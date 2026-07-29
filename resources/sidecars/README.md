# CodeBundle Sidecars

This directory holds platform-specific Python exporter sidecar builds for packaged desktop apps.

Generated sidecars are intentionally ignored by Git. Build them on the target OS or in a CI runner for each platform:

```bash
cd apps/desktop
npm run sidecar:build
npm run sidecar:verify
```

Expected generated layout:

```text
resources/
  sidecars/
    current/
      codebundle-exporter      # macOS/Linux
      codebundle-exporter.exe  # Windows
```

Keep `.gitkeep` placeholders committed. Do not commit generated sidecar binaries unless a release process explicitly requires it.

`sidecar:verify` performs a local smoke export with a temporary fixture, then removes the fixture and output. Sidecars make no network calls at build or runtime.

For a signed macOS release, electron-builder treats `Contents/Resources/sidecars/codebundle-exporter` as an additional binary and signs it with the app before notarization. Keep the sidecar in its expected package path; moving it after signing invalidates the app signature. Local and credential-free beta builds remain unsigned.
