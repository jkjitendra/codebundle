import { describe, expect, it } from "vitest";
import {
  buildConfigPreview,
  createEmptySelection,
  getSelectionSummary,
  isFileSelected,
  selectPaths,
  toggleFileSelection,
  toggleNodeSelection
} from "../src/renderer/lib/selection";
import { buildTreeIndex } from "../src/renderer/lib/treeUtils";
import type { FileTreeDirectoryNode, FileTreeNode } from "../src/shared/types";

function sampleTree(): FileTreeNode[] {
  return [
    {
      path: "src",
      name: "src",
      type: "directory",
      depth: 0,
      childrenCount: 3,
      children: [
        {
          path: "src/app.ts",
          name: "app.ts",
          type: "file",
          depth: 1,
          sizeBytes: 100,
          extension: ".ts"
        },
        {
          path: "src/util.ts",
          name: "util.ts",
          type: "file",
          depth: 1,
          sizeBytes: 100,
          extension: ".ts"
        },
        {
          path: "src/nested",
          name: "nested",
          type: "directory",
          depth: 1,
          childrenCount: 1,
          children: [
            {
              path: "src/nested/deep.ts",
              name: "deep.ts",
              type: "file",
              depth: 2,
              sizeBytes: 100,
              extension: ".ts"
            }
          ]
        }
      ]
    },
    {
      path: "README.md",
      name: "README.md",
      type: "file",
      depth: 0,
      sizeBytes: 50,
      extension: ".md"
    }
  ];
}

function largeTree(fileCount: number): FileTreeNode[] {
  const children: FileTreeNode[] = Array.from({ length: fileCount }, (_, index) => ({
    path: `big/file-${index}.ts`,
    name: `file-${index}.ts`,
    type: "file",
    depth: 1,
    sizeBytes: 1,
    extension: ".ts"
  }));

  return [
    {
      path: "big",
      name: "big",
      type: "directory",
      depth: 0,
      childrenCount: fileCount,
      children
    }
  ];
}

describe("selection model", () => {
  it("selecting a folder does not expand child files into selectedFiles", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    const selection = toggleNodeSelection(tree[0], createEmptySelection(), index);

    expect(selection.selectedFolders).toEqual(new Set(["src"]));
    expect(selection.selectedFiles.size).toBe(0);
  });

  it("selected folder marks child files as effectively selected", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    const selection = toggleNodeSelection(tree[0], createEmptySelection(), index);

    expect(isFileSelected("src/app.ts", selection, index)).toBe(true);
    expect(isFileSelected("src/nested/deep.ts", selection, index)).toBe(true);
    expect(isFileSelected("README.md", selection, index)).toBe(false);
  });

  it("deselecting child file under selected folder works", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    let selection = toggleNodeSelection(tree[0], createEmptySelection(), index);
    selection = toggleFileSelection("src/app.ts", selection, index);

    expect(isFileSelected("src/app.ts", selection, index)).toBe(false);
    expect(isFileSelected("src/util.ts", selection, index)).toBe(true);
    expect(selection.deselectedFiles).toEqual(new Set(["src/app.ts"]));
  });

  it("selecting and deselecting individual files works", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    let selection = toggleFileSelection("README.md", createEmptySelection(), index);

    expect(selection.selectedFiles).toEqual(new Set(["README.md"]));
    expect(isFileSelected("README.md", selection, index)).toBe(true);

    selection = toggleFileSelection("README.md", selection, index);

    expect(selection.selectedFiles.size).toBe(0);
    expect(isFileSelected("README.md", selection, index)).toBe(false);
  });

  it("select all visible works without selecting already covered files explicitly", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    let selection = toggleNodeSelection(tree[0], createEmptySelection(), index);
    selection = selectPaths(["src/app.ts", "README.md"], selection, index);

    expect(selection.selectedFolders).toEqual(new Set(["src"]));
    expect(selection.selectedFiles).toEqual(new Set(["README.md"]));
  });

  it("deselect all clears all selection sets", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    const selected = toggleNodeSelection(tree[0], createEmptySelection(), index);
    const cleared = createEmptySelection();

    expect(selected.selectedFolders.size).toBe(1);
    expect(cleared.selectedFiles.size).toBe(0);
    expect(cleared.selectedFolders.size).toBe(0);
    expect(cleared.deselectedFiles.size).toBe(0);
    expect(cleared.deselectedFolders.size).toBe(0);
  });

  it("config generation includes selected folders compactly", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    const selection = toggleNodeSelection(tree[0], createEmptySelection(), index);
    const config = buildConfigPreview({
      projectRoot: "/repo",
      outputFile: "/tmp/codebundle-output.md",
      format: "markdown",
      selection,
      exclude: ["node_modules/**"],
      maxFileSizeKb: 500,
      respectGitIgnore: true,
      followSymlinks: false
    });

    expect(config.folders).toEqual(["src"]);
    expect(config.files).toEqual([]);
  });

  it("config generation turns deselected child files into excludes", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    let selection = toggleNodeSelection(tree[0], createEmptySelection(), index);
    selection = toggleFileSelection("src/app.ts", selection, index);
    const config = buildConfigPreview({
      projectRoot: "/repo",
      outputFile: "/tmp/codebundle-output.md",
      format: "markdown",
      selection,
      exclude: [],
      maxFileSizeKb: 500,
      respectGitIgnore: true,
      followSymlinks: false
    });

    expect(config.folders).toEqual(["src"]);
    expect(config.exclude).toContain("src/app.ts");
  });

  it("selected counts are correct", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    let selection = toggleNodeSelection(tree[0], createEmptySelection(), index);
    selection = toggleFileSelection("README.md", selection, index);
    selection = toggleFileSelection("src/app.ts", selection, index);

    expect(getSelectionSummary(selection, index)).toEqual({
      selectedFilesCount: 1,
      selectedFoldersCount: 1,
      estimatedExportFileCount: 3
    });
  });

  it("selecting a 10,000-file folder keeps explicit selectedFiles compact", () => {
    const tree = largeTree(10_000);
    const index = buildTreeIndex(tree);
    const selection = toggleNodeSelection(tree[0], createEmptySelection(), index);

    expect(selection.selectedFolders).toEqual(new Set(["big"]));
    expect(selection.selectedFiles.size).toBe(0);
    expect(getSelectionSummary(selection, index).estimatedExportFileCount).toBe(10_000);
  });

  it("deselecting a child folder under a selected folder adds a compact folder override", () => {
    const tree = sampleTree();
    const index = buildTreeIndex(tree);
    let selection = toggleNodeSelection(tree[0], createEmptySelection(), index);
    selection = toggleNodeSelection((tree[0] as FileTreeDirectoryNode).children[2], selection, index);

    expect(selection.selectedFolders).toEqual(new Set(["src"]));
    expect(selection.deselectedFolders).toEqual(new Set(["src/nested"]));
    expect(getSelectionSummary(selection, index).estimatedExportFileCount).toBe(2);
  });
});
