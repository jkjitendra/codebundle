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

export interface ScanProjectResult {
  projectRoot: string;
  nodes: ScanNode[];
  summary: ScanSummary;
  warnings?: string[];
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
}

export interface CodeBundleApi {
  chooseProjectFolder: () => Promise<string | null>;
  chooseOutputFile: () => Promise<string | null>;
  scanProject: (options: ScanProjectOptions) => Promise<ScanProjectResult>;
  getDefaultExcludes: () => Promise<string[]>;
  getAppInfo: () => Promise<AppInfo>;
}

declare global {
  interface Window {
    codeBundle: CodeBundleApi;
  }
}
