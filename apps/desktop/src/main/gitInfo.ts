/**
 * Git project information detection.
 *
 * Runs Git commands in the Electron main process using child_process.execFile
 * with argument arrays (never shell strings). All failures are handled safely —
 * callers always receive a GitProjectInfo, never a thrown error.
 *
 * Security constraints:
 *  - No shell command strings.
 *  - No remote URL collection.
 *  - No branch switching or staging.
 *  - Timeout enforced per command (GIT_COMMAND_TIMEOUT_MS).
 *  - Stdout/stderr capped (GIT_STDOUT_CAP_BYTES).
 *  - Paths are never logged in full.
 */

import { execFile } from "node:child_process";
import type { GitProjectInfo } from "../shared/types";

const GIT_COMMAND_TIMEOUT_MS = 2000;
const GIT_STDOUT_CAP_BYTES = 4096;

/**
 * Run a git command using execFile (no shell). Returns stdout trimmed, or throws on failure.
 */
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cp = execFile(
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
        } else {
          resolve(stdout.trim());
        }
      }
    );
    // Safety: if the child process hangs past our timeout, kill it.
    cp.on("error", () => {
      /* handled by callback */
    });
  });
}

/**
 * Detect Git context for the given projectRoot directory.
 *
 * Always returns a GitProjectInfo — never throws.
 */
export async function detectGitProjectInfo(projectRoot: string): Promise<GitProjectInfo> {
  // Step 1: check if Git is available and projectRoot is inside a worktree.
  let isInsideWorkTree: string;
  try {
    isInsideWorkTree = await runGit(["rev-parse", "--is-inside-work-tree"], projectRoot);
  } catch (error: unknown) {
    // ENOENT means git executable not found.
    if (isEnoent(error)) {
      return {
        isGitRepository: false,
        gitAvailable: false,
        warning: "Git is not available."
      };
    }
    // Any other failure (non-zero exit, timeout, etc.) — not a Git repository.
    return {
      isGitRepository: false,
      gitAvailable: true
    };
  }

  if (isInsideWorkTree !== "true") {
    return {
      isGitRepository: false,
      gitAvailable: true
    };
  }

  // Step 2: gather metadata, collecting each field independently so partial failures are safe.
  const info: GitProjectInfo = {
    isGitRepository: true,
    gitAvailable: true
  };

  // Repo root
  try {
    const repoRoot = await runGit(["rev-parse", "--show-toplevel"], projectRoot);
    if (repoRoot) {
      info.repoRoot = repoRoot;
    }
  } catch {
    // Non-fatal — leave repoRoot undefined.
  }

  // Branch / detached HEAD
  try {
    const abbrevRef = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot);
    if (abbrevRef === "HEAD") {
      info.isDetachedHead = true;
      // branch stays undefined for detached HEAD
    } else if (abbrevRef) {
      info.branch = abbrevRef;
      info.isDetachedHead = false;
    }
  } catch {
    // Non-fatal — leave branch and isDetachedHead undefined.
  }

  // Full commit hash
  try {
    const fullCommit = await runGit(["rev-parse", "HEAD"], projectRoot);
    if (fullCommit) {
      info.commit = fullCommit;
    }
  } catch {
    // Non-fatal — leave commit undefined.
  }

  // Short commit hash
  try {
    const shortCommit = await runGit(["rev-parse", "--short", "HEAD"], projectRoot);
    if (shortCommit) {
      info.shortCommit = shortCommit;
    }
  } catch {
    // Non-fatal — leave shortCommit undefined.
  }

  // Working tree status (tracked files only; --untracked-files=no avoids scanning large repos)
  try {
    const statusOutput = await runGit(
      ["status", "--porcelain=v1", "--untracked-files=no"],
      projectRoot
    );
    info.hasTrackedChanges = statusOutput.length > 0;
  } catch {
    // Non-fatal — leave hasTrackedChanges undefined.
  }

  return info;
}

function isEnoent(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ENOENT: git executable not found on PATH.
    // On Windows the error may surface as ENOENT or a spawn error.
    return code === "ENOENT" || error.message.includes("ENOENT");
  }
  return false;
}
