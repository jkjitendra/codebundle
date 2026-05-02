import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { RunExportFailure } from "../shared/types";

const PYTHON_VERSION_TIMEOUT_MS = 5_000;

export interface PythonCommand {
  executable: string;
  baseArgs: string[];
  version: string;
}

type PythonResolutionResult = { success: true; command: PythonCommand } | RunExportFailure;

export interface PythonCandidate {
  executable: string;
  baseArgs: string[];
  isExplicit?: boolean;
}

export type VersionCommandRunner = (
  candidate: PythonCandidate
) => Promise<{ found: false } | { found: true; stdout: string; stderr: string }>;

export interface PythonResolverOptions {
  env?: { CODEBUNDLE_PYTHON_PATH?: string };
  platform?: NodeJS.Platform;
  runVersionCommand?: VersionCommandRunner;
}

type SpawnVersionCommand = typeof spawn;

export async function resolvePythonExecutable(options: PythonResolverOptions = {}): Promise<PythonResolutionResult> {
  const candidates = getPythonCandidates(options.env ?? process.env, options.platform ?? process.platform);
  let unsupportedVersion: string | null = null;
  const versionCommand = options.runVersionCommand ?? ((candidate: PythonCandidate) => runVersionCommand(candidate));

  for (const candidate of candidates) {
    const versionResult = await readPythonVersion(candidate, versionCommand);
    if (!versionResult.found) {
      continue;
    }

    if (!versionResult.supported) {
      unsupportedVersion = versionResult.version;
      if (candidate.isExplicit) {
        return unsupportedPython(versionResult.version);
      }
      continue;
    }

    return {
      success: true,
      command: {
        executable: candidate.executable,
        baseArgs: candidate.baseArgs,
        version: versionResult.version
      }
    };
  }

  if (unsupportedVersion) {
    return unsupportedPython(unsupportedVersion);
  }

  return {
    success: false,
    error: {
      code: "PYTHON_NOT_FOUND",
      message: "Python 3.10 or later was not found.",
      details: "Install Python 3.10+ or configure CODEBUNDLE_PYTHON_PATH."
    }
  };
}

export function getPythonCandidates(
  env: { CODEBUNDLE_PYTHON_PATH?: string },
  platform: NodeJS.Platform
): PythonCandidate[] {
  const candidates: PythonCandidate[] = [];
  const configuredPath = env.CODEBUNDLE_PYTHON_PATH;
  if (configuredPath) {
    candidates.push({ executable: configuredPath, baseArgs: [], isExplicit: true });
  }

  if (platform === "win32") {
    candidates.push(
      { executable: "py", baseArgs: ["-3"] },
      { executable: "python", baseArgs: [] },
      { executable: "python3", baseArgs: [] }
    );
  } else {
    candidates.push({ executable: "python3", baseArgs: [] }, { executable: "python", baseArgs: [] });
  }

  return candidates;
}

async function readPythonVersion(
  candidate: PythonCandidate,
  versionCommand: VersionCommandRunner
): Promise<{ found: false } | { found: true; supported: boolean; version: string }> {
  const result = await versionCommand(candidate);
  if (!result.found) {
    return { found: false };
  }

  const version = parsePythonVersion(`${result.stdout}\n${result.stderr}`);
  if (!version) {
    return { found: false };
  }

  return {
    found: true,
    supported: isSupportedVersion(version),
    version
  };
}

export function runVersionCommand(
  candidate: PythonCandidate,
  options: { timeoutMs?: number; spawnImpl?: SpawnVersionCommand } = {}
): Promise<{ found: false } | { found: true; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const spawnImpl = options.spawnImpl ?? spawn;
    const child = spawnImpl(candidate.executable, [...candidate.baseArgs, "--version"], {
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
      resolve({ found: false });
    }, options.timeoutMs ?? PYTHON_VERSION_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ found: false });
    });
    child.on("close", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ found: true, stdout, stderr });
    });
  });
}

export function parsePythonVersion(output: string): string | null {
  const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function isSupportedVersion(version: string): boolean {
  const [major, minor] = version.split(".").map(Number);
  return major > 3 || (major === 3 && minor >= 10);
}

function unsupportedPython(version: string): RunExportFailure {
  return {
    success: false,
    error: {
      code: "PYTHON_VERSION_UNSUPPORTED",
      message: "Python 3.10 or later is required.",
      details: `Detected Python ${version}.`
    }
  };
}
