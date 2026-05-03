import { constants } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergePythonPath, resolveExporterCommand } from "../src/main/exporterCommandResolver";

function accessFor(existing: Set<string>, executable: Set<string> = existing) {
  return async (path: string, mode?: number) => {
    if (mode === constants.X_OK && !executable.has(path)) {
      throw new Error("not executable");
    }
    if (!existing.has(path)) {
      throw new Error("missing");
    }
  };
}

describe("exporterCommandResolver", () => {
  it("resolves bundled sidecar on macOS/Linux packaged mode", async () => {
    const sidecarPath = "/app/resources/sidecars/codebundle-exporter";
    const result = await resolveExporterCommand({
      isPackaged: true,
      resourcesPath: "/app/resources",
      platform: "darwin",
      accessFile: accessFor(new Set([sidecarPath]))
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command).toEqual({
        executable: sidecarPath,
        argsPrefix: [],
        mode: "bundled-sidecar"
      });
    }
  });

  it("resolves bundled sidecar on Windows packaged mode", async () => {
    const sidecarPath = "C:\\App\\resources\\sidecars\\codebundle-exporter.exe";
    const result = await resolveExporterCommand({
      isPackaged: true,
      resourcesPath: "C:\\App\\resources",
      platform: "win32",
      accessFile: accessFor(new Set([sidecarPath]))
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.executable).toBe(sidecarPath);
      expect(result.command.argsPrefix).toEqual([]);
    }
  });

  it("returns EXPORTER_SIDECAR_NOT_FOUND when packaged sidecar is missing", async () => {
    const result = await resolveExporterCommand({
      isPackaged: true,
      resourcesPath: "/app/resources",
      platform: "linux",
      accessFile: accessFor(new Set())
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORTER_SIDECAR_NOT_FOUND");
    }
  });

  it("returns EXPORTER_SIDECAR_NOT_EXECUTABLE when packaged sidecar cannot execute", async () => {
    const sidecarPath = "/app/resources/sidecars/codebundle-exporter";
    const result = await resolveExporterCommand({
      isPackaged: true,
      resourcesPath: "/app/resources",
      platform: "linux",
      accessFile: accessFor(new Set([sidecarPath]), new Set())
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORTER_SIDECAR_NOT_EXECUTABLE");
    }
  });

  it("returns dev-python command in development mode", async () => {
    const result = await resolveExporterCommand({
      isPackaged: false,
      platform: "linux",
      env: { PYTHONPATH: "/existing" },
      resolvePython: async () => ({ success: true, command: { executable: "python3", baseArgs: [], version: "3.12.0" } }),
      resolveExporterPythonPath: async () => "/repo/exporter-python"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.executable).toBe("python3");
      expect(result.command.argsPrefix).toEqual(["-m", "codebundle_exporter"]);
      expect(result.command.env?.PYTHONPATH).toBe("/repo/exporter-python:/existing");
      expect(result.command.mode).toBe("dev-python");
    }
  });

  it("includes Python base args for py launcher development mode", async () => {
    const result = await resolveExporterCommand({
      isPackaged: false,
      platform: "win32",
      env: {},
      resolvePython: async () => ({ success: true, command: { executable: "py", baseArgs: ["-3"], version: "3.12.0" } }),
      resolveExporterPythonPath: async () => "C:\\repo\\exporter-python"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.argsPrefix).toEqual(["-3", "-m", "codebundle_exporter"]);
    }
  });

  it("returns Python resolver error when Python is missing in development mode", async () => {
    const result = await resolveExporterCommand({
      isPackaged: false,
      platform: "linux",
      env: {},
      resolvePython: async () => ({
        success: false,
        error: {
          code: "PYTHON_NOT_FOUND",
          message: "Python 3.10 or later was not found."
        }
      }),
      resolveExporterPythonPath: async () => "/repo/exporter-python"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PYTHON_NOT_FOUND");
    }
  });

  it("uses Windows path separator when merging PYTHONPATH", () => {
    expect(mergePythonPath("C:\\repo\\exporter-python", "C:\\existing", "win32")).toBe(
      "C:\\repo\\exporter-python;C:\\existing"
    );
  });
});
