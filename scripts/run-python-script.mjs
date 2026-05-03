#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const MINIMUM_PYTHON = { major: 3, minor: 10 };
const PYTHON_VERSION_TIMEOUT_MS = 5_000;

const [, , scriptPath, ...scriptArgs] = process.argv;

if (!scriptPath) {
  console.error("Usage: node scripts/run-python-script.mjs <script.py> [...args]");
  process.exit(1);
}

const candidates = getPythonCandidates();
const resolved = resolvePython(candidates);

if (!resolved) {
  console.error(
    "Python 3.10 or later was not found.\n\n" +
      "Install Python 3.10+ or set CODEBUNDLE_PYTHON_PATH to a Python executable.\n" +
      "Example:\n" +
      "  export CODEBUNDLE_PYTHON_PATH=/path/to/python3"
  );
  process.exit(1);
}

const script = resolve(process.cwd(), scriptPath);
const result = spawnSync(resolved.executable, [...resolved.baseArgs, script, ...scriptArgs], {
  stdio: "inherit",
  windowsHide: true
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

function getPythonCandidates() {
  const candidates = [];
  if (process.env.CODEBUNDLE_PYTHON_PATH) {
    candidates.push({ executable: process.env.CODEBUNDLE_PYTHON_PATH, baseArgs: [], explicit: true });
  }

  if (process.platform === "win32") {
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

function resolvePython(candidates) {
  for (const candidate of candidates) {
    const versionResult = spawnSync(candidate.executable, [...candidate.baseArgs, "--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: PYTHON_VERSION_TIMEOUT_MS
    });

    if (versionResult.error || versionResult.status !== 0) {
      continue;
    }

    const version = parsePythonVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
    if (!version) {
      continue;
    }

    if (!isSupportedVersion(version)) {
      if (candidate.explicit) {
        console.error(`CODEBUNDLE_PYTHON_PATH points to Python ${version}, but Python 3.10+ is required.`);
        process.exit(1);
      }
      continue;
    }

    return candidate;
  }

  return null;
}

function parsePythonVersion(output) {
  const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

function isSupportedVersion(version) {
  return version.major > MINIMUM_PYTHON.major || (version.major === MINIMUM_PYTHON.major && version.minor >= MINIMUM_PYTHON.minor);
}
