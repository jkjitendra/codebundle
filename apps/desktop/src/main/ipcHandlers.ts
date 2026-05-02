import { app, dialog, ipcMain } from "electron";
import { DEFAULT_EXCLUDES } from "./defaultRules";
import { prepareExportConfig } from "./configWriter";
import { scanProject } from "./scanFiles";

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

  ipcMain.handle("codebundle:get-app-info", () => ({
    name: app.getName(),
    version: app.getVersion()
  }));
}
