# CodeBundle

CodeBundle is a local-first project exporter.

Phase 1 contains only the standalone Python CLI exporter. It can generate Markdown or text exports from a JSON config without opening a desktop app.

No Electron desktop app, hosted web app, cloud service, upload flow, packaging flow, or secret storage is included in this phase.

## Structure

```text
codebundle/
  exporter-python/
  shared/
  docs/
```

## Install Python Exporter

```bash
pip install -e exporter-python
```

## Run

```bash
python -m codebundle_exporter --config shared/codebundle.config.example.json
```

See `docs/python-automation.md` for automation examples.

## Current Limitations

`respectGitIgnore` provides simple root `.gitignore` pattern support. It is not full Git-compatible matching and does not implement every Git ignore rule or nested `.gitignore` behavior.
