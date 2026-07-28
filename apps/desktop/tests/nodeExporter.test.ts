import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runNodeExporter } from "../src/main/nodeExporter";
import { scanNodeExportFiles } from "../src/main/nodeExportScanner";
import { runExporter } from "../src/main/runExporter";
import type { CodeBundleExportConfig } from "../src/shared/types";

async function fixture(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "codebundle-node-exporter-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "README.md"), "# Hello\n", "utf8");
  await writeFile(join(root, "src", "app.py"), "print('hello')\n", "utf8");
  await writeFile(join(root, "src", "large.txt"), "x".repeat(2048), "utf8");
  await writeFile(join(root, "src", "binary.bin"), Buffer.from([0, 1, 2]));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function config(root: string, overrides: Partial<CodeBundleExportConfig> = {}): CodeBundleExportConfig {
  return {
    version: 1,
    projectRoot: root,
    outputFile: join(root, "export.md"),
    format: "markdown",
    mode: "selected",
    files: ["README.md"],
    folders: ["src"],
    include: [],
    exclude: [],
    maxFileSizeKb: 1,
    skipBinaryFiles: true,
    respectGitIgnore: true,
    followSymlinks: false,
    ...overrides
  };
}

describe("Node fallback exporter", () => {
  it("runs a real Node export when Python command resolution reports unavailable", async () => {
    const test = await fixture();
    try {
      const result = await runExporter(config(test.root, { folders: [], outputFile: join(test.root, "fallback.md") }), {
        resolveExporterCommand: async () => ({
          success: false,
          error: { code: "PYTHON_NOT_FOUND", message: "Python is unavailable." }
        })
      });
      expect(result).toMatchObject({ success: true, exporter: "node-fallback", fallbackReason: "PYTHON_NOT_FOUND" });
      await expect(readFile(join(test.root, "fallback.md"), "utf8")).resolves.toContain("README.md");
    } finally {
      await test.cleanup();
    }
  });

  it("exports selected files/folders in deterministic order and skips large/binary files", async () => {
    const test = await fixture();
    try {
      const result = await runNodeExporter(config(test.root), { fallbackReason: "PYTHON_NOT_FOUND" });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.exporter).toBe("node-fallback");
      expect(result.fallbackReason).toBe("PYTHON_NOT_FOUND");
      expect(result.summary).toMatchObject({ exportedFiles: 2, skippedLarge: 1, skippedBinary: 1 });
      const output = await readFile(join(test.root, "export.md"), "utf8");
      expect(output.indexOf("## File 1: `README.md`")).toBeLessThan(output.indexOf("## File 2: `src/app.py`"));
      expect(output).toContain("print('hello')");
    } finally {
      await test.cleanup();
    }
  });

  it("honors custom excludes and simple root .gitignore patterns", async () => {
    const test = await fixture();
    try {
      await writeFile(join(test.root, ".gitignore"), "src/app.py\n", "utf8");
      const scan = await scanNodeExportFiles(config(test.root, { exclude: ["README.md"] }));
      expect(scan.entries).toEqual([]);
      expect(scan.summary.skippedExcluded).toBeGreaterThanOrEqual(2);
    } finally {
      await test.cleanup();
    }
  });

  it("rejects path traversal and absolute selected paths before reading", async () => {
    const test = await fixture();
    try {
      await expect(scanNodeExportFiles(config(test.root, { files: ["../outside.txt"], folders: [] }))).rejects.toThrow("escapes projectRoot");
      await expect(scanNodeExportFiles(config(test.root, { files: [join(test.root, "README.md")], folders: [] }))).rejects.toThrow("relative paths");
    } finally {
      await test.cleanup();
    }
  });

  it.skipIf(process.platform === "win32")("skips symlinks by default and accepts only inside-root targets when enabled", async () => {
    const test = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "codebundle-node-outside-"));
    try {
      await symlink(join(test.root, "README.md"), join(test.root, "inside-link.md"));
      await writeFile(join(outside, "outside.md"), "outside", "utf8");
      await symlink(join(outside, "outside.md"), join(test.root, "outside-link.md"));
      const skipped = await scanNodeExportFiles(config(test.root, { files: ["inside-link.md", "outside-link.md"], folders: [] }));
      expect(skipped.entries).toEqual([]);
      const followed = await scanNodeExportFiles(config(test.root, { files: ["inside-link.md", "outside-link.md"], folders: [], followSymlinks: true }));
      expect(followed.entries.map((entry) => entry.relativePath)).toEqual(["inside-link.md"]);
      expect(followed.summary.skippedInvalid).toBeGreaterThan(0);
    } finally {
      await test.cleanup();
      await rm(outside, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("rejects an outside symlinked directory before traversal when following symlinks", async () => {
    const test = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "codebundle-node-outside-directory-"));
    try {
      await writeFile(join(outside, "private.md"), "do-not-export", "utf8");
      await symlink(outside, join(test.root, "outside-directory"));
      const fallbackConfig = config(test.root, {
        files: [],
        folders: ["outside-directory"],
        outputFile: join(test.root, "outside-directory-export.md"),
        followSymlinks: true
      });
      const scan = await scanNodeExportFiles(fallbackConfig);
      expect(scan.entries).toEqual([]);
      expect(scan.summary.skippedInvalid).toBeGreaterThan(0);

      const result = await runNodeExporter(fallbackConfig, { fallbackReason: "PYTHON_NOT_FOUND" });
      expect(result.success).toBe(true);
      await expect(readFile(fallbackConfig.outputFile, "utf8")).resolves.not.toContain("do-not-export");
    } finally {
      await test.cleanup();
      await rm(outside, { recursive: true, force: true });
    }
  });
});
