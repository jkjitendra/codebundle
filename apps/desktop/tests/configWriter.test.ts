import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeGitDiffInfo, sanitizeGitInfo, writeValidatedExportConfig } from "../src/main/configWriter";

function makeExportConfig(projectRoot: string, outputFile: string, git: unknown) {
  return {
    version: 1,
    projectRoot,
    outputFile,
    format: "markdown",
    mode: "selected",
    files: ["app.ts"],
    folders: [],
    include: [],
    exclude: [],
    maxFileSizeKb: 500,
    skipBinaryFiles: true,
    respectGitIgnore: true,
    followSymlinks: false,
    git
  };
}

function validGitDiff(overrides: Record<string, unknown> = {}) {
  return {
    mode: "workingTree",
    includeUntracked: false,
    changedFilesCount: 3,
    selectedFilesCount: 2,
    unavailableFilesCount: 1,
    ...overrides
  };
}

describe("sanitizeGitInfo", () => {
  it("passes through valid Git metadata", () => {
    expect(
      sanitizeGitInfo({
        isGitRepository: true,
        gitAvailable: true,
        repoRoot: "/repo",
        branch: "main",
        commit: "abc1234567890abcdef1234567890abcdef12345678",
        shortCommit: "abc1234",
        isDetachedHead: false,
        hasTrackedChanges: true,
        warning: "partial Git metadata"
      })
    ).toEqual({
      isGitRepository: true,
      gitAvailable: true,
      repoRoot: "/repo",
      branch: "main",
      commit: "abc1234567890abcdef1234567890abcdef12345678",
      shortCommit: "abc1234",
      isDetachedHead: false,
      hasTrackedChanges: true,
      warning: "partial Git metadata"
    });
  });

  it("returns undefined for non-object input", () => {
    expect(sanitizeGitInfo(null)).toBeUndefined();
    expect(sanitizeGitInfo("main")).toBeUndefined();
    expect(sanitizeGitInfo([])).toBeUndefined();
  });

  it("returns undefined when required booleans are missing", () => {
    expect(sanitizeGitInfo({ gitAvailable: true })).toBeUndefined();
    expect(sanitizeGitInfo({ isGitRepository: true })).toBeUndefined();
    expect(sanitizeGitInfo({ isGitRepository: "true", gitAvailable: true })).toBeUndefined();
  });

  it("drops unknown fields", () => {
    const sanitized = sanitizeGitInfo({
      isGitRepository: true,
      gitAvailable: true,
      branch: "main",
      remoteUrl: "git@example.com:private/repo.git",
      hostingProvider: "example"
    });

    expect(sanitized).toEqual({
      isGitRepository: true,
      gitAvailable: true,
      branch: "main"
    });
    expect(sanitized as unknown as Record<string, unknown>).not.toHaveProperty("remoteUrl");
    expect(sanitized as unknown as Record<string, unknown>).not.toHaveProperty("hostingProvider");
  });

  it("caps long branch, commit, and warning strings", () => {
    const sanitized = sanitizeGitInfo({
      isGitRepository: true,
      gitAvailable: true,
      branch: "b".repeat(350),
      commit: "c".repeat(180),
      shortCommit: "s".repeat(180),
      warning: "w".repeat(350)
    });

    expect(sanitized?.branch).toHaveLength(300);
    expect(sanitized?.commit).toHaveLength(128);
    expect(sanitized?.shortCommit).toHaveLength(128);
    expect(sanitized?.warning).toHaveLength(300);
  });

  it("omits malformed Git metadata from the written export config", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "codebundle-config-writer-test-"));
    let tempConfigPath: string | undefined;

    try {
      await writeFile(join(projectRoot, "app.ts"), "const app = true;\n", "utf8");
      const prepared = await writeValidatedExportConfig(
        makeExportConfig(projectRoot, join(projectRoot, "out.md"), {
          isGitRepository: true,
          branch: "main"
        })
      );
      tempConfigPath = prepared.tempConfigPath;

      expect(prepared.config.git).toBeUndefined();
      const serialized = JSON.parse(await readFile(tempConfigPath, "utf8")) as Record<string, unknown>;
      expect(serialized).not.toHaveProperty("git");
    } finally {
      if (tempConfigPath) {
        await rm(tempConfigPath, { force: true });
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("sanitizeGitDiffInfo", () => {
  it("accepts valid metadata and drops unknown fields", () => {
    const sanitized = sanitizeGitDiffInfo(validGitDiff({ baseRef: "main", ignored: "value" }));

    expect(sanitized).toEqual({
      mode: "workingTree",
      baseRef: "main",
      includeUntracked: false,
      changedFilesCount: 3,
      selectedFilesCount: 2,
      unavailableFilesCount: 1
    });
    expect(sanitized as unknown as Record<string, unknown>).not.toHaveProperty("ignored");
  });

  it("rejects invalid modes and invalid counts", () => {
    expect(sanitizeGitDiffInfo(validGitDiff({ mode: "all" }))).toBeUndefined();
    expect(sanitizeGitDiffInfo(validGitDiff({ changedFilesCount: -1 }))).toBeUndefined();
    expect(sanitizeGitDiffInfo(validGitDiff({ selectedFilesCount: 1.5 }))).toBeUndefined();
  });

  it("writes sanitized gitDiff and omits malformed metadata", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "codebundle-config-writer-git-diff-test-"));
    let tempConfigPath: string | undefined;

    try {
      await writeFile(join(projectRoot, "app.ts"), "const app = true;\n", "utf8");
      const prepared = await writeValidatedExportConfig({
        ...makeExportConfig(projectRoot, join(projectRoot, "out.md"), undefined),
        gitDiff: validGitDiff({ unknown: "dropped" })
      });
      tempConfigPath = prepared.tempConfigPath;
      expect(prepared.config.gitDiff).toEqual(validGitDiff());

      const serialized = JSON.parse(await readFile(tempConfigPath, "utf8")) as Record<string, unknown>;
      expect(serialized.gitDiff).toEqual(validGitDiff());

      await rm(tempConfigPath, { force: true });
      tempConfigPath = undefined;
      const malformed = await writeValidatedExportConfig({
        ...makeExportConfig(projectRoot, join(projectRoot, "out-two.md"), undefined),
        gitDiff: validGitDiff({ unavailableFilesCount: -1 })
      });
      tempConfigPath = malformed.tempConfigPath;
      expect(malformed.config.gitDiff).toBeUndefined();
      const malformedSerialized = JSON.parse(await readFile(tempConfigPath, "utf8")) as Record<string, unknown>;
      expect(malformedSerialized).not.toHaveProperty("gitDiff");
    } finally {
      if (tempConfigPath) {
        await rm(tempConfigPath, { force: true });
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
