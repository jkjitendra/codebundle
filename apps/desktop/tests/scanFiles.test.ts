import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXCLUDES } from "../src/main/defaultRules";
import { isExcludedPath, scanProject } from "../src/main/scanFiles";

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codebundle-scan-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "app.ts"), "console.log('ok');\n", "utf8");
  return root;
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
    expect(isExcludedPath("src/app.ts", false, DEFAULT_EXCLUDES)).toBe(false);
  });
});
