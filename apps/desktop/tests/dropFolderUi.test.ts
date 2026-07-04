import { describe, expect, it, vi } from "vitest";
import { handleDroppedProjectFolder, removeRecentProjectPath, selectRecentProjectPath } from "../src/renderer/App";
import {
  DEFAULT_DROP_ERROR_MESSAGE,
  getDroppedFilePath,
  getDropErrorMessage
} from "../src/renderer/components/ProjectPicker";
import type { ValidateDroppedFolderResult } from "../src/shared/types";

function createHandlerOptions(validateResult: ValidateDroppedFolderResult) {
  return {
    validateDroppedFolder: vi.fn(async () => validateResult),
    confirmHomeDirectory: vi.fn(() => true),
    setProjectFolder: vi.fn(),
    resetProjectState: vi.fn(),
    scanProjectFolder: vi.fn(async () => undefined)
  };
}

describe("dropped project folder UI flow", () => {
  it("extracts dropped paths through the preload bridge", () => {
    const file = {} as File;
    const getPathForFile = vi.fn(() => "/Users/user/projects/app");

    expect(getDroppedFilePath(file, getPathForFile)).toBe("/Users/user/projects/app");
    expect(getPathForFile).toHaveBeenCalledWith(file);
  });

  it("falls back to legacy File.path when the bridge path is unavailable", () => {
    const file = { path: "/Users/user/projects/app" } as File & { path: string };

    expect(getDroppedFilePath(file, () => "")).toBe("/Users/user/projects/app");
    expect(getDroppedFilePath(file, () => { throw new Error("unsupported"); })).toBe("/Users/user/projects/app");
  });

  it("returns null when no dropped file path is available", () => {
    expect(getDroppedFilePath({} as File, () => "")).toBeNull();
  });

  it("scans a valid dropped folder using the resolved path", async () => {
    const options = createHandlerOptions({
      success: true,
      resolvedPath: "/Users/user/projects/real-project"
    });

    const result = await handleDroppedProjectFolder("/Users/user/projects/link", options);

    expect(result.success).toBe(true);
    expect(options.setProjectFolder).toHaveBeenCalledWith("/Users/user/projects/real-project");
    expect(options.resetProjectState).toHaveBeenCalledTimes(1);
    expect(options.scanProjectFolder.mock.calls).toEqual([["/Users/user/projects/real-project"]]);
  });

  it("returns validation failure text for inline drop feedback", async () => {
    const options = createHandlerOptions({
      success: false,
      error: {
        code: "NOT_A_DIRECTORY",
        message: "Dropped item is not a folder. Please drop a folder."
      }
    });

    const result = await handleDroppedProjectFolder("/Users/user/projects/file.txt", options);

    expect(result).toEqual({
      success: false,
      message: "Dropped item is not a folder. Please drop a folder."
    });
    expect(getDropErrorMessage(result)).toBe("Dropped item is not a folder. Please drop a folder.");
    expect(options.scanProjectFolder).not.toHaveBeenCalled();
  });

  it("uses the default inline error when Electron does not provide a path", () => {
    expect(DEFAULT_DROP_ERROR_MESSAGE).toBe("Could not use the dropped item. Please drop a folder.");
  });

  it("returns no inline drop error after a successful folder drop", () => {
    expect(getDropErrorMessage({ success: true })).toBeNull();
  });

  it("confirms home directory drops before scanning with allowHomeDirectory", async () => {
    const options = createHandlerOptions({
      success: false,
      error: {
        code: "HOME_DIRECTORY",
        message: "Scanning your home directory can include many personal files."
      }
    });

    const result = await handleDroppedProjectFolder("/Users/user", options);

    expect(result.success).toBe(true);
    expect(options.confirmHomeDirectory).toHaveBeenCalledTimes(1);
    expect(options.setProjectFolder).toHaveBeenCalledWith("/Users/user");
    expect(options.scanProjectFolder.mock.calls).toEqual([["/Users/user", true]]);
  });

  it("uses the resolved path after confirming a symlink-to-home drop", async () => {
    const options = createHandlerOptions({
      success: false,
      resolvedPath: "/Users/user",
      error: {
        code: "HOME_DIRECTORY",
        message: "Scanning your home directory can include many personal files."
      }
    });

    const result = await handleDroppedProjectFolder("/Users/user/projects/home-link", options);

    expect(result.success).toBe(true);
    expect(options.confirmHomeDirectory).toHaveBeenCalledTimes(1);
    expect(options.setProjectFolder).toHaveBeenCalledWith("/Users/user");
    expect(options.scanProjectFolder.mock.calls).toEqual([["/Users/user", true]]);
  });

  it("does not scan home directory drops when confirmation is declined", async () => {
    const options = createHandlerOptions({
      success: false,
      error: {
        code: "HOME_DIRECTORY",
        message: "Scanning your home directory can include many personal files."
      }
    });
    options.confirmHomeDirectory.mockReturnValue(false);

    const result = await handleDroppedProjectFolder("/Users/user", options);

    expect(result).toEqual({ success: false });
    expect(options.setProjectFolder).not.toHaveBeenCalled();
    expect(options.resetProjectState).not.toHaveBeenCalled();
    expect(options.scanProjectFolder).not.toHaveBeenCalled();
  });

  it("selects a recent project without scanning it", () => {
    const setProjectFolder = vi.fn();
    const resetProjectState = vi.fn();
    const scanProjectFolder = vi.fn();

    selectRecentProjectPath("/Users/user/projects/app", {
      setProjectFolder,
      resetProjectState
    });

    expect(setProjectFolder).toHaveBeenCalledWith("/Users/user/projects/app");
    expect(resetProjectState).toHaveBeenCalledTimes(1);
    expect(scanProjectFolder).not.toHaveBeenCalled();
  });

  it("updates the recent projects list after removal", async () => {
    const projects = [
      {
        path: "/Users/user/projects/app",
        name: "app",
        addedAt: 1,
        lastOpenedAt: 2
      }
    ];
    const removeRecentProject = vi.fn(async () => ({ projects }));
    const setRecentProjects = vi.fn();

    await removeRecentProjectPath("/Users/user/projects/old", {
      removeRecentProject,
      setRecentProjects
    });

    expect(removeRecentProject).toHaveBeenCalledWith("/Users/user/projects/old");
    expect(setRecentProjects).toHaveBeenCalledWith(projects);
  });
});