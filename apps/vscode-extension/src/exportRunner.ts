import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { delimiter, resolve } from "node:path";
import type { PythonCommand } from "./pythonResolver";

const MAX_STDOUT_BYTES = 1_000_000;
const MAX_STDERR_BYTES = 200_000;
export interface ExportResult { success: boolean; outputFile?: string; summary?: Record<string, unknown>; error?: string; stderr: string; }

function sanitizeStderr(value: string): string {
  return value
    .replace(/AKIA[0-9A-Z]{16}/g, "AKIA***")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}/g, "token***")
    .replace(/xox[bporas]-[A-Za-z0-9-]{10,}/g, "token***")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "jwt***")
    .replace(/((?:api[_-]?key|api[_-]?secret|secret|password|token)\s*[:=]\s*["']?)[^\s"']{8,}/gi, "$1***");
}

export function exporterPythonPath(configuredPath: string, extensionPath: string, inheritedPath = process.env.PYTHONPATH): string | undefined {
  const source = configuredPath.trim() || (() => {
    const candidate = resolve(extensionPath, "../../exporter-python");
    return existsSync(candidate) ? candidate : "";
  })();
  return [source, inheritedPath].filter(Boolean).join(delimiter) || undefined;
}

export function runExporter(python: PythonCommand, configPath: string, pythonPath?: string): Promise<ExportResult> {
  return new Promise((resolveResult) => {
    const child = spawn(python.command, [...python.argsPrefix, "-m", "codebundle_exporter", "--config", configPath], {
      shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: pythonPath ? { ...process.env, PYTHONPATH: pythonPath } : process.env
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    const append = (current: string, chunk: Buffer, cap: number) => {
      const remaining = cap - Buffer.byteLength(current);
      if (remaining <= 0) { overflow = true; return current; }
      const bounded = chunk.subarray(0, remaining).toString("utf8");
      if (chunk.length > remaining) overflow = true;
      return current + bounded;
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk, MAX_STDOUT_BYTES); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk, MAX_STDERR_BYTES); });
    child.once("error", (error) => resolveResult({ success: false, error: "Unable to start the local Python exporter.", stderr: error.message }));
    child.once("close", (code) => {
      const safeStderr = sanitizeStderr(stderr);
      if (overflow) return resolveResult({ success: false, error: "Exporter output exceeded the safety limit.", stderr: safeStderr });
      try {
        const parsed: unknown = JSON.parse(stdout.trim());
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid JSON result");
        const payload = parsed as { success?: unknown; outputFile?: unknown; summary?: unknown; error?: { message?: unknown } };
        if (code === 0 && payload.success === true) return resolveResult({ success: true, outputFile: typeof payload.outputFile === "string" ? payload.outputFile : undefined, summary: typeof payload.summary === "object" && payload.summary ? payload.summary as Record<string, unknown> : undefined, stderr: safeStderr });
        return resolveResult({ success: false, error: typeof payload.error?.message === "string" ? payload.error.message : "Exporter failed.", stderr: safeStderr });
      } catch {
        resolveResult({ success: false, error: "Exporter returned an invalid response.", stderr: safeStderr });
      }
    });
  });
}
