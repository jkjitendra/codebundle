import { mkdir, rename, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, win32 } from "node:path";
import logger from "electron-log";
import type { RecentProject } from "../shared/types";

const RECENT_PROJECTS_FILE = "recent-projects.json";
export const MAX_RECENT_PROJECTS = 10;
let recentProjectsMutationQueue: Promise<void> = Promise.resolve();

function enqueueRecentProjectsMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = recentProjectsMutationQueue.then(operation, operation);
  recentProjectsMutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function normalizeInputPath(projectPath: string): string {
  return normalize(projectPath.trim());
}

/**
 * Normalize a path for comparison. On Windows, case-insensitive.
 */
export function normalizeForCompare(projectPath: string, platform: NodeJS.Platform = process.platform): string {
  const trimmed = projectPath.trim();
  const normalized = platform === "win32" ? win32.normalize(trimmed) : normalize(trimmed);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * Return only the folder basename for safe log messages.
 * Never logs full absolute paths to avoid exposing private directory names.
 */
export function safeLabel(projectPath: string): string {
  const trimmed = projectPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = trimmed.split("/").filter(Boolean);
  return parts.at(-1) || "project";
}

export function getRecentProjectsPath(userDataPath: string): string {
  return join(userDataPath, RECENT_PROJECTS_FILE);
}

function isValidEntry(entry: unknown): entry is RecentProject {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return false;
  }
  const record = entry as Record<string, unknown>;
  const normalizedPath = typeof record.path === "string" ? normalizeInputPath(record.path) : "";
  return (
    typeof record.path === "string" &&
    normalizedPath.length > 0 &&
    isAbsolute(normalizedPath) &&
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    typeof record.addedAt === "number" &&
    Number.isFinite(record.addedAt) &&
    typeof record.lastOpenedAt === "number" &&
    Number.isFinite(record.lastOpenedAt)
  );
}

function parseStoredProjects(raw: string): RecentProject[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const projects: RecentProject[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (!isValidEntry(entry)) {
        continue;
      }

      const normalizedPath = normalizeInputPath(entry.path);
      const comparePath = normalizeForCompare(normalizedPath);
      if (seen.has(comparePath)) {
        continue;
      }
      seen.add(comparePath);
      projects.push({
        path: normalizedPath,
        name: entry.name.trim(),
        addedAt: entry.addedAt,
        lastOpenedAt: entry.lastOpenedAt
      });

      if (projects.length >= MAX_RECENT_PROJECTS) {
        break;
      }
    }

    return projects;
  } catch {
    return [];
  }
}

/**
 * Write the recent projects list atomically (temp file then rename)
 * to reduce corruption risk if the app exits during write.
 */
async function writeRecentProjectsAtomic(userDataPath: string, projects: RecentProject[]): Promise<void> {
  const filePath = getRecentProjectsPath(userDataPath);
  const tmpPath = `${filePath}.tmp`;
  await mkdir(userDataPath, { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

export async function readRecentProjects(userDataPath: string): Promise<RecentProject[]> {
  try {
    const raw = await readFile(getRecentProjectsPath(userDataPath), "utf8");
    return parseStoredProjects(raw);
  } catch {
    return [];
  }
}

/**
 * Validate a single path: must be absolute, must resolve to an existing directory.
 */
export async function isValidProjectPath(projectPath: string): Promise<boolean> {
  if (typeof projectPath !== "string") {
    return false;
  }

  const normalizedPath = normalizeInputPath(projectPath);
  if (normalizedPath.length === 0 || !isAbsolute(normalizedPath)) {
    return false;
  }

  try {
    const fileStat = await stat(normalizedPath);
    return fileStat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Add a project to the recent list. If it already exists, it is
 * moved to the front with an updated `lastOpenedAt`. The list is
 * capped at MAX_RECENT_PROJECTS.
 *
 * Returns the updated list, or the unchanged list if the path is invalid.
 */
export async function addRecentProject(userDataPath: string, projectPath: string): Promise<RecentProject[]> {
  return enqueueRecentProjectsMutation(async () => {
    const normalizedProjectPath = normalizeInputPath(projectPath);
    if (!(await isValidProjectPath(normalizedProjectPath))) {
      return readRecentProjects(userDataPath);
    }

    const normalizedInput = normalizeForCompare(normalizedProjectPath);
    const existing = await readRecentProjects(userDataPath);
    const now = Date.now();

    // Check for duplicate (by normalized path comparison)
    const duplicateIndex = existing.findIndex(
      (entry) => normalizeForCompare(entry.path) === normalizedInput
    );

    let entry: RecentProject;
    if (duplicateIndex >= 0) {
      // Re-opened: update lastOpenedAt, keep original addedAt
      entry = { ...existing[duplicateIndex], path: normalizedProjectPath, lastOpenedAt: now };
      existing.splice(duplicateIndex, 1);
    } else {
      entry = {
        path: normalizedProjectPath,
        name: safeLabel(normalizedProjectPath),
        addedAt: now,
        lastOpenedAt: now
      };
    }

    const updated = [entry, ...existing].slice(0, MAX_RECENT_PROJECTS);
    await writeRecentProjectsAtomic(userDataPath, updated);
    logger.info("Added recent project", { name: safeLabel(normalizedProjectPath) });
    return updated;
  });
}

/**
 * Remove a project from the recent list by path. Returns the updated list.
 */
export async function removeRecentProject(userDataPath: string, projectPath: string): Promise<RecentProject[]> {
  return enqueueRecentProjectsMutation(async () => {
    if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
      return readRecentProjects(userDataPath);
    }

    const normalizedInput = normalizeForCompare(projectPath);
    const existing = await readRecentProjects(userDataPath);
    const filtered = existing.filter(
      (entry) => normalizeForCompare(entry.path) !== normalizedInput
    );

    if (filtered.length !== existing.length) {
      await writeRecentProjectsAtomic(userDataPath, filtered);
      logger.info("Removed recent project", { name: safeLabel(projectPath) });
    }
    return filtered;
  });
}

/**
 * Validate all recent projects, removing entries whose paths
 * no longer exist or are no longer directories. Only called
 * when the UI explicitly requests the list (no background scan).
 */
export async function validateRecentProjects(userDataPath: string): Promise<RecentProject[]> {
  return enqueueRecentProjectsMutation(async () => {
    const existing = await readRecentProjects(userDataPath);
    if (existing.length === 0) {
      return [];
    }

    const validEntries: RecentProject[] = [];
    for (const entry of existing) {
      if (await isValidProjectPath(entry.path)) {
        validEntries.push(entry);
      }
    }

    if (validEntries.length !== existing.length) {
      await writeRecentProjectsAtomic(userDataPath, validEntries);
      logger.info("Pruned stale recent projects", { removedCount: existing.length - validEntries.length });
    }
    return validEntries;
  });
}