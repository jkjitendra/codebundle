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
npm audit
npm run sidecar:clean
npm run sidecar:build
npm run sidecar:verify
npm run package:dir
```

`sidecar:build` removes stale sidecar/PyInstaller output before building and reports the artifact size. `sidecar:verify` runs an isolated real export through the built executable, validates its single JSON stdout result and generated content, bounds stderr, and removes its temporary fixture. `package:dir` creates an unpacked app for local smoke testing and fails clearly if `resources/sidecars/current/codebundle-exporter*` is missing or fails verification. The desktop Node fallback is runtime resilience only; it does not waive these release requirements.

## Create A Release

1. Update the version in `apps/desktop/package.json`.

Auto-update uses the packaged app version, not only the Git tag. For every release, update `apps/desktop/package.json` first, then create the matching Git tag, for example `v0.1.2` for package version `0.1.2`.

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

The release workflow also uploads electron-updater metadata files:

- macOS: `latest-mac.yml`
- Windows: `latest.yml`
- Linux: `latest-linux.yml`

These files must stay attached to the GitHub Release with the installer/package artifacts so installed apps can discover updates.

Before publishing, verify **Check for Updates** in a packaged build when an older installed version and a newer test release are available. Development builds intentionally do not check for updates. Keep updater metadata attached even though the runtime has a local Node export fallback; packaging still requires the verified Python sidecar.

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

For a credentialed stable release, configure GitHub repository secrets:

- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
- Windows: `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`.

The release workflow logs whether the signed path is enabled without printing secret values. It builds unsigned beta artifacts when secrets are absent. Set repository variable `REQUIRE_CODE_SIGNING=true` only when macOS and Windows signing credentials are mandatory; missing complete credentials then fail the applicable release job. Do not commit certificate files, private keys, API keys, or passwords.

For every credentialed release, confirm:

1. Package version and `v*` tag match.
2. Per-OS sidecars were built and verified.
3. `latest-mac.yml`, `latest.yml`, and `latest-linux.yml` are attached.
4. macOS app, sidecar, and stapled ticket pass `scripts/verify-macos-signing.sh`.
5. Windows NSIS and portable artifacts report `Valid` in `Get-AuthenticodeSignature`.
6. No certificate or credential material appears in the worktree or release artifacts.

Linux artifacts remain unsigned in this phase. Unsigned beta builds may trigger operating-system warnings. See [Code Signing and Notarization](code-signing-and-notarization.md) for the owner runbook.

## Dependency Audit

`npm audit --omit=dev` is clean. As of the Phase 13 preflight, full `npm audit` reports 16 high-severity findings in development/build tooling through electron-builder's dependency chain; its proposed complete remediation requires a breaking electron-builder change. Do not run `npm audit fix --force` as part of a release. Track that dependency migration separately and rerun the complete verification suite after it is planned.

Before publishing a release, rerun:

```bash
cd apps/desktop
npm audit
npm audit --omit=dev
```

Do not run `npm audit fix --force` blindly if future advisories appear. Use targeted upgrades, then rerun tests, typecheck, build, sidecar packaging, and packaged export smoke tests.
