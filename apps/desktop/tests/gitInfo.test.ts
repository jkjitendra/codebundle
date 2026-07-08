import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// We mock child_process.execFile before importing gitInfo so the module
// uses our stub instead of the real implementation.
vi.mock("node:child_process", () => ({
  execFile: vi.fn()
}));

import { execFile } from "node:child_process";
import { detectGitProjectInfo } from "../src/main/gitInfo";

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFileMock = (
  bin: string,
  args: string[],
  opts: unknown,
  cb: ExecFileCallback
) => never;

function fakeChildProcess(): never {
  return { on: vi.fn() } as never;
}

function mockGitSuccess(stdout: string): ExecFileMock {
  return (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
    cb(null, stdout, "");
    return fakeChildProcess();
  };
}

function mockGitError(error: Error): ExecFileMock {
  return (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCallback) => {
    cb(error, "", "");
    return fakeChildProcess();
  };
}

function mockGitSequence(sequence: ExecFileMock[]): void {
  for (const implementation of sequence) {
    mockExecFile.mockImplementationOnce(implementation);
  }
}

/** Returns a standard ENOENT error (git not found). */
function enoentError(): Error {
  const err = new Error("spawn git ENOENT") as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
}

/** Returns a generic non-zero exit error. */
function exitError(message = "Command failed"): Error {
  return new Error(message);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Git not available
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — git not available", () => {
  it("returns gitAvailable: false and isGitRepository: false when git is missing (ENOENT)", async () => {
    mockExecFile.mockImplementation(mockGitError(enoentError()));

    const result = await detectGitProjectInfo("/some/project");

    expect(result.gitAvailable).toBe(false);
    expect(result.isGitRepository).toBe(false);
    expect(result.warning).toContain("Git is not available");
  });
});

