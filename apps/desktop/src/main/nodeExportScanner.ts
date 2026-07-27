import { open, lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { CodeBundleExportConfig, ExporterSummary } from "../shared/types";
import { isPathInside } from "./pathSecurity";
import { isNodeExportExcluded, normalizeExportPath } from "./nodeExportIgnore";

const SAMPLE_SIZE = 8192;

const DEFAULT_EXCLUDES = [
  ".git/**", "node_modules/**", "dist/**", "build/**", ".next/**", "coverage/**", "__pycache__/**",
  ".venv/**", ".venv-build/**", "venv/**", "target/**", "out/**", ".idea/**", ".vscode/**", "*.pyc",
  "*.class", "*.jar", "*.war", "*.zip", "*.tar", "*.gz", "*.png", "*.jpg", "*.jpeg", "*.gif",
  "*.webp", "*.ico", "*.pdf", "*.mp4", "*.mov", "*.mp3", "*.wav", ".env", ".env.*", "*.pem",
  "*.key", "*.p12", "*.keystore", "credentials.json", "service-account.json", "codebundle-output.md",
  "codebundle-output.txt", "*.codebundle.tmp.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"
];

export interface NodeExportFileEntry {
  relativePath: string;
  absolutePath: string;
}

export interface NodeExportScanResult {
  entries: NodeExportFileEntry[];
  summary: ExporterSummary;
}

export async function scanNodeExportFiles(config: CodeBundleExportConfig): Promise<NodeExportScanResult> {
  const projectRoot = await resolveProjectRoot(config.projectRoot);
  const outputFile = resolve(config.outputFile);
  const summary = emptySummary();
  const patterns = [...DEFAULT_EXCLUDES, ...config.exclude, ...(await readGitIgnore(projectRoot, config.respectGitIgnore))];
  const candidates: string[] = [];

  if (config.mode !== "selected") {
    throw new Error("Node fallback supports selected export mode only.");
  }

  for (const selectedFile of config.files) {
    const path = validateSelectedPath(projectRoot, selectedFile, "files");
    const info = await lstat(path).catch(() => null);
    if (!info) {
      summary.skippedMissing += 1;
    } else if (!info.isFile() && !info.isSymbolicLink()) {
      summary.skippedInvalid += 1;
    } else {
      candidates.push(path);
    }
  }

  for (const selectedFolder of config.folders) {
    const path = validateSelectedPath(projectRoot, selectedFolder, "folders");
    const info = await lstat(path).catch(() => null);
    if (!info) {
      summary.skippedMissing += 1;
    } else if (!info.isDirectory() && !info.isSymbolicLink()) {
      summary.skippedInvalid += 1;
    } else if (info.isSymbolicLink() && !config.followSymlinks) {
      summary.skippedInvalid += 1;
    } else {
      candidates.push(...(await walkDirectory(projectRoot, path, config.followSymlinks, patterns, summary)));
    }
  }

  const seen = new Set<string>();
  const entries: NodeExportFileEntry[] = [];
  for (const candidate of candidates) {
    const entry = await evaluateFile(projectRoot, outputFile, candidate, patterns, config, summary);
    if (!entry || seen.has(entry.absolutePath)) continue;
    seen.add(entry.absolutePath);
    entries.push(entry);
  }

  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  summary.exportedFiles = entries.length;
  return { entries, summary };
}

function emptySummary(): ExporterSummary {
  return { exportedFiles: 0, skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 };
}

async function resolveProjectRoot(projectRoot: string): Promise<string> {
  if (!isAbsolute(projectRoot)) throw new Error("projectRoot must be absolute");
  const info = await stat(projectRoot).catch(() => null);
  if (!info?.isDirectory()) throw new Error("projectRoot must be an existing directory");
  return realpath(projectRoot);
}

function validateSelectedPath(projectRoot: string, selectedPath: string, label: string): string {
  if (!selectedPath || isAbsolute(selectedPath)) throw new Error(`${label} entries must be non-empty relative paths`);
  const candidate = resolve(projectRoot, selectedPath);
  if (!isPathInside(projectRoot, candidate)) throw new Error(`${label} entry escapes projectRoot: ${selectedPath}`);
  return candidate;
}

async function walkDirectory(
  projectRoot: string,
  directory: string,
  followSymlinks: boolean,
  patterns: string[],
  summary: ExporterSummary
): Promise<string[]> {
  const results: string[] = [];
  const resolvedDirectory = await realpath(directory).catch(() => null);
  if (!resolvedDirectory || !isPathInside(projectRoot, resolvedDirectory)) {
    summary.skippedInvalid += 1;
    return results;
  }
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    summary.skippedInvalid += 1;
    return results;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const item of entries) {
    const candidate = resolve(directory, item.name);
    const relativePath = normalizeExportPath(relative(projectRoot, candidate));
    if (isNodeExportExcluded(relativePath, patterns)) {
      summary.skippedExcluded += 1;
      continue;
    }
    if (item.isSymbolicLink() && !followSymlinks) {
      summary.skippedInvalid += 1;
      continue;
    }
    const resolved = await realpath(candidate).catch(() => null);
    if (resolved && !isPathInside(projectRoot, resolved)) {
      summary.skippedInvalid += 1;
      continue;
    }
    const info = await stat(candidate).catch(() => null);
    if (!info) {
      summary.skippedMissing += 1;
    } else if (info.isDirectory()) {
      results.push(...(await walkDirectory(projectRoot, candidate, followSymlinks, patterns, summary)));
    } else if (info.isFile()) {
      results.push(candidate);
    } else {
      summary.skippedInvalid += 1;
    }
  }
  return results;
}

