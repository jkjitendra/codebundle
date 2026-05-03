import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { Dirent } from "node:fs";
import type { ScanNode, ScanProjectOptions, ScanProjectResult, ScanSummary } from "../shared/types";
import { DEFAULT_EXCLUDES } from "./defaultRules";
import { assertSafeProjectRoot, isPathInside } from "./pathSecurity";

const SAMPLE_SIZE = 8192;

interface ScanContext {
  projectRoot: string;
  realProjectRoot: string;
  maxFileSizeBytes: number;
  excludePatterns: string[];
  followSymlinks: boolean;
  summary: ScanSummary;
  nodes: ScanNode[];
}

export async function scanProject(options: ScanProjectOptions): Promise<ScanProjectResult> {
  const projectRoot = assertSafeProjectRoot(options.projectRoot, options.allowHomeDirectory);
  const rootStats = await stat(projectRoot);
  if (!rootStats.isDirectory()) {
    throw new Error("INVALID_PROJECT_ROOT: Project root must be a directory.");
  }

  const realProjectRoot = await realpath(projectRoot);
  const excludePatterns = [
    ...DEFAULT_EXCLUDES,
    ...(options.exclude ?? []),
    ...(options.respectGitIgnore ? await readSimpleGitIgnore(projectRoot) : [])
  ];
  const summary: ScanSummary = {
    totalFiles: 0,
    totalFolders: 0,
    skippedFiles: 0,
    skippedBinary: 0,
    skippedLarge: 0,
    skippedExcluded: 0
  };

  const context: ScanContext = {
    projectRoot,
    realProjectRoot,
    maxFileSizeBytes: Math.max(1, options.maxFileSizeKb) * 1024,
    excludePatterns,
    followSymlinks: options.followSymlinks,
    summary,
    nodes: []
  };

  await scanDirectory(context, projectRoot);
  context.nodes.sort(compareNodes);

  return {
    projectRoot,
    nodes: context.nodes,
    summary
  };
}

async function scanDirectory(context: ScanContext, absoluteDirectory: string): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    return 0;
  }

  let allowedChildren = 0;

  for (const entry of entries) {
    const absolutePath = join(absoluteDirectory, entry.name);
    const relativePath = toRelativePath(context.projectRoot, absolutePath);
    if (!relativePath || isExcludedPath(relativePath, entry.isDirectory(), context.excludePatterns)) {
      if (relativePath) {
        context.summary.skippedFiles += 1;
        context.summary.skippedExcluded += 1;
      }
      continue;
    }

    let pathStats = await safeLstat(absolutePath);
    if (!pathStats) {
      context.summary.skippedFiles += 1;
      continue;
    }

    if (pathStats.isSymbolicLink()) {
      if (!context.followSymlinks) {
        context.summary.skippedFiles += 1;
        continue;
      }

      const resolvedPath = await safeRealPath(absolutePath);
      if (!resolvedPath || !isPathInside(context.realProjectRoot, resolvedPath)) {
        context.summary.skippedFiles += 1;
        continue;
      }

      const resolvedStats = await safeStat(absolutePath);
      if (!resolvedStats) {
        context.summary.skippedFiles += 1;
        continue;
      }
      pathStats = resolvedStats;
    }

    if (pathStats.isDirectory()) {
      const childCount = await scanDirectory(context, absolutePath);
      context.nodes.push({
        path: relativePath,
        name: entry.name,
        type: "directory",
        childrenCount: childCount
      });
      context.summary.totalFolders += 1;
      allowedChildren += 1;
      continue;
    }

    if (!pathStats.isFile()) {
      context.summary.skippedFiles += 1;
      continue;
    }

    if (pathStats.size > context.maxFileSizeBytes) {
      context.summary.skippedFiles += 1;
      context.summary.skippedLarge += 1;
      continue;
    }

    if (await isProbablyBinary(absolutePath)) {
      context.summary.skippedFiles += 1;
      context.summary.skippedBinary += 1;
      continue;
    }

    context.nodes.push({
      path: relativePath,
      name: entry.name,
      type: "file",
      sizeBytes: pathStats.size,
      extension: extname(entry.name)
    });
    context.summary.totalFiles += 1;
    allowedChildren += 1;
  }

  return allowedChildren;
}

async function readSimpleGitIgnore(projectRoot: string): Promise<string[]> {
  try {
    const content = await readFile(join(projectRoot, ".gitignore"), "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"))
      .map((line) => {
        const cleaned = line.replace(/^\/+/, "");
        return cleaned.endsWith("/") ? `${cleaned.replace(/\/+$/, "")}/**` : cleaned;
      });
  } catch {
    return [];
  }
}

async function isProbablyBinary(path: string): Promise<boolean> {
  let sample: Buffer;
  try {
    const file = await readFile(path);
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

export function isExcludedPath(relativePath: string, isDirectory: boolean, patterns: readonly string[]): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  return patterns.some((pattern) => matchesGlob(normalizedPath, isDirectory, pattern));
}

function matchesGlob(relativePath: string, isDirectory: boolean, pattern: string): boolean {
  const normalizedPattern = normalizeRelativePath(pattern);
  if (!normalizedPattern) {
    return false;
  }

  const variants = new Set<string>([normalizedPattern]);
  if (normalizedPattern.includes("**/")) {
    variants.add(normalizedPattern.replaceAll("**/", ""));
  }
  if (normalizedPattern.endsWith("/**")) {
    variants.add(normalizedPattern.slice(0, -3));
  }

  return [...variants].some((variant) => {
    if (variant.endsWith("/**")) {
      const prefix = variant.slice(0, -3);
      if (matchesDirectoryPrefix(relativePath, prefix)) {
        return true;
      }
    }

    if (!variant.includes("/")) {
      return relativePath.split("/").some((part) => globToRegExp(variant).test(part));
    }

    if (isDirectory && matchesDirectoryPrefix(relativePath, variant)) {
      return true;
    }

    return globToRegExp(variant).test(relativePath);
  });
}

function matchesDirectoryPrefix(relativePath: string, prefix: string): boolean {
  if (relativePath === prefix || relativePath.startsWith(`${prefix}/`)) {
    return true;
  }
  return relativePath.endsWith(`/${prefix}`) || relativePath.includes(`/${prefix}/`);
}

function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function toRelativePath(projectRoot: string, absolutePath: string): string {
  return normalizeRelativePath(relative(projectRoot, absolutePath));
}

async function safeLstat(path: string) {
  try {
    return await lstat(path);
  } catch {
    return null;
  }
}

async function safeStat(path: string) {
  try {
    return await stat(path);
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

function compareNodes(left: ScanNode, right: ScanNode): number {
  if (left.type !== right.type) {
    return left.type === "directory" ? -1 : 1;
  }
  return left.path.localeCompare(right.path);
}
