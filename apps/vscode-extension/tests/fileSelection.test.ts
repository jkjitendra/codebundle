import { describe, expect, it } from "vitest";
import { filesForWorkspace, filesForWorkspaceUris, groupOpenFilesByWorkspace } from "../src/fileSelection";

const root = { name: "repo", uri: { scheme: "file", fsPath: "/work/repo" } };
const other = { name: "other", uri: { scheme: "file", fsPath: "/work/other" } };
const documents = [
  { uri: { scheme: "file", fsPath: "/work/repo/a.ts" } }, { uri: { scheme: "file", fsPath: "/work/repo/a.ts" } },
  { uri: { scheme: "untitled", fsPath: "/work/repo/new.ts" }, isUntitled: true }, { uri: { scheme: "file", fsPath: "/outside.ts" } },
  { uri: { scheme: "file", fsPath: "/work/other/b.ts" } }
];

describe("file selection", () => {
  it("filters non-file, outside, and duplicate open files", () => expect(filesForWorkspace(documents, root.uri.fsPath)).toEqual(["a.ts"]));
  it("groups files by workspace folder", () => {
    const groups = groupOpenFilesByWorkspace(documents, [root, other]);
    expect(groups.get(root)).toEqual(["a.ts"]);
    expect(groups.get(other)).toEqual(["b.ts"]);
  });
  it("deduplicates visible file-tab URIs", () => {
    expect(filesForWorkspaceUris([
      { scheme: "file", fsPath: "/work/repo/README.md" },
      { scheme: "file", fsPath: "/work/repo/README.md" },
      { scheme: "untitled", fsPath: "/work/repo/new.ts" }
    ], root.uri.fsPath)).toEqual(["README.md"]);
  });
});
