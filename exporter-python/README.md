# CodeBundle Python Exporter

Standalone Python CLI exporter for CodeBundle automation, scripting, terminal usage, and future CI/CD usage.

## Install

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

## Contract

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

## Tests

```bash
pytest
```

## Current Limitations

`respectGitIgnore` provides simple root `.gitignore` pattern support. It is not full Git-compatible matching and does not implement every Git ignore rule or nested `.gitignore` behavior.
