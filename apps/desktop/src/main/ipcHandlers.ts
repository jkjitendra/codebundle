import { app, dialog, ipcMain, shell } from "electron";
import { isAbsolute } from "node:path";
import { DEFAULT_EXCLUDES } from "./defaultRules";
import { prepareExportConfig } from "./configWriter";
import { validateDroppedFolder } from "./dropFolderValidation";
import { deleteExportProfile, markExportProfileUsed, readExportProfiles, saveExportProfile } from "./exportProfiles";
import { getGitDiffFiles } from "./gitDiff";
import { readPreferences, savePreferences } from "./preferences";
import { generatePreview } from "./previewGenerator";
import { addRecentProject, readRecentProjects, removeRecentProject, validateRecentProjects } from "./recentProjects";
import { runExporter } from "./runExporter";
import { scanProject } from "./scanFiles";
import { scanFilesForSecrets } from "./secretScanner";
import type { ExportProfilesResult, RecentProjectsResult } from "../shared/types";

let currentExportController: AbortController | null = null;

async function getStoredRecentProjectsResult(): Promise<RecentProjectsResult> {
  try {
    return { projects: await readRecentProjects(app.getPath("userData")) };
  } catch {
    return { projects: [] };
  }
}

async function getValidatedRecentProjectsResult(): Promise<RecentProjectsResult> {
  try {
    return { projects: await validateRecentProjects(app.getPath("userData")) };
  } catch {
    return getStoredRecentProjectsResult();
  }
}

async function getStoredExportProfilesResult(): Promise<ExportProfilesResult> {
  try {
    return { profiles: await readExportProfiles(app.getPath("userData")) };
  } catch {
    return { profiles: [] };
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle("codebundle:choose-project-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Project Folder",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("codebundle:choose-output-file", async () => {
    const result = await dialog.showSaveDialog({
      title: "Choose Output File",
      defaultPath: "codebundle-output.md",
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "Text", extensions: ["txt"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });

  ipcMain.handle("codebundle:get-default-excludes", () => [...DEFAULT_EXCLUDES]);

  ipcMain.handle("codebundle:scan-project", async (_event, options) => scanProject(options));

  ipcMain.handle("codebundle:prepare-export-config", async (_event, config) => prepareExportConfig(config));

  ipcMain.handle("codebundle:run-export", async (_event, config) => {
    if (currentExportController) {
      return {
        success: false,
        error: {
          code: "EXPORT_IN_PROGRESS",
          message: "An export is already running."
        }
      };
    }

    currentExportController = new AbortController();
    try {
      return await runExporter(config, {
        signal: currentExportController.signal,
        exporterCommandOptions: {
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          appPath: app.getAppPath()
        }
      });
    } finally {
      currentExportController = null;
    }
  });

  ipcMain.handle("codebundle:cancel-export", () => {
    if (!currentExportController) {
      return {
        success: false,
        error: {
          code: "EXPORT_CANCELLED",
          message: "No export is currently running."
        }
      };
    }

    currentExportController.abort();
    return {
      success: false,
      error: {
        code: "EXPORT_CANCELLED",
        message: "Export was cancelled."
      }
    };
  });

  ipcMain.handle("codebundle:reveal-path", (_event, path) => {
    if (typeof path !== "string" || path.length === 0 || !isAbsolute(path)) {
      return {
        success: false,
        error: {
          code: "INVALID_REVEAL_PATH",
          message: "The output path is invalid.",
          details: "Expected a non-empty absolute path."
        }
      };
    }

    try {
      shell.showItemInFolder(path);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "REVEAL_PATH_FAILED",
          message: "Could not reveal the output file.",
          details: error instanceof Error ? error.message : "Unknown reveal path error."
        }
      };
    }
  });

  ipcMain.handle("codebundle:get-app-info", () => ({
    name: app.getName(),
    version: app.getVersion()
  }));

  ipcMain.handle("codebundle:get-preferences", async () => readPreferences(app.getPath("userData")));

  ipcMain.handle("codebundle:save-preferences", async (_event, preferences) =>
    savePreferences(app.getPath("userData"), preferences)
  );

  ipcMain.handle("codebundle:scan-secrets", async (_event, options) => scanFilesForSecrets(options));

  ipcMain.handle("codebundle:generate-preview", async (_event, options) => generatePreview(options));

  ipcMain.handle("codebundle:validate-dropped-folder", async (_event, path) => validateDroppedFolder(path));

  ipcMain.handle("codebundle:get-recent-projects", async () => getValidatedRecentProjectsResult());

  ipcMain.handle("codebundle:add-recent-project", async (_event, input: unknown) => {
    const projectPath = typeof input === "string" ? input.trim() : "";
    if (projectPath.length === 0 || !isAbsolute(projectPath)) {
      return getStoredRecentProjectsResult();
    }

    try {
      return { projects: await addRecentProject(app.getPath("userData"), projectPath) };
    } catch {
      return getStoredRecentProjectsResult();
    }
  });

  ipcMain.handle("codebundle:remove-recent-project", async (_event, input: unknown) => {
    const projectPath = typeof input === "string" ? input.trim() : "";
    if (projectPath.length === 0 || !isAbsolute(projectPath)) {
      return getStoredRecentProjectsResult();
    }

    try {
      return { projects: await removeRecentProject(app.getPath("userData"), projectPath) };
    } catch {
      return getStoredRecentProjectsResult();
    }
  });

  ipcMain.handle("codebundle:get-export-profiles", async () => getStoredExportProfilesResult());

  ipcMain.handle("codebundle:save-export-profile", async (_event, input: unknown) => {
    return { profiles: await saveExportProfile(app.getPath("userData"), input) };
  });

  ipcMain.handle("codebundle:delete-export-profile", async (_event, input: unknown) => {
    const id = typeof input === "string" ? input.trim() : "";
    if (id.length === 0) {
      return getStoredExportProfilesResult();
    }

    try {
      return { profiles: await deleteExportProfile(app.getPath("userData"), id) };
    } catch {
      return getStoredExportProfilesResult();
    }
  });

  ipcMain.handle("codebundle:mark-export-profile-used", async (_event, input: unknown) => {
    const id = typeof input === "string" ? input.trim() : "";
    if (id.length === 0) {
      return getStoredExportProfilesResult();
    }

    try {
      return { profiles: await markExportProfileUsed(app.getPath("userData"), id) };
    } catch {
      return getStoredExportProfilesResult();
    }
  });

  ipcMain.handle("codebundle:get-git-diff-files", async (_event, options: unknown) =>
    getGitDiffFiles(options)
  );
}
