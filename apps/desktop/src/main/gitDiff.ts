/**
 * Local Git diff file detection for the diff-only selection flow.
 *
 * This module deliberately reads only Git status/path metadata. Commands use
 * execFile with argument arrays, never a shell, and failures return a safe
 * empty result for the renderer to handle.
 */

import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { GitDiffFile, GitDiffMode, GitDiffResult } from "../shared/types";

const GIT_COMMAND_TIMEOUT_MS = 2_000;
const GIT_STDOUT_CAP_BYTES = 1024 * 1024;
const EMPTY_COUNTS = { deletedCount: 0, skippedInvalidCount: 0 };

const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const UNSAFE_REF_PREFIXES = ["-"];
const UNSAFE_REF_SUBSTRINGS = ["..", "@{", " ", ".lock"];
const UNSAFE_REF_SUFFIXES = ["/"];
const UNSAFE_SEGMENT_NAMES = new Set([".", ".."]);

function validateBaseRef(ref: string): string | undefined {
  if (!ref || typeof ref !== "string") {
    return "baseRef must be a non-empty string";
  }
  if (ref.length > 200) {
    return "baseRef must not exceed 200 characters";
  }
  if (!SAFE_REF_PATTERN.test(ref)) {
    return "baseRef contains disallowed characters";
  }
  for (const prefix of UNSAFE_REF_PREFIXES) {
    if (ref.startsWith(prefix)) {
      return `baseRef must not start with "${prefix}"`;
    }
  }
  for (const sub of UNSAFE_REF_SUBSTRINGS) {
    if (ref.includes(sub)) {
      return `baseRef must not contain "${sub}"`;
    }
  }
  for (const suffix of UNSAFE_REF_SUFFIXES) {
    if (ref.endsWith(suffix)) {
      return `baseRef must not end with "${suffix}"`;
    }
  }
  for (const segment of ref.split("/")) {
    if (UNSAFE_SEGMENT_NAMES.has(segment)) {
      return `baseRef must not contain path segment "${segment}"`;
    }
  }
  return undefined;
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd,
        timeout: GIT_COMMAND_TIMEOUT_MS,
        maxBuffer: GIT_STDOUT_CAP_BYTES,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(String(stdout));
      }
    );
    child.on("error", () => {
      // execFile also delivers spawn errors through the callback above.
    });
  });
}

function isEnoent(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || error.message.includes("ENOENT");
}

function safeResult(mode: GitDiffMode, options: Partial<GitDiffResult> = {}): GitDiffResult {
  return {
    isGitRepository: false,
    gitAvailable: true,
    mode,
    files: [],
    ...EMPTY_COUNTS,
    ...options
  };
}

function normalizeDiffPath(rawPath: string, repoRoot: string, projectRoot: string): string | null {
  if (!rawPath) {
    return null;
  }

  const normalized = rawPath.replace(/\\/g, "/");
  if (isAbsolute(normalized)) {
    return null;
  }

  const absolutePath = resolve(repoRoot, normalized);
  const projectRelativePath = relative(resolve(projectRoot), absolutePath);
  if (
    !projectRelativePath ||
    projectRelativePath === ".." ||
    projectRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(projectRelativePath)
  ) {
    return null;
  }

  return projectRelativePath.replace(/\\/g, "/");
}

interface ParsedDiffEntry {
  status: GitDiffFile["status"] | "deleted";
  oldPath?: string;
  newPath: string;
}

interface ParsedNameStatusOutput {
  entries: ParsedDiffEntry[];
  malformedCount: number;
}

function parseNameStatusZOutput(raw: string): ParsedNameStatusOutput {
  const tokens = raw.split("\0");
  const entries: ParsedDiffEntry[] = [];
  let malformedCount = 0;
  let index = 0;

  while (index < tokens.length - 1) {
    const statusToken = tokens[index++];
    if (!statusToken) {
      malformedCount += 1;
      continue;
    }

    const status = statusToken[0].toUpperCase();
    if (status === "R" || status === "C") {
      const oldPath = tokens[index++];
      const newPath = tokens[index++];
      if (!oldPath || !newPath) {
        malformedCount += 1;
        continue;
      }
      entries.push({ status: status === "R" ? "renamed" : "copied", oldPath, newPath });
      continue;
    }

    const newPath = tokens[index++];
    if (!newPath) {
      malformedCount += 1;
      continue;
    }
    switch (status) {
      case "A":
        entries.push({ status: "added", newPath });
        break;
      case "M":
        entries.push({ status: "modified", newPath });
        break;
      case "D":
        entries.push({ status: "deleted", newPath });
        break;
      case "T":
        entries.push({ status: "typeChanged", newPath });
        break;
      default:
        malformedCount += 1;
    }
  }

  return { entries, malformedCount };
}

