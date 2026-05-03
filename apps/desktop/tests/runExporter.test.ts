import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { cleanupOldTempConfigs } from "../src/main/configWriter";
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
        cleanupOldTempConfigs: async () => undefined,
        resolveExporterCommand: async () => ({
          success: false,
          error: {
            code: "EXPORTER_PYTHON_NOT_FOUND",
            message: "The local Python exporter package was not found."
          }
        })
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
        cleanupOldTempConfigs: async () => undefined,
        resolveExporterCommand: async () => ({
          success: true,
          command: {
            executable: "python3",
            argsPrefix: ["-m", "codebundle_exporter"],
            env: { PYTHONPATH: "/repo/exporter-python" },
            mode: "dev-python"
          }
        }),
        runPython: async () => parseExporterResult(successStdout, "", 0),
        cleanupTempConfig: cleanup
      }
    );

    expect(result.success).toBe(true);
    expect(cleanup).toHaveBeenCalledWith("/tmp/config.codebundle.tmp.json");
  });

  it("uses argsPrefix when running a packaged sidecar command", async () => {
    const runPython = vi.fn(async () => parseExporterResult(successStdout, "", 0));

    await runExporter(
      {},
      {
        writeConfig: async () => ({ config: {} as never, tempConfigPath: "/tmp/config.codebundle.tmp.json" }),
        cleanupOldTempConfigs: async () => undefined,
        cleanupTempConfig: async () => undefined,
        resolveExporterCommand: async () => ({
          success: true,
          command: {
            executable: "/app/resources/sidecars/codebundle-exporter",
            argsPrefix: [],
            mode: "bundled-sidecar"
          }
        }),
        runPython
      }
    );

    expect(runPython).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: "/app/resources/sidecars/codebundle-exporter",
        args: ["--config", "/tmp/config.codebundle.tmp.json"]
      })
    );
  });

  it("uses dev Python command prefix when running in development mode", async () => {
    const runPython = vi.fn(async () => parseExporterResult(successStdout, "", 0));

    await runExporter(
      {},
      {
        writeConfig: async () => ({ config: {} as never, tempConfigPath: "/tmp/config.codebundle.tmp.json" }),
        cleanupOldTempConfigs: async () => undefined,
        cleanupTempConfig: async () => undefined,
        resolveExporterCommand: async () => ({
          success: true,
          command: {
            executable: "python3",
            argsPrefix: ["-m", "codebundle_exporter"],
            env: { PYTHONPATH: "/repo/exporter-python" },
            mode: "dev-python"
          }
        }),
        runPython
      }
    );

    expect(runPython).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: "python3",
        args: ["-m", "codebundle_exporter", "--config", "/tmp/config.codebundle.tmp.json"],
        env: { PYTHONPATH: "/repo/exporter-python" }
      })
    );
  });

  it("handles cancel behavior", async () => {
    const controller = new AbortController();
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn(() => child);

    const promise = runPythonExporter(baseRunOptions({ timeoutMs: 1000, signal: controller.signal, spawnImpl: spawnImpl as never }));
    controller.abort();
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("EXPORT_CANCELLED");
    }
    expect(child.kill).toHaveBeenCalled();
  });
});

describe("temp config cleanup", () => {
  it("deletes only old CodeBundle temp configs", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codebundle-cleanup-test-"));
    const oldConfig = path.join(tempDirectory, "codebundle-old.codebundle.tmp.json");
    const newConfig = path.join(tempDirectory, "codebundle-new.codebundle.tmp.json");
    const unrelated = path.join(tempDirectory, "other.codebundle.tmp.json");
    const now = Date.now();

    await fs.writeFile(oldConfig, "{}", "utf8");
    await fs.writeFile(newConfig, "{}", "utf8");
    await fs.writeFile(unrelated, "{}", "utf8");
    await fs.utimes(oldConfig, new Date(now - 48 * 60 * 60 * 1000), new Date(now - 48 * 60 * 60 * 1000));
    await fs.utimes(newConfig, new Date(now), new Date(now));
    await fs.utimes(unrelated, new Date(now - 48 * 60 * 60 * 1000), new Date(now - 48 * 60 * 60 * 1000));

    await cleanupOldTempConfigs(tempDirectory, now, 24 * 60 * 60 * 1000);

    await expect(fs.access(oldConfig)).rejects.toThrow();
    await expect(fs.access(newConfig)).resolves.toBeUndefined();
    await expect(fs.access(unrelated)).resolves.toBeUndefined();
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });
});
