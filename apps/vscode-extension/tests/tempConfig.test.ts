import { readFile, access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildExportConfig } from "../src/configBuilder";
import { deleteTempConfig, writeTempConfig } from "../src/tempConfig";

describe("temp config", () => {
  it("writes valid JSON using a safe prefix and deletes it", async () => {
    const config = buildExportConfig({ projectRoot: "/tmp", outputFile: "/tmp/out.md", files: ["a.ts"], maxFileSizeKb: 1, respectGitIgnore: true, followSymlinks: false });
    const path = await writeTempConfig(config);
    expect(path).toMatch(/codebundler-vscode-[0-9a-f-]+\.codebundle\.tmp\.json$/);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ files: ["a.ts"] });
    await deleteTempConfig(path);
    await expect(access(path)).rejects.toThrow();
  });
});
