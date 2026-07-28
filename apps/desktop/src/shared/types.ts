export interface AppInfo {
  name: string;
  version: string;
}

export interface ScanProjectOptions {
  projectRoot: string;
  maxFileSizeKb: number;
  exclude: string[];
  respectGitIgnore: boolean;
  followSymlinks: boolean;
  allowHomeDirectory?: boolean;
}

export interface ScanFileNode {
  path: string;
  name: string;
  type: "file";
  sizeBytes: number;
  extension: string;
}

export interface ScanDirectoryNode {
  path: string;
  name: string;
  type: "directory";
  childrenCount: number;
}

export type ScanNode = ScanFileNode | ScanDirectoryNode;

export interface FileTreeNodeBase {
  path: string;
  name: string;
  depth: number;
}

export interface FileTreeFileNode extends FileTreeNodeBase {
  type: "file";
  sizeBytes: number;
  extension: string;
}

export interface FileTreeDirectoryNode extends FileTreeNodeBase {
  type: "directory";
  children: FileTreeNode[];
  childrenCount: number;
}

export type FileTreeNode = FileTreeFileNode | FileTreeDirectoryNode;

export interface ScanSummary {
  totalFiles: number;
  totalFolders: number;
  skippedFiles: number;
  skippedBinary: number;
  skippedLarge: number;
  skippedExcluded: number;
}

export interface GitProjectInfo {
  isGitRepository: boolean;
  gitAvailable: boolean;
  repoRoot?: string;
  branch?: string;
  commit?: string;
  shortCommit?: string;
  isDetachedHead?: boolean;
  hasTrackedChanges?: boolean;
  warning?: string;
}

export type GitDiffMode = "workingTree" | "branch";

export interface GitDiffOptions {
  projectRoot: string;
  mode: GitDiffMode;
  baseRef?: string;
  includeUntracked: boolean;
}

export interface GitDiffFile {
  path: string;
  status: "added" | "modified" | "renamed" | "copied" | "typeChanged" | "untracked";
}

export interface GitDiffResult {
  isGitRepository: boolean;
  gitAvailable: boolean;
  mode: GitDiffMode;
  baseRef?: string;
  files: GitDiffFile[];
  deletedCount: number;
  skippedInvalidCount: number;
  warning?: string;
}

export interface GitDiffExportInfo {
  mode: GitDiffMode;
  baseRef?: string;
  includeUntracked: boolean;
  changedFilesCount: number;
  selectedFilesCount: number;
  unavailableFilesCount: number;
}

export interface ScanProjectResult {
  projectRoot: string;
  nodes: ScanNode[];
  summary: ScanSummary;
  warnings?: string[];
  git?: GitProjectInfo;
}

export interface CodeBundleConfigPreview {
  version: 1;
  projectRoot: string;
  outputFile: string;
  format: "markdown" | "text";
  mode: "selected" | "include" | "all";
  files: string[];
  folders: string[];
  include: string[];
  exclude: string[];
  maxFileSizeKb: number;
  skipBinaryFiles: boolean;
  respectGitIgnore: boolean;
  followSymlinks: boolean;
  git?: GitProjectInfo;
  gitDiff?: GitDiffExportInfo;
}

export type CodeBundleExportConfig = CodeBundleConfigPreview;

export interface PreparedExportSummary {
  projectRoot: string;
  outputFile: string;
  format: "markdown" | "text";
  mode: "selected" | "include" | "all";
  filesCount: number;
  foldersCount: number;
  excludeCount: number;
  maxFileSizeKb: number;
}

export interface PrepareExportConfigSuccess {
  success: true;
  tempConfigPath: string;
  summary: PreparedExportSummary;
}

export interface PrepareExportConfigFailure {
  success: false;
  error: {
    code: "INVALID_EXPORT_CONFIG";
    message: "The export config is invalid.";
    details: string;
  };
}

export type PrepareExportConfigResult = PrepareExportConfigSuccess | PrepareExportConfigFailure;

export interface ExporterSummary {
  exportedFiles: number;
  skippedBinary: number;
  skippedLarge: number;
  skippedExcluded: number;
  skippedMissing: number;
  skippedInvalid: number;
}

export interface RunExportSuccess {
  success: true;
  outputFile: string;
  summary: ExporterSummary;
  /** Present only when the local Node exporter recovered from Python unavailability. */
  exporter?: "python" | "node-fallback";
  fallbackReason?: string;
}

export interface RunExportFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

export type RunExportResult = RunExportSuccess | RunExportFailure;

export interface RevealPathSuccess {
  success: true;
}

export interface RevealPathFailure {
  success: false;
  error: {
    code: "INVALID_REVEAL_PATH" | "REVEAL_PATH_FAILED";
    message: string;
    details?: string;
  };
}

export type RevealPathResult = RevealPathSuccess | RevealPathFailure;

