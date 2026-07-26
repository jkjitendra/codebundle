import { DEFAULT_EXCLUDES } from "./defaultExcludes";

export interface VsCodeExportConfig {
  version: 1;
  projectRoot: string;
  outputFile: string;
  format: "markdown" | "text";
  mode: "selected";
  files: string[];
  folders: [];
  include: [];
  exclude: string[];
  maxFileSizeKb: number;
  skipBinaryFiles: true;
  respectGitIgnore: boolean;
  followSymlinks: boolean;
}

export function buildExportConfig(input: Omit<VsCodeExportConfig, "version" | "format" | "mode" | "folders" | "include" | "exclude" | "skipBinaryFiles"> & { userExcludes?: string[] }): VsCodeExportConfig {
  const files = [...new Set(input.files.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const exclude = [...new Set([...DEFAULT_EXCLUDES, ...(input.userExcludes ?? []).map((item) => item.trim()).filter(Boolean)])];
  return {
    version: 1, projectRoot: input.projectRoot, outputFile: input.outputFile,
    format: input.outputFile.toLowerCase().endsWith(".txt") ? "text" : "markdown",
    mode: "selected", files, folders: [], include: [], exclude,
    maxFileSizeKb: Math.max(1, Math.floor(input.maxFileSizeKb)), skipBinaryFiles: true,
    respectGitIgnore: input.respectGitIgnore, followSymlinks: input.followSymlinks
  };
}
