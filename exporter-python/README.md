# CodeBundle Python Exporter

Standalone Python CLI exporter for CodeBundle automation, scripting, terminal usage, desktop integration, and future CI/CD usage.

The exporter reads a JSON config, scans allowed text files under `projectRoot`, and writes one Markdown or text output file. It never uploads files.

## Install

From the repository root:

```bash
pip install -e exporter-python
```

## Run

```bash
python -m codebundle_exporter --config shared/codebundle.config.example.json
```

Development direct-file invocation is also supported:

```bash
python exporter-python/codebundle_exporter/main.py --config shared/codebundle.config.example.json
```

## Sidecar Build

The desktop packaging foundation can build this exporter as a PyInstaller sidecar:

```bash
cd apps/desktop
npm run sidecar:build
```

Generated sidecars are written under `resources/sidecars/current/` and are ignored by Git.

## Config Contract

The config schema lives in `shared/codebundle-config.schema.json`.

Required fields:

- `projectRoot`
- `outputFile`
- `format`
- `mode`

Supported modes:

- `selected`: use `files` and `folders`.
- `include`: use `include` glob patterns.
- `all`: scan all allowed readable text files.

## stdout Contract

stdout contains exactly one JSON object. stderr may contain human-readable diagnostics.

Success:

```json
{
  "success": true,
  "outputFile": "/absolute/output/codebundle-output.md",
  "summary": {
    "exportedFiles": 42,
    "skippedBinary": 3,
    "skippedLarge": 2,
    "skippedExcluded": 11,
    "skippedMissing": 0,
    "skippedInvalid": 0
  }
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CONFIG",
    "message": "The config file is invalid.",
    "details": "projectRoot is required"
  }
}
```

## Default Excludes

Defaults skip `.git`, `node_modules`, build outputs, virtualenvs, lock files, `.env`, credentials, keys, common archives, and common binary media formats.

## Tests

```bash
pytest
```

## Current Limitations

`respectGitIgnore` provides simple root `.gitignore` pattern support. It is not full Git-compatible matching and does not implement every Git ignore rule or nested `.gitignore` behavior.
