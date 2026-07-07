import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn()
  }
}));

import {
  deleteExportProfile,
  getExportProfilesPath,
  markExportProfileUsed,
  MAX_EXPORT_PROFILES,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILE_PATHS,
  readExportProfiles,
  saveExportProfile,
  validateProfileInput
} from "../src/main/exportProfiles";
import type { SaveExportProfileInput, SavedExportProfile } from "../src/shared/types";

async function withTempUserData<T>(run: (userDataPath: string) => Promise<T>): Promise<T> {
  const userDataPath = await mkdtemp(join(tmpdir(), "codebundle-profiles-"));
  try {
    return await run(userDataPath);
  } finally {
    await rm(userDataPath, { recursive: true, force: true });
  }
}

function makeValidInput(overrides: Partial<SaveExportProfileInput> = {}): SaveExportProfileInput {
  return {
    name: "My Profile",
    projectRoot: "/Users/test/project",
    outputFile: "/Users/test/output.md",
    format: "markdown",
    files: ["src/index.ts", "src/app.ts"],
    folders: ["src/lib"],
    excludeText: "node_modules\n.git",
    maxFileSizeKb: 500,
    respectGitIgnore: true,
    followSymlinks: false,
    ...overrides
  };
}

function makeStoredProfile(overrides: Partial<SavedExportProfile> = {}): SavedExportProfile {
  return {
    id: "stored-profile-id",
    name: "Stored Profile",
    projectRoot: "/Users/test/project",
    outputFile: null,
    format: "markdown",
    files: ["src/index.ts"],
    folders: ["src/lib"],
    excludeText: "",
    maxFileSizeKb: 500,
    respectGitIgnore: true,
    followSymlinks: false,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides
  };
}

