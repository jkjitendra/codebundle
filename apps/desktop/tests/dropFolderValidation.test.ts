import { describe, expect, it, vi, afterEach } from "vitest";
import { homedir } from "node:os";
import { validateDroppedFolder } from "../src/main/dropFolderValidation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * We stub node:fs/promises.stat and node:fs/promises.realpath because
 * the paths used in tests do not exist on disk.
 */
function mockFsSuccess(isDirectory: boolean, resolvedPath?: string) {
  const statMock = vi.fn(async () => ({
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory
  }));
  const realpathMock = vi.fn(async (p: string) => resolvedPath ?? p);

  vi.doMock("node:fs/promises", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:fs/promises")>();
    return { ...original, stat: statMock, realpath: realpathMock };
  });

  return { statMock, realpathMock };
}

function mockFsStatThrow() {
  vi.doMock("node:fs/promises", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:fs/promises")>();
    return {
      ...original,
      stat: vi.fn(async () => { throw new Error("ENOENT: no such file or directory"); }),
      realpath: vi.fn(async (p: string) => p)
    };
  });
}

function mockRealpathThrow() {
  vi.doMock("node:fs/promises", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:fs/promises")>();
    return {
      ...original,
      stat: vi.fn(async () => ({ isDirectory: () => true, isFile: () => false })),
      realpath: vi.fn(async () => { throw new Error("ENOENT"); })
    };
  });
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — input validation", () => {
  it("rejects null", async () => {
    const result = await validateDroppedFolder(null);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("rejects undefined", async () => {
    const result = await validateDroppedFolder(undefined);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("rejects a number", async () => {
    const result = await validateDroppedFolder(42);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("rejects an empty string", async () => {
    const result = await validateDroppedFolder("");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("rejects a whitespace-only string", async () => {
    const result = await validateDroppedFolder("   ");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("rejects an object", async () => {
    const result = await validateDroppedFolder({ path: "/some/dir" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});

// ---------------------------------------------------------------------------
// Relative path rejection
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — relative path rejection", () => {
  it("rejects a relative path", async () => {
    const result = await validateDroppedFolder("some/relative/path");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_ABSOLUTE");
  });

  it("rejects a plain filename", async () => {
    const result = await validateDroppedFolder("folder");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_ABSOLUTE");
  });
});

// ---------------------------------------------------------------------------
// Dangerous path rejection
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — dangerous path rejection", () => {
  it("rejects the filesystem root /", async () => {
    const result = await validateDroppedFolder("/");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DANGEROUS_PATH");
  });

  it("rejects /etc", async () => {
    const result = await validateDroppedFolder("/etc");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DANGEROUS_PATH");
  });

  it("rejects /usr", async () => {
    const result = await validateDroppedFolder("/usr");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DANGEROUS_PATH");
  });

  it("rejects a safe-looking path whose realpath resolves to /etc", async () => {
    mockFsSuccess(true, "/etc");
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/projects/etc-link");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DANGEROUS_PATH");
    expect(result.error.message).toBe("Cannot use a system-level directory as a project folder.");
  });

  it("rejects a safe-looking path whose realpath resolves to /usr", async () => {
    mockFsSuccess(true, "/usr");
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/projects/usr-link");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("DANGEROUS_PATH");
    expect(result.error.message).toBe("Cannot use a system-level directory as a project folder.");
  });
});

// ---------------------------------------------------------------------------
// Non-existent path
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — non-existent path", () => {
  it("returns NOT_A_DIRECTORY when stat throws ENOENT", async () => {
    mockFsStatThrow();
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/nonexistent/path/that/does/not/exist");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_A_DIRECTORY");
  });
});

// ---------------------------------------------------------------------------
// File instead of folder
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — file drop", () => {
  it("returns NOT_A_DIRECTORY when a file is dropped", async () => {
    mockFsSuccess(false);
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/file.ts");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("NOT_A_DIRECTORY");
    expect(result.error.message).toContain("not a folder");
  });
});

// ---------------------------------------------------------------------------
// Realpath failure
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — realpath failure", () => {
  it("returns RESOLVE_FAILED when realpath throws", async () => {
    mockRealpathThrow();
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/projects/myapp");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("RESOLVE_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Valid folder
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — valid folder", () => {
  it("returns success with the resolved path for a valid folder", async () => {
    const resolvedPath = "/Users/user/projects/myapp-real";
    mockFsSuccess(true, resolvedPath);
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/projects/myapp");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.resolvedPath).toBe(resolvedPath);
  });

  it("returns success for a symlink resolving inside a normal project folder", async () => {
    const resolvedPath = "/Users/user/projects/real-project";
    mockFsSuccess(true, resolvedPath);
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/projects/link-to-project");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.resolvedPath).toBe(resolvedPath);
  });

  it("returns success with the same path when no symlink", async () => {
    mockFsSuccess(true);
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/projects/direct");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.resolvedPath).toBe("/Users/user/projects/direct");
  });

  it("trims leading/trailing whitespace from input", async () => {
    mockFsSuccess(true);
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("  /Users/user/projects/myapp  ");
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Home directory — confirmed in renderer before scanning
// ---------------------------------------------------------------------------

describe("validateDroppedFolder — home directory", () => {
  it("returns HOME_DIRECTORY for the current home directory before scanning", async () => {
    const result = await validateDroppedFolder(homedir());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("HOME_DIRECTORY");
    expect(result.resolvedPath).toBeUndefined();
    expect(result.error.message).toBe("Scanning your home directory can include many personal files.");
  });

  it("returns HOME_DIRECTORY when a safe-looking path resolves to the home directory", async () => {
    mockFsSuccess(true, homedir());
    const { validateDroppedFolder: validate } = await import("../src/main/dropFolderValidation");
    const result = await validate("/Users/user/projects/home-link");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("HOME_DIRECTORY");
    expect(result.resolvedPath).toBe(homedir());
    expect(result.error.message).toBe("Scanning your home directory can include many personal files.");
  });
});
