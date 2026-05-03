# CodeBundle Sidecars

This directory holds platform-specific Python exporter sidecar builds for packaged desktop apps.

Generated sidecars are intentionally ignored by Git. Build them on the target OS or in a CI runner for each platform:

```bash
cd apps/desktop
npm run sidecar:build
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
