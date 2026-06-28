import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  generatePreview,
  markdownFence,
  PreviewBuilder,
  type PreviewDependencies
} from "../src/main/previewGenerator";
import type { CodeBundleExportConfig } from "../src/shared/types";

function makeConfig(overrides: Partial<CodeBundleExportConfig> = {}): CodeBundleExportConfig {
  return {
    version: 1,
    projectRoot: "/projects/test-project",
    outputFile: "/output/codebundle-output.md",
    format: "markdown",
    mode: "selected",
    files: ["src/main.ts", "README.md"],
    folders: [],
    include: [],
    exclude: [],
    maxFileSizeKb: 500,
    skipBinaryFiles: true,
    respectGitIgnore: true,
    followSymlinks: false,
    ...overrides
  };
}

const FILE_CONTENTS: Record<string, string> = {
  "src/main.ts": 'console.log("hello world");\n',
  "README.md": "# Test Project\n\nA test project.\n"
};

function stubDeps(overrides: Partial<PreviewDependencies> = {}): PreviewDependencies {
  return {
    resolveProjectRoot: async (projectRoot: string) => projectRoot,
    readFileForPreview: async (path: string) => {
      const name = Object.keys(FILE_CONTENTS).find((key) => path.endsWith(key));
      if (name) {
        return FILE_CONTENTS[name];
      }
      throw new Error(`File not found: ${path}`);
    },
    resolveFileEntries: async (config) => {
      const entries = config.files
        .map((relativePath) => ({
          relativePath,
          absolutePath: `${config.projectRoot}/${relativePath}`
        }))
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      return { entries, summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 } };
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// PreviewBuilder tests
// ---------------------------------------------------------------------------

describe("PreviewBuilder", () => {
  it("accumulates content and tracks bytes/lines", () => {
    const builder = new PreviewBuilder(10_000, 100);
    builder.appendLine("hello");
    builder.appendLine("world");
    expect(builder.lineCount).toBe(2);
    expect(builder.bytesGenerated).toBeGreaterThan(0);
    expect(builder.truncated).toBe(false);
    expect(builder.getContent()).toBe("hello\nworld");
  });

  it("stops appending once byte cap is reached", () => {
    const builder = new PreviewBuilder(10, 1000);
    builder.appendLine("short"); // 6 bytes (5 + newline)
    expect(builder.truncated).toBe(false);
    builder.appendLine("this is way too long for the byte cap");
    expect(builder.truncated).toBe(true);
    // Content should only contain first line
    expect(builder.getContent()).toBe("short");
  });

  it("stops appending once line cap is reached", () => {
    const builder = new PreviewBuilder(100_000, 3);
    builder.appendLine("line 1");
    builder.appendLine("line 2");
    builder.appendLine("line 3");
    expect(builder.truncated).toBe(false);
    builder.appendLine("line 4");
    expect(builder.truncated).toBe(true);
    expect(builder.lineCount).toBe(3);
    expect(builder.getContent()).toBe("line 1\nline 2\nline 3");
  });

  it("canAppend returns false when truncated", () => {
    const builder = new PreviewBuilder(5, 100);
    builder.appendLine("abc"); // 4 bytes
    expect(builder.canAppend("too long")).toBe(false);
    builder.append("too long");
    expect(builder.truncated).toBe(true);
    expect(builder.canAppend("anything")).toBe(false);
  });

  it("canAppend returns false when bytes would exceed cap", () => {
    const builder = new PreviewBuilder(20, 100);
    builder.appendLine("hello"); // 6 bytes
    expect(builder.canAppend("a".repeat(20))).toBe(false);
  });

  it("canAppend returns false when lines would exceed cap", () => {
    const builder = new PreviewBuilder(100_000, 2);
    builder.appendLine("line 1");
    builder.appendLine("line 2");
    expect(builder.canAppend("line 3\n")).toBe(false);
  });

  it("markTruncated explicitly sets the truncated flag", () => {
    const builder = new PreviewBuilder(10_000, 100);
    builder.appendLine("safe content");
    expect(builder.truncated).toBe(false);
    builder.markTruncated();
    expect(builder.truncated).toBe(true);
    expect(builder.canAppend("more content\n")).toBe(false);
    expect(builder.getContent()).toBe("safe content");
  });

  it("append is a no-op after truncation", () => {
    const builder = new PreviewBuilder(5, 100);
    builder.append("abc");
    builder.append("this will truncate");
    const contentAfterTrunc = builder.getContent();
    builder.append("more stuff");
    expect(builder.getContent()).toBe(contentAfterTrunc);
  });

  it("getContent removes trailing newline", () => {
    const builder = new PreviewBuilder(10_000, 100);
    builder.appendLine("hello");
    expect(builder.getContent()).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// generatePreview — format tests
// ---------------------------------------------------------------------------

describe("generatePreview", () => {
  describe("Markdown format", () => {
    it("generates correct Markdown preview format matching Python exporter", async () => {
      const config = makeConfig();
      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        stubDeps()
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const content = result.preview.content;
      expect(content).toContain("# CodeBundle Export");
      expect(content).toContain("Project Root: `/projects/test-project`");
      expect(content).toContain("Total Files: 2");
      expect(content).toContain("---");
      expect(content).toContain("## File 1: `README.md`");
      expect(content).toContain("## File 2: `src/main.ts`");
      expect(content).toContain('console.log("hello world");');
      expect(content).toContain("# Test Project");
      expect(content).toContain("```text");
      expect(result.preview.format).toBe("markdown");
      expect(result.preview.totalSelectedFiles).toBe(2);
      expect(result.preview.previewedFiles).toBe(2);
      expect(result.preview.truncated).toBe(false);
    });
  });

  describe("Text format", () => {
    it("generates correct text preview format matching Python exporter", async () => {
      const config = makeConfig({ format: "text" });
      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        stubDeps()
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const content = result.preview.content;
      expect(content).toContain("CodeBundle Export");
      expect(content).not.toContain("# CodeBundle Export");
      expect(content).toContain("Project Root: /projects/test-project");
      expect(content).toContain("Total Files: 2");
      expect(content).toContain("File 1 Path");
      expect(content).toContain("File 2 Path");
      expect(content).not.toContain("```");
      expect(result.preview.format).toBe("text");
      expect(result.preview.totalSelectedFiles).toBe(2);
      expect(result.preview.previewedFiles).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Truncation via PreviewBuilder
  // ---------------------------------------------------------------------------

  describe("truncation", () => {
    it("truncates at 500 lines and sets truncated: true", async () => {
      const longContent = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
      const config = makeConfig({ files: ["big-file.ts"] });
      const deps = stubDeps({
        readFileForPreview: async () => longContent,
        resolveFileEntries: async (cfg) => ({
          entries: cfg.files.map((rp) => ({ relativePath: rp, absolutePath: `${cfg.projectRoot}/${rp}` })),
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 5_000_000 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.preview.truncated).toBe(true);
      expect(result.preview.totalSelectedFiles).toBe(1);
      expect(result.preview.previewedFiles).toBe(0);
    });

    it("truncates at byte cap and sets truncated: true", async () => {
      const largeContent = "x".repeat(300) + "\n";
      const config = makeConfig({ files: ["big-file.ts"] });
      const deps = stubDeps({
        readFileForPreview: async () => largeContent,
        resolveFileEntries: async (cfg) => ({
          entries: cfg.files.map((rp) => ({ relativePath: rp, absolutePath: `${cfg.projectRoot}/${rp}` })),
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 10_000, maxPreviewBytes: 200 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.preview.truncated).toBe(true);
      expect(result.preview.totalSelectedFiles).toBe(1);
      expect(result.preview.previewedFiles).toBe(0);
      expect(Buffer.byteLength(result.preview.content, "utf8")).toBeLessThanOrEqual(200);
    });

    it("marks preview truncated when the next file block cannot be appended", async () => {
      const config = makeConfig({ files: ["small.ts", "large.ts"] });
      const deps = stubDeps({
        readFileForPreview: async (path: string) => {
          if (path.endsWith("small.ts")) return "small\n";
          if (path.endsWith("large.ts")) return `${"x".repeat(2_000)}\n`;
          return null;
        },
        resolveFileEntries: async (cfg) => ({
          entries: cfg.files.map((rp) => ({ relativePath: rp, absolutePath: `${cfg.projectRoot}/${rp}` })),
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 10_000, maxPreviewBytes: 1_000 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.preview.truncated).toBe(true);
      expect(result.preview.totalSelectedFiles).toBe(2);
      expect(result.preview.previewedFiles).toBe(1);
      expect(result.preview.content).toContain("small.ts");
      expect(result.preview.content).not.toContain("large.ts");
    });

    it("distinguishes selected files from previewed files when a selected file is skipped", async () => {
      const config = makeConfig({ files: ["src/main.ts", "big.ts"] });
      const deps = stubDeps({
        readFileForPreview: async (path: string) => {
          if (path.endsWith("big.ts")) return null;
          return FILE_CONTENTS["src/main.ts"];
        },
        resolveFileEntries: async (cfg) => ({
          entries: cfg.files.map((rp) => ({ relativePath: rp, absolutePath: `${cfg.projectRoot}/${rp}` })),
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.preview.totalSelectedFiles).toBe(2);
      expect(result.preview.previewedFiles).toBe(1);
      expect(result.preview.content).toContain("Total Files: 2");
      expect(result.preview.content).toContain("src/main.ts");
      expect(result.preview.content).not.toContain("big.ts");
    });
  });

  // ---------------------------------------------------------------------------
  // Early stop — stops reading files after truncation
  // ---------------------------------------------------------------------------

  describe("early stop after truncation", () => {
    it("stops reading more files after truncation", async () => {
      const readSpy = vi.fn(async (path: string) => {
        if (path.endsWith("file1.ts")) return "content of file1\n";
        if (path.endsWith("file2.ts")) return `${"x".repeat(1_000)}\n`;
        if (path.endsWith("file3.ts")) return "content of file3\n";
        return null;
      });

      const config = makeConfig({ files: ["file1.ts", "file2.ts", "file3.ts"] });
      const deps = stubDeps({
        readFileForPreview: readSpy,
        resolveFileEntries: async (cfg) => ({
          entries: cfg.files.map((rp) => ({ relativePath: rp, absolutePath: `${cfg.projectRoot}/${rp}` })),
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      // Small byte cap: the first file fits, the second block marks truncation.
      const result = await generatePreview(
        { config, maxPreviewLines: 10_000, maxPreviewBytes: 300 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.preview.truncated).toBe(true);
      expect(result.preview.totalSelectedFiles).toBe(3);
      expect(result.preview.previewedFiles).toBe(1);
      // readSpy should have been called fewer than 3 times since builder stops early
      expect(readSpy.mock.calls.length).toBeLessThan(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Path safety tests
  // ---------------------------------------------------------------------------

  describe("selected relative paths", () => {
    it("includes selected relative paths in preview", async () => {
      const config = makeConfig({ files: ["src/main.ts"] });
      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        stubDeps()
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.preview.content).toContain("src/main.ts");
      expect(result.preview.totalSelectedFiles).toBe(1);
      expect(result.preview.previewedFiles).toBe(1);
    });
  });

  describe("path traversal rejection", () => {
    it("rejects absolute paths in files list", async () => {
      const config = makeConfig({ files: ["/etc/passwd"] });
      const deps = stubDeps({
        resolveFileEntries: async () => ({
          entries: [],
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 1 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.preview.totalSelectedFiles).toBe(0);
      expect(result.preview.previewedFiles).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe("missing file skip", () => {
    it("skips missing files gracefully", async () => {
      const config = makeConfig({ files: ["src/main.ts", "nonexistent.ts"] });
      const deps = stubDeps({
        readFileForPreview: async (path: string) => {
          if (path.endsWith("nonexistent.ts")) {
            throw new Error("File not found");
          }
          return FILE_CONTENTS["src/main.ts"];
        },
        resolveFileEntries: async (cfg) => ({
          entries: cfg.files.map((rp) => ({ relativePath: rp, absolutePath: `${cfg.projectRoot}/${rp}` })),
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.preview.totalSelectedFiles).toBe(2);
      expect(result.preview.previewedFiles).toBe(1);
      expect(result.preview.content).toContain("src/main.ts");
      expect(result.preview.content).not.toContain("## File 2");
    });
  });

  describe("large file skip", () => {
    it("skips files when readFileForPreview returns null", async () => {
      const config = makeConfig({ files: ["big.ts"], maxFileSizeKb: 1 });
      const deps = stubDeps({
        readFileForPreview: async () => null,
        resolveFileEntries: async (cfg) => ({
          entries: cfg.files.map((rp) => ({
            relativePath: rp,
            absolutePath: `${cfg.projectRoot}/${rp}`
          })),
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.preview.totalSelectedFiles).toBe(1);
      expect(result.preview.previewedFiles).toBe(0);
    });
  });

  describe("empty selection", () => {
    it("generates preview with zero files for empty selection", async () => {
      const config = makeConfig({ files: [], folders: [] });
      const deps = stubDeps({
        resolveFileEntries: async () => ({
          entries: [],
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        deps
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.preview.totalSelectedFiles).toBe(0);
      expect(result.preview.previewedFiles).toBe(0);
      expect(result.preview.content).toContain("Total Files: 0");
    });
  });

  // ---------------------------------------------------------------------------
  // Error details safety
  // ---------------------------------------------------------------------------

  describe("error details safety", () => {
    it("does not include content in error details", async () => {
      const result = await generatePreview(
        { config: { version: 2 } as unknown as CodeBundleExportConfig, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        stubDeps()
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("PREVIEW_GENERATION_FAILED");
      expect(result.error.message).toBe("Could not generate export preview.");
      expect(result.error.details).toBeDefined();
      expect(result.error.details!.length).toBeLessThanOrEqual(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Preview does not write to disk
  // ---------------------------------------------------------------------------

  describe("preview does not write output file", () => {
    it("does not create the configured output file during preview generation", async () => {
      const tempDirectory = await mkdtemp(join(tmpdir(), "codebundle-preview-test-"));

      try {
        const outputFile = join(tempDirectory, "preview-output.md");
        const config = makeConfig({ outputFile });
        await generatePreview(
          { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
          stubDeps()
        );

        await expect(stat(outputFile)).rejects.toThrow();
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Concrete selected files (preview uses files, not folders)
  // ---------------------------------------------------------------------------

  describe("concrete selected files", () => {
    it("generates preview using concrete file paths with empty folders", async () => {
      const config = makeConfig({
        files: ["src/main.ts", "README.md"],
        folders: []
      });

      const resolveEntries = vi.fn(async (cfg: CodeBundleExportConfig) => ({
        entries: cfg.files.map((rp) => ({
          relativePath: rp,
          absolutePath: `${cfg.projectRoot}/${rp}`
        })),
        summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
      }));

      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        stubDeps({ resolveFileEntries: resolveEntries })
      );

      expect(result.success).toBe(true);
      // Verify resolveFileEntries was called with files and empty folders
      expect(resolveEntries).toHaveBeenCalledTimes(1);
      const passedConfig = resolveEntries.mock.calls[0][0];
      expect(passedConfig.files).toEqual(["src/main.ts", "README.md"]);
      expect(passedConfig.folders).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Input validation
  // ---------------------------------------------------------------------------

  describe("input validation", () => {
    it("returns error for null input", async () => {
      const result = await generatePreview(null, stubDeps());
      expect(result.success).toBe(false);
    });

    it("returns error for string input", async () => {
      const result = await generatePreview("invalid", stubDeps());
      expect(result.success).toBe(false);
    });

    it("returns error for missing config", async () => {
      const result = await generatePreview({}, stubDeps());
      expect(result.success).toBe(false);
    });

    it("uses default maxPreviewLines when not provided", async () => {
      const config = makeConfig({ files: [] });
      const deps = stubDeps({
        resolveFileEntries: async () => ({
          entries: [],
          summary: { skippedBinary: 0, skippedLarge: 0, skippedExcluded: 0, skippedMissing: 0, skippedInvalid: 0 }
        })
      });

      const result = await generatePreview({ config }, deps);
      expect(result.success).toBe(true);
    });

    it("returns error for invalid version", async () => {
      const config = makeConfig({ version: 99 as never });
      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        stubDeps()
      );
      expect(result.success).toBe(false);
    });

    it("returns error for non-absolute projectRoot", async () => {
      const config = makeConfig({ projectRoot: "relative/path" });
      const result = await generatePreview(
        { config, maxPreviewLines: 500, maxPreviewBytes: 200_000 },
        stubDeps()
      );
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// markdownFence tests
// ---------------------------------------------------------------------------

describe("markdownFence", () => {
  it("returns triple backticks for content without backticks", () => {
    expect(markdownFence("hello world")).toBe("```");
  });

  it("returns one more than the longest backtick run", () => {
    expect(markdownFence("some ```code``` here")).toBe("````");
  });

  it("returns at least triple backticks", () => {
    expect(markdownFence("a`b")).toBe("```");
  });

  it("handles content with long backtick runs", () => {
    expect(markdownFence("`````")).toBe("``````");
  });
});