export interface CodeBundlePreferences {
  recentProjectFolder: string | null;
  recentOutputFile: string | null;
  maxFileSizeKb: number;
  respectGitIgnore: boolean;
  followSymlinks: boolean;
  excludeText: string;
}

export interface SavePreferencesSuccess {
  success: true;
}

export interface SavePreferencesFailure {
  success: false;
  error: {
    code: "PREFERENCES_SAVE_FAILED";
    message: string;
    details?: string;
  };
}

export type SavePreferencesResult = SavePreferencesSuccess | SavePreferencesFailure;

export interface SecretFinding {
  filePath: string;
  ruleId: string;
  ruleLabel: string;
  severity: "high" | "medium";
  line: number;
  redactedMatch: string;
}

export interface SecretScanOptions {
  projectRoot: string;
  filePaths: string[];
  maxFileSizeKb: number;
}

export interface SecretScanResult {
  findings: SecretFinding[];
  scannedFileCount: number;
  errorCount: number;
  hasMoreFindings: boolean;
}

export interface GeneratePreviewOptions {
  config: CodeBundleExportConfig;
  maxPreviewLines: number;
  maxPreviewBytes: number;
}

export interface PreviewResult {
  content: string;
  totalSelectedFiles: number;
  previewedFiles: number;
  totalLines: number;
  truncated: boolean;
  format: "markdown" | "text";
}

export interface GeneratePreviewSuccess {
  success: true;
  preview: PreviewResult;
}

export interface GeneratePreviewFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

export type GeneratePreviewResult = GeneratePreviewSuccess | GeneratePreviewFailure;

export interface ValidateDroppedFolderSuccess {
  success: true;
  resolvedPath: string;
}

export interface ValidateDroppedFolderFailure {
  success: false;
  resolvedPath?: string;
  error: {
    code: "INVALID_INPUT" | "NOT_ABSOLUTE" | "NOT_A_DIRECTORY" | "DANGEROUS_PATH" | "HOME_DIRECTORY" | "RESOLVE_FAILED";
    message: string;
  };
}

export type ValidateDroppedFolderResult = ValidateDroppedFolderSuccess | ValidateDroppedFolderFailure;

export interface RecentProject {
  path: string;
  name: string;
  addedAt: number;
  lastOpenedAt: number;
}

export interface RecentProjectsResult {
  projects: RecentProject[];
}

export interface SavedExportProfile {
  id: string;
  name: string;
  projectRoot: string;
  outputFile: string | null;
  format: "markdown" | "text";
  files: string[];
  folders: string[];
  excludeText: string;
  maxFileSizeKb: number;
  respectGitIgnore: boolean;
  followSymlinks: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface SaveExportProfileInput {
  id?: string;
  name: string;
  projectRoot: string;
  outputFile: string | null;
  format: "markdown" | "text";
  files: string[];
  folders: string[];
  excludeText: string;
  maxFileSizeKb: number;
  respectGitIgnore: boolean;
  followSymlinks: boolean;
}

export interface ExportProfilesResult {
  profiles: SavedExportProfile[];
}

export interface CodeBundleApi {
  chooseProjectFolder: () => Promise<string | null>;
  chooseOutputFile: () => Promise<string | null>;
  scanProject: (options: ScanProjectOptions) => Promise<ScanProjectResult>;
  prepareExportConfig: (config: CodeBundleExportConfig) => Promise<PrepareExportConfigResult>;
  runExport: (config: CodeBundleExportConfig) => Promise<RunExportResult>;
  cancelExport: () => Promise<RunExportResult>;
  revealPath: (path: string) => Promise<RevealPathResult>;
  getPreferences: () => Promise<CodeBundlePreferences>;
  savePreferences: (preferences: CodeBundlePreferences) => Promise<SavePreferencesResult>;
  getDefaultExcludes: () => Promise<string[]>;
  getAppInfo: () => Promise<AppInfo>;
  scanForSecrets: (options: SecretScanOptions) => Promise<SecretScanResult>;
  generatePreview: (options: GeneratePreviewOptions) => Promise<GeneratePreviewResult>;
  validateDroppedFolder: (path: string) => Promise<ValidateDroppedFolderResult>;
  getRecentProjects: () => Promise<RecentProjectsResult>;
  addRecentProject: (path: string) => Promise<RecentProjectsResult>;
  removeRecentProject: (path: string) => Promise<RecentProjectsResult>;
  getExportProfiles: () => Promise<ExportProfilesResult>;
  saveExportProfile: (profile: SaveExportProfileInput) => Promise<ExportProfilesResult>;
  deleteExportProfile: (id: string) => Promise<ExportProfilesResult>;
  markExportProfileUsed: (id: string) => Promise<ExportProfilesResult>;
  getGitDiffFiles: (options: GitDiffOptions) => Promise<GitDiffResult>;
  getPathForFile: (file: File) => string;
}

declare global {
  interface Window {
    codeBundle: CodeBundleApi;
  }
}
