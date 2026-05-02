import { homedir } from "node:os";
import { resolve, relative, isAbsolute, parse } from "node:path";

export function normalizeAbsolutePath(inputPath: string): string {
  return resolve(inputPath);
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = resolve(parentPath);
  const child = resolve(childPath);
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function isSafeProjectPath(projectRoot: string, candidatePath: string): boolean {
  return isPathInside(projectRoot, candidatePath);
}

const DANGEROUS_POSIX_ROOTS = new Set(["/", "/etc", "/usr", "/System", "/Library"]);
const DANGEROUS_WINDOWS_ROOTS = new Set([
  "c:\\",
  "c:\\windows",
  "c:\\program files",
  "c:\\program files (x86)"
]);

export function isDangerousProjectRoot(inputPath: string): boolean {
  const normalized = resolve(inputPath);
  const lower = normalized.toLowerCase();

  if (DANGEROUS_POSIX_ROOTS.has(normalized)) {
    return true;
  }

  if (DANGEROUS_WINDOWS_ROOTS.has(lower)) {
    return true;
  }

  const parsed = parse(normalized);
  return normalized === parsed.root && DANGEROUS_WINDOWS_ROOTS.has(parsed.root.toLowerCase());
}

export function isHomeDirectory(inputPath: string): boolean {
  return resolve(inputPath) === resolve(homedir());
}

export function assertSafeProjectRoot(inputPath: string, allowHomeDirectory = false): string {
  const normalized = normalizeAbsolutePath(inputPath);

  if (isDangerousProjectRoot(normalized)) {
    throw new Error("DANGEROUS_PROJECT_ROOT: Choose a project folder instead of a system-level directory.");
  }

  if (isHomeDirectory(normalized) && !allowHomeDirectory) {
    throw new Error("HOME_DIRECTORY_REQUIRES_CONFIRMATION: Scanning your home directory can include many personal files.");
  }

  return normalized;
}

export function assertRelativePathInside(projectRoot: string, relativePath: string, label: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`${label} entries must be non-empty relative paths`);
  }

  if (isAbsolute(relativePath)) {
    throw new Error(`${label} entries must be relative paths`);
  }

  const candidate = resolve(projectRoot, relativePath);
  if (!isPathInside(projectRoot, candidate)) {
    throw new Error(`${label} entry escapes projectRoot: ${relativePath}`);
  }

  return candidate;
}
