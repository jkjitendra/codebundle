# CodeBundle

![CodeBundle](resources/branding/horizontal_logo2.png)

CodeBundle bundles selected project files into one Markdown or text export for AI review, code sharing, automation, and CI/CD workflows.

It has three local execution paths:

- Desktop app: an Electron UI for choosing a project folder, scanning files, selecting files/folders, choosing an output file, and running the local exporter.
- Python CLI: a standalone automation tool that reads a JSON config and writes the final export.
- VS Code extension: export selected workspace files directly from VS Code using the local exporter.

With the desktop app, you can scan local projects, select files and folders, estimate export size and tokens, preview the export, get local secret warnings before preview/export, drag and drop a project folder, reuse recent projects, and export to Markdown or text.

CodeBundle is local-first. It does not upload project files, does not require cloud services for export, and does not store secrets in app preferences, recent-project metadata, or saved-profile metadata.

Packaged desktop builds can check the configured GitHub Release feed for application updates. Development builds never check for updates. Update checks do not upload project files or source code.
The desktop app calls the Python CLI on the same machine.

Status: MVP development build with release packaging foundation. Development mode requires Node/npm, Python 3.10+, and access to `exporter-python`. Public desktop builds include the Electron runtime and a bundled exporter sidecar so installed users do not manually install Python, Node, npm, Python packages, or project dependencies.

Latest public release:

```text
https://github.com/jkjitendra/codebundle/releases/latest
```

## Quick Start

Run these commands from the repository root unless stated otherwise.

Install and run the desktop app:

```bash
cd apps/desktop
npm install
npm run dev
```

Install and run the Python exporter:

```bash
pip install -e exporter-python
python -m codebundle_exporter --config shared/codebundle.config.example.json
```

## Desktop Usage

1. Open the desktop app with `npm run dev`.
2. Choose, paste, drag and drop, or select a recent project folder.
3. Click `Scan Project`.
4. Select files and folders in the tree.
5. Review the size and token estimate.
6. Optionally click `Generate Preview` to inspect a bounded local preview before writing a file.
7. Choose an output `.md` or `.txt` file.
8. Click `Run Export`.
9. Use `Reveal Output` after export succeeds.

Selecting a recent project fills the Project Folder input only; it does not scan automatically. A project is added to Recent Projects after a successful scan.

Development mode requires Python 3.10+. You can set `CODEBUNDLE_PYTHON_PATH` to point at a specific Python executable. Public packaged builds use the bundled exporter sidecar. If the primary Python exporter is unavailable or cannot start, the desktop app can complete the same local export with its built-in Node fallback; Python remains the default exporter.

## Desktop Features

- Project scanning and file tree selection for folders and individual files.
- Default excludes plus custom exclude patterns.
- Token and size estimation with context-window badges.
- In-app export preview generated locally before writing an output file.
- Local secret scanner before preview and export.
- Drag-and-drop project folder input with main-process validation.
- Recent Projects dropdown for successfully scanned folders.
- Saved export profiles for reusable project/export selections.
- Local Python sidecar/exporter execution.
- Git branch and commit metadata in previews and exports.
- Git diff-only selection for exporting changed files.

## VS Code Extension MVP

The local-only **CodeBundler** VS Code extension exports the current file, open workspace files, or selected workspace files through the existing CodeBundle Python exporter. Python is required for this development MVP; there is no bundled sidecar yet. See the [VS Code Extension Guide](apps/vscode-extension/README.md).

## Python CLI Usage

The Python exporter accepts a shared JSON config:

```bash
python -m codebundle_exporter --config path/to/codebundle.config.json
```

stdout contains exactly one JSON object so scripts and the desktop app can parse results safely. See `docs/python-automation.md`.

## Documentation

