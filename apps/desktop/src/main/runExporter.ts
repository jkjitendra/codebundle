import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { access, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { CodeBundleExportConfig, RunExportFailure, RunExportResult, RunExportSuccess } from "../shared/types";
import { InvalidExportConfigError, invalidConfigResult, writeValidatedExportConfig } from "./configWriter";
import { type PythonCommand, resolvePythonExecutable } from "./pythonResolver";

const DEFAULT_TIMEOUT_MS = 120_000;

export interface PreparedExportConfigForRun {
  config: CodeBundleExportConfig;
  tempConfigPath: string;
}

export interface RunExporterOptions {
  timeoutMs?: number;
  writeConfig?: (input: unknown) => Promise<PreparedExportConfigForRun>;
  resolvePython?: () => Promise<{ success: true; command: PythonCommand } | RunExportFailure>;
  resolveExporterPythonPath?: () => Promise<string | null>;
  runPython?: (options: RunPythonExporterOptions) => Promise<RunExportResult>;
  cleanupTempConfig?: (tempConfigPath: string) => Promise<void>;
}

export interface RunPythonExporterOptions {
  executable: string;
  args: string[];
  exporterPythonPath: string;
  timeoutMs: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: typeof spawn;
}

export async function runExporter(input: unknown, options: RunExporterOptions = {}): Promise<RunExportResult> {
  let tempConfigPath: string | null = null;

  try {
    const prepared = await (options.writeConfig ?? writeValidatedExportConfig)(input);
    tempConfigPath = prepared.tempConfigPath;

    const python = await (options.resolvePython ?? resolvePythonExecutable)();
    if (!python.success) {
      return python;
    }

    const exporterPythonPath = await (options.resolveExporterPythonPath ?? (() => resolveExporterPythonPath()))();
    if (!exporterPythonPath) {
      return failure(
        "EXPORTER_PYTHON_NOT_FOUND",
        "The local Python exporter package was not found.",
        "Expected exporter-python/codebundle_exporter next to apps/desktop."
      );
    }

    const result = await (options.runPython ?? runPythonExporter)({
      executable: python.command.executable,
      args: [...python.command.baseArgs, "-m", "codebundle_exporter", "--config", tempConfigPath],
      exporterPythonPath,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });

    if (result.success) {
      await (options.cleanupTempConfig ?? cleanupTempConfig)(tempConfigPath);
      tempConfigPath = null;
    }

    return result;
  } catch (error) {
    if (error instanceof InvalidExportConfigError) {
      return invalidConfigResult(error.message);
    }
    return failure(
      "EXPORT_PREPARE_FAILED",
      "CodeBundle could not prepare the export.",
      error instanceof Error ? error.message : "Unknown export preparation error."
    );
  }
}

export async function runPythonExporter(options: RunPythonExporterOptions): Promise<RunExportResult> {
  return new Promise((resolveResult) => {
    const spawnImpl = options.spawnImpl ?? spawn;
    const child = spawnImpl(options.executable, options.args, {
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...(options.env ?? process.env),
        PYTHONPATH: mergePythonPath(options.exporterPythonPath, (options.env ?? process.env).PYTHONPATH)
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }) as unknown as ChildProcessByStdio<null, Readable, Readable>;

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      resolveResult(
        failure(
          "EXPORT_TIMEOUT",
          "CodeBundle export timed out.",
          `The Python exporter did not finish within ${Math.round(options.timeoutMs / 1000)} seconds.`
        )
      );
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveResult(failure("EXPORTER_FAILED", "The Python exporter failed to start.", error.message));
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveResult(parseExporterResult(stdout, stderr, exitCode));
    });
  });
}

export function parseExporterResult(stdout: string, stderr: string, exitCode: number | null): RunExportResult {
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    if (exitCode !== 0) {
      return failure("EXPORTER_FAILED", "The Python exporter failed.", safeDetails(stderr, `Exit code ${exitCode ?? "unknown"}.`));
    }
    return failure("EXPORTER_STDOUT_INVALID", "The Python exporter returned invalid output.", "stdout was empty.");
  }

  const parsed = parseJsonObject(trimmedStdout);
  if (!parsed) {
    if (exitCode !== 0) {
      return failure("EXPORTER_FAILED", "The Python exporter failed.", safeDetails(stderr, `Exit code ${exitCode ?? "unknown"}.`));
    }
    return failure("EXPORTER_STDOUT_INVALID", "The Python exporter returned invalid output.", "stdout was not a valid JSON object.");
  }

  if (isExporterFailure(parsed)) {
    return parsed;
  }

  if (isExporterSuccess(parsed)) {
    if (exitCode === 0) {
      return parsed;
    }
    return failure("EXPORTER_FAILED", "The Python exporter failed.", safeDetails(stderr, `Exit code ${exitCode ?? "unknown"}.`));
  }

  return failure("EXPORTER_STDOUT_INVALID", "The Python exporter returned invalid output.", "stdout JSON did not match the expected contract.");
}

export async function resolveExporterPythonPath(appPath = process.cwd()): Promise<string | null> {
  const candidates = [
    resolve(appPath, "../../exporter-python"),
    resolve(process.cwd(), "../../exporter-python"),
    resolve(__dirname, "../../../../exporter-python")
  ];

  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, "codebundle_exporter"));
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

export function mergePythonPath(exporterPythonPath: string, existingPythonPath: string | undefined): string {
  return existingPythonPath ? `${exporterPythonPath}${process.platform === "win32" ? ";" : ":"}${existingPythonPath}` : exporterPythonPath;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function isExporterSuccess(value: Record<string, unknown>): value is Record<string, unknown> & RunExportSuccess {
  const summary = value.summary;
  return (
    value.success === true &&
    typeof value.outputFile === "string" &&
    typeof summary === "object" &&
    summary !== null &&
    hasNumber(summary, "exportedFiles") &&
    hasNumber(summary, "skippedBinary") &&
    hasNumber(summary, "skippedLarge") &&
    hasNumber(summary, "skippedExcluded") &&
    hasNumber(summary, "skippedMissing") &&
    hasNumber(summary, "skippedInvalid")
  );
}

function isExporterFailure(value: Record<string, unknown>): value is Record<string, unknown> & RunExportFailure {
  const error = value.error;
  return (
    value.success === false &&
    typeof error === "object" &&
    error !== null &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

function hasNumber(value: object, key: string): boolean {
  return typeof (value as Record<string, unknown>)[key] === "number";
}

function safeDetails(stderr: string, fallback: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, 2000);
}

function failure(code: string, message: string, details?: string): RunExportFailure {
  return { success: false, error: { code, message, details } };
}

export async function cleanupTempConfig(tempConfigPath: string): Promise<void> {
  try {
    await unlink(tempConfigPath);
  } catch {
    // Best-effort cleanup; export success should not fail because temp cleanup failed.
  }
}
