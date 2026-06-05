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

## Secret Scanner

CodeBundle includes a local-only secret scanner that warns users before export if selected files contain potential secrets.

### What It Detects

The scanner uses regex-based rules to detect common secret patterns:

- AWS Access Key IDs (`AKIA...`)
- GitHub tokens (`ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_`, `github_pat_`)
- Slack tokens (`xoxb-`, `xoxp-`, `xoxa-`, etc.)
- Private key blocks — requires a complete PEM block with `-----BEGIN ... PRIVATE KEY-----` header, `-----END ... PRIVATE KEY-----` footer, and plausible base64 key material between them. Standalone header strings (e.g. in `.replace()` calls or parser code) are not flagged.
- Generic API key/secret assignments (`api_key = "..."`, `secret_key: "..."`)
- JWT tokens (`eyJ...eyJ...`)
- Inline environment variable secrets (`SECRET_TOKEN=...`, `DATABASE_PASSWORD=...`, `API_KEY=...`, `STRIPE_KEY=...`)
- Config property secrets (`spring.datasource.password=...`, `jwt.secret=...`, `aws.secretAccessKey=...`, `app.api-key=...`). Supports both `=` and `:` separators. Rejects env-variable placeholders (`${DB_PASSWORD}`), dev placeholders (`changeme`, `dummy`, etc.), short values, and path-suffix keys (`private-key-path`, `token-url`, etc.).

### Security Design

- Scanning runs entirely in the Electron main process. The renderer never receives raw file contents.
- The renderer sends only relative file paths over IPC. The main process resolves each path against `projectRoot` and validates it remains inside the project root before scanning.
- IPC results contain only file paths, rule names, severity levels, and **redacted** match previews (first 3 characters + `***`).
- No secret values are stored in preferences, logs, temp files, or exported data.
- Scanning is local-only and never transmits data over the network.

### Behavior

- Scanning is triggered before export, not during the file tree scan phase.
- Only files eligible for export are scanned (not binary, not too large, not excluded).
- `.env` and `.env.*` files are default-excluded in the normal UI flow and will typically not be scanned. `application.properties`, `application.yml`, and `application.yaml` are **not** default-excluded — the scanner checks these config files for property-style secrets when they are selected for export.
- A defensive max file size guard is applied inside the scanner.
- Results are capped at 20 findings per file and 200 total findings per scan.
- If findings are detected, a warning modal is shown. The user can cancel export (safe default) or continue intentionally.
- The scanner does not permanently block export.
- If the scanner itself fails, export proceeds with an informational notice.

### Limitations

- The scanner uses lightweight regex patterns and may produce false positives or miss obfuscated secrets.
- Private key detection requires a complete PEM block. Standalone header/footer strings in parser code are intentionally not flagged.
- Paths to secret files (e.g. `apple.private-key-path=/path/to/key.p8`) are not treated as secret values to reduce false positives.
- It is not a replacement for dedicated secret scanning tools like `gitleaks`, `truffleHog`, or GitHub secret scanning.
- Users should still review selected files before export.

### Manual Testing

To manually test the secret scanner, create a non-excluded file such as `src/fake-secret-test.ts` containing a fake GitHub token (e.g. `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`) or AWS key (`AKIAIOSFODNN7EXAMPLE`). Do not use `.env` files for testing since `.env` and `.env.*` are default-excluded and will not be scanned.

## Why Not a Hosted Web Scanner

CodeBundle should not be deployed as a hosted web scanner. A hosted scanner would require uploading project files or granting a remote service access to local source code, which conflicts with the local-first security model. The intended model is local Electron UI plus local Python CLI execution.
