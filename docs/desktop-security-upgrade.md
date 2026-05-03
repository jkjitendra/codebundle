# Desktop Security Dependency Upgrade

Date: 2026-05-03

This note records the dependency upgrade performed for the CodeBundle desktop release flow after `npm audit` reported vulnerabilities in Electron, electron-builder's dependency chain, Vite/esbuild, tar, node-gyp, and `@electron/rebuild`.

## Package Metadata Check

Target versions were checked with `npm view` before installation.

- `electron@41.5.0` exists and supports Node `>=12.20.55`.
- `electron-builder@26.8.1` exists and supports Node `>=14.0.0`.
- `electron-vite@5.0.0` exists and requires Node `^20.19.0 || >=22.12.0`.
- `vite@8.0.10` exists and requires Node `^20.19.0 || >=22.12.0`.
- `@vitejs/plugin-react@6.0.1` exists and requires Node `^20.19.0 || >=22.12.0`.

`electron-vite@5.0.0` peers `vite ^5.0.0 || ^6.0.0 || ^7.0.0`, so the requested Vite 8 target is not compatible with the requested electron-vite 5 target. The compatible upgrade used:

- `electron@41.5.0`
- `electron-builder@26.8.1`
- `electron-vite@5.0.0`
- `vite@7.3.2`
- `@vitejs/plugin-react@5.2.0`
- `@swc/core@1.15.33`

`@swc/core` is included to satisfy the `electron-vite@5.0.0` peer dependency.

## Node Requirement

Use Node `22.12.0` or newer in the Node 22 line. The repo root `.nvmrc` pins:

```text
22.12.0
```

The upgraded Vite/electron-vite toolchain requires `^20.19.0 || >=22.12.0`; Node 22.12.0 is the preferred release baseline.

## Verification

Executed after the upgrade:

```bash
npm ci
npm run test
npm run typecheck
npm run build
npm run sidecar:verify
npm run package:dir
npm audit
npm audit --omit=dev
```

Results:

- Desktop tests: 7 files, 64 tests passed.
- TypeScript typecheck passed.
- Electron Vite build passed with Vite 7.3.2.
- `sidecar:verify` passed.
- `package:dir` passed with Electron 41.5.0 and electron-builder 26.8.1.
- Full `npm audit`: 0 vulnerabilities.
- Production `npm audit --omit=dev`: 0 vulnerabilities.

The first `package:dir` attempt failed only because Electron 41 had to be downloaded from GitHub and the sandbox had no network access. Rerunning with network access succeeded.

## Runtime Security Review

- `BrowserWindow` keeps `contextIsolation: true`.
- `BrowserWindow` keeps `nodeIntegration: false`.
- `BrowserWindow` keeps `sandbox: true`.
- No unsafe Electron remote module usage was found.
- Renderer and preload contain no `child_process`, `spawn`, or `exec(` usage.
- Process execution remains confined to the Electron main process for Python resolution/export execution.
- IPC remains exposed through the narrow `window.codeBundle` preload API.

The unpacked macOS app launched successfully from `apps/desktop/release/mac-arm64/CodeBundle.app`; the renderer process started with `--enable-sandbox`. Packaged resources include:

```text
Contents/Resources/sidecars/codebundle-exporter
```

## Remaining Warnings

- `npm ci` reports deprecation warnings from transitive packages: `inflight`, `rimraf@2`, `glob@7`, and `boolean`.
- `package:dir` reports duplicate dependency references for React transitive packages.
- `package:dir` reports a Node deprecation warning from electron-builder internals about child process `shell: true`.
- macOS package output is ad-hoc signed and notarization is skipped because signing/notarization credentials are not configured.
