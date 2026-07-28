import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeNodeExport } from "../src/main/nodeExportWriter";
import type { CodeBundleExportConfig } from "../src/shared/types";

describe("Node fallback writer", () => {
  it("matches Markdown sections, fences, Git, and Git Diff metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "codebundle-node-writer-"));
    try {
      const source = join(root, "app.py");
      const outputFile = join(root, "out.md");
      await writeFile(source, "```\nprint('hello')\n", "utf8");
      const config: CodeBundleExportConfig = {
        version: 1, projectRoot: root, outputFile, format: "markdown", mode: "selected", files: ["app.py"], folders: [], include: [], exclude: [],
        maxFileSizeKb: 500, skipBinaryFiles: true, respectGitIgnore: true, followSymlinks: false,
        git: { isGitRepository: true, gitAvailable: true, branch: "main", shortCommit: "abc1234", hasTrackedChanges: false },
        gitDiff: { mode: "branch", baseRef: "main", includeUntracked: true, changedFilesCount: 2, selectedFilesCount: 1, unavailableFilesCount: 1 }
      };
      await writeNodeExport(config, [{ relativePath: "app.py", absolutePath: source }]);
      const output = await readFile(outputFile, "utf8");
      expect(output).toContain("## Git\n\n- Branch: main\n- Commit: abc1234\n- Working tree: clean");
      expect(output).toContain("## Git Diff\n\n- Mode: Branch vs main");
      expect(output).toContain("````text\n```\nprint('hello')\n````");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes Python-compatible text format", async () => {
    const root = await mkdtemp(join(tmpdir(), "codebundle-node-text-"));
    try {
      const source = join(root, "README.md");
      const outputFile = join(root, "out.txt");
      await writeFile(source, "hello\n", "utf8");
      const config: CodeBundleExportConfig = {
        version: 1, projectRoot: root, outputFile, format: "text", mode: "selected", files: ["README.md"], folders: [], include: [], exclude: [],
        maxFileSizeKb: 500, skipBinaryFiles: true, respectGitIgnore: false, followSymlinks: false
      };
      await writeNodeExport(config, [{ relativePath: "README.md", absolutePath: source }]);
      await expect(readFile(outputFile, "utf8")).resolves.toContain("File 1 Path\nREADME.md\n\nhello");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
