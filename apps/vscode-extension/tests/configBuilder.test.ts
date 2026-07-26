import { describe, expect, it } from "vitest";
import { buildExportConfig } from "../src/configBuilder";

function build(outputFile = "/work/out.md") {
  return buildExportConfig({ projectRoot: "/work", outputFile, files: ["z.ts", "a.ts", "z.ts"], userExcludes: ["custom/**", "custom/**"], maxFileSizeKb: 500, respectGitIgnore: true, followSymlinks: false });
}

describe("buildExportConfig", () => {
  it("builds a selected-mode config with sorted deduplicated files", () => {
    const config = build();
    expect(config.mode).toBe("selected");
    expect(config.files).toEqual(["a.ts", "z.ts"]);
    expect(config.folders).toEqual([]);
    expect(config.include).toEqual([]);
    expect(config.skipBinaryFiles).toBe(true);
  });
  it("infers markdown and text formats", () => { expect(build().format).toBe("markdown"); expect(build("/work/out.txt").format).toBe("text"); });
  it("merges excludes and stores no content field", () => {
    const config = build();
    expect(config.exclude).toContain("custom/**");
    expect(JSON.stringify(config)).not.toContain("file contents");
  });
});
