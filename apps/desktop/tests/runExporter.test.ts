import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  parseExporterResult,
  runExporter,
  runPythonExporter,
  type RunPythonExporterOptions
} from "../src/main/runExporter";

const successStdout = JSON.stringify({
  success: true,
  outputFile: "/tmp/codebundle-output.md",
  summary: {
    exportedFiles: 2,
    skippedBinary: 1,
    skippedLarge: 0,
    skippedExcluded: 3,
    skippedMissing: 0,
    skippedInvalid: 0
  }
});

const failureStdout = JSON.stringify({
  success: false,
  error: {
    code: "INVALID_CONFIG",
    message: "The config file is invalid.",
    details: "projectRoot is required"
  }
});

function baseRunOptions(overrides: Partial<RunPythonExporterOptions> = {}): RunPythonExporterOptions {
  return {
    executable: "python3",
    args: ["-m", "codebundle_exporter", "--config", "/tmp/config.codebundle.tmp.json"],
    exporterPythonPath: "/repo/exporter-python",
    timeoutMs: 100,
    cwd: "/repo/apps/desktop",
    env: {},
    ...overrides
  };
}

describe("runExporter parsing", () => {
  it("parses valid Python success stdout", () => {
    const result = parseExporterResult(successStdout, "", 0);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outputFile).toBe("/tmp/codebundle-output.md");
      expect(result.summary.exportedFiles).toBe(2);
    }
  });

  it("parses valid Python failure stdout", () => {
    const result = parseExporterResult(failureStdout, "", 1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_CONFIG");
    }
  });

  it("handles empty stdout with zero exit", () => {
    const result = parseExporterResult("", "", 0);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORTER_STDOUT_INVALID");
      expect(result.error.details).toBe("stdout was empty.");
    }
  });

  it("handles malformed stdout with zero exit", () => {
    const result = parseExporterResult("not-json", "", 0);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORTER_STDOUT_INVALID");
    }
  });

  it("handles non-zero exit with valid JSON failure", () => {
    const result = parseExporterResult(failureStdout, "details", 2);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_CONFIG");
    }
  });

  it("handles non-zero exit with invalid stdout and stderr details", () => {
    const result = parseExporterResult("not-json", "traceback without file contents", 2);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORTER_FAILED");
      expect(result.error.details).toBe("traceback without file contents");
    }
  });
});

describe("runExporter process behavior", () => {
  it("handles timeout", async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn(() => child);

    const promise = runPythonExporter(baseRunOptions({ timeoutMs: 5, spawnImpl: spawnImpl as never }));
    await vi.advanceTimersByTimeAsync(5);
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORT_TIMEOUT");
    }
    expect(child.kill).toHaveBeenCalled();
  });

  it("handles exporter-python path missing", async () => {
    const result = await runExporter(
      {},
      {
        writeConfig: async () => ({ config: {} as never, tempConfigPath: "/tmp/config.codebundle.tmp.json" }),
        resolvePython: async () => ({ success: true, command: { executable: "python3", baseArgs: [], version: "3.12.0" } }),
        resolveExporterPythonPath: async () => null
      }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORTER_PYTHON_NOT_FOUND");
    }
  });

  it("attempts temp config cleanup after success", async () => {
    const cleanup = vi.fn(async () => undefined);
    const result = await runExporter(
      {},
      {
        writeConfig: async () => ({ config: {} as never, tempConfigPath: "/tmp/config.codebundle.tmp.json" }),
        resolvePython: async () => ({ success: true, command: { executable: "python3", baseArgs: [], version: "3.12.0" } }),
        resolveExporterPythonPath: async () => "/repo/exporter-python",
        runPython: async () => parseExporterResult(successStdout, "", 0),
        cleanupTempConfig: cleanup
      }
    );

    expect(result.success).toBe(true);
    expect(cleanup).toHaveBeenCalledWith("/tmp/config.codebundle.tmp.json");
  });
});