async function evaluateFile(
  projectRoot: string,
  outputFile: string,
  candidate: string,
  patterns: string[],
  config: CodeBundleExportConfig,
  summary: ExporterSummary
): Promise<NodeExportFileEntry | null> {
  const linkInfo = await lstat(candidate).catch(() => null);
  if (!linkInfo) {
    summary.skippedMissing += 1;
    return null;
  }
  if (linkInfo.isSymbolicLink() && !config.followSymlinks) {
    summary.skippedInvalid += 1;
    return null;
  }
  const resolved = await realpath(candidate).catch(() => null);
  if (!resolved || !isPathInside(projectRoot, resolved)) {
    summary.skippedInvalid += 1;
    return null;
  }
  const relativePath = normalizeExportPath(relative(projectRoot, candidate));
  if (resolved === outputFile || isNodeExportExcluded(relativePath, patterns)) {
    summary.skippedExcluded += 1;
    return null;
  }
  const info = await stat(resolved).catch(() => null);
  if (!info?.isFile()) {
    summary.skippedMissing += 1;
    return null;
  }
  if (info.size > config.maxFileSizeKb * 1024) {
    summary.skippedLarge += 1;
    return null;
  }
  if (config.skipBinaryFiles && await isProbablyBinary(resolved)) {
    summary.skippedBinary += 1;
    return null;
  }
  return { relativePath, absolutePath: resolved };
}

async function isProbablyBinary(path: string): Promise<boolean> {
  try {
    const file = await open(path, "r");
    try {
      const buffer = Buffer.alloc(SAMPLE_SIZE);
      const { bytesRead } = await file.read(buffer, 0, SAMPLE_SIZE, 0);
      const sample = buffer.subarray(0, bytesRead);
      if (sample.includes(0)) return true;
      if (!sample.length) return false;
      const controls = new Set([7, 8, 9, 10, 12, 13, 27]);
      return [...sample].filter((byte) => byte < 32 && !controls.has(byte)).length / sample.length > 0.3;
    } finally {
      await file.close();
    }
  } catch {
    return true;
  }
}

async function readGitIgnore(projectRoot: string, enabled: boolean): Promise<string[]> {
  if (!enabled) return [];
  const content = await (await import("node:fs/promises")).readFile(resolve(projectRoot, ".gitignore"), "utf8").catch(() => "");
  return content.split(/\r?\n/).flatMap((line) => {
    const pattern = line.trim();
    if (!pattern || pattern.startsWith("#") || pattern.startsWith("!")) return [];
    return [pattern.endsWith("/") ? `${pattern.slice(0, -1)}/**` : pattern];
  });
}
