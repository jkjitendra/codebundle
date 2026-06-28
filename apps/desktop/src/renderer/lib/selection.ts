import type { CodeBundleConfigPreview, FileTreeNode } from "./types";
import { EXPORT_HEADER_OVERHEAD_BYTES, PER_FILE_MARKDOWN_OVERHEAD_BYTES, estimateTokenCount } from "./tokenEstimate";
import type { TreeIndex } from "./treeUtils";

export type SelectionState = "checked" | "unchecked" | "indeterminate";

export interface SelectionModel {
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  deselectedFiles: Set<string>;
  deselectedFolders: Set<string>;
}

export function createEmptySelection(): SelectionModel {
  return {
    selectedFiles: new Set(),
    selectedFolders: new Set(),
    deselectedFiles: new Set(),
    deselectedFolders: new Set()
  };
}

export function getNodeSelectionState(node: FileTreeNode, selection: SelectionModel, index: TreeIndex): SelectionState {
  if (node.type === "file") {
    return isFileSelected(node.path, selection, index) ? "checked" : "unchecked";
  }

  const totalFiles = index.descendantFileCountByFolder.get(node.path) ?? 0;
  if (totalFiles === 0) {
    return "unchecked";
  }

  if (isFolderFullySelected(node.path, selection, index)) {
    return "checked";
  }

  if (hasAnySelectionInFolder(node.path, selection, index)) {
    return "indeterminate";
  }

  return "unchecked";
}

export function toggleNodeSelection(node: FileTreeNode, selection: SelectionModel, index: TreeIndex): SelectionModel {
  if (node.type === "file") {
    return toggleFileSelection(node.path, selection, index);
  }
  return toggleFolderSelection(node.path, selection, index);
}

export function toggleFileSelection(path: string, selection: SelectionModel, index: TreeIndex): SelectionModel {
  const next = cloneSelection(selection);
  const wasSelected = isFileSelected(path, selection, index);
  const wasSelectedByFolder = isSelectedByFolder(path, selection, index);
  const wasExplicitlyDeselected = selection.deselectedFiles.has(path) || isDeselectedByFolder(path, selection, index);
  clearPath(next, path);

  if (wasSelected) {
    if (wasSelectedByFolder) {
      next.deselectedFiles.add(path);
    } else {
      next.selectedFiles.delete(path);
    }
  } else if (wasSelectedByFolder && wasExplicitlyDeselected) {
    removeDeselectedAncestors(path, next, index);
  } else if (isDeselectedByFolder(path, selection, index)) {
    removeDeselectedAncestors(path, next, index);
    next.selectedFiles.add(path);
  } else {
    next.selectedFiles.add(path);
  }

  return normalizeSelectionForAncestors(path, next, index);
}

export function toggleFolderSelection(path: string, selection: SelectionModel, index: TreeIndex): SelectionModel {
  const next = cloneSelection(selection);
  const state = getFolderSelectionState(path, selection, index);

  if (state === "checked") {
    clearSelectionUnderFolder(path, next);
    if (isSelectedByAncestorFolder(path, selection, index)) {
      next.deselectedFolders.add(path);
    }
  } else {
    clearSelectionUnderFolder(path, next);
    next.deselectedFolders.delete(path);
    removeDeselectedAncestors(path, next, index);
    next.selectedFolders.add(path);
  }

  removeRedundantSelectedDescendants(path, next);
  return normalizeSelectionForAncestors(path, next, index);
}

export function selectPaths(paths: string[], selection: SelectionModel, index: TreeIndex): SelectionModel {
  let next = selection;
  for (const path of paths) {
    const node = index.nodeByPath.get(path);
    if (!node) {
      continue;
    }
    if (node.type === "file" && !isFileSelected(path, next, index)) {
      next = toggleFileSelection(path, next, index);
    } else if (node.type === "directory" && getFolderSelectionState(path, next, index) !== "checked") {
      next = toggleFolderSelection(path, next, index);
    }
  }
  return next;
}

export function clearSelection(): SelectionModel {
  return createEmptySelection();
}

