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

## Recent Projects

Recent projects are stored locally under Electron's `userData` path in `recent-projects.json`.

Each recent-project entry stores only:

- The project folder path.
- The folder display name.
- `addedAt` and `lastOpenedAt` timestamps.

Recent projects do not store file contents, selected files, secrets, tokens, passwords, or API keys.

The recent-project list is capped at 10 entries. A project is added only after a project scan succeeds. Choosing a folder, typing a path, selecting a recent project, or failing a drag-and-drop scan does not add a recent project.

Stale recent-project paths are pruned only when the renderer explicitly loads the recent-project list through `getRecentProjects()`. There is no background scanning or automatic filesystem probing for recent projects.

Selecting a recent project only populates the Project Folder input and resets the current scan state. It does not scan automatically.

Logs must never include full absolute project paths. Recent-project log entries may use sanitized folder labels such as a basename, but they must not write complete paths.

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

## Export Preview

CodeBundle supports an in-app export preview that generates export content in memory without writing to disk.

### Security Design

- **User-triggered.** Preview generation is initiated only by an explicit user action ("Generate Preview" button). It is never triggered automatically.
- **Secret scan before preview.** The same secret scanner that runs before export also runs before preview generation. If secrets are detected, the user sees a warning and must confirm before the preview is generated.
- **Bounded content.** Preview content is truncated by both line count (default 500 lines) and byte count (default 200 KB) in the main process before being sent to the renderer. The renderer never receives unbounded file content.
- **Main process only.** File reading and preview rendering happen entirely in the Electron main process. The renderer receives only the pre-truncated preview string and metadata (total selected files, previewed files, total lines, truncated flag, format).
- **Local-only.** Preview content is never transmitted over the network.
- **Not persisted.** Preview content is held in React state only while the preview modal is open. It is not written to disk, temp files, preferences, or logs.
- **Not logged.** Preview content is not included in error messages, log output, or crash reports. Error details are capped at 500 characters and never contain file content.
- **Path validation.** Preview uses the same path security checks as export: paths must be relative, must resolve inside projectRoot, and path traversal is rejected.
- **No output file written.** Unlike the full export flow, preview generation does not write any output file. The preview modal provides a "Confirm Export" action that triggers the standard export flow if the user wants to proceed.

### Known Gaps

The preview renderer is implemented in Node.js in the main process and mirrors the Python exporter's output format. However, it does not use the Python exporter directly. Minor formatting differences between the preview and the final export may occur. The preview is intended as a representative sample, not a byte-exact match.

## Why Not a Hosted Web Scanner

CodeBundle should not be deployed as a hosted web scanner. A hosted scanner would require uploading project files or granting a remote service access to local source code, which conflicts with the local-first security model. The intended model is local Electron UI plus local Python CLI execution.

## Drag-and-Drop Folder Input

CodeBundle supports dragging a folder onto the Project Folder input to set the project root.

### Security Design

- **Main process validation only.** When the user drops a folder, the renderer sends the raw dropped path string to the main process via IPC (`codebundle:validate-dropped-folder`). The main process validates the path and returns either a resolved canonical path or an error. The renderer never calls `fs.stat`, `fs.realpath`, or any other filesystem API directly.
- **Preload path extraction.** The renderer obtains the dropped `File` path through the preload bridge using Electron's `webUtils.getPathForFile`, with a legacy `File.path` fallback for older runtimes.
- **Absolute path required.** Relative paths are rejected before any filesystem access.
- **Dangerous roots blocked.** System-level roots (`/`, `/etc`, `/usr`, `/System`, `/Library`, Windows drive roots) are rejected with a `DANGEROUS_PATH` error before any stat call.
- **Directory check.** The main process calls `fs.stat` to verify the dropped item is an existing directory. File drops return a `NOT_A_DIRECTORY` error.
- **Symlink target validation.** The canonical path is resolved via `fs.realpath` and checked again so a safe-looking symlink to a system root still returns `DANGEROUS_PATH`, and a symlink to the home directory returns `HOME_DIRECTORY` with the resolved canonical home path.
- **Home directory confirmation.** Dropping the home directory returns `HOME_DIRECTORY`; the renderer asks for confirmation before scanning with the same allow flag used by the manual scan flow. If validation returned a canonical resolved path, scanning uses that path after confirmation.
- **Inline invalid-drop feedback.** Validation failures are returned to the Project Folder drop zone and shown inline as red drop-zone feedback.
- **No file content read.** Path validation reads only directory metadata (`stat`). No file content is accessed during drop validation.
- **Error messages are safe.** Error responses to the renderer contain only short fixed-text error codes and pre-written messages. Filesystem error details (ENOENT stack traces, etc.) are not forwarded to the renderer.
