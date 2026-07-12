/**
 * Pure helper for building Git diff file selection from a diff result.
 * Kept in a separate module for testability without React or IPC dependencies.
 */

import type { GitDiffExportInfo, GitDiffFile, GitDiffMode } from "./types";
import type { TreeIndex } from "./treeUtils";

export interface BuildGitDiffSelectionOptions {
  diffFiles: GitDiffFile[];
  treeIndex: TreeIndex;
  deletedCount: number;
  skippedInvalidCount: number;
  mode: GitDiffMode;
  baseRef?: string;
  includeUntracked: boolean;
}

export interface BuildGitDiffSelectionResult {
  availablePaths: string[];
  gitDiffInfo: GitDiffExportInfo;
}

/**
 * Filter diff files against the scan tree and compute GitDiffExportInfo.
 */
export function buildGitDiffSelection(
  options: BuildGitDiffSelectionOptions
): BuildGitDiffSelectionResult {
  const {
    diffFiles,
    treeIndex,
    deletedCount,
    skippedInvalidCount,
    mode,
    baseRef,
    includeUntracked
  } = options;

  const changedPaths = diffFiles.map((file) => file.path);
  const availablePaths = [...new Set(changedPaths)].filter((path) => {
    const node = treeIndex.nodeByPath.get(path);
    return node !== undefined && node.type === "file";
  });
  // The Git result exposes selectable paths separately from deleted and invalid
  // paths. Keep the total honest for the export metadata, while only selecting
  // files that remain in the scanned tree.
  const changedFilesCount = changedPaths.length + deletedCount + skippedInvalidCount;
  const unavailableFilesCount = Math.max(0, changedFilesCount - availablePaths.length);

  const gitDiffInfo: GitDiffExportInfo = {
    mode,
    includeUntracked,
    changedFilesCount,
    selectedFilesCount: availablePaths.length,
    unavailableFilesCount
  };

  if (mode === "branch" && baseRef) {
    gitDiffInfo.baseRef = baseRef;
  }

  return { availablePaths, gitDiffInfo };
}
