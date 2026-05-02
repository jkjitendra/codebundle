import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPreferencesPath, readPreferences, savePreferences } from "../src/main/preferences";

describe("preferences", () => {
  it("returns defaults when preferences do not exist", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "codebundle-prefs-missing-"));

    const preferences = await readPreferences(userDataPath);

    expect(preferences.maxFileSizeKb).toBe(500);
    expect(preferences.respectGitIgnore).toBe(true);
    expect(preferences.recentProjectFolder).toBeNull();
    await rm(userDataPath, { recursive: true, force: true });
  });

  it("writes and reads preferences", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "codebundle-prefs-"));

    const result = await savePreferences(userDataPath, {
      recentProjectFolder: "/tmp/project",
      recentOutputFile: "/tmp/codebundle-output.md",
      maxFileSizeKb: 250,
      respectGitIgnore: false,
      followSymlinks: true,
      excludeText: "dist/**"
    });
    const preferences = await readPreferences(userDataPath);
    const raw = await readFile(getPreferencesPath(userDataPath), "utf8");

    expect(result.success).toBe(true);
    expect(preferences).toEqual({
      recentProjectFolder: "/tmp/project",
      recentOutputFile: "/tmp/codebundle-output.md",
      maxFileSizeKb: 250,
      respectGitIgnore: false,
      followSymlinks: true,
      excludeText: "dist/**"
    });
    expect(raw).not.toContain("file content");
    await rm(userDataPath, { recursive: true, force: true });
  });
});
