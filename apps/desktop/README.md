# CodeBundle Desktop

![CodeBundle](../../resources/branding/horizontal_logo2.png)

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

The Python sidecar (or local Python in development) remains the primary exporter. If it is missing, not executable, not installed, or cannot be launched, the main process falls back to a local Node exporter. The fallback reads selected files only during export, makes no network or Git calls, and formats Git/Git Diff metadata already supplied by the app. It does not replace required sidecar build and verification before packaging.

Build the sidecar on the target OS:

```bash
npm run sidecar:clean
npm run sidecar:build
npm run sidecar:verify
```

`sidecar:build` uses PyInstaller one-file mode, clears stale generated sidecar/PyInstaller files first, and reports the platform-specific artifact size. `sidecar:verify` runs a local temporary smoke export through the built executable and validates its JSON result and exported content; it cleans its fixture afterwards. Generated sidecars are ignored and should not be committed.

The sidecar scripts use a Node wrapper that resolves Python in this order:

1. `CODEBUNDLE_PYTHON_PATH`
2. Windows: `py -3`, `python`, `python3`
3. macOS/Linux: `python3`, `python`

Create an unpacked package directory:

```bash
npm run package:dir
```

The package scripts do not silently build the sidecar. They verify the sidecar with a real smoke export before running electron-builder, so packaging fails clearly if `resources/sidecars/current/codebundle-exporter*` is missing or broken. Packaged users do not need Python; development mode still uses local Python and `PYTHONPATH`.

Generate app icons after branding source changes:

```bash
npm run branding:icons
```

Create release packages for the current OS:

```bash
npm run package
```

Configured package targets:

- macOS: `.dmg`, `.zip`
- Windows: NSIS `.exe`, portable `.exe`
- Linux: `.AppImage`, `.deb`, `.tar.gz`

The latest public release is:

```text
https://github.com/jkjitendra/codebundle/releases/latest
```

## App Workflow

1. Choose a project folder.
2. Scan the project.
3. Select files and folders in the file tree, or use Git Diff to replace the selection with changed files.
4. Edit exclude patterns if needed.
5. Choose an output `.md` or `.txt` file.
6. Click `Run Export`.
7. Review exported/skipped counts.
8. Click `Reveal Output` to locate the generated file.
9. Optionally save an export profile for reuse.
10. Load a saved profile to restore project, output, options, and file selections.

The app persists recent project/output paths, basic preferences, and saved export profiles under Electron `userData`. Saved profiles store configuration only, never file contents.

## Runtime Model

- Renderer has `contextIsolation` enabled.
- Renderer has `nodeIntegration` disabled.
- The preload exposes a narrow `window.codeBundle` API.
- Filesystem scanning and native dialogs run in the main process.
- Export runs by spawning Python with argument arrays.
- The renderer never reads file contents.

## Python Requirement

Development mode requires Python 3.10+ on the developer's machine. Public packaged builds use the bundled sidecar and should not require users to install Python, Node.js, npm, Python packages, or project dependencies.

Resolution order:

1. `CODEBUNDLE_PYTHON_PATH`
2. macOS/Linux: `python3`, `python`
3. Windows: `py -3`, `python`, `python3`

Development uses `PYTHONPATH` to make `../../exporter-python` importable.

## Git Metadata

After a successful scan, the app reads Git context for the scanned project folder and displays a badge below the file count:

```
Git: main · abc1234 · clean
Git: feature/my-branch · abc1234 · modified
Git: detached HEAD · cafebab
Git: Not a Git repository
Git: Git not available
```

Git metadata is also included in previews and final Python exports:

```markdown
## Git

- Branch: main
- Commit: abc1234
- Working tree: clean
```

Git detection runs in the Electron main process using `git rev-parse` and `git status --porcelain=v1 --untracked-files=no`. Each command has a 2-second timeout. Git failures never block scanning or export. The renderer never runs Git.

The Python exporter never runs Git — it formats only the metadata already provided in the export config.

## Git Diff-Only Selection

Git diff-only selection for exporting changed files is available after a successful scan of a Git worktree. Choose working-tree changes versus `HEAD`, or compare the current branch with a local base ref. Optionally include untracked files, then click **Select changed files** to replace the tree selection. Deleted, excluded, invalid, and missing paths are counted but not selected.

The app reads local path/status metadata only with `execFile`; it never reads patch contents, fetches remotes, switches branches, stages changes, commits, or mutates the repository. The normal local secret scan still runs before preview and export. Saved profiles retain manually selected paths but never store Git diff mode, base ref, or counts.

## Known Limitations

- Signing and notarization are not implemented; CI artifacts are unsigned beta builds.
- Desktop dependency audit is clean after the Electron/electron-builder/electron-vite/Vite security upgrade. See `../../docs/desktop-security-upgrade.md`.
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

Run the desktop app from the repository development setup. Packaged builds use `process.resourcesPath/sidecars/codebundle-exporter*`.

### Output File Is Empty Or Missing

Check the selected files, exclude patterns, and export summary.