export function getSelectionSummary(selection: SelectionModel, index: TreeIndex) {
  let estimatedExportFileCountRaw = 0;

  for (const folderPath of selection.selectedFolders) {
    if (hasSelectedFolderAncestor(folderPath, selection, index)) {
      continue;
    }
    estimatedExportFileCountRaw += index.descendantFileCountByFolder.get(folderPath) ?? 0;
  }

  for (const filePath of selection.selectedFiles) {
    if (!isSelectedByFolder(filePath, selection, index)) {
      estimatedExportFileCountRaw += 1;
    }
  }

  for (const filePath of selection.deselectedFiles) {
    if (isSelectedByFolder(filePath, selection, index)) {
      estimatedExportFileCountRaw -= 1;
    }
  }

  for (const folderPath of selection.deselectedFolders) {
    if (isSelectedByAncestorFolder(folderPath, selection, index)) {
      estimatedExportFileCountRaw -= index.descendantFileCountByFolder.get(folderPath) ?? 0;
    }
  }

  const estimatedExportFileCount = Math.max(0, estimatedExportFileCountRaw);

  // Compute estimated total bytes from selected files
  let estimatedTotalBytes = 0;
  for (const filePath of index.filePaths) {
    if (isFileSelected(filePath, selection, index)) {
      const node = index.nodeByPath.get(filePath);
      if (node && node.type === "file") {
        estimatedTotalBytes += node.sizeBytes;
      }
    }
  }

  // Apply export wrapper overhead when files are selected
  if (estimatedExportFileCount > 0) {
    estimatedTotalBytes += EXPORT_HEADER_OVERHEAD_BYTES + estimatedExportFileCount * PER_FILE_MARKDOWN_OVERHEAD_BYTES;
  }

  return {
    selectedFilesCount: selection.selectedFiles.size,
    selectedFoldersCount: selection.selectedFolders.size,
    estimatedExportFileCount,
    estimatedTotalBytes,
    estimatedTokenCount: estimateTokenCount(estimatedTotalBytes)
  };
}

export function buildConfigPreview(options: {
  projectRoot: string;
  outputFile: string;
  format: "markdown" | "text";
  selection: SelectionModel;
  exclude: string[];
  maxFileSizeKb: number;
  respectGitIgnore: boolean;
  followSymlinks: boolean;
}): CodeBundleConfigPreview {
  const folders = compactSelectedFolders(options.selection).sort((left, right) => left.localeCompare(right));
  const files = [...options.selection.selectedFiles]
    .filter((filePath) => !folders.some((folderPath) => isDescendantPath(filePath, folderPath)))
    .sort((left, right) => left.localeCompare(right));
  const excludeOverrides = [
    ...[...options.selection.deselectedFiles].sort((left, right) => left.localeCompare(right)),
    ...[...options.selection.deselectedFolders].sort((left, right) => left.localeCompare(right)).map((path) => `${path}/**`)
  ];

  return {
    version: 1,
    projectRoot: options.projectRoot,
    outputFile: options.outputFile,
    format: options.format,
    mode: "selected",
    files,
    folders,
    include: [],
    exclude: [...new Set([...options.exclude, ...excludeOverrides])],
    maxFileSizeKb: options.maxFileSizeKb,
    skipBinaryFiles: true,
    respectGitIgnore: options.respectGitIgnore,
    followSymlinks: options.followSymlinks
  };
}

export function isFileSelected(path: string, selection: SelectionModel, index: TreeIndex): boolean {
  if (selection.deselectedFiles.has(path)) {
    return false;
  }
  if (selection.selectedFiles.has(path)) {
    return true;
  }
  return isSelectedByFolder(path, selection, index) && !isDeselectedByFolder(path, selection, index);
}

export function normalizeSelectionForAncestors(path: string, selection: SelectionModel, index: TreeIndex): SelectionModel {
  const next = cloneSelection(selection);
  const candidateFolders = [...(index.ancestorsByPath.get(path) ?? [])];
  const node = index.nodeByPath.get(path);
  if (node?.type === "directory") {
    candidateFolders.push(path);
  }

  for (const folderPath of candidateFolders.reverse()) {
    if (isSelectedByAncestorFolder(folderPath, next, index)) {
      continue;
    }
    if (areAllDescendantFilesSelected(folderPath, next, index)) {
      clearSelectionUnderFolder(folderPath, next);
      next.selectedFolders.add(folderPath);
    }
  }

  return next;
}

export function areAllDescendantFilesSelected(folderPath: string, selection: SelectionModel, index: TreeIndex): boolean {
  const descendantFiles = index.descendantFilesByFolder.get(folderPath) ?? [];
  return descendantFiles.length > 0 && descendantFiles.every((filePath) => isFileSelected(filePath, selection, index));
}

export function clearSelectionUnderFolder(folderPath: string, selection: SelectionModel): void {
  clearDescendantOverrides(folderPath, selection);
}

function getFolderSelectionState(path: string, selection: SelectionModel, index: TreeIndex): SelectionState {
  const node = index.nodeByPath.get(path);
  if (!node || node.type !== "directory") {
    return "unchecked";
  }
  return getNodeSelectionState(node, selection, index);
}

