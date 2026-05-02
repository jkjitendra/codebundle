import { app, dialog, ipcMain, shell } from "electron";
import { isAbsolute } from "node:path";
import { DEFAULT_EXCLUDES } from "./defaultRules";
import { prepareExportConfig } from "./configWriter";
import { readPreferences, savePreferences } from "./preferences";
import { runExporter } from "./runExporter";
import { scanProject } from "./scanFiles";

let currentExportController: AbortController | null = null;

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
      return await runExporter(config, { signal: currentExportController.signal });
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
}
