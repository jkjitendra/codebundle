import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runNodeExporter } from "../src/main/nodeExporter";
import type { CodeBundleExportConfig } from "../src/shared/types";

const python = process.env.CODEBUNDLE_PYTHON_PATH ?? "python3";
const pythonAvailable = spawnSync(python, ["--version"], { encoding: "utf8" }).status === 0;
const parityIt = pythonAvailable ? it : it.skip;

describe("Node fallback parity with Python exporter", () => {
  parityIt("matches core output structure, ordering, metadata, and summary for a small fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "codebundle-node-parity-"));
    try {
      await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
      await (await import("node:fs/promises")).mkdir(join(root, "src"));
      await writeFile(join(root, "src", "app.py"), "print('app')\n", "utf8");
      await writeFile(join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");
      const pythonOutput = join(root, "python.md");
      const nodeOutput = join(root, "node.md");
      const config: CodeBundleExportConfig = {
        version: 1, projectRoot: root, outputFile: nodeOutput, format: "markdown", mode: "selected", files: ["README.md"], folders: ["src"], include: [], exclude: [],
        maxFileSizeKb: 500, skipBinaryFiles: true, respectGitIgnore: true, followSymlinks: false,
        git: { isGitRepository: true, gitAvailable: true, branch: "main", shortCommit: "abc1234", hasTrackedChanges: false },
        gitDiff: { mode: "workingTree", includeUntracked: false, changedFilesCount: 3, selectedFilesCount: 3, unavailableFilesCount: 0 }
      };
      const pythonConfig = { ...config, outputFile: pythonOutput };
      const configPath = join(root, "python-config.json");
      await writeFile(configPath, JSON.stringify(pythonConfig), "utf8");
      const result = spawnSync(python, ["-m", "codebundle_exporter", "--config", configPath], {
        encoding: "utf8", env: { ...process.env, PYTHONPATH: resolve(process.cwd(), "../../exporter-python") }
      });
      expect(result.status, result.stderr).toBe(0);
      const nodeResult = await runNodeExporter(config, { fallbackReason: "PYTHON_NOT_FOUND" });
      expect(nodeResult.success).toBe(true);
      const pythonExport = await readFile(pythonOutput, "utf8");
      const nodeExport = await readFile(nodeOutput, "utf8");
      for (const section of ["# CodeBundle Export", "Total Files: 3", "## Git", "## Git Diff", "README.md", "src/app.py", "src/index.ts"]) {
        expect(nodeExport).toContain(section);
        expect(pythonExport).toContain(section);
      }
      expect(nodeExport.indexOf("README.md")).toBeLessThan(nodeExport.indexOf("src/app.py"));
      expect(nodeExport.indexOf("src/app.py")).toBeLessThan(nodeExport.indexOf("src/index.ts"));
      if (nodeResult.success) expect(nodeResult.summary).toMatchObject({ exportedFiles: 3, skippedBinary: 0, skippedLarge: 0 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
