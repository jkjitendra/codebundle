import { describe, expect, it } from "vitest";
import { buildGitDiffSelection } from "../src/renderer/lib/gitDiffSelection";
import { buildTreeIndex } from "../src/renderer/lib/treeUtils";
import type { FileTreeNode } from "../src/shared/types";

const tree: FileTreeNode[] = [
  {
    path: "src",
    name: "src",
    type: "directory",
    depth: 0,
    childrenCount: 1,
    children: [
      { path: "src/app.ts", name: "app.ts", type: "file", depth: 1, sizeBytes: 1, extension: ".ts" }
    ]
  },
  { path: "README.md", name: "README.md", type: "file", depth: 0, sizeBytes: 1, extension: ".md" }
];

describe("buildGitDiffSelection", () => {
  it("selects only changed files present in the scan tree and counts unavailable paths", () => {
    const result = buildGitDiffSelection({
      diffFiles: [
        { path: "src/app.ts", status: "modified" },
        { path: "missing.ts", status: "added" },
        { path: "src", status: "modified" }
      ],
      treeIndex: buildTreeIndex(tree),
      deletedCount: 1,
      skippedInvalidCount: 2,
      mode: "branch",
      baseRef: "main",
      includeUntracked: true
    });

    expect(result.availablePaths).toEqual(["src/app.ts"]);
    expect(result.gitDiffInfo).toEqual({
      mode: "branch",
      baseRef: "main",
      includeUntracked: true,
      changedFilesCount: 6,
      selectedFilesCount: 1,
      unavailableFilesCount: 5
    });
  });

  it("returns empty selection metadata for an empty diff", () => {
    const result = buildGitDiffSelection({
      diffFiles: [],
      treeIndex: buildTreeIndex(tree),
      deletedCount: 0,
      skippedInvalidCount: 0,
      mode: "workingTree",
      includeUntracked: false
    });

    expect(result.availablePaths).toEqual([]);
    expect(result.gitDiffInfo).toEqual({
      mode: "workingTree",
      includeUntracked: false,
      changedFilesCount: 0,
      selectedFilesCount: 0,
      unavailableFilesCount: 0
    });
  });
});
