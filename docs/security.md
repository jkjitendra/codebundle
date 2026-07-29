# CodeBundle Security Notes

CodeBundle is local-first. It does not upload files, call cloud APIs, sync data, or store secrets.

## VS Code Extension MVP

The VS Code extension runs locally in the VS Code extension host and uses VS Code workspace file APIs to select files. It writes only a temporary JSON export config in the OS temp directory, then runs the existing Python exporter locally with `spawn` and an argument array; it never invokes a shell.

There are no uploads, cloud services, telemetry, accounts, or remote calls. File contents are read locally only for the pre-export secret warning and by the exporter. Secret warning findings are redacted, capped, and never stored in VS Code global/workspace state, output logs, or temp config. The extension stores only safe settings such as Python path and export preferences.

This MVP has no bundled Python sidecar and no Node-only exporter fallback. Python must be installed locally or configured with `codebundler.pythonPath`.

## Desktop Process Boundaries

- The renderer does not access Node.js APIs directly.
- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- The preload exposes a narrow `window.codeBundle` API.
- Native dialogs, filesystem scanning, config writing, preferences, and Python export execution happen in the Electron main process.
- The renderer receives scan metadata only. Scan responses include paths, file sizes, extensions, and counts, not file contents.

## File Content Access

The Python exporter reads file contents only when the user runs an export. The Electron renderer does not read file contents.

In development mode, Electron runs the exporter through local Python. In packaged mode, Electron runs the bundled sidecar executable. If that primary exporter is unavailable or cannot start, the Electron main process may use a local Node fallback exporter. It reads only selected files during export, uses no shell commands, network calls, telemetry, uploads, or Git commands, and formats only Git metadata already provided by the app. Ordinary export/config failures do not trigger this fallback.

The bundled sidecar is packaged app code. In credentialed macOS releases it is signed with the app before notarization, and it is replaced only through the app release process. Local and credential-free beta builds are unsigned and can be blocked or warned about by the operating system.

## Application Updates

Only packaged desktop builds may contact the configured GitHub Release provider to check for application updates. Development builds do not perform update network checks. Update requests do not include project files, selected paths, file contents, source code, account data, telemetry, or credentials. The renderer receives only a small sanitized update status and never receives `autoUpdater` APIs or raw updater errors. Installing a downloaded update requires an explicit user restart action.

Code signing establishes publisher identity and artifact integrity; notarization is Apple's malware-scanning and ticketing process. Neither process uploads user project files or makes signing credentials available to the renderer. Certificates, private keys, Apple credentials, and passwords are supplied only as CI secrets or protected local environment variables and are ignored by Git.

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

## Saved Export Profiles

Saved export profiles are stored locally under Electron's `userData` path in `export-profiles.json`.

Each saved profile stores:

- A profile name.
- The project root path.
- The output file path (optional, may be null).
- The output format (`markdown` or `text`).
- Selected file and folder relative paths.
- Custom exclude text.
- Max file size, `.gitignore`, and symlink preferences.
- `createdAt`, `updatedAt`, and optional `lastUsedAt` timestamps.

Saved export profiles do not store file contents, preview content, Git diff mode/base ref/counts, exported output, secret values, tokens, passwords, or API keys.

The saved profile list is capped at 20 entries. Profiles are created only through an explicit user action (Save Current).

Loading a profile populates the project folder, output file, export options, and exclude text. It does not scan automatically. After a manual scan, saved file/folder selections are restored only if the paths still exist in the scan tree. Missing paths are skipped with a warning.

The main process validates all profile input:

- Profile names are trimmed and capped at 80 characters.
- `projectRoot` must be an absolute path.
- `outputFile` must be null or an absolute path.
- Selected file/folder paths must be relative and must not escape `projectRoot`.
- Total selected paths are capped at 5,000.
- Timestamps and IDs are controlled by the main process, not by the renderer.

Logs use sanitized folder basenames, not full absolute paths.

## Default Excludes

CodeBundle applies default excludes for common sensitive, generated, dependency, and binary paths, including:

- `.git/**`
- `node_modules/**`
- build outputs such as `dist/**`, `build/**`, `.next/**`, `coverage/**`, and `out/**`
- virtualenv/cache paths such as `.venv/**`, `.venv-build/**`, `venv/**`, and `__pycache__/**`
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

## Git Metadata

After a successful scan, CodeBundle reads basic Git context for the scanned project using the local `git` executable.

### What is collected

- Current branch name (or detached HEAD state).
- Short and full commit hash.
- Whether tracked files have uncommitted changes (`git status --porcelain=v1 --untracked-files=no`).

### What is not collected

- Remote URLs.
- Commit history, diff content, or blame data.
- Any credentials, tokens, or SSH keys.
- Untracked file content or names.

### Security design

- Git metadata is read locally through the `git` executable when available. No network calls are made.
- CodeBundle does not contact Git hosting providers (GitHub, GitLab, Bitbucket, etc.).
- Git commands use argument arrays (`child_process.execFile`), never shell command strings.
- No branch switching, staging, or committing is performed.
- Each Git command has a strict 2-second timeout. Stdout is capped. All failures return a safe fallback result — Git failures never block scanning or export.
- Git detection runs entirely in the Electron main process. The renderer never executes Git.
- The Python exporter does not run Git. It only formats metadata already provided in the export config.
- If Git is not installed or the project is not a Git repository, the scan still succeeds. The UI badge reflects the unavailable or non-repo state.
- Git metadata is included in the export config (written to the OS temp directory) only when it was successfully detected. It follows the same temp file lifecycle as other config data.

## Git Diff-Only Selection

Git diff-only export is local-only. It reads local Git file path/status metadata to replace the tree selection with changed files; it never reads or exports patch contents through Git.

- Commands use the local `git` executable through `child_process.execFile` with argument arrays, never a shell.
- It does not fetch remotes, switch branches, stage changes, commit, or otherwise mutate the repository.
- Returned paths are normalized and validated inside the scanned `projectRoot`, including when that root is a subfolder of a repository.
- Deleted files, malformed entries, and paths outside the selected project root are counted/skipped and never selected.
- The normal local secret scan still runs before preview and export; diff-only selection does not bypass it.
- Saved profiles never store `gitDiff`, base refs, changed-file counts, or unavailable-file counts. They may store manually saved selected paths.
