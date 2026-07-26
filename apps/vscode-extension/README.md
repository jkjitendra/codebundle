# CodeBundler VS Code Extension (MVP)

CodeBundler exports selected workspace files into one local Markdown or text bundle. It uses the existing CodeBundle Python exporter and makes no network, telemetry, cloud, account, or upload calls.

## Development

```bash
cd apps/vscode-extension
npm install
code .
```

In VS Code, press `F5` to launch an Extension Development Host. Open a workspace in that host and run a command from the Command Palette.

## Commands

- `CodeBundler: Export Current File`
- `CodeBundler: Export Open Files` (includes all visible saved workspace editor tabs; the CodeBundler Output channel reports the detected count before export)
- `CodeBundler: Export Selected Workspace Files`

Each command asks for a `.md` or `.txt` output path. The selected-files command uses a capped, files-only QuickPick (5,000 files maximum).

Exports read the saved files on disk. If a selected file has unsaved editor changes, CodeBundler warns before export and lets you cancel or deliberately export its saved version. Save the file first to include those edits.

## Settings

- `codebundler.pythonPath`: optional Python executable.
- `codebundler.exporterPythonPath`: optional `exporter-python` source directory. In this repository it is detected automatically.
- `codebundler.maxFileSizeKb`, `codebundler.respectGitIgnore`, `codebundler.followSymlinks`, and `codebundler.excludePatterns`: export options.

Python 3 is required for this MVP. There is no bundled Python sidecar or Node-only exporter fallback yet.

## Marketplace MVP setup

CodeBundler is local-only, but the Marketplace package does not bundle the CodeBundle Python exporter. After installing from Marketplace, install Python 3 and set `codebundler.exporterPythonPath` to a local checkout's `exporter-python` directory. For example:

```text
/path/to/codebundle/exporter-python
```

Alternatively, make the `codebundle_exporter` module available to the Python executable configured by `codebundler.pythonPath`. CodeBundler does not upload your files or contact a remote export service.

## Security model and limitations

The extension runs in the local VS Code extension host. It uses workspace APIs for selection, writes only a temporary JSON config, and starts the exporter with `spawn` and argument arrays (never a shell). File contents are read locally only for the secret warning and exporter. Secret findings are redacted and are not saved in VS Code state; neither file contents nor secrets are stored. The extension supports no profiles, Git diff selection, cloud sync, telemetry, auto-update, or marketplace publishing workflow in this MVP.
