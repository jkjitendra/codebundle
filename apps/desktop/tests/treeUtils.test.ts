import { describe, expect, it } from "vitest";
import { buildFileTree, buildTreeIndex } from "../src/renderer/lib/treeUtils";
import type { ScanNode } from "../src/shared/types";

describe("tree utilities", () => {
  it("builds indexes with parent, ancestor, and descendant file counts", () => {
    const nodes: ScanNode[] = [
      { path: "src", name: "src", type: "directory", childrenCount: 2 },
      { path: "src/nested", name: "nested", type: "directory", childrenCount: 1 },
      { path: "src/app.ts", name: "app.ts", type: "file", sizeBytes: 10, extension: ".ts" },
      { path: "src/nested/deep.ts", name: "deep.ts", type: "file", sizeBytes: 10, extension: ".ts" }
    ];

    const tree = buildFileTree(nodes);
    const index = buildTreeIndex(tree);

    expect(index.parentByPath.get("src/nested/deep.ts")).toBe("src/nested");
    expect(index.ancestorsByPath.get("src/nested/deep.ts")).toEqual(["src", "src/nested"]);
    expect(index.descendantFileCountByFolder.get("src")).toBe(2);
    expect(index.descendantFileCountByFolder.get("src/nested")).toBe(1);
    expect(index.descendantFilesByFolder.get("src")).toEqual(["src/nested/deep.ts", "src/app.ts"]);
    expect(index.filePaths).toEqual(["src/nested/deep.ts", "src/app.ts"]);
    expect(index.directoryPaths).toEqual(["src", "src/nested"]);
  });
});
