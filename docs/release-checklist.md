# CodeBundle Release Checklist

Use this checklist before creating a public GitHub Release.

## Required Checks

1. Confirm tests pass.
2. Confirm sidecar builds on each OS.
3. Confirm packaged export works on each OS.
4. Confirm app icon appears correctly.
5. Confirm installers are attached to GitHub Release.
6. Confirm website download button points to latest release.
7. Confirm no generated binaries are committed.

## Local Preflight

Run from the repository root:

```bash
cd exporter-python
pytest
```

Run from `apps/desktop`:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run sidecar:build
npm run sidecar:verify
npm run package:dir
```

`package:dir` creates an unpacked app for local smoke testing. It verifies the sidecar before packaging, so the package fails clearly if `resources/sidecars/current/codebundle-exporter*` is missing.

## Create A Release

1. Update the version in `apps/desktop/package.json`.
2. Regenerate icons only if the committed branding source changes:

```bash
cd apps/desktop
npm run branding:icons
```

The icon script uses macOS image tooling and should be run on macOS when the source logo changes. Generated app icons are committed under `apps/desktop/build/`.

3. Confirm the worktree does not include generated installers, sidecars, PyInstaller outputs, or Electron release folders.
4. Create and push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions release workflow runs on `v*` tags, builds on macOS, Windows, and Linux, builds the platform Python sidecar on each OS, packages the desktop app, and uploads installers/packages to the GitHub Release using the Actions `GITHUB_TOKEN`.

## User Download Guidance

Latest release page:

```text
https://github.com/jkjitendra/codebundle/releases/latest
```

Typical downloads:

- macOS: `.dmg` or `.zip`
- Windows: `.exe`
- Linux: `.AppImage`, `.deb`, or `.tar.gz`

Installed users should not install Python, Node.js, npm, Python packages, or project dependencies. Public desktop builds include the Electron app and the bundled Python exporter sidecar.

## Local-First Release Notes

Release notes should state that CodeBundle runs locally:

- No file uploads.
- No cloud service calls.
- Renderer code does not receive Node filesystem or process APIs.
- Files are scanned and exported on the user's machine.
- Packaged builds use the bundled sidecar instead of local Python.

## Signing And Notarization

Current CI artifacts are unsigned beta artifacts. Before a stable public launch, configure:

- macOS Developer ID signing.
- macOS notarization.
- Windows Authenticode signing.
- Release checksums.

Unsigned builds may trigger operating system warnings.

## Dependency Audit

Desktop dependency audit is clean after the targeted security upgrade. See `desktop-security-upgrade.md`.

Before publishing a release, rerun:

```bash
cd apps/desktop
npm audit
npm audit --omit=dev
```

Do not run `npm audit fix --force` blindly if future advisories appear. Use targeted upgrades, then rerun tests, typecheck, build, sidecar packaging, and packaged export smoke tests.
