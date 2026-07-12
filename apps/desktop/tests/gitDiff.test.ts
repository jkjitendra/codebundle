import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

import { execFile } from "node:child_process";
import { getGitDiffFiles } from "../src/main/gitDiff";

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

type Callback = (error: Error | null, stdout: string, stderr: string) => void;
type Implementation = (_bin: string, _args: string[], _options: unknown, callback: Callback) => never;

function childProcess(): never {
  return { on: vi.fn() } as never;
}

function success(stdout: string): Implementation {
  return (_bin, _args, _options, callback) => {
    callback(null, stdout, "");
    return childProcess();
  };
}

function failure(error: Error): Implementation {
  return (_bin, _args, _options, callback) => {
    callback(error, "", "");
    return childProcess();
  };
}

function sequence(...implementations: Implementation[]): void {
  implementations.forEach((implementation) => mockExecFile.mockImplementationOnce(implementation));
}

function gitReady(diffOutput = ""): void {
  sequence(success("true"), success("/repo"), success(diffOutput));
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    projectRoot: "/repo",
    mode: "workingTree" as const,
    includeUntracked: false,
    ...overrides
  };
}

function enoentError(): Error {
  const error = new Error("spawn git ENOENT") as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.resetAllMocks());

describe("getGitDiffFiles", () => {
  it("returns a safe unavailable result when Git is missing", async () => {
    mockExecFile.mockImplementation(failure(enoentError()));

    await expect(getGitDiffFiles(options())).resolves.toMatchObject({
      isGitRepository: false,
      gitAvailable: false,
      files: []
    });
  });

  it("returns a safe non-repository result", async () => {
    mockExecFile.mockImplementation(failure(new Error("not a git repository")));

    await expect(getGitDiffFiles(options())).resolves.toMatchObject({
      isGitRepository: false,
      gitAvailable: true,
      files: []
    });
  });

  it("parses working-tree changes and counts deleted files", async () => {
    gitReady("M\0src/app.ts\0A\0new.ts\0D\0gone.ts\0T\0script\0");

    const result = await getGitDiffFiles(options());

    expect(result.files).toEqual([
      { path: "src/app.ts", status: "modified" },
      { path: "new.ts", status: "added" },
      { path: "script", status: "typeChanged" }
    ]);
    expect(result.deletedCount).toBe(1);
    expect(mockExecFile).toHaveBeenLastCalledWith(
      "git",
      ["diff", "--name-status", "-z", "--diff-filter=ACMRTD", "HEAD", "--"],
      expect.objectContaining({ cwd: "/repo" }),
      expect.any(Function)
    );
  });

  it("uses the new path for renames and copies", async () => {
    gitReady("R100\0old.ts\0renamed.ts\0C100\0source.ts\0copied.ts\0");

    await expect(getGitDiffFiles(options())).resolves.toMatchObject({
      files: [
        { path: "renamed.ts", status: "renamed" },
        { path: "copied.ts", status: "copied" }
      ]
    });
  });

  it("runs a branch comparison from the local merge base", async () => {
    sequence(success("true"), success("/repo"), success("abc123"), success("M\0src/app.ts\0"));

    const result = await getGitDiffFiles(options({ mode: "branch", baseRef: "main" }));

    expect(result.files).toEqual([{ path: "src/app.ts", status: "modified" }]);
    expect(mockExecFile.mock.calls[2][1]).toEqual(["merge-base", "main", "HEAD"]);
    expect(mockExecFile.mock.calls[3][1]).toEqual([
      "diff", "--name-status", "-z", "--diff-filter=ACMRTD", "abc123", "HEAD", "--"
    ]);
  });

  it.each(["-main", "main..old", "main@{1}", "main branch", "main.lock", "main/", ".", "main/../old"]) (
    "rejects unsafe branch base ref %s",
    async (baseRef) => {
      sequence(success("true"), success("/repo"));

      const result = await getGitDiffFiles(options({ mode: "branch", baseRef }));

      expect(result.warning).toContain("Invalid baseRef");
      expect(result.files).toEqual([]);
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    }
  );

  it("includes untracked files only when requested", async () => {
    gitReady("M\0src/app.ts\0");
    await expect(getGitDiffFiles(options())).resolves.toMatchObject({
      files: [{ path: "src/app.ts", status: "modified" }]
    });

    vi.resetAllMocks();
    sequence(success("true"), success("/repo"), success("M\0src/app.ts\0"), success("notes.txt\0"));
    await expect(getGitDiffFiles(options({ includeUntracked: true }))).resolves.toMatchObject({
      files: [
        { path: "src/app.ts", status: "modified" },
        { path: "notes.txt", status: "untracked" }
      ]
    });
  });

  it("skips traversal paths and maps repo-root paths for a scanned subfolder", async () => {
    sequence(
      success("true"),
      success("/repo"),
      success("M\0packages/app/src/index.ts\0M\0README.md\0M\0../outside.ts\0")
    );

    const result = await getGitDiffFiles(options({ projectRoot: "/repo/packages/app" }));

    expect(result.files).toEqual([{ path: "src/index.ts", status: "modified" }]);
    expect(result.skippedInvalidCount).toBe(2);
  });

  it("returns a safe warning when a Git command fails or output is malformed", async () => {
    sequence(success("true"), success("/repo"), failure(new Error("timeout")));
    await expect(getGitDiffFiles(options())).resolves.toMatchObject({
      isGitRepository: true,
      warning: "Git diff command failed.",
      files: []
    });

    vi.resetAllMocks();
    gitReady("M\0");
    await expect(getGitDiffFiles(options())).resolves.toMatchObject({
      files: [],
      skippedInvalidCount: 1
    });
  });
});
