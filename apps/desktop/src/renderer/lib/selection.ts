import type { CodeBundleConfigPreview, FileTreeNode } from "./types";
import { collectDirectoryPaths, collectFilePaths, getDescendantFilePaths } from "./treeUtils";

export type SelectionState = "checked" | "unchecked" | "indeterminate";

export function getNodeSelectionState(node: FileTreeNode, selectedFiles: Set<string>): SelectionState {
  if (node.type === "file") {
    return selectedFiles.has(node.path) ? "checked" : "unchecked";
  }

  const descendantFiles = getDescendantFilePaths(node);
  if (descendantFiles.length === 0) {
    return "unchecked";
  }

  const selectedCount = descendantFiles.filter((path) => selectedFiles.has(path)).length;
  if (selectedCount === 0) {
    return "unchecked";
  }
  if (selectedCount === descendantFiles.length) {
    return "checked";
  }
  return "indeterminate";
}

export function toggleNodeSelection(node: FileTreeNode, selectedFiles: Set<string>): Set<string> {
  const next = new Set(selectedFiles);
  const paths = getDescendantFilePaths(node);
  const shouldSelect = paths.some((path) => !next.has(path));

  for (const path of paths) {
    if (shouldSelect) {
      next.add(path);
    } else {
      next.delete(path);
    }
  }

  return next;
}

export function selectFiles(paths: string[], selectedFiles: Set<string>): Set<string> {
  const next = new Set(selectedFiles);
  for (const path of paths) {
    next.add(path);
  }
  return next;
}

export function clearSelection(): Set<string> {
  return new Set<string>();
}

export function getSelectionSummary(nodes: FileTreeNode[], selectedFiles: Set<string>) {
  const allFiles = collectFilePaths(nodes);
  const selectedFolders = collectDirectoryPaths(nodes).filter((folderPath) => {
    const folderFiles = allFiles.filter((filePath) => filePath.startsWith(`${folderPath}/`));
    return folderFiles.length > 0 && folderFiles.every((filePath) => selectedFiles.has(filePath));
  });

  return {
    selectedFilesCount: selectedFiles.size,
    selectedFoldersCount: selectedFolders.length,
    estimatedExportFileCount: selectedFiles.size
  };
}

export function buildConfigPreview(options: {
  projectRoot: string;
  outputFile: string;
  format: "markdown" | "text";
  tree: FileTreeNode[];
  selectedFiles: Set<string>;
  exclude: string[];
  maxFileSizeKb: number;
  respectGitIgnore: boolean;
  followSymlinks: boolean;
}): CodeBundleConfigPreview {
  const allFiles = collectFilePaths(options.tree);
  const allDirectories = collectDirectoryPaths(options.tree).sort(
    (left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right)
  );
  const folders: string[] = [];

  for (const folderPath of allDirectories) {
    if (folders.some((parentPath) => folderPath.startsWith(`${parentPath}/`))) {
      continue;
    }
    const folderFiles = allFiles.filter((filePath) => filePath.startsWith(`${folderPath}/`));
    if (folderFiles.length > 0 && folderFiles.every((filePath) => options.selectedFiles.has(filePath))) {
      folders.push(folderPath);
    }
  }

  const files = [...options.selectedFiles]
    .filter((filePath) => !folders.some((folderPath) => filePath.startsWith(`${folderPath}/`)))
    .sort((left, right) => left.localeCompare(right));

  return {
    version: 1,
    projectRoot: options.projectRoot,
    outputFile: options.outputFile,
    format: options.format,
    mode: "selected",
    files,
    folders,
    include: [],
    exclude: options.exclude,
    maxFileSizeKb: options.maxFileSizeKb,
    skipBinaryFiles: true,
    respectGitIgnore: options.respectGitIgnore,
    followSymlinks: options.followSymlinks
  };
}
