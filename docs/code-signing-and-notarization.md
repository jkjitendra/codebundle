# Code Signing and Notarization

CodeBundle release CI can produce signed production artifacts when release-owner credentials are configured. Contributors do not need signing certificates: local builds and releases without credentials remain unsigned beta builds.

Signing proves the publisher and artifact integrity. Apple notarization submits the signed app for malware scanning and attaches a ticket. Neither process uploads project files, source code selected for export, user data, or application preferences.

## What belongs in Git

Commit the release configuration and public build resources:

- `apps/desktop/build/icon.icns`, `icon.ico`, `icon.png`, and `icons/`
- `apps/desktop/build/entitlements.mac.plist`
- `apps/desktop/build/entitlements.mac.inherit.plist`
- `apps/desktop/electron-builder.yml`, `.github/workflows/release.yml`, verification scripts, tests, and release documentation

Never commit generated output or credentials. `.gitignore` covers Electron `out/` and `release/` folders, generated `resources/sidecars/current/codebundle-exporter*`, Python build/dist output, `node_modules/`, local `.env` files, and certificate/key formats such as `.p12`, `.pfx`, `.cer`, `.pem`, `.key`, `.p8`, `.mobileprovision`, `.keystore`, and `.jks`. The only intentional file under `resources/sidecars/current/` is its `.gitkeep` placeholder.

## macOS release prerequisites

Release owners need Apple Developer Program membership, a **Developer ID Application** certificate, the associated private key, and the Apple Team ID. Configure these GitHub repository secrets:

- `CSC_LINK`: electron-builder-compatible base64 certificate or secure certificate location.
- `CSC_KEY_PASSWORD`: certificate password.
- `APPLE_ID`: Apple ID used for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

Electron Builder signs the app with hardened runtime and the minimal Electron JIT/executable-memory entitlements in `apps/desktop/build/entitlements.mac.plist`. It also signs the bundled Python exporter at `Contents/Resources/sidecars/codebundle-exporter`. With all macOS secrets present, electron-builder uses its built-in notarization and stapling path before creating DMG/ZIP artifacts.

Run this only on a credentialed macOS release package:

```bash
bash scripts/verify-macos-signing.sh apps/desktop/release
```

It verifies the app signature, sidecar signature, Gatekeeper assessment, and stapled ticket. Do not run this as the unsigned-local-beta check: it is expected to fail for an unsigned artifact.

## Windows release prerequisites

Obtain a Windows Authenticode certificate or use a compatible future cloud-signing provider. Configure these GitHub repository secrets:

- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`

The workflow maps them to `CSC_LINK` and `CSC_KEY_PASSWORD` only in the Windows job. The `publisherName` in electron-builder must match the certificate subject; update it if the certificate uses a different publisher identity. SmartScreen reputation can still take time to develop depending on certificate type and distribution history.

Inspect Windows artifacts from PowerShell:

```powershell
./scripts/verify-windows-signature.ps1 -ReleaseDirectory ./apps/desktop/release -RequireSigned
```

Without `-RequireSigned`, the script reports unsigned beta executables but does not fail because of their unsigned status.

## Unsigned local and beta builds

No signing credentials are required for normal development or packaging:

```bash
cd apps/desktop
npm run dev
npm test
npm run typecheck
npm run build
npm run package:dir
```

The release workflow uses the same unsigned-beta path when secrets are absent. It logs `Signing credentials missing: building unsigned beta artifact.` and explicitly disables automatic certificate discovery. Unsigned macOS downloads can be quarantined or blocked by Gatekeeper; users should only bypass that protection for an artifact obtained from the official CodeBundle release.

To require signing for a release, set the GitHub repository variable:

```text
REQUIRE_CODE_SIGNING=true
```

The macOS job then requires both Developer ID and Apple notarization credentials; the Windows job requires its certificate pair. Linux packaging is not blocked because Linux signing is outside this phase.

## Release owner checklist

1. Confirm `apps/desktop/package.json` version and `v*` tag match.
2. Confirm sidecar build and smoke verification ran on each platform.
3. Confirm updater metadata (`latest-mac.yml`, `latest.yml`, `latest-linux.yml`) is attached to the GitHub Release.
4. Confirm the macOS signed path completes `codesign`, notarization, stapling, and Gatekeeper verification.
5. Confirm Windows installer and portable executable signatures are valid.
6. Confirm the Python sidecar remains present and executable in the packaged app.
7. Confirm no `.p12`, `.pfx`, `.cer`, `.mobileprovision`, private key, Apple credential, or password is committed or uploaded as an artifact.
8. Record the full dependency-audit status. Phase 13 has a clean `npm audit --omit=dev`; full `npm audit` reports 16 high-severity development/build-tooling findings through electron-builder and requires a breaking migration for complete remediation. Do not use `npm audit fix --force` solely to change build tooling.

## Linux and future work

Linux AppImage, deb, and tarball artifacts remain unsigned. Distribution/package signing and release checksums are future work and must not block the current Linux package or updater metadata upload.
