import { describe, expect, it } from "vitest";
import { normalizeWorkspaceRelativePath } from "../src/pathSecurity";

describe("normalizeWorkspaceRelativePath", () => {
  it("accepts a file inside the workspace as a POSIX relative path", () => expect(normalizeWorkspaceRelativePath("/work/project", "/work/project/src/app.ts")).toBe("src/app.ts"));
  it("rejects paths outside the workspace", () => expect(normalizeWorkspaceRelativePath("/work/project", "/work/secret.txt")).toBeNull());
  it("rejects traversal", () => expect(normalizeWorkspaceRelativePath("/work/project", "/work/project/../secret.txt")).toBeNull());
  it("normalizes Windows separators", () => expect(normalizeWorkspaceRelativePath("C:\\work\\project", "C:\\work\\project\\src\\app.ts")).toBe("src/app.ts"));
  it("rejects an empty or workspace-root path", () => {
    expect(normalizeWorkspaceRelativePath("/work/project", "")).toBeNull();
    expect(normalizeWorkspaceRelativePath("/work/project", "/work/project")).toBeNull();
  });
});
