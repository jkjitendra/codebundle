import { readFile, readdir, lstat, stat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { CodeBundleExportConfig, GeneratePreviewResult, GitDiffExportInfo, GitProjectInfo, PreviewResult } from "../shared/types";
import { assertSafeProjectRoot, isPathInside } from "./pathSecurity";

const DEFAULT_MAX_PREVIEW_LINES = 500;
const DEFAULT_MAX_PREVIEW_BYTES = 200_000;
const SAMPLE_SIZE = 8192;

export interface ValidatedPreviewOptions {
  config: CodeBundleExportConfig;
  maxPreviewLines: number;
  maxPreviewBytes: number;
}

interface PreviewFileEntry {
  relativePath: string;
  absolutePath: string;
}

interface PreviewScanSummary {
  skippedBinary: number;
  skippedLarge: number;
  skippedExcluded: number;
  skippedMissing: number;
  skippedInvalid: number;
}

export interface PreviewDependencies {
  readFileForPreview?: (absolutePath: string, maxFileSizeKb: number, skipBinary: boolean) => Promise<string | null>;
  resolveFileEntries?: (config: CodeBundleExportConfig) => Promise<{ entries: PreviewFileEntry[]; summary: PreviewScanSummary }>;
  resolveProjectRoot?: (projectRoot: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// PreviewBuilder — true bounded content accumulation
// ---------------------------------------------------------------------------

export class PreviewBuilder {
  private readonly chunks: string[] = [];
  private _bytesGenerated = 0;
  private _lineCount = 0;
  private _truncated = false;
  private readonly maxBytes: number;
  private readonly maxLines: number;

  constructor(maxBytes: number, maxLines: number) {
    this.maxBytes = maxBytes;
    this.maxLines = maxLines;
  }

  get bytesGenerated(): number {
    return this._bytesGenerated;
  }

  get lineCount(): number {
    return this._lineCount;
  }

  get truncated(): boolean {
    return this._truncated;
  }

  markTruncated(): void {
    this._truncated = true;
  }

  canAppend(text: string): boolean {
    if (this._truncated) {
      return false;
    }
    const textBytes = Buffer.byteLength(text, "utf8");
    const textLines = countNewlines(text);
    if (this._bytesGenerated + textBytes > this.maxBytes) {
      return false;
    }
    if (this._lineCount + textLines > this.maxLines) {
      return false;
    }
    return true;
  }

  append(text: string): void {
    if (this._truncated) {
      return;
    }
    const textBytes = Buffer.byteLength(text, "utf8");
    const textLines = countNewlines(text);

    if (this._bytesGenerated + textBytes > this.maxBytes || this._lineCount + textLines > this.maxLines) {
      this._truncated = true;
      return;
    }

    this.chunks.push(text);
    this._bytesGenerated += textBytes;
    this._lineCount += textLines;
  }

  appendLine(line: string): void {
    this.append(line + "\n");
  }

  getContent(): string {
    const content = this.chunks.join("");
    // Remove trailing newline for clean output
    return content.endsWith("\n") ? content.slice(0, -1) : content;
  }
}

function countNewlines(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === "\n") {
      count += 1;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Main preview generation
// ---------------------------------------------------------------------------

export async function generatePreview(input: unknown, deps: PreviewDependencies = {}): Promise<GeneratePreviewResult> {
  try {
    const options = validatePreviewInput(input);
    const config = validatePreviewConfig(options.config);
    const projectRoot = await (deps.resolveProjectRoot ?? resolveProjectRoot)(config.projectRoot);

    const resolveEntries = deps.resolveFileEntries ?? resolveSelectedFileEntries;
    const readForPreview = deps.readFileForPreview ?? defaultReadFileForPreview;

    const { entries } = await resolveEntries(config);

    const builder = new PreviewBuilder(options.maxPreviewBytes, options.maxPreviewLines);
    let previewedFiles = 0;

    // Render header — placeholder total that we cannot fix later in bounded mode.
    // We use entries.length as the expected count; actual rendered count may differ
    // if files are skipped during read or if truncation stops us early.
    if (config.format === "markdown") {
      builder.appendLine("# CodeBundle Export");
      builder.appendLine("");
      builder.appendLine(`Project Root: \`${projectRoot}\``);
      builder.appendLine("");
      builder.appendLine(`Total Files: ${entries.length}`);
      builder.appendLine("");
      appendGitSectionMarkdown(builder, config);
      appendGitDiffSectionMarkdown(builder, config);
      builder.appendLine("---");
      builder.appendLine("");
    } else {
      builder.appendLine("CodeBundle Export");
      builder.appendLine("");
      builder.appendLine(`Project Root: ${projectRoot}`);
      builder.appendLine("");
      builder.appendLine(`Total Files: ${entries.length}`);
      builder.appendLine("");
      appendGitSectionText(builder, config);
      appendGitDiffSectionText(builder, config);
      builder.appendLine("---");
      builder.appendLine("");
    }


    for (const entry of entries) {
      // Stop reading files if already truncated
      if (builder.truncated) {
        break;
      }

      let content: string | null;
      try {
        content = await readForPreview(entry.absolutePath, config.maxFileSizeKb, config.skipBinaryFiles);
      } catch {
        // Skip files that cannot be read
        continue;
      }
      if (content === null) {
        continue;
      }

      const fileNumber = previewedFiles + 1;
      const cleanContent = content.replace(/\n$/, "");

      if (config.format === "markdown") {
        const fence = markdownFence(content);
        const fileBlock =
          `## File ${fileNumber}: \`${entry.relativePath}\`\n` +
          "\n" +
          `${fence}text\n` +
          cleanContent + "\n" +
          fence + "\n" +
          "\n" +
          "---\n" +
          "\n";

        if (!builder.canAppend(fileBlock)) {
          builder.markTruncated();
          break;
        }
        builder.append(fileBlock);
        previewedFiles += 1;
      } else {
        const fileBlock =
          `File ${fileNumber} Path\n` +
          entry.relativePath + "\n" +
          "\n" +
          cleanContent + "\n" +
          "\n" +
          "---\n" +
          "\n";

        if (!builder.canAppend(fileBlock)) {
          builder.markTruncated();
          break;
        }
        builder.append(fileBlock);
        previewedFiles += 1;
      }
    }

    const preview: PreviewResult = {
      content: builder.getContent(),
      totalSelectedFiles: entries.length,
      previewedFiles,
      totalLines: builder.lineCount,
      truncated: builder.truncated,
      format: config.format
    };

    return { success: true, preview };
  } catch (error) {
    // Never include file content in error details
    const message = error instanceof Error ? error.message : "Unknown preview error.";
    return {
      success: false,
      error: {
        code: "PREVIEW_GENERATION_FAILED",
        message: "Could not generate export preview.",
        details: safeErrorDetails(message)
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePreviewInput(input: unknown): ValidatedPreviewOptions {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Preview input must be an object.");
  }
  const record = input as Record<string, unknown>;

  if (typeof record.config !== "object" || record.config === null || Array.isArray(record.config)) {
    throw new Error("config is required.");
  }

  const maxPreviewLines = typeof record.maxPreviewLines === "number" && record.maxPreviewLines > 0
    ? record.maxPreviewLines
    : DEFAULT_MAX_PREVIEW_LINES;

  const maxPreviewBytes = typeof record.maxPreviewBytes === "number" && record.maxPreviewBytes > 0
    ? record.maxPreviewBytes
    : DEFAULT_MAX_PREVIEW_BYTES;

  return {
    config: record.config as CodeBundleExportConfig,
    maxPreviewLines,
    maxPreviewBytes
  };
}

function validatePreviewConfig(config: CodeBundleExportConfig): CodeBundleExportConfig {
  if (config.version !== 1) {
    throw new Error("version must be 1");
  }
  if (typeof config.projectRoot !== "string" || !isAbsolute(config.projectRoot)) {
    throw new Error("projectRoot must be an absolute path");
  }
  if (typeof config.format !== "string" || (config.format !== "markdown" && config.format !== "text")) {
    throw new Error("format must be markdown or text");
  }
  if (typeof config.mode !== "string") {
    throw new Error("mode is required");
  }
  if (!Array.isArray(config.files)) {
    throw new Error("files must be an array");
  }
  if (!Array.isArray(config.folders)) {
    throw new Error("folders must be an array");
  }
  if (!Array.isArray(config.exclude)) {
    throw new Error("exclude must be an array");
  }
  if (typeof config.maxFileSizeKb !== "number" || config.maxFileSizeKb <= 0) {
    throw new Error("maxFileSizeKb must be a positive number");
  }
  return config;
}

// ---------------------------------------------------------------------------
// Project root & file resolution
// ---------------------------------------------------------------------------

async function resolveProjectRoot(projectRoot: string): Promise<string> {
  const normalized = assertSafeProjectRoot(projectRoot, true);
  const stats = await stat(normalized).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error("projectRoot must be an existing directory");
  }
  return await realpath(normalized);
}

export async function resolveSelectedFileEntries(
  config: CodeBundleExportConfig
): Promise<{ entries: PreviewFileEntry[]; summary: PreviewScanSummary }> {
  const projectRoot = await realpath(resolve(config.projectRoot));
  const summary: PreviewScanSummary = {
    skippedBinary: 0,
    skippedLarge: 0,
    skippedExcluded: 0,
    skippedMissing: 0,
    skippedInvalid: 0
  };

  const seen = new Set<string>();
  const entries: PreviewFileEntry[] = [];

  // Process explicitly selected files
  for (const relativePath of config.files) {
    if (!relativePath || isAbsolute(relativePath)) {
      summary.skippedInvalid += 1;
      continue;
    }
    const absolutePath = resolve(projectRoot, relativePath);
    if (!isPathInside(projectRoot, absolutePath)) {
      summary.skippedInvalid += 1;
      continue;
    }
    const resolvedPath = await safeRealPath(absolutePath);
    if (resolvedPath && !isPathInside(projectRoot, resolvedPath)) {
      summary.skippedInvalid += 1;
      continue;
    }
    const fileStat = await safeStat(absolutePath);
    if (!fileStat || !fileStat.isFile()) {
      summary.skippedMissing += 1;
      continue;
    }
    const identity = resolvedPath ?? absolutePath;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    entries.push({ relativePath: normalizeRelativePath(relativePath), absolutePath: identity });
  }

  // Process selected folders (walk recursively)
  for (const relativePath of config.folders) {
    if (!relativePath || isAbsolute(relativePath)) {
      summary.skippedInvalid += 1;
      continue;
    }
    const absolutePath = resolve(projectRoot, relativePath);
    if (!isPathInside(projectRoot, absolutePath)) {
      summary.skippedInvalid += 1;
      continue;
    }
    const resolvedPath = await safeRealPath(absolutePath);
    if (resolvedPath && !isPathInside(projectRoot, resolvedPath)) {
      summary.skippedInvalid += 1;
      continue;
    }
    const folderStat = await safeStat(absolutePath);
    if (!folderStat || !folderStat.isDirectory()) {
      summary.skippedMissing += 1;
      continue;
    }
    const folderFiles = await walkDirectory(projectRoot, absolutePath, config.followSymlinks, config.exclude);
    for (const file of folderFiles) {
      if (seen.has(file.absolutePath)) {
        continue;
      }
      seen.add(file.absolutePath);
      entries.push(file);
    }
  }

  // Filter out excluded entries
  const filtered: PreviewFileEntry[] = [];
  for (const entry of entries) {
    if (isExcluded(entry.relativePath, config.exclude)) {
      summary.skippedExcluded += 1;
      continue;
    }
    filtered.push(entry);
  }

  filtered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { entries: filtered, summary };
}

// ---------------------------------------------------------------------------
// Directory walking & exclusion (used by resolveSelectedFileEntries for IPC)
// ---------------------------------------------------------------------------

async function walkDirectory(
  projectRoot: string,
  dirPath: string,
  followSymlinks: boolean,
  excludePatterns: string[]
): Promise<PreviewFileEntry[]> {
  const results: PreviewFileEntry[] = [];

  let dirEntries: string[];
  try {
    dirEntries = await readdir(dirPath);
  } catch {
    return results;
  }

  for (const name of dirEntries) {
    const absolutePath = join(dirPath, name);
    const relativePath = normalizeRelativePath(relative(projectRoot, absolutePath));

    if (isExcluded(relativePath, excludePatterns)) {
      continue;
    }

    let entryStat = await safeLstat(absolutePath);
    if (!entryStat) {
      continue;
    }

    if (entryStat.isSymbolicLink()) {
      if (!followSymlinks) {
        continue;
      }
      const resolvedPath = await safeRealPath(absolutePath);
      if (!resolvedPath || !isPathInside(projectRoot, resolvedPath)) {
        continue;
      }
      entryStat = await safeStat(absolutePath);
      if (!entryStat) {
        continue;
      }
    }

    if (entryStat.isDirectory()) {
      const subFiles = await walkDirectory(projectRoot, absolutePath, followSymlinks, excludePatterns);
      results.push(...subFiles);
    } else if (entryStat.isFile()) {
      const resolvedPath = await safeRealPath(absolutePath);
      if (resolvedPath && !isPathInside(projectRoot, resolvedPath)) {
        continue;
      }
      results.push({ relativePath, absolutePath: resolvedPath ?? absolutePath });
    }
  }

  return results;
}

function isExcluded(relativePath: string, patterns: string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const parts = normalized.split("/").filter((p) => p.length > 0);

  for (const rawPattern of patterns) {
    const pattern = normalizeRelativePath(rawPattern);
    if (!pattern) {
      continue;
    }

    const variants = [pattern];
    if (pattern.includes("**/")) {
      variants.push(pattern.replace("**/", ""));
    }

    for (const variant of variants) {
      if (variant.endsWith("/**")) {
        const prefix = variant.slice(0, -3);
        if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
          return true;
        }
        if (!prefix.includes("/") && parts.some((part) => simpleGlobMatch(part, prefix))) {
          return true;
        }
        continue;
      }

      if (!variant.includes("/")) {
        if (parts.some((part) => simpleGlobMatch(part, variant))) {
          return true;
        }
        continue;
      }

      if (!hasGlob(variant)) {
        if (normalized === variant || normalized.startsWith(`${variant}/`)) {
          return true;
        }
        continue;
      }

      if (simpleGlobMatch(normalized, variant)) {
        return true;
      }
    }
  }

  return false;
}

function simpleGlobMatch(value: string, pattern: string): boolean {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      i += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  source += "$";
  return new RegExp(source).test(value);
}

function hasGlob(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?") || pattern.includes("[");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function markdownFence(content: string): string {
  let longestRun = 0;
  let currentRun = 0;
  for (const char of content) {
    if (char === "`") {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 0;
    }
  }
  return "`".repeat(Math.max(3, longestRun + 1));
}

async function defaultReadFileForPreview(
  absolutePath: string,
  maxFileSizeKb: number,
  skipBinary: boolean
): Promise<string | null> {
  const fileStat = await safeStat(absolutePath);
  if (!fileStat || !fileStat.isFile()) {
    return null;
  }
  if (fileStat.size > maxFileSizeKb * 1024) {
    return null;
  }
  if (skipBinary && await isProbablyBinary(absolutePath)) {
    return null;
  }
  return readTextFile(absolutePath);
}

async function readTextFile(absolutePath: string): Promise<string> {
  const data = await readFile(absolutePath);
  return data.toString("utf8");
}

async function isProbablyBinary(absolutePath: string): Promise<boolean> {
  let sample: Buffer;
  try {
    const file = await readFile(absolutePath);
    sample = file.subarray(0, SAMPLE_SIZE);
  } catch {
    return true;
  }

  if (sample.length === 0) {
    return false;
  }

  if (sample.includes(0)) {
    return true;
  }

  const allowedControlBytes = new Set([7, 8, 9, 10, 12, 13, 27]);
  let controlCount = 0;
  for (const byte of sample) {
    if (byte < 32 && !allowedControlBytes.has(byte)) {
      controlCount += 1;
    }
  }
  return controlCount / sample.length > 0.3;
}

// ---------------------------------------------------------------------------
// Git metadata section helpers
// ---------------------------------------------------------------------------

/**
 * Returns the branch label for display — "detached HEAD" for detached state,
 * the branch name otherwise, or undefined if not available.
 */
function formatGitBranchLabel(git: GitProjectInfo): string | undefined {
  if (git.isDetachedHead) {
    return "detached HEAD";
  }
  return git.branch;
}

/**
 * Returns the working tree status label — "modified" or "clean", or undefined
 * if hasTrackedChanges is not available.
 */
function formatGitWorkingTree(git: GitProjectInfo): string | undefined {
  if (typeof git.hasTrackedChanges !== "boolean") {
    return undefined;
  }
  return git.hasTrackedChanges ? "modified" : "clean";
}

/**
 * Append the Git metadata block in Markdown format to the builder.
 * Only appended when git.isGitRepository is true.
 */
function appendGitSectionMarkdown(builder: PreviewBuilder, config: CodeBundleExportConfig): void {
  const git = config.git;
  if (!git?.isGitRepository) {
    return;
  }

  builder.appendLine("## Git");
  builder.appendLine("");

  const branchLabel = formatGitBranchLabel(git);
  if (branchLabel) {
    builder.appendLine(`- Branch: ${branchLabel}`);
  }
  if (git.shortCommit) {
    builder.appendLine(`- Commit: ${git.shortCommit}`);
  }
  const workingTree = formatGitWorkingTree(git);
  if (workingTree) {
    builder.appendLine(`- Working tree: ${workingTree}`);
  }

  builder.appendLine("");
}

/**
 * Append the Git metadata block in plain text format to the builder.
 * Only appended when git.isGitRepository is true.
 */
function appendGitSectionText(builder: PreviewBuilder, config: CodeBundleExportConfig): void {
  const git = config.git;
  if (!git?.isGitRepository) {
    return;
  }

  builder.appendLine("Git");
  builder.appendLine("");

  const branchLabel = formatGitBranchLabel(git);
  if (branchLabel) {
    builder.appendLine(`Branch: ${branchLabel}`);
  }
  if (git.shortCommit) {
    builder.appendLine(`Commit: ${git.shortCommit}`);
  }
  const workingTree = formatGitWorkingTree(git);
  if (workingTree) {
    builder.appendLine(`Working tree: ${workingTree}`);
  }

  builder.appendLine("");
}

/**
 * Format the Git diff mode label for display.
 */
function formatGitDiffModeLabel(gitDiff: GitDiffExportInfo): string {
  if (gitDiff.mode === "branch") {
    return `Branch vs ${gitDiff.baseRef ?? "base"}`;
  }
  return "Working tree vs HEAD";
}

/**
 * Append the Git Diff section in Markdown format.
 * Only appended when config.gitDiff is defined.
 */
function appendGitDiffSectionMarkdown(builder: PreviewBuilder, config: CodeBundleExportConfig): void {
  const gitDiff = config.gitDiff;
  if (!gitDiff) {
    return;
  }

  builder.appendLine("## Git Diff");
  builder.appendLine("");
  builder.appendLine(`- Mode: ${formatGitDiffModeLabel(gitDiff)}`);
  builder.appendLine(`- Changed files selected: ${gitDiff.selectedFilesCount}`);
  builder.appendLine(`- Unavailable/skipped: ${gitDiff.unavailableFilesCount}`);
  builder.appendLine(`- Include untracked: ${gitDiff.includeUntracked ? "yes" : "no"}`);
  builder.appendLine("");
}

/**
 * Append the Git Diff section in plain text format.
 * Only appended when config.gitDiff is defined.
 */
function appendGitDiffSectionText(builder: PreviewBuilder, config: CodeBundleExportConfig): void {
  const gitDiff = config.gitDiff;
  if (!gitDiff) {
    return;
  }

  builder.appendLine("Git Diff");
  builder.appendLine("");
  builder.appendLine(`Mode: ${formatGitDiffModeLabel(gitDiff)}`);
  builder.appendLine(`Changed files selected: ${gitDiff.selectedFilesCount}`);
  builder.appendLine(`Unavailable/skipped: ${gitDiff.unavailableFilesCount}`);
  builder.appendLine(`Include untracked: ${gitDiff.includeUntracked ? "yes" : "no"}`);
  builder.appendLine("");
}

function normalizeRelativePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function safeErrorDetails(message: string): string {
  return message.slice(0, 500);
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function safeLstat(path: string) {
  try {
    return await lstat(path);
  } catch {
    return null;
  }
}

async function safeRealPath(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}
