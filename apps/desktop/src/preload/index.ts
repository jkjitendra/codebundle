import { contextBridge, ipcRenderer } from "electron";
import type {
  AppInfo,
  CodeBundleApi,
  CodeBundleExportConfig,
  CodeBundlePreferences,
  GeneratePreviewOptions,
  GeneratePreviewResult,
  PrepareExportConfigResult,
  RevealPathResult,
  RunExportResult,
  SavePreferencesResult,
  ScanProjectOptions,
  ScanProjectResult,
  SecretScanOptions,
  SecretScanResult,
  ValidateDroppedFolderResult
} from "../shared/types";

const api: CodeBundleApi = {
  chooseProjectFolder: () => ipcRenderer.invoke("codebundle:choose-project-folder") as Promise<string | null>,
  chooseOutputFile: () => ipcRenderer.invoke("codebundle:choose-output-file") as Promise<string | null>,
  scanProject: (options: ScanProjectOptions) =>
    ipcRenderer.invoke("codebundle:scan-project", options) as Promise<ScanProjectResult>,
  prepareExportConfig: (config: CodeBundleExportConfig) =>
    ipcRenderer.invoke("codebundle:prepare-export-config", config) as Promise<PrepareExportConfigResult>,
  runExport: (config: CodeBundleExportConfig) => ipcRenderer.invoke("codebundle:run-export", config) as Promise<RunExportResult>,
  cancelExport: () => ipcRenderer.invoke("codebundle:cancel-export") as Promise<RunExportResult>,
  revealPath: (path: string) => ipcRenderer.invoke("codebundle:reveal-path", path) as Promise<RevealPathResult>,
  getPreferences: () => ipcRenderer.invoke("codebundle:get-preferences") as Promise<CodeBundlePreferences>,
  savePreferences: (preferences: CodeBundlePreferences) =>
    ipcRenderer.invoke("codebundle:save-preferences", preferences) as Promise<SavePreferencesResult>,
  getDefaultExcludes: () => ipcRenderer.invoke("codebundle:get-default-excludes") as Promise<string[]>,
  getAppInfo: () => ipcRenderer.invoke("codebundle:get-app-info") as Promise<AppInfo>,
  scanForSecrets: (options: SecretScanOptions) =>
    ipcRenderer.invoke("codebundle:scan-secrets", options) as Promise<SecretScanResult>,
  generatePreview: (options: GeneratePreviewOptions) =>
    ipcRenderer.invoke("codebundle:generate-preview", options) as Promise<GeneratePreviewResult>,
  validateDroppedFolder: (path: string) =>
    ipcRenderer.invoke("codebundle:validate-dropped-folder", path) as Promise<ValidateDroppedFolderResult>
};

contextBridge.exposeInMainWorld("codeBundle", api);
