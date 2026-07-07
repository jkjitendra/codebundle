import { randomUUID } from "node:crypto";
import { mkdir, rename, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, relative } from "node:path";
import logger from "electron-log";
import { safeLabel } from "./recentProjects";
import type { SavedExportProfile, SaveExportProfileInput } from "../shared/types";

const EXPORT_PROFILES_FILE = "export-profiles.json";
export const MAX_EXPORT_PROFILES = 20;
export const MAX_PROFILE_NAME_LENGTH = 80;
export const MAX_PROFILE_PATHS = 5_000;

let exportProfilesMutationQueue: Promise<void> = Promise.resolve();

function enqueueExportProfileMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = exportProfilesMutationQueue.then(operation, operation);
  exportProfilesMutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function getExportProfilesPath(userDataPath: string): string {
  return join(userDataPath, EXPORT_PROFILES_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Check that a relative path does not escape the project root.
 * Rejects absolute paths, empty strings, and traversal paths.
 */
function isRelativePathInsideRoot(projectRoot: string, relativePath: string): boolean {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    return false;
  }
  if (isAbsolute(relativePath)) {
    return false;
  }
  const candidate = resolve(projectRoot, relativePath);
  const rel = relative(projectRoot, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isValidStoredProfile(entry: unknown): entry is SavedExportProfile {
  if (!isRecord(entry)) {
    return false;
  }

  if (typeof entry.id !== "string" || entry.id.length === 0) {
    return false;
  }
  if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
    return false;
  }
  if (entry.name.length > MAX_PROFILE_NAME_LENGTH) {
    return false;
  }
  if (typeof entry.projectRoot !== "string" || !isAbsolute(entry.projectRoot)) {
    return false;
  }
  const projectRoot = entry.projectRoot;
  if (entry.outputFile !== null && (typeof entry.outputFile !== "string" || !isAbsolute(entry.outputFile))) {
    return false;
  }
  if (entry.format !== "markdown" && entry.format !== "text") {
    return false;
  }
  if (!isStringArray(entry.files) || !isStringArray(entry.folders)) {
    return false;
  }
  const files = entry.files;
  const folders = entry.folders;
  if (files.length + folders.length > MAX_PROFILE_PATHS) {
    return false;
  }
  if (!files.every((filePath) => isRelativePathInsideRoot(projectRoot, filePath))) {
    return false;
  }
  if (!folders.every((folderPath) => isRelativePathInsideRoot(projectRoot, folderPath))) {
    return false;
  }
  if (typeof entry.excludeText !== "string") {
    return false;
  }
  if (typeof entry.maxFileSizeKb !== "number" || !Number.isInteger(entry.maxFileSizeKb) || entry.maxFileSizeKb <= 0) {
    return false;
  }
  if (typeof entry.respectGitIgnore !== "boolean" || typeof entry.followSymlinks !== "boolean") {
    return false;
  }
  if (typeof entry.createdAt !== "number" || !Number.isFinite(entry.createdAt)) {
    return false;
  }
  if (typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt)) {
    return false;
  }
  if (entry.lastUsedAt !== undefined && (typeof entry.lastUsedAt !== "number" || !Number.isFinite(entry.lastUsedAt))) {
    return false;
  }

  return true;
}

function parseStoredProfiles(raw: string): SavedExportProfile[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const profiles: SavedExportProfile[] = [];
    const seenIds = new Set<string>();
    for (const entry of parsed) {
      if (!isValidStoredProfile(entry)) {
        continue;
      }
      if (seenIds.has(entry.id)) {
        continue;
      }
      seenIds.add(entry.id);
      profiles.push(entry);

      if (profiles.length >= MAX_EXPORT_PROFILES) {
        break;
      }
    }

    return profiles;
  } catch {
    return [];
  }
}

