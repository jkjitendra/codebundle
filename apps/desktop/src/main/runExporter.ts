import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { unlink } from "node:fs/promises";
import type { CodeBundleExportConfig, RunExportFailure, RunExportResult, RunExportSuccess } from "../shared/types";
import { cleanupOldTempConfigs, InvalidExportConfigError, invalidConfigResult, writeValidatedExportConfig } from "./configWriter";
import {
  resolveExporterCommand,
  type ExporterCommandResolverOptions,
  type ExporterCommandResolutionResult
} from "./exporterCommandResolver";
import { runNodeExporter, type RunNodeExporterOptions } from "./nodeExporter";

const DEFAULT_TIMEOUT_MS = 120_000;

export interface PreparedExportConfigForRun {
  config: CodeBundleExportConfig;
  tempConfigPath: string;
}

export interface RunExporterOptions {
  timeoutMs?: number;
  writeConfig?: (input: unknown) => Promise<PreparedExportConfigForRun>;
  resolveExporterCommand?: () => Promise<ExporterCommandResolutionResult>;
  exporterCommandOptions?: ExporterCommandResolverOptions;
  runPython?: (options: RunPythonExporterOptions) => Promise<RunExportResult>;
  runNode?: (config: CodeBundleExportConfig, options: RunNodeExporterOptions) => Promise<RunExportResult>;
  cleanupTempConfig?: (tempConfigPath: string) => Promise<void>;
  cleanupOldTempConfigs?: () => Promise<void>;
  signal?: AbortSignal;
}

export interface RunPythonExporterOptions {
  executable: string;
  args: string[];
  timeoutMs: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: typeof spawn;
  signal?: AbortSignal;
}

export async function runExporter(input: unknown, options: RunExporterOptions = {}): Promise<RunExportResult> {
  let tempConfigPath: string | null = null;

  try {
    if (options.signal?.aborted) {
      return exportCancelled();
    }
    await (options.cleanupOldTempConfigs ?? cleanupOldTempConfigs)();
    if (options.signal?.aborted) {
      return exportCancelled();
    }
    const prepared = await (options.writeConfig ?? writeValidatedExportConfig)(input);
    tempConfigPath = prepared.tempConfigPath;

    if (options.signal?.aborted) {
      return exportCancelled();
    }
    const exporterCommand = await (options.resolveExporterCommand ?? (() => resolveExporterCommand(options.exporterCommandOptions)))();
    if (!exporterCommand.success) {
      if (shouldUseNodeFallback(exporterCommand.error.code)) {
        const fallback = await (options.runNode ?? runNodeExporter)(prepared.config, { fallbackReason: exporterCommand.error.code });
        if (fallback.success) {
          await (options.cleanupTempConfig ?? cleanupTempConfig)(tempConfigPath);
          tempConfigPath = null;
        }
        return fallback;
      }
      return exporterCommand;
    }

    const result = await (options.runPython ?? runPythonExporter)({
      executable: exporterCommand.command.executable,
      args: [...exporterCommand.command.argsPrefix, "--config", tempConfigPath],
      env: exporterCommand.command.env,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: options.signal
    });

    if (!result.success && shouldUseNodeFallback(result.error.code)) {
      const fallback = await (options.runNode ?? runNodeExporter)(prepared.config, { fallbackReason: result.error.code });
      if (fallback.success) {
        await (options.cleanupTempConfig ?? cleanupTempConfig)(tempConfigPath);
        tempConfigPath = null;
      }
      return fallback;
    }

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
    if (options.signal?.aborted) {
      resolveResult(exportCancelled());
      return;
    }
    const child = spawnImpl(options.executable, options.args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }) as unknown as ChildProcessByStdio<null, Readable, Readable>;

    let stdout = "";
    let stderr = "";
    let settled = false;
    const cancelExport = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolveResult(exportCancelled());
    };
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
      resolveResult(failure("EXPORTER_SPAWN_FAILED", "The Python exporter could not be started.", safeDetails(error.message, "The exporter process could not be launched.")));
    });
    options.signal?.addEventListener("abort", cancelExport, { once: true });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancelExport);
      resolveResult(parseExporterResult(stdout, stderr, exitCode));
    });
  });
}

const NODE_FALLBACK_ERROR_CODES = new Set([
  "EXPORTER_SIDECAR_NOT_FOUND",
  "EXPORTER_SIDECAR_NOT_EXECUTABLE",
  "PYTHON_NOT_FOUND",
  "EXPORTER_PYTHON_NOT_FOUND",
  "EXPORTER_SPAWN_FAILED"
]);

export function shouldUseNodeFallback(errorCode: string): boolean {
  return NODE_FALLBACK_ERROR_CODES.has(errorCode);
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

function exportCancelled(): RunExportFailure {
  return {
    success: false,
    error: {
      code: "EXPORT_CANCELLED",
      message: "Export was cancelled."
    }
  };
}

export async function cleanupTempConfig(tempConfigPath: string): Promise<void> {
  try {
    await unlink(tempConfigPath);
  } catch {
    // Best-effort cleanup; export success should not fail because temp cleanup failed.
  }
}
