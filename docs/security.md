# CodeBundle Security Notes

CodeBundle is local-first. It does not upload files, call cloud APIs, sync data, or store secrets.

## Desktop Process Boundaries

- The renderer does not access Node.js APIs directly.
- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- The preload exposes a narrow `window.codeBundle` API.
- Native dialogs, filesystem scanning, config writing, preferences, and Python export execution happen in the Electron main process.
- The renderer receives scan metadata only. Scan responses include paths, file sizes, extensions, and counts, not file contents.

## File Content Access

The Python exporter reads file contents only when the user runs an export. The Electron renderer does not read file contents.

In development mode, Electron runs the exporter through local Python. In packaged mode, Electron runs the bundled sidecar executable. Both modes run locally and preserve the same stdout/stderr export contract.

The bundled sidecar is packaged app code. It should be treated as trusted local application code, signed with the app in production, and replaced only through the app release process.

The desktop app writes a temporary JSON config in the OS temp directory before export. The temp config contains paths, selection lists, format, limits, and exclude patterns. It does not contain file contents.

Successful exports attempt to remove their temp config. Failed exports may leave the temp config for debugging. Only files matching `codebundle-*.codebundle.tmp.json` should be considered CodeBundle temp configs.

## Preferences

Desktop preferences are stored locally under Electron's `userData` path. They may include:

- Recent project folder path.
- Recent output file path.
- Max file size preference.
- `.gitignore` and symlink preferences.
- Exclude pattern text.

Preferences do not store file contents, selected file contents, tokens, passwords, or API keys.

## Default Excludes

CodeBundle applies default excludes for common sensitive, generated, dependency, and binary paths, including:

- `.git/**`
- `node_modules/**`
- build outputs such as `dist/**`, `build/**`, `.next/**`, `coverage/**`, and `out/**`
- virtualenv/cache paths such as `.venv/**`, `venv/**`, and `__pycache__/**`
- `.env` and `.env.*`
- keys and credentials such as `*.pem`, `*.key`, `credentials.json`, and `service-account.json`
- lock files such as `package-lock.json`, `yarn.lock`, and `pnpm-lock.yaml`
- common image, audio, video, archive, and compiled binary formats

Users should still review selected files before export. Default excludes reduce common risk, but they cannot know every project-specific secret path.

## Path Safety

CodeBundle rejects path traversal attempts such as `../../secret.txt` for selected files and folders. Selected relative paths must remain inside `projectRoot` after resolution.

The desktop scanner blocks dangerous roots, including:

- `/`
- `/etc`
- `/usr`
- `/System`
- `/Library`
- `C:\`
- `C:\Windows`
- `C:\Program Files`
- `C:\Program Files (x86)`

Scanning a home directory is treated as risky and surfaced in the UI.

## Symlinks

Symlinks are not followed unless `followSymlinks` is enabled. When disabled, symlinked files and directories are skipped.

When symlinks are enabled, resolved paths are still checked so selected paths cannot escape the project root.

## Gitignore Support

`.gitignore` support is intentionally simple. CodeBundle supports practical root `.gitignore` pattern matching, but it is not a full Git-compatible ignore engine and does not implement every nested `.gitignore` rule.

## Why Not a Hosted Web Scanner

CodeBundle should not be deployed as a hosted web scanner. A hosted scanner would require uploading project files or granting a remote service access to local source code, which conflicts with the local-first security model. The intended model is local Electron UI plus local Python CLI execution.