async function writeExportProfilesAtomic(userDataPath: string, profiles: SavedExportProfile[]): Promise<void> {
  const filePath = getExportProfilesPath(userDataPath);
  const tmpPath = `${filePath}.tmp`;
  await mkdir(userDataPath, { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

export async function readExportProfiles(userDataPath: string): Promise<SavedExportProfile[]> {
  try {
    const raw = await readFile(getExportProfilesPath(userDataPath), "utf8");
    return parseStoredProfiles(raw);
  } catch {
    return [];
  }
}

/**
 * Validate renderer-submitted profile input.
 * Throws on invalid input instead of silently correcting.
 */
export function validateProfileInput(input: unknown): SaveExportProfileInput {
  if (!isRecord(input)) {
    throw new Error("Profile input must be an object.");
  }

  // Name
  if (typeof input.name !== "string") {
    throw new Error("Profile name must be a string.");
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("Profile name must not be empty.");
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH) {
    throw new Error(`Profile name must not exceed ${MAX_PROFILE_NAME_LENGTH} characters.`);
  }

  // Project root
  if (typeof input.projectRoot !== "string" || !isAbsolute(input.projectRoot)) {
    throw new Error("Profile projectRoot must be an absolute path.");
  }
  const projectRoot = input.projectRoot;

  // Output file
  let outputFile: string | null = null;
  if (input.outputFile !== null && input.outputFile !== undefined) {
    if (typeof input.outputFile !== "string" || !isAbsolute(input.outputFile)) {
      throw new Error("Profile outputFile must be null or an absolute path.");
    }
    outputFile = input.outputFile;
  }

  // Format
  if (input.format !== "markdown" && input.format !== "text") {
    throw new Error("Profile format must be \"markdown\" or \"text\".");
  }

  // Files and folders — must be relative, inside projectRoot
  if (!isStringArray(input.files)) {
    throw new Error("Profile files must be an array of strings.");
  }
  if (!isStringArray(input.folders)) {
    throw new Error("Profile folders must be an array of strings.");
  }

  const totalPaths = input.files.length + input.folders.length;
  if (totalPaths > MAX_PROFILE_PATHS) {
    throw new Error(`Cannot save profile because it contains more than ${MAX_PROFILE_PATHS} selected paths.`);
  }

  for (const filePath of input.files) {
    if (!isRelativePathInsideRoot(projectRoot, filePath)) {
      throw new Error(`Profile file path is invalid or escapes projectRoot: ${filePath}`);
    }
  }
  for (const folderPath of input.folders) {
    if (!isRelativePathInsideRoot(projectRoot, folderPath)) {
      throw new Error(`Profile folder path is invalid or escapes projectRoot: ${folderPath}`);
    }
  }

  // Exclude text
  if (typeof input.excludeText !== "string") {
    throw new Error("Profile excludeText must be a string.");
  }

  // Max file size
  if (typeof input.maxFileSizeKb !== "number" || !Number.isInteger(input.maxFileSizeKb) || input.maxFileSizeKb <= 0) {
    throw new Error("Profile maxFileSizeKb must be a positive integer.");
  }

  // Booleans
  if (typeof input.respectGitIgnore !== "boolean") {
    throw new Error("Profile respectGitIgnore must be a boolean.");
  }
  if (typeof input.followSymlinks !== "boolean") {
    throw new Error("Profile followSymlinks must be a boolean.");
  }

  // Optional id for updates
  const id = typeof input.id === "string" && input.id.length > 0 ? input.id : undefined;

  return {
    id,
    name,
    projectRoot,
    outputFile,
    format: input.format,
    files: input.files,
    folders: input.folders,
    excludeText: input.excludeText,
    maxFileSizeKb: input.maxFileSizeKb,
    respectGitIgnore: input.respectGitIgnore,
    followSymlinks: input.followSymlinks
  };
}

/**
 * Save or update a profile. If the input has an `id` matching an existing profile,
 * that profile is updated in place (preserving `createdAt`). Otherwise a new profile
 * is created. The list is capped at MAX_EXPORT_PROFILES (oldest by `updatedAt` is evicted).
 */
export async function saveExportProfile(
  userDataPath: string,
  input: unknown
): Promise<SavedExportProfile[]> {
  return enqueueExportProfileMutation(async () => {
    const validated = validateProfileInput(input);
    const existing = await readExportProfiles(userDataPath);
    const now = Date.now();

    if (validated.id) {
      // Update existing profile
      const index = existing.findIndex((profile) => profile.id === validated.id);
      if (index >= 0) {
        const updated: SavedExportProfile = {
          ...existing[index],
          name: validated.name,
          projectRoot: validated.projectRoot,
          outputFile: validated.outputFile,
          format: validated.format,
          files: validated.files,
          folders: validated.folders,
          excludeText: validated.excludeText,
          maxFileSizeKb: validated.maxFileSizeKb,
          respectGitIgnore: validated.respectGitIgnore,
          followSymlinks: validated.followSymlinks,
          updatedAt: now
        };
        existing[index] = updated;
        await writeExportProfilesAtomic(userDataPath, existing);
        logger.info("Updated export profile", { name: safeLabel(validated.projectRoot) });
        return existing;
      }
    }

    // Create new profile
    const newProfile: SavedExportProfile = {
      id: randomUUID(),
      name: validated.name,
      projectRoot: validated.projectRoot,
      outputFile: validated.outputFile,
      format: validated.format,
      files: validated.files,
      folders: validated.folders,
      excludeText: validated.excludeText,
      maxFileSizeKb: validated.maxFileSizeKb,
      respectGitIgnore: validated.respectGitIgnore,
      followSymlinks: validated.followSymlinks,
      createdAt: now,
      updatedAt: now
    };

    const profiles = [newProfile, ...existing];
    // Cap at MAX_EXPORT_PROFILES — evict the oldest by updatedAt
    if (profiles.length > MAX_EXPORT_PROFILES) {
      profiles.sort((a, b) => b.updatedAt - a.updatedAt);
      profiles.length = MAX_EXPORT_PROFILES;
    }

    await writeExportProfilesAtomic(userDataPath, profiles);
    logger.info("Saved export profile", { name: safeLabel(validated.projectRoot) });
    return profiles;
  });
}

/**
 * Delete a profile by id. If the id does not exist, the list is returned unchanged.
 */
export async function deleteExportProfile(userDataPath: string, id: string): Promise<SavedExportProfile[]> {
  return enqueueExportProfileMutation(async () => {
    if (typeof id !== "string" || id.length === 0) {
      return readExportProfiles(userDataPath);
    }

    const existing = await readExportProfiles(userDataPath);
    const filtered = existing.filter((profile) => profile.id !== id);

    if (filtered.length !== existing.length) {
      await writeExportProfilesAtomic(userDataPath, filtered);
      logger.info("Deleted export profile", { id: id.slice(0, 8) });
    }
    return filtered;
  });
}

/**
 * Update `lastUsedAt` for a profile. Missing id is safe and returns the existing list.
 */
export async function markExportProfileUsed(userDataPath: string, id: string): Promise<SavedExportProfile[]> {
  return enqueueExportProfileMutation(async () => {
    if (typeof id !== "string" || id.length === 0) {
      return readExportProfiles(userDataPath);
    }

    const existing = await readExportProfiles(userDataPath);
    const index = existing.findIndex((profile) => profile.id === id);
    if (index < 0) {
      return existing;
    }

    existing[index] = { ...existing[index], lastUsedAt: Date.now() };
    await writeExportProfilesAtomic(userDataPath, existing);
    return existing;
  });
}