function isFolderFullySelected(path: string, selection: SelectionModel, index: TreeIndex): boolean {
  const totalFiles = index.descendantFileCountByFolder.get(path) ?? 0;
  if (totalFiles === 0) {
    return false;
  }
  if (!selection.selectedFolders.has(path) && !isSelectedByAncestorFolder(path, selection, index)) {
    return hasAnySelectionInFolder(path, selection, index) && areAllDescendantFilesSelected(path, selection, index);
  }
  return !hasDeselectionInFolder(path, selection);
}

function hasAnySelectionInFolder(path: string, selection: SelectionModel, index: TreeIndex): boolean {
  if (selection.selectedFolders.has(path) || isSelectedByAncestorFolder(path, selection, index)) {
    return !selection.deselectedFolders.has(path);
  }

  for (const folderPath of selection.selectedFolders) {
    if (isDescendantPath(folderPath, path)) {
      return true;
    }
  }
  for (const filePath of selection.selectedFiles) {
    if (isDescendantPath(filePath, path)) {
      return true;
    }
  }
  return false;
}

function isSelectedByFolder(path: string, selection: SelectionModel, index: TreeIndex): boolean {
  return getSelectionAncestors(path, index).some((ancestor) => selection.selectedFolders.has(ancestor));
}

function isSelectedByAncestorFolder(path: string, selection: SelectionModel, index: TreeIndex): boolean {
  return getSelectionAncestors(path, index).slice(0, -1).some((ancestor) => selection.selectedFolders.has(ancestor));
}

function hasSelectedFolderAncestor(path: string, selection: SelectionModel, index: TreeIndex): boolean {
  return isSelectedByAncestorFolder(path, selection, index);
}

function isDeselectedByFolder(path: string, selection: SelectionModel, index: TreeIndex): boolean {
  return getSelectionAncestors(path, index).some((ancestor) => selection.deselectedFolders.has(ancestor));
}

function hasDeselectionInFolder(path: string, selection: SelectionModel): boolean {
  for (const filePath of selection.deselectedFiles) {
    if (isDescendantPath(filePath, path)) {
      return true;
    }
  }
  for (const folderPath of selection.deselectedFolders) {
    if (folderPath === path || isDescendantPath(folderPath, path)) {
      return true;
    }
  }
  return false;
}

function compactSelectedFolders(selection: SelectionModel): string[] {
  const sorted = [...selection.selectedFolders].sort(
    (left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right)
  );
  const folders: string[] = [];

  for (const folderPath of sorted) {
    if (!folders.some((parentPath) => isDescendantPath(folderPath, parentPath))) {
      folders.push(folderPath);
    }
  }

  return folders;
}

function getSelectionAncestors(path: string, index: TreeIndex): string[] {
  const ancestors = index.ancestorsByPath.get(path) ?? [];
  return [...ancestors, path];
}

function clearPath(selection: SelectionModel, path: string): void {
  selection.selectedFiles.delete(path);
  selection.selectedFolders.delete(path);
  selection.deselectedFiles.delete(path);
  selection.deselectedFolders.delete(path);
}

function clearDescendantOverrides(path: string, selection: SelectionModel): void {
  for (const set of [selection.selectedFiles, selection.selectedFolders, selection.deselectedFiles, selection.deselectedFolders]) {
    for (const candidate of [...set]) {
      if (candidate === path || isDescendantPath(candidate, path)) {
        set.delete(candidate);
      }
    }
  }
}

function removeRedundantSelectedDescendants(path: string, selection: SelectionModel): void {
  for (const folderPath of [...selection.selectedFolders]) {
    if (folderPath !== path && isDescendantPath(folderPath, path)) {
      selection.selectedFolders.delete(folderPath);
    }
  }
  for (const filePath of [...selection.selectedFiles]) {
    if (isDescendantPath(filePath, path)) {
      selection.selectedFiles.delete(filePath);
    }
  }
}

function removeDeselectedAncestors(path: string, selection: SelectionModel, index: TreeIndex): void {
  for (const ancestor of index.ancestorsByPath.get(path) ?? []) {
    selection.deselectedFolders.delete(ancestor);
  }
}

function cloneSelection(selection: SelectionModel): SelectionModel {
  return {
    selectedFiles: new Set(selection.selectedFiles),
    selectedFolders: new Set(selection.selectedFolders),
    deselectedFiles: new Set(selection.deselectedFiles),
    deselectedFolders: new Set(selection.deselectedFolders)
  };
}

function isDescendantPath(path: string, parentPath: string): boolean {
  return path.startsWith(`${parentPath}/`);
}
