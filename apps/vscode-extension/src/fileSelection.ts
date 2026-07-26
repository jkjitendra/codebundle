import { normalizeWorkspaceRelativePath } from "./pathSecurity";

export interface FileLikeUri { scheme: string; fsPath: string; }
export interface TextDocumentLike { uri: FileLikeUri; isUntitled?: boolean; }
export interface WorkspaceFolderLike { name: string; uri: FileLikeUri; }

export function filesForWorkspaceUris(uris: readonly FileLikeUri[], workspaceRoot: string): string[] {
  return [...new Set(uris
    .filter((uri) => uri.scheme === "file")
    .map((uri) => normalizeWorkspaceRelativePath(workspaceRoot, uri.fsPath))
    .filter((path): path is string => path !== null))].sort((a, b) => a.localeCompare(b));
}

export function filesForWorkspace(documents: readonly TextDocumentLike[], workspaceRoot: string): string[] {
  return filesForWorkspaceUris(documents.filter((document) => !document.isUntitled).map((document) => document.uri), workspaceRoot);
}

export function workspaceForPath(path: string, folders: readonly WorkspaceFolderLike[]): WorkspaceFolderLike | undefined {
  return folders.find((folder) => normalizeWorkspaceRelativePath(folder.uri.fsPath, path) !== null);
}

export function groupOpenFilesByWorkspace(documents: readonly TextDocumentLike[], folders: readonly WorkspaceFolderLike[]): Map<WorkspaceFolderLike, string[]> {
  return groupOpenFileUrisByWorkspace(documents.filter((document) => !document.isUntitled).map((document) => document.uri), folders);
}

export function groupOpenFileUrisByWorkspace(uris: readonly FileLikeUri[], folders: readonly WorkspaceFolderLike[]): Map<WorkspaceFolderLike, string[]> {
  const groups = new Map<WorkspaceFolderLike, string[]>();
  for (const folder of folders) {
    const files = filesForWorkspaceUris(uris, folder.uri.fsPath);
    if (files.length) groups.set(folder, files);
  }
  return groups;
}
