import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EXCLUDES } from "../src/main/defaultRules";
import { isExcludedPath, scanProject } from "../src/main/scanFiles";

// Mock gitInfo so scan tests don't invoke the real git executable.
vi.mock("../src/main/gitInfo", () => ({
  detectGitProjectInfo: vi.fn().mockResolvedValue({
    isGitRepository: true,
    gitAvailable: true,
    branch: "main",
    shortCommit: "abc1234",
    commit: "abc1234567890abcdef",
    isDetachedHead: false,
    hasTrackedChanges: false
  })
}));

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codebundle-scan-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "app.ts"), "console.log('ok');\n", "utf8");
  return root;
}

async function createNamedProjectFixture(projectName: string): Promise<{ parent: string; root: string }> {
  const parent = await mkdtemp(join(tmpdir(), "codebundle-scan-parent-"));
  const root = join(parent, projectName);
  await mkdir(join(root, "apps", "desktop", "src"), { recursive: true });
  await writeFile(join(root, "apps", "desktop", "src", "app.ts"), "console.log('ok');\n", "utf8");
  return { parent, root };
}

async function createExcludedDirectory(root: string, relativePath: string): Promise<void> {
  const directory = join(root, ...relativePath.split("/"));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "hidden.ts"), "should not scan\n", "utf8");
}

describe("scanFiles excludes", () => {
  it.each([
    "node_modules",
    "out",
    "release",
    ".pytest_cache",
    "__pycache__",
    ".vite",
    "dist",
    "build",
    ".git",
    ".venv",
    ".venv-build",
    "venv",
    "coverage"
  ])("excludes %s by default", async (directoryName) => {
    const root = await createFixture();
    await createExcludedDirectory(root, directoryName);

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: [],
      respectGitIgnore: false,
      followSymlinks: false
    });
    const paths = result.nodes.map((node) => node.path);

    expect(paths).not.toContain(directoryName);
    expect(paths).not.toContain(`${directoryName}/hidden.ts`);
    expect(result.summary.skippedExcluded).toBeGreaterThanOrEqual(1);
    await rm(root, { recursive: true, force: true });
  });

  it("does not recurse into excluded directories", async () => {
    const root = await createFixture();
    await createExcludedDirectory(root, "node_modules/nested");

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: [],
      respectGitIgnore: false,
      followSymlinks: false
    });

    expect(result.nodes.some((node) => node.path.includes("node_modules"))).toBe(false);
    expect(result.summary.totalFiles).toBe(1);
    await rm(root, { recursive: true, force: true });
  });

  it("supports custom /** directory exclude patterns", async () => {
    const root = await createFixture();
    await createExcludedDirectory(root, "generated");

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: ["generated/**"],
      respectGitIgnore: false,
      followSymlinks: false
    });

    expect(result.nodes.some((node) => node.path.includes("generated"))).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it("supports custom exact directory exclude names", async () => {
    const root = await createFixture();
    await createExcludedDirectory(root, "nested/generated");

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: ["generated"],
      respectGitIgnore: false,
      followSymlinks: false
    });

    expect(result.nodes.some((node) => node.path.includes("generated"))).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it("matches exact directory names and /** directory patterns", () => {
    expect(isExcludedPath("node_modules", true, DEFAULT_EXCLUDES)).toBe(true);
    expect(isExcludedPath("packages/app/node_modules", true, DEFAULT_EXCLUDES)).toBe(true);
    expect(isExcludedPath("packages/app/node_modules/pkg/index.js", false, DEFAULT_EXCLUDES)).toBe(true);
    expect(isExcludedPath("apps/desktop/node_modules/pkg/index.js", false, ["codebundle/apps/desktop/node_modules/**"], "codebundle")).toBe(true);
    expect(isExcludedPath("src/app.ts", false, DEFAULT_EXCLUDES)).toBe(false);
  });

  it("normalizes custom patterns that start with the project root basename", async () => {
    const { parent, root } = await createNamedProjectFixture("codebundle");
    await createExcludedDirectory(root, "apps/desktop/node_modules/pkg");

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: ["codebundle/apps/desktop/node_modules/**"],
      respectGitIgnore: false,
      followSymlinks: false
    });

    expect(result.nodes.some((node) => node.path.includes("node_modules"))).toBe(false);
    expect(result.summary.totalFiles).toBe(1);
    expect(result.summary.skippedExcluded).toBeGreaterThanOrEqual(1);
    await rm(parent, { recursive: true, force: true });
  });

  it("excludes package-lock.json by default in nested app folders", async () => {
    const root = await createFixture();
    await mkdir(join(root, "apps", "desktop"), { recursive: true });
    await writeFile(join(root, "apps", "desktop", "package-lock.json"), "{}", "utf8");

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: [],
      respectGitIgnore: false,
      followSymlinks: false
    });

    expect(result.nodes.some((node) => node.path === "apps/desktop/package-lock.json")).toBe(false);
    expect(result.summary.skippedExcluded).toBeGreaterThanOrEqual(1);
    await rm(root, { recursive: true, force: true });
  });

  it.each(["node_modules", "node_modules/**"])("excludes nested node_modules with %s", async (pattern) => {
    const root = await createFixture();
    await createExcludedDirectory(root, "apps/desktop/node_modules/pkg");

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: [pattern],
      respectGitIgnore: false,
      followSymlinks: false
    });

    expect(result.nodes.some((node) => node.path.includes("node_modules"))).toBe(false);
    expect(result.summary.skippedExcluded).toBeGreaterThanOrEqual(1);
    await rm(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Git metadata integration
// ---------------------------------------------------------------------------

describe("scanProject — git metadata", () => {
  it("includes a git field in the scan result", async () => {
    const root = await createFixture();

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: [],
      respectGitIgnore: false,
      followSymlinks: false
    });

    // git field should be present (mocked to return a Git repository result).
    expect(result.git).toBeDefined();
    expect(typeof result.git?.isGitRepository).toBe("boolean");
    expect(typeof result.git?.gitAvailable).toBe("boolean");

    await rm(root, { recursive: true, force: true });
  });

  it("scan still succeeds when git detection throws", async () => {
    const { detectGitProjectInfo } = await import("../src/main/gitInfo");
    const mockDetect = detectGitProjectInfo as ReturnType<typeof vi.fn>;
    mockDetect.mockRejectedValueOnce(new Error("unexpected git error"));

    const root = await createFixture();

    const result = await scanProject({
      projectRoot: root,
      maxFileSizeKb: 500,
      exclude: [],
      respectGitIgnore: false,
      followSymlinks: false
    });

    // Scan must succeed regardless of Git detection failure.
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.summary.totalFiles).toBeGreaterThan(0);
    // A warning is added when git detection throws.
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.some((w) => w.includes("Git"))).toBe(true);

    await rm(root, { recursive: true, force: true });
  });
});
