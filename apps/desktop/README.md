# CodeBundle Desktop

Electron desktop app for CodeBundle.

The app scans local project metadata in the Electron main process, lets users select files/folders in React, and runs the local Python CLI exporter through a validated JSON config. It does not upload files.

## Install

Run these commands from `apps/desktop` unless stated otherwise.

```bash
npm install
```

## Run Dev Mode

```bash
npm run dev
```

## Typecheck

```bash
npm run typecheck
```

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

This creates Electron Vite build output under `out/`. It is not a distributable installer.

## Sidecar And Packaging

Development mode runs the exporter with local Python:

```bash
python -m codebundle_exporter --config <temp-config-path>
```

Packaged mode is designed to run a bundled sidecar from app resources:

```text
process.resourcesPath/sidecars/codebundle-exporter
process.resourcesPath/sidecars/codebundle-exporter.exe
```

Build the sidecar on the target OS:

```bash
npm run sidecar:build
npm run sidecar:verify
```

The sidecar scripts use a Node wrapper that resolves Python in this order:

1. `CODEBUNDLE_PYTHON_PATH`
2. Windows: `py -3`, `python`, `python3`
3. macOS/Linux: `python3`, `python`

Create an unpacked package directory:

```bash
npm run package:dir
```

The package scripts do not silently build the sidecar. They verify that the sidecar exists before running electron-builder, so packaging fails clearly if `resources/sidecars/current/codebundle-exporter*` is missing.

## App Workflow

1. Choose a project folder.
2. Scan the project.
3. Select files and folders in the file tree.
4. Edit exclude patterns if needed.
5. Choose an output `.md` or `.txt` file.
6. Click `Run Export`.
7. Review exported/skipped counts.
8. Click `Reveal Output` to locate the generated file.

The app persists recent project/output paths and basic preferences under Electron `userData`.

## Runtime Model

- Renderer has `contextIsolation` enabled.
- Renderer has `nodeIntegration` disabled.
- The preload exposes a narrow `window.codeBundle` API.
- Filesystem scanning and native dialogs run in the main process.
- Export runs by spawning Python with argument arrays.
- The renderer never reads file contents.

## Python Requirement

The current MVP requires Python 3.10+ on the user's machine.

Resolution order:

1. `CODEBUNDLE_PYTHON_PATH`
2. macOS/Linux: `python3`, `python`
3. Windows: `py -3`, `python`, `python3`

Development uses `PYTHONPATH` to make `../../exporter-python` importable.

## Known Limitations

- Signing, notarization, and installer release flow are not implemented.
- Sidecars must be built on the target OS or in platform-specific CI runners.
- `.gitignore` support is simple and not full Git-compatible matching.
- Export progress is coarse, not streamed from Python.
- Failed temp configs may remain for debugging.

## Troubleshooting

### Python Not Found

Install Python 3.10+ or set:

```bash
export CODEBUNDLE_PYTHON_PATH=/path/to/python3
```

### Exporter Module Not Found

Run the desktop app from the repository development setup. Packaged exporter sidecar support is not implemented yet.

### Output File Is Empty Or Missing

Check the selected files, exclude patterns, and export summary.
