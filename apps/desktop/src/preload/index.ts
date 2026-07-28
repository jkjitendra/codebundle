import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppInfo,
  CodeBundleApi,
  CodeBundleExportConfig,
  CodeBundlePreferences,
  ExportProfilesResult,
  GeneratePreviewOptions,
  GeneratePreviewResult,
  GitDiffOptions,
  GitDiffResult,
  InstallUpdateResult,
  PrepareExportConfigResult,
  RecentProjectsResult,
  RevealPathResult,
  RunExportResult,
  SaveExportProfileInput,
  SavePreferencesResult,
  ScanProjectOptions,
  ScanProjectResult,
  SecretScanOptions,
  SecretScanResult,
  UpdateState,
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
  getUpdateState: () => ipcRenderer.invoke("codebundle:get-update-state") as Promise<UpdateState>,
  checkForUpdates: () => ipcRenderer.invoke("codebundle:check-for-updates") as Promise<UpdateState>,
  installUpdate: () => ipcRenderer.invoke("codebundle:install-update") as Promise<InstallUpdateResult>,
  onUpdateStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on("codebundle:update-state-changed", listener);
    return () => ipcRenderer.removeListener("codebundle:update-state-changed", listener);
  },
  scanForSecrets: (options: SecretScanOptions) =>
    ipcRenderer.invoke("codebundle:scan-secrets", options) as Promise<SecretScanResult>,
  generatePreview: (options: GeneratePreviewOptions) =>
    ipcRenderer.invoke("codebundle:generate-preview", options) as Promise<GeneratePreviewResult>,
  validateDroppedFolder: (path: string) =>
    ipcRenderer.invoke("codebundle:validate-dropped-folder", path) as Promise<ValidateDroppedFolderResult>,
  getRecentProjects: () =>
    ipcRenderer.invoke("codebundle:get-recent-projects") as Promise<RecentProjectsResult>,
  addRecentProject: (path: string) =>
    ipcRenderer.invoke("codebundle:add-recent-project", path) as Promise<RecentProjectsResult>,
  removeRecentProject: (path: string) =>
    ipcRenderer.invoke("codebundle:remove-recent-project", path) as Promise<RecentProjectsResult>,
  getExportProfiles: () =>
    ipcRenderer.invoke("codebundle:get-export-profiles") as Promise<ExportProfilesResult>,
  saveExportProfile: (profile: SaveExportProfileInput) =>
    ipcRenderer.invoke("codebundle:save-export-profile", profile) as Promise<ExportProfilesResult>,
  deleteExportProfile: (id: string) =>
    ipcRenderer.invoke("codebundle:delete-export-profile", id) as Promise<ExportProfilesResult>,
  markExportProfileUsed: (id: string) =>
    ipcRenderer.invoke("codebundle:mark-export-profile-used", id) as Promise<ExportProfilesResult>,
  getGitDiffFiles: (options: GitDiffOptions) =>
    ipcRenderer.invoke("codebundle:get-git-diff-files", options) as Promise<GitDiffResult>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
};

contextBridge.exposeInMainWorld("codeBundle", api);
