import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  parsePythonVersion,
  resolvePythonExecutable,
  runVersionCommand,
  type PythonCandidate
} from "../src/main/pythonResolver";

function versionRunner(versions: Record<string, { stdout?: string; stderr?: string } | "missing">) {
  return async (candidate: PythonCandidate) => {
    const result = versions[candidate.executable];
    if (!result || result === "missing") {
      return { found: false as const };
    }
    return { found: true as const, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

describe("pythonResolver", () => {
  it("resolves CODEBUNDLE_PYTHON_PATH when valid", async () => {
    const result = await resolvePythonExecutable({
      env: { CODEBUNDLE_PYTHON_PATH: "/custom/python" },
      platform: "darwin",
      runVersionCommand: versionRunner({ "/custom/python": { stdout: "Python 3.11.7" } })
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.executable).toBe("/custom/python");
      expect(result.command.version).toBe("3.11.7");
    }
  });

  it("rejects CODEBUNDLE_PYTHON_PATH when version is below 3.10", async () => {
    const result = await resolvePythonExecutable({
      env: { CODEBUNDLE_PYTHON_PATH: "/old/python" },
      platform: "darwin",
      runVersionCommand: versionRunner({ "/old/python": { stdout: "Python 3.9.6" } })
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PYTHON_VERSION_UNSUPPORTED");
      expect(result.error.details).toBe("Detected Python 3.9.6.");
    }
  });

  it("falls back to platform candidates when env var is absent", async () => {
    const result = await resolvePythonExecutable({
      env: {},
      platform: "linux",
      runVersionCommand: versionRunner({
        python3: "missing",
        python: { stderr: "Python 3.12.1" }
      })
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.executable).toBe("python");
      expect(result.command.version).toBe("3.12.1");
    }
  });

  it("handles missing executable", async () => {
    const result = await resolvePythonExecutable({
      env: {},
      platform: "linux",
      runVersionCommand: versionRunner({ python3: "missing", python: "missing" })
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PYTHON_NOT_FOUND");
    }
  });

  it("handles version command timeout", async () => {
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

    const promise = runVersionCommand({ executable: "python3", baseArgs: [] }, { timeoutMs: 5, spawnImpl: spawnImpl as never });
    await vi.advanceTimersByTimeAsync(5);
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual({ found: false });
    expect(child.kill).toHaveBeenCalled();
  });

  it("parses Python version from stdout", () => {
    expect(parsePythonVersion("Python 3.10.13")).toBe("3.10.13");
  });

  it("parses Python version from stderr", async () => {
    const result = await resolvePythonExecutable({
      env: {},
      platform: "linux",
      runVersionCommand: versionRunner({ python3: { stderr: "Python 3.13.0" } })
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.command.version).toBe("3.13.0");
    }
  });

  it("rejects malformed version output", async () => {
    const result = await resolvePythonExecutable({
      env: {},
      platform: "linux",
      runVersionCommand: versionRunner({ python3: { stdout: "not python" }, python: "missing" })
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PYTHON_NOT_FOUND");
    }
  });
});
