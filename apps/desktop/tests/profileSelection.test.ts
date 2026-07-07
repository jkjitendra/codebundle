import { describe, expect, it } from "vitest";
import { restoreProfileSelection } from "../src/renderer/lib/profileSelection";
import { buildFileTree, buildTreeIndex } from "../src/renderer/lib/treeUtils";
import type { ScanNode } from "../src/shared/types";

function makeTreeIndex(nodes: ScanNode[]) {
  const tree = buildFileTree(nodes);
  return buildTreeIndex(tree);
}

describe("restoreProfileSelection", () => {
  const testNodes: ScanNode[] = [
    { path: "src", name: "src", type: "directory", childrenCount: 3 },
    { path: "src/index.ts", name: "index.ts", type: "file", sizeBytes: 100, extension: ".ts" },
    { path: "src/app.ts", name: "app.ts", type: "file", sizeBytes: 200, extension: ".ts" },
    { path: "src/lib", name: "lib", type: "directory", childrenCount: 1 },
    { path: "src/lib/utils.ts", name: "utils.ts", type: "file", sizeBytes: 50, extension: ".ts" },
    { path: "docs", name: "docs", type: "directory", childrenCount: 1 },
    { path: "docs/readme.md", name: "readme.md", type: "file", sizeBytes: 300, extension: ".md" }
  ];

  it("restores existing saved files", () => {
    const treeIndex = makeTreeIndex(testNodes);
    const result = restoreProfileSelection({
      treeIndex,
      files: ["src/index.ts", "src/app.ts"],
      folders: []
    });

    expect(result.selectedFiles).toEqual(["src/index.ts", "src/app.ts"]);
    expect(result.selectedFolders).toEqual([]);
    expect(result.restoredCount).toBe(2);
    expect(result.missingCount).toBe(0);
  });

  it("restores existing saved folders", () => {
    const treeIndex = makeTreeIndex(testNodes);
    const result = restoreProfileSelection({
      treeIndex,
      files: [],
      folders: ["src/lib", "docs"]
    });

    expect(result.selectedFiles).toEqual([]);
    expect(result.selectedFolders).toEqual(["src/lib", "docs"]);
    expect(result.restoredCount).toBe(2);
    expect(result.missingCount).toBe(0);
  });

  it("skips missing saved paths", () => {
    const treeIndex = makeTreeIndex(testNodes);
    const result = restoreProfileSelection({
      treeIndex,
      files: ["src/index.ts", "src/deleted.ts", "src/gone.ts"],
      folders: ["src/lib", "missing-folder"]
    });

    expect(result.selectedFiles).toEqual(["src/index.ts"]);
    expect(result.selectedFolders).toEqual(["src/lib"]);
    expect(result.restoredCount).toBe(2);
    expect(result.missingCount).toBe(3);
  });

  it("returns correct counts with mixed found and missing paths", () => {
    const treeIndex = makeTreeIndex(testNodes);
    const result = restoreProfileSelection({
      treeIndex,
      files: ["src/index.ts", "nonexistent.ts"],
      folders: ["docs", "old-folder"]
    });

    expect(result.restoredCount).toBe(2);
    expect(result.missingCount).toBe(2);
  });

  it("returns zero counts for empty input", () => {
    const treeIndex = makeTreeIndex(testNodes);
    const result = restoreProfileSelection({
      treeIndex,
      files: [],
      folders: []
    });

    expect(result.selectedFiles).toEqual([]);
    expect(result.selectedFolders).toEqual([]);
    expect(result.restoredCount).toBe(0);
    expect(result.missingCount).toBe(0);
  });

  it("does not select paths absent from the scan result", () => {
    const treeIndex = makeTreeIndex(testNodes);
    const result = restoreProfileSelection({
      treeIndex,
      files: ["completely/made/up.ts"],
      folders: ["does/not/exist"]
    });

    expect(result.selectedFiles).toEqual([]);
    expect(result.selectedFolders).toEqual([]);
    expect(result.restoredCount).toBe(0);
    expect(result.missingCount).toBe(2);
  });

  it("does not treat a folder path as a file or vice versa", () => {
    const treeIndex = makeTreeIndex(testNodes);
    // "src" is a directory, not a file
    // "src/index.ts" is a file, not a directory
    const result = restoreProfileSelection({
      treeIndex,
      files: ["src"],
      folders: ["src/index.ts"]
    });

    expect(result.selectedFiles).toEqual([]);
    expect(result.selectedFolders).toEqual([]);
    expect(result.restoredCount).toBe(0);
    expect(result.missingCount).toBe(2);
  });
});
