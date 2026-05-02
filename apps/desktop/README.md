# CodeBundle Desktop

Phase 2 Electron desktop skeleton for CodeBundle.

This phase provides the app shell, secure preload bridge, native folder/output file dialogs, and placeholder renderer UI. It does not run the Python exporter yet.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Typecheck

```bash
npm run typecheck
```

## Local Scanning

The renderer asks the preload bridge to call `window.codeBundle.scanProject(options)`. Scanning happens only in the Electron main process and returns file metadata, never file contents.

The scanner blocks system-level roots, skips binary and oversized files, applies default and custom excludes, and prompts before scanning the user home directory.

## Implemented Preload API

```ts
window.codeBundle.chooseProjectFolder()
window.codeBundle.chooseOutputFile()
window.codeBundle.getDefaultExcludes()
window.codeBundle.getAppInfo()
```

## Security Baseline

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled in the renderer.
- The renderer receives only a narrow preload API.
- Native filesystem dialogs are handled in the main process.
- No Python bridge, packaging flow, upload flow, cloud service, or renderer `child_process` usage exists in this phase.

## Current Limitations

- `.gitignore` support is simple root `.gitignore` pattern support, not full Git-compatible matching.
- Scanning is local metadata only; it does not invoke the Python exporter or generate a final export.
