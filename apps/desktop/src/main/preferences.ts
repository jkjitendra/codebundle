import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CodeBundlePreferences, SavePreferencesResult } from "../shared/types";

const PREFERENCES_FILE = "preferences.json";

export const DEFAULT_PREFERENCES: CodeBundlePreferences = {
  recentProjectFolder: null,
  recentOutputFile: null,
  maxFileSizeKb: 500,
  respectGitIgnore: true,
  followSymlinks: false,
  excludeText: ""
};

export async function readPreferences(userDataPath: string): Promise<CodeBundlePreferences> {
  try {
    const raw = await readFile(getPreferencesPath(userDataPath), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizePreferences(parsed);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(userDataPath: string, preferences: unknown): Promise<SavePreferencesResult> {
  try {
    const normalized = normalizePreferences(preferences);
    const preferencesPath = getPreferencesPath(userDataPath);
    await mkdir(dirname(preferencesPath), { recursive: true });
    await writeFile(preferencesPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "PREFERENCES_SAVE_FAILED",
        message: "Could not save CodeBundle preferences.",
        details: error instanceof Error ? error.message : "Unknown preferences save error."
      }
    };
  }
}

export function getPreferencesPath(userDataPath: string): string {
  return join(userDataPath, PREFERENCES_FILE);
}

export function normalizePreferences(value: unknown): CodeBundlePreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_PREFERENCES };
  }

  const maxFileSizeKb = value.maxFileSizeKb;
  return {
    recentProjectFolder: optionalString(value.recentProjectFolder),
    recentOutputFile: optionalString(value.recentOutputFile),
    maxFileSizeKb: typeof maxFileSizeKb === "number" && Number.isInteger(maxFileSizeKb) && maxFileSizeKb > 0 ? maxFileSizeKb : 500,
    respectGitIgnore: typeof value.respectGitIgnore === "boolean" ? value.respectGitIgnore : true,
    followSymlinks: typeof value.followSymlinks === "boolean" ? value.followSymlinks : false,
    excludeText: typeof value.excludeText === "string" ? value.excludeText : ""
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