describe("export profiles", () => {
  it("returns an empty list when the file does not exist", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });

  it("returns an empty list for corrupted JSON", async () => {
    await withTempUserData(async (userDataPath) => {
      await writeFile(getExportProfilesPath(userDataPath), "{not valid json", "utf8");
      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });

  it("saves and reads a profile", async () => {
    await withTempUserData(async (userDataPath) => {
      const profiles = await saveExportProfile(userDataPath, makeValidInput());
      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toMatchObject({
        name: "My Profile",
        projectRoot: "/Users/test/project",
        outputFile: "/Users/test/output.md",
        format: "markdown",
        files: ["src/index.ts", "src/app.ts"],
        folders: ["src/lib"]
      });
      expect(typeof profiles[0].id).toBe("string");
      expect(profiles[0].id.length).toBeGreaterThan(0);
      expect(typeof profiles[0].createdAt).toBe("number");
      expect(profiles[0].createdAt).toBe(profiles[0].updatedAt);

      const stored = await readExportProfiles(userDataPath);
      expect(stored).toEqual(profiles);
    });
  });

  it("saves a profile with null outputFile", async () => {
    await withTempUserData(async (userDataPath) => {
      const profiles = await saveExportProfile(userDataPath, makeValidInput({ outputFile: null }));
      expect(profiles).toHaveLength(1);
      expect(profiles[0].outputFile).toBeNull();
    });
  });

  it("trims the profile name", async () => {
    await withTempUserData(async (userDataPath) => {
      const profiles = await saveExportProfile(userDataPath, makeValidInput({ name: "  Trimmed Name  " }));
      expect(profiles[0].name).toBe("Trimmed Name");
    });
  });

  it("rejects an empty name", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(saveExportProfile(userDataPath, makeValidInput({ name: "   " }))).rejects.toThrow(
        /name must not be empty/
      );
    });
  });

  it("rejects a name exceeding max length", async () => {
    await withTempUserData(async (userDataPath) => {
      const longName = "x".repeat(MAX_PROFILE_NAME_LENGTH + 1);
      await expect(saveExportProfile(userDataPath, makeValidInput({ name: longName }))).rejects.toThrow(
        /must not exceed/
      );
    });
  });

  it("rejects a relative projectRoot", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(
        saveExportProfile(userDataPath, makeValidInput({ projectRoot: "./relative" }))
      ).rejects.toThrow(/absolute/);
    });
  });

  it("rejects a relative outputFile when not null", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(
        saveExportProfile(userDataPath, makeValidInput({ outputFile: "output.md" }))
      ).rejects.toThrow(/absolute/);
    });
  });

  it("rejects absolute paths in selected files", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(
        saveExportProfile(userDataPath, makeValidInput({ files: ["/etc/passwd"] }))
      ).rejects.toThrow(/invalid or escapes/);
    });
  });

  it("rejects absolute paths in selected folders", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(
        saveExportProfile(userDataPath, makeValidInput({ folders: ["/usr/bin"] }))
      ).rejects.toThrow(/invalid or escapes/);
    });
  });

  it("rejects traversal paths like ../secret.ts", async () => {
    await withTempUserData(async (userDataPath) => {
      await expect(
        saveExportProfile(userDataPath, makeValidInput({ files: ["../secret.ts"] }))
      ).rejects.toThrow(/invalid or escapes/);
    });
  });

  it("rejects when total selected paths exceed MAX_PROFILE_PATHS", async () => {
    await withTempUserData(async (userDataPath) => {
      const manyFiles = Array.from({ length: MAX_PROFILE_PATHS + 1 }, (_, i) => `file-${i}.ts`);
      await expect(
        saveExportProfile(userDataPath, makeValidInput({ files: manyFiles, folders: [] }))
      ).rejects.toThrow(/more than/);
    });
  });

  it("rejects invalid save input instead of returning stored profiles", async () => {
    await withTempUserData(async (userDataPath) => {
      await saveExportProfile(userDataPath, makeValidInput({ name: "Existing" }));

      await expect(saveExportProfile(userDataPath, "not a profile")).rejects.toThrow(/must be an object/);

      const profiles = await readExportProfiles(userDataPath);
      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe("Existing");
    });
  });

  it("caps profile count at MAX_EXPORT_PROFILES", async () => {
    await withTempUserData(async (userDataPath) => {
      for (let i = 0; i < MAX_EXPORT_PROFILES + 3; i++) {
        await saveExportProfile(
          userDataPath,
          makeValidInput({ name: `Profile ${i}` })
        );
      }
      const profiles = await readExportProfiles(userDataPath);
      expect(profiles).toHaveLength(MAX_EXPORT_PROFILES);
    });
  });

  it("updates an existing profile by id", async () => {
    await withTempUserData(async (userDataPath) => {
      const created = await saveExportProfile(userDataPath, makeValidInput());
      const profileId = created[0].id;
      const createdAt = created[0].createdAt;

      const updated = await saveExportProfile(
        userDataPath,
        makeValidInput({ id: profileId, name: "Updated Profile", outputFile: "/Users/test/new-output.md" })
      );

      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe(profileId);
      expect(updated[0].name).toBe("Updated Profile");
      expect(updated[0].outputFile).toBe("/Users/test/new-output.md");
      expect(updated[0].createdAt).toBe(createdAt);
      expect(updated[0].updatedAt).toBeGreaterThanOrEqual(createdAt);
    });
  });

  it("creates a new profile when saving with a non-existent id", async () => {
    await withTempUserData(async (userDataPath) => {
      const first = await saveExportProfile(userDataPath, makeValidInput());
      const second = await saveExportProfile(
        userDataPath,
        makeValidInput({ id: "non-existent-id", name: "Second" })
      );

      expect(second).toHaveLength(2);
      expect(second[0].name).toBe("Second");
      expect(second[0].id).not.toBe("non-existent-id");
      expect(second[1].id).toBe(first[0].id);
    });
  });

  it("deletes an existing profile", async () => {
    await withTempUserData(async (userDataPath) => {
      const profiles = await saveExportProfile(userDataPath, makeValidInput());
      const result = await deleteExportProfile(userDataPath, profiles[0].id);

      expect(result).toEqual([]);
      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });

  it("safely handles deleting a non-existent profile", async () => {
    await withTempUserData(async (userDataPath) => {
      const profiles = await saveExportProfile(userDataPath, makeValidInput());
      const result = await deleteExportProfile(userDataPath, "missing-id");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(profiles[0].id);
    });
  });

  it("marks a profile as used", async () => {
    await withTempUserData(async (userDataPath) => {
      const profiles = await saveExportProfile(userDataPath, makeValidInput());
      expect(profiles[0].lastUsedAt).toBeUndefined();

      const updated = await markExportProfileUsed(userDataPath, profiles[0].id);
      expect(typeof updated[0].lastUsedAt).toBe("number");
      expect(updated[0].lastUsedAt).toBeGreaterThanOrEqual(profiles[0].updatedAt);
    });
  });

  it("safely handles marking a non-existent profile as used", async () => {
    await withTempUserData(async (userDataPath) => {
      const profiles = await saveExportProfile(userDataPath, makeValidInput());
      const result = await markExportProfileUsed(userDataPath, "missing-id");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(profiles[0].id);
    });
  });

  it("leaves no .tmp file after an atomic write", async () => {
    await withTempUserData(async (userDataPath) => {
      await saveExportProfile(userDataPath, makeValidInput());

      const raw = await readFile(getExportProfilesPath(userDataPath), "utf8");
      expect(JSON.parse(raw)).toEqual([
        expect.objectContaining({ name: "My Profile" })
      ]);
      await expect(access(`${getExportProfilesPath(userDataPath)}.tmp`)).rejects.toThrow();
    });
  });

  it("serializes rapid saves and deletes via mutation queue", async () => {
    await withTempUserData(async (userDataPath) => {
      const first = await saveExportProfile(userDataPath, makeValidInput({ name: "First" }));
      const firstId = first[0].id;

      await Promise.all([
        saveExportProfile(userDataPath, makeValidInput({ name: "Second" })),
        deleteExportProfile(userDataPath, firstId)
      ]);

      const profiles = await readExportProfiles(userDataPath);
      expect(profiles.find((p) => p.id === firstId)).toBeUndefined();
      expect(profiles.find((p) => p.name === "Second")).toBeDefined();
    });
  });

  it("drops invalid stored entries when reading", async () => {
    await withTempUserData(async (userDataPath) => {
      const validEntry = makeStoredProfile({ id: "valid-id", name: "Valid", folders: [] });

      await writeFile(
        getExportProfilesPath(userDataPath),
        JSON.stringify([
          validEntry,
          { id: "", name: "Missing Id" },
          { id: "bad", name: "" },
          null,
          42
        ]),
        "utf8"
      );

      const profiles = await readExportProfiles(userDataPath);
      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toMatchObject({ id: "valid-id", name: "Valid" });
    });
  });

  it("drops stored profile with traversal file path like ../secret.ts", async () => {
    await withTempUserData(async (userDataPath) => {
      await writeFile(
        getExportProfilesPath(userDataPath),
        JSON.stringify([makeStoredProfile({ files: ["../secret.ts"] })]),
        "utf8"
      );

      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });

  it("drops stored profile with absolute selected file path", async () => {
    await withTempUserData(async (userDataPath) => {
      await writeFile(
        getExportProfilesPath(userDataPath),
        JSON.stringify([makeStoredProfile({ files: ["/etc/passwd"] })]),
        "utf8"
      );

      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });

  it("drops stored profile with absolute selected folder path", async () => {
    await withTempUserData(async (userDataPath) => {
      await writeFile(
        getExportProfilesPath(userDataPath),
        JSON.stringify([makeStoredProfile({ folders: ["/Users/test/project/src"] })]),
        "utf8"
      );

      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });

  it("drops stored profile with too many selected paths", async () => {
    await withTempUserData(async (userDataPath) => {
      const manyFiles = Array.from({ length: MAX_PROFILE_PATHS + 1 }, (_, i) => `file-${i}.ts`);
      await writeFile(
        getExportProfilesPath(userDataPath),
        JSON.stringify([makeStoredProfile({ files: manyFiles, folders: [] })]),
        "utf8"
      );

      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });

  it("drops stored profile with too-long profile name", async () => {
    await withTempUserData(async (userDataPath) => {
      await writeFile(
        getExportProfilesPath(userDataPath),
        JSON.stringify([makeStoredProfile({ name: "x".repeat(MAX_PROFILE_NAME_LENGTH + 1) })]),
        "utf8"
      );

      await expect(readExportProfiles(userDataPath)).resolves.toEqual([]);
    });
  });
});

describe("validateProfileInput", () => {
  it("accepts a valid input", () => {
    const input = makeValidInput();
    const result = validateProfileInput(input);
    expect(result.name).toBe("My Profile");
    expect(result.projectRoot).toBe("/Users/test/project");
  });

  it("rejects non-object input", () => {
    expect(() => validateProfileInput("string")).toThrow(/must be an object/);
    expect(() => validateProfileInput(null)).toThrow(/must be an object/);
    expect(() => validateProfileInput(42)).toThrow(/must be an object/);
  });

  it("rejects invalid format", () => {
    expect(() => validateProfileInput(makeValidInput({ format: "json" as never }))).toThrow(/format must be/);
  });

  it("rejects non-boolean respectGitIgnore", () => {
    expect(() => validateProfileInput({ ...makeValidInput(), respectGitIgnore: "yes" })).toThrow(/boolean/);
  });

  it("rejects non-boolean followSymlinks", () => {
    expect(() => validateProfileInput({ ...makeValidInput(), followSymlinks: 1 })).toThrow(/boolean/);
  });

  it("rejects non-positive maxFileSizeKb", () => {
    expect(() => validateProfileInput(makeValidInput({ maxFileSizeKb: 0 }))).toThrow(/positive integer/);
    expect(() => validateProfileInput(makeValidInput({ maxFileSizeKb: -1 }))).toThrow(/positive integer/);
    expect(() => validateProfileInput(makeValidInput({ maxFileSizeKb: 1.5 }))).toThrow(/positive integer/);
  });

  it("preserves optional id for updates", () => {
    const result = validateProfileInput(makeValidInput({ id: "existing-id" }));
    expect(result.id).toBe("existing-id");
  });

  it("omits id when not provided", () => {
    const result = validateProfileInput(makeValidInput());
    expect(result.id).toBeUndefined();
  });
});
