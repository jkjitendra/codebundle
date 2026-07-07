import type { TreeIndex } from "./treeUtils";

export interface ProfileSelectionResult {
  selectedFiles: string[];
  selectedFolders: string[];
  restoredCount: number;
  missingCount: number;
}

/**
 * Restore a saved profile's file/folder selections against a live scan tree.
 * Only paths that exist in the current tree index are returned.
 * Returns counts of restored and missing paths for user feedback.
 */
export function restoreProfileSelection(options: {
  treeIndex: TreeIndex;
  files: string[];
  folders: string[];
}): ProfileSelectionResult {
  const { treeIndex, files, folders } = options;

  const selectedFiles: string[] = [];
  const selectedFolders: string[] = [];
  let missingCount = 0;

  for (const filePath of files) {
    const node = treeIndex.nodeByPath.get(filePath);
    if (node && node.type === "file") {
      selectedFiles.push(filePath);
    } else {
      missingCount++;
    }
  }

  for (const folderPath of folders) {
    const node = treeIndex.nodeByPath.get(folderPath);
    if (node && node.type === "directory") {
      selectedFolders.push(folderPath);
    } else {
      missingCount++;
    }
  }

  return {
    selectedFiles,
    selectedFolders,
    restoredCount: selectedFiles.length + selectedFolders.length,
    missingCount
  };
}