- [Desktop App Guide](apps/desktop/README.md)
- [VS Code Extension Guide](apps/vscode-extension/README.md)
- [Python Exporter Guide](exporter-python/README.md)
- [Security Notes](docs/security.md)
- [Desktop Packaging Notes](docs/desktop-packaging.md)
- [Desktop Security Dependency Upgrade](docs/desktop-security-upgrade.md)
- [Release Checklist](docs/release-checklist.md)
- [Website And Netlify Integration](docs/website-netlify-integration.md)
- [Python Automation Guide](docs/python-automation.md)

## Project Structure

```text
codebundle/
  exporter-python/
    codebundle_exporter/
    tests/
  apps/
    desktop/
      src/
      tests/
    vscode-extension/
      src/
      tests/
  shared/
  docs/
```

## Security Model

- Renderer code does not access Node.js APIs directly.
- Filesystem scanning happens in the Electron main process.
- Scan responses contain metadata only, not file contents.
- Python reads file contents only during export.
- Secret scanning is local-only and returns redacted findings.
- Export preview is generated locally, truncated, not persisted, and not written to the output file.
- Git metadata and optional diff-only file selection are read locally through Git. Remote URLs are not collected, Git hosting providers are not contacted, and branch switching commands are not run.
- Drag-and-drop folder paths are validated in the Electron main process.
- Recent projects are local metadata only. They store folder paths, folder display names, and timestamps, not file contents, selected files, secrets, tokens, or API keys.
- Saved export profiles are local configuration metadata only. They store profile names, project/output paths, selected relative paths, exclude text, and export options, never file contents, preview content, Git diff metadata, exported output, secret values, tokens, passwords, or API keys.
- Default excludes skip `.env`, keys, credentials, `.git`, `node_modules`, build outputs, lock files, and common binary formats.
- Dangerous roots such as `/`, `/etc`, `/usr`, `/System`, `/Library`, and Windows system roots are blocked.
- Path traversal attempts are rejected.
- Recent project logs use sanitized folder labels instead of full absolute paths.

See `docs/security.md` for details.

## Test Commands

Python:

```bash
cd exporter-python
pytest
```

Desktop:

```bash
cd apps/desktop
npm ci
npm test
npm run typecheck
npm run build
```

Release packaging preflight:

```bash
cd apps/desktop
npm run sidecar:build
npm run sidecar:verify
npm run package:dir
```

The bundled Python sidecar is built per operating system. `sidecar:verify` runs a local temporary export smoke test and checks the sidecar's JSON result and generated content before packaging. Generated sidecars are ignored by Git. Packaged desktop users do not need Python; development mode still uses local Python.

Create a public release by pushing a `v*` tag, for example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions builds macOS, Windows, and Linux artifacts, builds the platform Python sidecar on each runner, and attaches installers/packages to the GitHub Release.

## Current MVP Limitations

- Production signing, notarization, and installer release flow are not implemented yet.
- Current CI artifacts are unsigned beta builds.
- Desktop dependency audit is clean after the Electron/electron-builder/electron-vite/Vite security upgrade. See `docs/desktop-security-upgrade.md`.
- Sidecars must be built per target OS before packaging.
- Development mode still needs Python 3.10+ and Node/npm.
- `.gitignore` support is simple root `.gitignore` pattern support, not full Git-compatible matching.
- Export progress is coarse.
- Failed export temp configs may be kept for debugging.

## Troubleshooting

### Python Not Found

Install Python 3.10+ or set:

```bash
export CODEBUNDLE_PYTHON_PATH=/path/to/python3
```

### Exporter Module Not Found

Run the desktop app from the repository development setup. Public packaged builds use the bundled sidecar under app resources and do not use local Python.

### Output File Is Empty Or Missing

Check the selected files, exclude patterns, and export summary.

### Recent Project Not Showing

Scan the folder successfully first. Recent projects are added only after a successful scan.

### Recent Project Disappeared

The folder may no longer exist. Stale recent-project paths are pruned when the Recent Projects list loads.

### Preview Shows A Warning

The local secret scanner runs before preview and export. Review the warning and cancel if the selected files may contain secrets.
