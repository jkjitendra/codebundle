import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, posix, resolve, win32 } from "node:path";
import type { RunExportFailure } from "../shared/types";
import { type PythonResolverOptions, resolvePythonExecutable } from "./pythonResolver";

export interface ExporterCommand {
  executable: string;
  argsPrefix: string[];
  env?: NodeJS.ProcessEnv;
  mode: "bundled-sidecar" | "dev-python";
}

export type ExporterCommandResolutionResult = { success: true; command: ExporterCommand } | RunExportFailure;

export interface ExporterCommandResolverOptions {
  isPackaged?: boolean;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  appPath?: string;
  accessFile?: (path: string, mode?: number) => Promise<void>;
  resolvePython?: (options?: PythonResolverOptions) => Promise<ExporterCommandResolutionResultForPython>;
  resolveExporterPythonPath?: (appPath?: string) => Promise<string | null>;
}

type ExporterCommandResolutionResultForPython =
  | { success: true; command: { executable: string; baseArgs: string[]; version: string } }
  | RunExportFailure;

export async function resolveExporterCommand(
  options: ExporterCommandResolverOptions = {}
): Promise<ExporterCommandResolutionResult> {
  const isPackaged = options.isPackaged ?? isProbablyPackaged();
  const platform = options.platform ?? process.platform;
  const accessFile = options.accessFile ?? access;

  if (isPackaged) {
    return resolveBundledSidecarCommand({
      platform,
      resourcesPath: options.resourcesPath ?? process.resourcesPath,
      accessFile
    });
  }

  return resolveDevPythonCommand({
    platform,
    env: options.env ?? process.env,
    appPath: options.appPath ?? process.cwd(),
    resolvePython: options.resolvePython ?? resolvePythonExecutable,
    resolveExporterPythonPath: options.resolveExporterPythonPath ?? resolveExporterPythonPath
  });
}

async function resolveBundledSidecarCommand(options: {
  platform: NodeJS.Platform;
  resourcesPath: string;
  accessFile: (path: string, mode?: number) => Promise<void>;
}): Promise<ExporterCommandResolutionResult> {
  const sidecarName = options.platform === "win32" ? "codebundle-exporter.exe" : "codebundle-exporter";
  const pathApi = options.platform === "win32" ? win32 : posix;
  const sidecarPath = pathApi.join(options.resourcesPath, "sidecars", sidecarName);

  try {
    await options.accessFile(sidecarPath, constants.F_OK);
  } catch {
    return failure(
      "EXPORTER_SIDECAR_NOT_FOUND",
      "The bundled CodeBundle exporter sidecar is missing.",
      "Reinstall CodeBundle or run in development mode."
    );
  }

  try {
    await options.accessFile(sidecarPath, constants.X_OK);
  } catch {
    return failure(
      "EXPORTER_SIDECAR_NOT_EXECUTABLE",
      "The bundled CodeBundle exporter could not be executed.",
      "Check app installation permissions."
    );
  }

  return {
    success: true,
    command: {
      executable: sidecarPath,
      argsPrefix: [],
      mode: "bundled-sidecar"
    }
  };
}

async function resolveDevPythonCommand(options: {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  appPath: string;
  resolvePython: (options?: PythonResolverOptions) => Promise<ExporterCommandResolutionResultForPython>;
  resolveExporterPythonPath: (appPath?: string) => Promise<string | null>;
}): Promise<ExporterCommandResolutionResult> {
  const python = await options.resolvePython({ env: options.env, platform: options.platform });
  if (!python.success) {
    return python;
  }

  const exporterPythonPath = await options.resolveExporterPythonPath(options.appPath);
  if (!exporterPythonPath) {
    return failure(
      "EXPORTER_PYTHON_NOT_FOUND",
      "The local Python exporter package was not found.",
      "Run from the repository checkout with exporter-python available. Configure Python 3.10+ with CODEBUNDLE_PYTHON_PATH; the app sets PYTHONPATH automatically."
    );
  }

  return {
    success: true,
    command: {
      executable: python.command.executable,
      argsPrefix: [...python.command.baseArgs, "-m", "codebundle_exporter"],
      env: {
        ...options.env,
        PYTHONPATH: mergePythonPath(exporterPythonPath, options.env.PYTHONPATH, options.platform)
      },
      mode: "dev-python"
    }
  };
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

export function mergePythonPath(
  exporterPythonPath: string,
  existingPythonPath: string | undefined,
  platform: NodeJS.Platform = process.platform
): string {
  const separator = platform === "win32" ? ";" : delimiter;
  return existingPythonPath ? `${exporterPythonPath}${separator}${existingPythonPath}` : exporterPythonPath;
}

function isProbablyPackaged(): boolean {
  return Boolean(process.versions.electron && !process.env.ELECTRON_RENDERER_URL && process.env.NODE_ENV !== "development");
}

function failure(code: string, message: string, details?: string): RunExportFailure {
  return { success: false, error: { code, message, details } };
}
