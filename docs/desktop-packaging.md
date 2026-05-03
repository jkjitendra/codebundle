# Desktop Packaging Notes

This document captures the current development runtime, packaged runtime foundation, and remaining production packaging work.

## Current Production Goal

Installed users should not manually install Python, Node.js, npm, Python packages, or project dependencies. The packaged app should include the Electron runtime and a platform-specific CodeBundle exporter sidecar.

## Development Mode

- The desktop app requires Python 3.10+ to be installed locally.
- Development requires Node/npm dependencies from `npm install`.
- Electron calls the Python CLI exporter with `child_process.spawn` and argument arrays.
- The renderer does not call Python and does not access Node.js APIs.
- During development, the main process sets `PYTHONPATH` so `../../exporter-python` can be imported.

Development export command used by Electron:

```bash
python -m codebundle_exporter --config <temp-config-path>
```

## Packaged Mode

- The packaged app uses a bundled sidecar executable.
- Packaged exports do not require a user-installed Python runtime.
- Packaged mode does not set `PYTHONPATH`.
- The sidecar is resolved under `process.resourcesPath/sidecars/`.

Expected packaged sidecar paths:

```text
process.resourcesPath/sidecars/codebundle-exporter
process.resourcesPath/sidecars/codebundle-exporter.exe
```

## Local Development

Install desktop dependencies:

```bash
cd apps/desktop
npm install
```

Run the desktop app:

```bash
npm run dev
```

Run checks:

```bash
npm test
npm run typecheck
npm run build
```

## Sidecar Build Flow

Build the Python exporter sidecar on the target OS:

```bash
cd apps/desktop
npm run sidecar:build
```

The build uses PyInstaller and writes to:

```text
resources/sidecars/current/codebundle-exporter
resources/sidecars/current/codebundle-exporter.exe
```

PyInstaller must be installed in the Python environment used to run the script:

```bash
python -m pip install pyinstaller
```

Do not attempt to build all OS sidecars from one OS. Build sidecars on each target OS or in platform-specific CI runners.

## Desktop Package Flow

Build the desktop app:

```bash
cd apps/desktop
npm run build
```

Build a sidecar, then create an unpacked package directory:

```bash
npm run sidecar:build
npm run sidecar:verify
npm run package:dir
```

`package:dir` and `package` run `sidecar:verify` before electron-builder. Packaging fails if the platform sidecar is missing, so a broken package is not produced silently.

The package config copies files from:

```text
../../resources/sidecars/current/
```

to app resources:

```text
sidecars/
```

`npm run build` creates Electron Vite output under `out/`. It is not a production installer by itself.

## Windows Notes

- Development Python resolution supports `CODEBUNDLE_PYTHON_PATH`, then `py -3`, `python`, and `python3`.
- Packaged sidecar name is `codebundle-exporter.exe`.
- Future Windows packaging should evaluate code signing, installer UX, and how the Python runtime or sidecar is located.

## macOS Notes

- Development Python resolution supports `CODEBUNDLE_PYTHON_PATH`, then `python3` and `python`.
- Packaged sidecar name is `codebundle-exporter`.
- A production macOS app will need code signing and notarization.
- The PyInstaller sidecar must be signed/notarized consistently with the app bundle.

## Linux Notes

- Development Python resolution supports `CODEBUNDLE_PYTHON_PATH`, then `python3` and `python`.
- Packaged sidecar name is `codebundle-exporter`.
- Packaging targets may include AppImage, deb, or rpm depending on distribution needs.

## Code Signing And Notarization

Code signing is not part of the current MVP. A packaging phase should define:

- Signing certificates and ownership.
- macOS notarization workflow.
- Windows Authenticode signing.
- Release artifact checksums.
- Reproducible build expectations.

## Current Limitation

The sidecar packaging foundation is in place, but signed production installers are not implemented yet. Cross-platform sidecars require platform-specific builds. Release artifacts and sidecar binaries should not be committed.

## Target Installed User Experience

The production goal is:

1. User downloads and installs CodeBundle.
2. User opens the desktop app.
3. User selects a project folder.
4. User runs an export.

The user should not need to manually install Python, Node.js, npm, or Python packages.

To achieve this, the planned packaging strategy is:

- Bundle the Electron desktop app.
- Build the Python exporter as a platform-specific sidecar executable.
- Include the sidecar in the packaged app resources.
- In packaged mode, call the bundled sidecar instead of `python -m codebundle_exporter`.

## Future Work

- CI build matrix for Windows, macOS, and Linux sidecars.
- Installer targets beyond unpacked `dir` builds.
- Code signing.
- macOS notarization.
- Release checksums.
- Auto-update evaluation.

## Recommended Next Packaging Phase

The next packaging phase should validate unpacked packaged exports on each OS, then add signing/notarization and installer artifact generation.
