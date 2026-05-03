# Python CLI Automation

Python CLI automation means CodeBundle can run from a terminal, shell script, or future CI job without opening the desktop app.

The exporter is local-first. It reads a JSON config, scans files under `projectRoot`, and writes a Markdown or text export to `outputFile`.

The CLI prints exactly one JSON object to stdout. Scripts and future desktop code should parse stdout, not stderr.

## Install

Run these commands from the repository root unless stated otherwise.

```bash
pip install -e exporter-python
```

## Run

```bash
python -m codebundle_exporter --config shared/codebundle.config.example.json
```

You can also run the module file directly during development:

```bash
python exporter-python/codebundle_exporter/main.py --config shared/codebundle.config.example.json
```

## Selected Export

Use `mode: "selected"` with explicit relative file paths:

```json
{
  "version": 1,
  "projectRoot": "/repo/my-project",
  "outputFile": "/repo/exports/codebundle-output.md",
  "format": "markdown",
  "mode": "selected",
  "files": ["package.json", "src/app.ts"],
  "folders": [],
  "include": [],
  "exclude": [],
  "maxFileSizeKb": 500,
  "skipBinaryFiles": true,
  "respectGitIgnore": true,
  "followSymlinks": false
}
```

## Folder Export

Still use `mode: "selected"`, but put folders in `folders`:

```json
{
  "version": 1,
  "projectRoot": "/repo/my-project",
  "outputFile": "/repo/exports/codebundle-output.md",
  "format": "markdown",
  "mode": "selected",
  "files": [],
  "folders": ["src", "docs"],
  "include": [],
  "exclude": ["src/generated/**"],
  "maxFileSizeKb": 500,
  "skipBinaryFiles": true,
  "respectGitIgnore": true,
  "followSymlinks": false
}
```

## All Export

Use `mode: "all"` to scan all allowed readable text files under the project root:

```json
{
  "version": 1,
  "projectRoot": "/repo/my-project",
  "outputFile": "/repo/exports/codebundle-output.txt",
  "format": "text",
  "mode": "all",
  "files": [],
  "folders": [],
  "include": [],
  "exclude": [],
  "maxFileSizeKb": 500,
  "skipBinaryFiles": true,
  "respectGitIgnore": true,
  "followSymlinks": false
}
```

## Include Pattern Export

Use `mode: "include"` with glob patterns:

```json
{
  "version": 1,
  "projectRoot": "/repo/my-project",
  "outputFile": "/repo/exports/codebundle-output.md",
  "format": "markdown",
  "mode": "include",
  "files": [],
  "folders": [],
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/*.test.ts"],
  "maxFileSizeKb": 500,
  "skipBinaryFiles": true,
  "respectGitIgnore": true,
  "followSymlinks": false
}
```

## Script Usage

```python
import json
import subprocess

result = subprocess.run(
    [
        "python",
        "-m",
        "codebundle_exporter",
        "--config",
        "codebundle.config.json",
    ],
    check=False,
    capture_output=True,
    text=True,
)

payload = json.loads(result.stdout)
if not payload["success"]:
    raise RuntimeError(payload["error"]["message"])

print(payload["outputFile"])
```

## CI/CD Future Usage

In CI, install the package and run the same CLI command against a generated config. The exporter does not upload files or read secrets from environment variables. Keep `outputFile` inside the CI workspace if the export should be archived as a build artifact.

## Current Limitations

`respectGitIgnore` provides simple root `.gitignore` pattern support. It is not full Git-compatible matching and does not implement every Git ignore rule or nested `.gitignore` behavior.
