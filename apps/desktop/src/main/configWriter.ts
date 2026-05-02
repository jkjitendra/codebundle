import { randomUUID } from "node:crypto";
import { realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type {
  CodeBundleExportConfig,
  PreparedExportSummary,
  PrepareExportConfigFailure,
  PrepareExportConfigResult
} from "../shared/types";
import { assertRelativePathInside, assertSafeProjectRoot, isDangerousProjectRoot, isPathInside } from "./pathSecurity";

const VALID_FORMATS = new Set(["markdown", "text"]);
const VALID_MODES = new Set(["selected", "include", "all"]);

export class InvalidExportConfigError extends Error {
  constructor(details: string) {
    super(details);
    this.name = "InvalidExportConfigError";
  }
}

export async function prepareExportConfig(input: unknown): Promise<PrepareExportConfigResult> {
  try {
    const { config, tempConfigPath } = await writeValidatedExportConfig(input);

    return {
      success: true,
      tempConfigPath,
      summary: summarizeConfig(config)
    };
  } catch (error) {
    return invalidConfigResult(error instanceof Error ? error.message : "Unknown export config error");
  }
}

export async function writeValidatedExportConfig(
  input: unknown
): Promise<{ config: CodeBundleExportConfig; tempConfigPath: string; summary: PreparedExportSummary }> {
  const config = await validateExportConfig(input);
  const tempConfigPath = join(tmpdir(), `codebundle-${randomUUID()}.codebundle.tmp.json`);
  await writeFile(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { config, tempConfigPath, summary: summarizeConfig(config) };
}

async function validateExportConfig(input: unknown): Promise<CodeBundleExportConfig> {
  if (!isRecord(input)) {
    throw new InvalidExportConfigError("config must be an object");
  }

  if (input.version !== 1) {
    throw new InvalidExportConfigError("version must be 1");
  }

  const projectRootValue = requireString(input, "projectRoot");
  if (!isAbsolute(projectRootValue)) {
    throw new InvalidExportConfigError("projectRoot must be absolute");
  }
  const normalizedProjectRoot = assertSafeProjectRoot(projectRootValue, true);
  const projectStats = await stat(normalizedProjectRoot).catch(() => null);
  if (!projectStats) {
    throw new InvalidExportConfigError("projectRoot must exist");
  }
  if (!projectStats.isDirectory()) {
    throw new InvalidExportConfigError("projectRoot must be a directory");
  }
  const projectRoot = await realpath(normalizedProjectRoot);

  const outputFileValue = requireString(input, "outputFile");
  if (!isAbsolute(outputFileValue)) {
    throw new InvalidExportConfigError("outputFile must be absolute");
  }
  const outputFile = resolve(outputFileValue);
  if (isDangerousProjectRoot(dirname(outputFile))) {
    throw new InvalidExportConfigError("outputFile must not be written directly to a system-level directory");
  }

  const format = requireString(input, "format");
  if (!VALID_FORMATS.has(format)) {
    throw new InvalidExportConfigError('format must be "markdown" or "text"');
  }

  const mode = requireString(input, "mode");
  if (!VALID_MODES.has(mode)) {
    throw new InvalidExportConfigError('mode must be "selected", "include", or "all"');
  }

  const files = requireStringArray(input, "files");
  const folders = requireStringArray(input, "folders");
  const include = requireStringArray(input, "include");
  const exclude = requireStringArray(input, "exclude");

  await validateRelativeEntries(projectRoot, files, "files");
  await validateRelativeEntries(projectRoot, folders, "folders");

  if (mode === "selected" && files.length + folders.length === 0) {
    throw new InvalidExportConfigError("selected mode requires at least one selected file or folder");
  }

  if (mode === "include" && include.length === 0) {
    throw new InvalidExportConfigError("include mode requires at least one include pattern");
  }

  const maxFileSizeKb = input.maxFileSizeKb;
  if (typeof maxFileSizeKb !== "number" || !Number.isInteger(maxFileSizeKb) || maxFileSizeKb <= 0) {
    throw new InvalidExportConfigError("maxFileSizeKb must be a positive integer");
  }

  const skipBinaryFiles = requireBoolean(input, "skipBinaryFiles");
  const respectGitIgnore = requireBoolean(input, "respectGitIgnore");
  const followSymlinks = requireBoolean(input, "followSymlinks");

  return {
    version: 1,
    projectRoot,
    outputFile,
    format: format as CodeBundleExportConfig["format"],
    mode: mode as CodeBundleExportConfig["mode"],
    files,
    folders,
    include,
    exclude,
    maxFileSizeKb,
    skipBinaryFiles,
    respectGitIgnore,
    followSymlinks
  };
}

function summarizeConfig(config: CodeBundleExportConfig): PreparedExportSummary {
  return {
    projectRoot: config.projectRoot,
    outputFile: config.outputFile,
    format: config.format,
    mode: config.mode,
    filesCount: config.files.length,
    foldersCount: config.folders.length,
    excludeCount: config.exclude.length,
    maxFileSizeKb: config.maxFileSizeKb
  };
}

async function validateRelativeEntries(projectRoot: string, entries: string[], label: string): Promise<void> {
  for (const entry of entries) {
    const candidate = assertRelativePathInside(projectRoot, entry, label);
    const candidateRealPath = await realpath(candidate).catch(() => null);
    if (candidateRealPath && !isPathInside(projectRoot, candidateRealPath)) {
      throw new InvalidExportConfigError(`${label} entry escapes projectRoot: ${entry}`);
    }
  }
}

export function invalidConfigResult(details: string): PrepareExportConfigFailure {
  return {
    success: false,
    error: {
      code: "INVALID_EXPORT_CONFIG",
      message: "The export config is invalid.",
      details
    }
  };
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidExportConfigError(`${key} is required`);
  }
  return value;
}

function requireStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    throw new InvalidExportConfigError(`${key} must be an array of strings`);
  }
  if (!value.every((item) => typeof item === "string")) {
    throw new InvalidExportConfigError(`${key} must be an array of strings`);
  }
  return [...value];
}

function requireBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== "boolean") {
    throw new InvalidExportConfigError(`${key} must be boolean`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