function extractOptions(input: unknown): {
  projectRoot: string;
  mode: GitDiffMode;
  baseRef?: string;
  includeUntracked: boolean;
} | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (typeof record.projectRoot !== "string" || !isAbsolute(record.projectRoot)) {
    return null;
  }
  if (record.mode !== "workingTree" && record.mode !== "branch") {
    return null;
  }
  if (typeof record.includeUntracked !== "boolean") {
    return null;
  }
  if (record.baseRef !== undefined && typeof record.baseRef !== "string") {
    return null;
  }
  const baseRef = record.baseRef?.trim() || undefined;
  return {
    projectRoot: record.projectRoot,
    mode: record.mode,
    baseRef,
    includeUntracked: record.includeUntracked
  };
}

/**
 * Get changed paths, returning paths relative to projectRoot even when it is
 * a subfolder of a larger repository. Deleted and invalid paths are counted
 * but are never returned as selectable files.
 */
export async function getGitDiffFiles(input: unknown): Promise<GitDiffResult> {
  const options = extractOptions(input);
  if (!options) {
    return safeResult("workingTree", { gitAvailable: false, warning: "Invalid Git diff options." });
  }

  const { projectRoot, mode, baseRef, includeUntracked } = options;
  try {
    const insideWorkTree = (await runGit(["rev-parse", "--is-inside-work-tree"], projectRoot)).trim();
    if (insideWorkTree !== "true") {
      return safeResult(mode);
    }
  } catch (error) {
    if (isEnoent(error)) {
      return safeResult(mode, { gitAvailable: false, warning: "Git is not available." });
    }
    return safeResult(mode);
  }

  let repoRoot: string;
  try {
    repoRoot = (await runGit(["rev-parse", "--show-toplevel"], projectRoot)).trim();
  } catch {
    return safeResult(mode);
  }
  if (!repoRoot || !isAbsolute(repoRoot)) {
    return safeResult(mode);
  }

  let diffArgs: string[];
  if (mode === "branch") {
    if (!baseRef) {
      return safeResult(mode, { isGitRepository: true, baseRef, warning: "Branch mode requires a baseRef." });
    }
    const refError = validateBaseRef(baseRef);
    if (refError) {
      return safeResult(mode, { isGitRepository: true, baseRef, warning: `Invalid baseRef: ${refError}` });
    }
    let mergeBase: string;
    try {
      mergeBase = (await runGit(["merge-base", baseRef, "HEAD"], repoRoot)).trim();
    } catch {
      return safeResult(mode, {
        isGitRepository: true,
        baseRef,
        warning: `Could not compute merge base for "${baseRef}". The ref may not exist locally.`
      });
    }
    if (!mergeBase) {
      return safeResult(mode, { isGitRepository: true, baseRef, warning: `No merge base found for "${baseRef}".` });
    }
    diffArgs = ["diff", "--name-status", "-z", "--diff-filter=ACMRTD", mergeBase, "HEAD", "--"];
  } else {
    diffArgs = ["diff", "--name-status", "-z", "--diff-filter=ACMRTD", "HEAD", "--"];
  }

  let diffOutput: string;
  try {
    diffOutput = await runGit(diffArgs, repoRoot);
  } catch {
    return safeResult(mode, { isGitRepository: true, baseRef: mode === "branch" ? baseRef : undefined, warning: "Git diff command failed." });
  }

  const parsed = parseNameStatusZOutput(diffOutput);
  const files: GitDiffFile[] = [];
  const pathsSeen = new Set<string>();
  let deletedCount = 0;
  let skippedInvalidCount = parsed.malformedCount;

  for (const entry of parsed.entries) {
    if (entry.status === "deleted") {
      deletedCount += 1;
      continue;
    }
    const path = normalizeDiffPath(entry.newPath, repoRoot, projectRoot);
    if (!path) {
      skippedInvalidCount += 1;
      continue;
    }
    if (!pathsSeen.has(path)) {
      files.push({ path, status: entry.status });
      pathsSeen.add(path);
    }
  }

  if (includeUntracked) {
    try {
      const untrackedOutput = await runGit(["ls-files", "--others", "--exclude-standard", "-z"], repoRoot);
      for (const rawPath of untrackedOutput.split("\0")) {
        if (!rawPath) {
          continue;
        }
        const path = normalizeDiffPath(rawPath, repoRoot, projectRoot);
        if (!path) {
          skippedInvalidCount += 1;
          continue;
        }
        if (!pathsSeen.has(path)) {
          files.push({ path, status: "untracked" });
          pathsSeen.add(path);
        }
      }
    } catch {
      // A successful tracked diff remains useful if optional untracked lookup fails.
    }
  }

  return {
    isGitRepository: true,
    gitAvailable: true,
    mode,
    baseRef: mode === "branch" ? baseRef : undefined,
    files,
    deletedCount,
    skippedInvalidCount
  };
}
