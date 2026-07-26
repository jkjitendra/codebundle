import { posix, win32 } from "node:path";

function pathApi(...paths: string[]) {
  return paths.some((value) => /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(value)) ? win32 : posix;
}

/** Returns a safe POSIX workspace-relative path, or null when it escapes the workspace. */
export function normalizeWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string | null {
  if (!workspaceRoot || !absolutePath) return null;
  const api = pathApi(workspaceRoot, absolutePath);
  if (!api.isAbsolute(workspaceRoot) || !api.isAbsolute(absolutePath)) return null;
  const root = api.resolve(workspaceRoot);
  const candidate = api.resolve(absolutePath);
  const relativePath = api.relative(root, candidate);
  if (!relativePath || api.isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${api.sep}`)) {
    return null;
  }
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "")) return null;
  return normalized;
}