// ---------------------------------------------------------------------------
// Not a Git repository
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — not a Git repository", () => {
  it("returns isGitRepository: false when rev-parse fails with non-zero exit", async () => {
    mockExecFile.mockImplementation(mockGitError(exitError("fatal: not a git repository")));

    const result = await detectGitProjectInfo("/some/project");

    expect(result.gitAvailable).toBe(true);
    expect(result.isGitRepository).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("returns isGitRepository: false when rev-parse --is-inside-work-tree returns 'false'", async () => {
    // git can return "false" as stdout in some edge cases (not inside worktree).
    mockExecFile.mockImplementation(mockGitSuccess("false"));

    const result = await detectGitProjectInfo("/some/project");

    expect(result.isGitRepository).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Branch detection
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — branch detection", () => {
  it("detects a normal branch name", async () => {
    mockGitSequence([
      mockGitSuccess("true"),                      // is-inside-work-tree
      mockGitSuccess("/repo"),                      // show-toplevel
      mockGitSuccess("main"),                       // abbrev-ref HEAD
      mockGitSuccess("abc1234567890abcdef1234567890abcdef12345678"), // rev-parse HEAD
      mockGitSuccess("abc1234"),                    // --short HEAD
      mockGitSuccess(""),                           // status --porcelain (clean)
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.isGitRepository).toBe(true);
    expect(result.gitAvailable).toBe(true);
    expect(result.branch).toBe("main");
    expect(result.isDetachedHead).toBe(false);
  });

  it("detects a feature branch name", async () => {
    mockGitSequence([
      mockGitSuccess("true"),
      mockGitSuccess("/repo"),
      mockGitSuccess("feature/git-branch-aware-exports"),
      mockGitSuccess("deadbeef1234567890abcdef1234567890abcdef"),
      mockGitSuccess("deadbee"),
      mockGitSuccess(""),
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.branch).toBe("feature/git-branch-aware-exports");
    expect(result.isDetachedHead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Detached HEAD detection
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — detached HEAD", () => {
  it("sets isDetachedHead: true and branch: undefined when abbrev-ref returns HEAD", async () => {
    mockGitSequence([
      mockGitSuccess("true"),
      mockGitSuccess("/repo"),
      mockGitSuccess("HEAD"),     // detached HEAD indicator
      mockGitSuccess("cafebabe1234567890abcdef1234567890abcdef"),
      mockGitSuccess("cafebab"),
      mockGitSuccess(""),
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.isDetachedHead).toBe(true);
    expect(result.branch).toBeUndefined();
    expect(result.shortCommit).toBe("cafebab");
  });
});

// ---------------------------------------------------------------------------
// Commit detection
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — commit detection", () => {
  it("captures both full commit hash and short commit hash", async () => {
    const fullHash = "1234567890abcdef1234567890abcdef12345678";
    const shortHash = "1234567";

    mockGitSequence([
      mockGitSuccess("true"),
      mockGitSuccess("/repo"),
      mockGitSuccess("main"),
      mockGitSuccess(fullHash),
      mockGitSuccess(shortHash),
      mockGitSuccess(""),
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.commit).toBe(fullHash);
    expect(result.shortCommit).toBe(shortHash);
  });
});

// ---------------------------------------------------------------------------
// Working tree status
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — working tree status", () => {
  it("reports hasTrackedChanges: false for a clean working tree", async () => {
    mockGitSequence([
      mockGitSuccess("true"),
      mockGitSuccess("/repo"),
      mockGitSuccess("main"),
      mockGitSuccess("abc1234567890abcdef1234567890abcdef12345678"),
      mockGitSuccess("abc1234"),
      mockGitSuccess(""),  // empty porcelain output = clean
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.hasTrackedChanges).toBe(false);
  });

  it("reports hasTrackedChanges: true when tracked files are modified", async () => {
    mockGitSequence([
      mockGitSuccess("true"),
      mockGitSuccess("/repo"),
      mockGitSuccess("main"),
      mockGitSuccess("abc1234567890abcdef1234567890abcdef12345678"),
      mockGitSuccess("abc1234"),
      mockGitSuccess(" M src/app.ts\n M src/lib.ts\n"),  // dirty
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.hasTrackedChanges).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Partial failure resilience
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — partial failure resilience", () => {
  it("returns partial result when individual git commands fail after initial success", async () => {
    mockGitSequence([
      mockGitSuccess("true"),            // is-inside-work-tree OK
      mockGitError(exitError()),         // show-toplevel fails
      mockGitSuccess("main"),            // abbrev-ref OK
      mockGitError(exitError()),         // rev-parse HEAD fails
      mockGitError(exitError()),         // --short HEAD fails
      mockGitSuccess(""),                // status OK
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.isGitRepository).toBe(true);
    expect(result.gitAvailable).toBe(true);
    expect(result.branch).toBe("main");
    expect(result.repoRoot).toBeUndefined();
    expect(result.commit).toBeUndefined();
    expect(result.shortCommit).toBeUndefined();
    expect(result.hasTrackedChanges).toBe(false);
  });

  it("does not throw on malformed Git output (empty strings)", async () => {
    mockGitSequence([
      mockGitSuccess("true"),
      mockGitSuccess(""),     // empty show-toplevel
      mockGitSuccess(""),     // empty abbrev-ref
      mockGitSuccess(""),     // empty full commit
      mockGitSuccess(""),     // empty short commit
      mockGitSuccess(""),     // clean status
    ]);

    const result = await detectGitProjectInfo("/repo");

    expect(result.isGitRepository).toBe(true);
    expect(result.branch).toBeUndefined();
    expect(result.commit).toBeUndefined();
    expect(result.shortCommit).toBeUndefined();
    expect(result.repoRoot).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Timeout safety
// ---------------------------------------------------------------------------

describe("detectGitProjectInfo — timeout handling", () => {
  it("returns a safe non-Git result when git executable times out on first call", async () => {
    // Simulate ETIMEDOUT (execFile timeout kills the process and returns an error)
    const timeoutErr = new Error("Command timed out") as NodeJS.ErrnoException;
    timeoutErr.code = "ETIMEDOUT";
    mockExecFile.mockImplementation(mockGitError(timeoutErr));

    // Should not throw — execFile error on first call is treated as non-Git (or unavailable).
    const result = await detectGitProjectInfo("/repo");

    expect(result).toBeDefined();
    expect(result.isGitRepository).toBe(false);
  });

  it("returns partial info when timeout occurs on a non-first git command", async () => {
    const timeoutErr = new Error("Command timed out") as NodeJS.ErrnoException;
    timeoutErr.code = "ETIMEDOUT";

    mockGitSequence([
      mockGitSuccess("true"),
      mockGitSuccess("/repo"),
      mockGitError(timeoutErr),   // abbrev-ref times out
      mockGitError(timeoutErr),   // rev-parse HEAD times out
      mockGitError(timeoutErr),   // short HEAD times out
      mockGitError(timeoutErr),   // status times out
    ]);

    const result = await detectGitProjectInfo("/repo");

    // Should still return a valid result with what was captured.
    expect(result.isGitRepository).toBe(true);
    expect(result.repoRoot).toBe("/repo");
    expect(result.branch).toBeUndefined();
    expect(result.commit).toBeUndefined();
  });
});
