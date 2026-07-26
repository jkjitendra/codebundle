import * as vscode from "vscode";
import { basename, join } from "node:path";
import { buildExportConfig } from "./configBuilder";
import { readSettings } from "./config";
import { groupOpenFileUrisByWorkspace } from "./fileSelection";
import { normalizeWorkspaceRelativePath } from "./pathSecurity";
import { resolvePythonCommand } from "./pythonResolver";
import { exporterPythonPath, runExporter } from "./exportRunner";
import { scanFilesForSecrets } from "./secretScanner";
import { deleteTempConfig, writeTempConfig } from "./tempConfig";
import { getOutputChannel, logExport } from "./outputChannel";
import { DEFAULT_EXCLUDES } from "./defaultExcludes";

const QUICK_PICK_CAP = 5_000;

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("codebundler.exportCurrentFile", () => exportCurrentFile(context)),
    vscode.commands.registerCommand("codebundler.exportOpenFiles", () => exportOpenFiles(context)),
    vscode.commands.registerCommand("codebundler.exportWorkspaceSelection", () => exportWorkspaceSelection(context))
  );
}

async function chooseWorkspace(folders = vscode.workspace.workspaceFolders): Promise<vscode.WorkspaceFolder | undefined> {
  if (!folders?.length) { void vscode.window.showErrorMessage("CodeBundler requires an open workspace folder."); return undefined; }
  if (folders.length === 1) return folders[0];
  const picked = await vscode.window.showQuickPick(folders.map((folder) => ({ label: folder.name, folder })), { placeHolder: "Choose a workspace folder for CodeBundler export" });
  return picked?.folder;
}

async function exportCurrentFile(context: vscode.ExtensionContext): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || document.uri.scheme !== "file") { void vscode.window.showErrorMessage("CodeBundler needs an active workspace file to export."); return; }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const relativePath = folder && normalizeWorkspaceRelativePath(folder.uri.fsPath, document.uri.fsPath);
  if (!folder || !relativePath) { void vscode.window.showErrorMessage("The active file must be inside an open workspace folder."); return; }
  await exportFiles(context, folder, [relativePath]);
}

async function exportOpenFiles(context: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) { void vscode.window.showErrorMessage("CodeBundler requires an open workspace folder."); return; }
  const groups = groupOpenFileUrisByWorkspace(openWorkspaceFileUris(), folders);
  if (!groups.size) { void vscode.window.showErrorMessage("No open workspace files are available to export."); return; }
  let folder: vscode.WorkspaceFolder | undefined;
  if (groups.size === 1) folder = [...groups.keys()][0] as vscode.WorkspaceFolder;
  else folder = await chooseWorkspace([...groups.keys()] as vscode.WorkspaceFolder[]);
  if (!folder) return;
  const files = groups.get(folder) ?? [];
  if (!files.length) { void vscode.window.showErrorMessage("No open files belong to the selected workspace folder."); return; }
  logExport(`Detected ${files.length} open workspace file(s) before export.`);
  await exportFiles(context, folder, files);
}

/**
 * workspace.textDocuments is the authoritative document list. Visible TabInputText
 * entries are included as well because VS Code can retain a pinned editor tab before
 * the corresponding document is reported in that list by the extension host.
 */
function openWorkspaceFileUris(): vscode.Uri[] {
  const uris = new Map<string, vscode.Uri>();
  for (const document of vscode.workspace.textDocuments) {
    if (document.uri.scheme === "file" && !document.isUntitled) uris.set(document.uri.toString(), document.uri);
  }
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      // Do not use instanceof here: extension-host tab input objects may cross a
      // VS Code API boundary where class identity is not stable.
      const uri = (tab.input as { uri?: vscode.Uri }).uri;
      if (uri?.scheme === "file") {
        uris.set(uri.toString(), uri);
      }
    }
  }
  return [...uris.values()];
}

async function exportWorkspaceSelection(context: vscode.ExtensionContext): Promise<void> {
  const folder = await chooseWorkspace();
  if (!folder) return;
  const settings = readSettings();
  const excludes = [...DEFAULT_EXCLUDES, ...settings.excludePatterns.map((item) => item.trim()).filter(Boolean)];
  const excludeGlob = `{${excludes.join(",")}}`;
  const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"), excludeGlob, QUICK_PICK_CAP);
  if (uris.length === QUICK_PICK_CAP) void vscode.window.showWarningMessage(`CodeBundler file selection is capped at ${QUICK_PICK_CAP.toLocaleString()} files.`);
  const items = uris
    .map((uri) => normalizeWorkspaceRelativePath(folder.uri.fsPath, uri.fsPath))
    .filter((path): path is string => path !== null)
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ label }));
  if (!items.length) { void vscode.window.showInformationMessage("No eligible workspace files were found."); return; }
  const selected = await vscode.window.showQuickPick(items, { canPickMany: true, placeHolder: "Select files to export with CodeBundler" });
  if (!selected?.length) return;
  await exportFiles(context, folder, selected.map((item) => item.label));
}

async function confirmSecretScan(projectRoot: string, files: string[], maxFileSizeKb: number): Promise<boolean> {
  try {
    const scan = await scanFilesForSecrets(projectRoot, files, maxFileSizeKb);
    if (!scan.findings.length) {
      if (scan.errorCount) {
        const action = await vscode.window.showWarningMessage("CodeBundler could not scan some files for secrets.", { modal: true }, "Cancel", "Continue Anyway");
        return action === "Continue Anyway";
      }
      return true;
    }
    const preview = scan.findings.slice(0, 5).map((finding) => `${finding.filePath}:${finding.line} — ${finding.ruleLabel} (${finding.redactedMatch})`).join("; ");
    const suffix = scan.findings.length > 5 || scan.hasMoreFindings ? " More findings were redacted." : "";
    const action = await vscode.window.showWarningMessage(`Potential secrets found: ${preview}.${suffix}`, { modal: true }, "Cancel", "Continue Anyway");
    return action === "Continue Anyway";
  } catch {
    const action = await vscode.window.showWarningMessage("CodeBundler secret scan failed. Continue without the warning scan?", { modal: true }, "Cancel", "Continue Anyway");
    return action === "Continue Anyway";
  }
}

async function confirmSavedFiles(folder: vscode.WorkspaceFolder, files: readonly string[]): Promise<boolean> {
  const selected = new Set(files);
  const unsaved = vscode.workspace.textDocuments
    .filter((document) => document.isDirty && document.uri.scheme === "file")
    .map((document) => normalizeWorkspaceRelativePath(folder.uri.fsPath, document.uri.fsPath))
    .filter((path): path is string => path !== null && selected.has(path));
  if (!unsaved.length) return true;

  const action = await vscode.window.showWarningMessage(
    `${unsaved.length} selected file(s) have unsaved changes. CodeBundler exports the saved on-disk version only.`,
    { modal: true },
    "Cancel", "Continue with Saved Files"
  );
  return action === "Continue with Saved Files";
}

async function chooseOutput(folder: vscode.WorkspaceFolder): Promise<vscode.Uri | undefined> {
  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(join(folder.uri.fsPath, "codebundler-export.md")),
    filters: { "Markdown": ["md"], "Text": ["txt"] }, saveLabel: "Export CodeBundler"
  });
}

async function exportFiles(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder, rawFiles: string[]): Promise<void> {
  const files = [...new Set(rawFiles)].sort((a, b) => a.localeCompare(b));
  if (!files.length) return;
  if (!await confirmSavedFiles(folder, files)) return;
  if (!await confirmSecretScan(folder.uri.fsPath, files, readSettings().maxFileSizeKb)) return;
  const output = await chooseOutput(folder);
  if (!output) return;
  if (!/\.(?:md|txt)$/i.test(output.fsPath)) {
    void vscode.window.showErrorMessage("CodeBundler output must use a .md or .txt extension.");
    return;
  }
  const settings = readSettings();
  const config = buildExportConfig({ projectRoot: folder.uri.fsPath, outputFile: output.fsPath, files, userExcludes: settings.excludePatterns, maxFileSizeKb: settings.maxFileSizeKb, respectGitIgnore: settings.respectGitIgnore, followSymlinks: settings.followSymlinks });
  const outputLabel = basename(output.fsPath);
  const channel = getOutputChannel();
  channel.show(true);
  logExport(`Starting export of ${files.length} selected file(s) to ${output.fsPath}.`);
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "CodeBundler export", cancellable: false }, async () => {
    const python = await resolvePythonCommand(settings.pythonPath);
    if (!python) { void vscode.window.showErrorMessage("CodeBundler could not find Python. Set codebundler.pythonPath or install Python 3."); logExport("Python was not found."); return; }
    let tempConfigPath: string | undefined;
    try {
      tempConfigPath = await writeTempConfig(config);
      logExport(`Running local Python exporter (${python.command}).`);
      const result = await runExporter(python, tempConfigPath, exporterPythonPath(settings.exporterPythonPath, context.extensionPath));
      if (!result.success) {
        if (result.stderr) logExport(`Exporter stderr: ${result.stderr.slice(0, 2_000)}`);
        logExport(`Export failed: ${result.error ?? "unknown error"}`);
        void vscode.window.showErrorMessage(`CodeBundler export failed: ${result.error ?? "Unknown error"}`);
        return;
      }
      logExport(`Export completed: ${outputLabel}.`);
      const action = await vscode.window.showInformationMessage("CodeBundler export completed.", "Open Output", "Reveal in Finder/Explorer");
      if (action === "Open Output") await vscode.window.showTextDocument(output);
      if (action === "Reveal in Finder/Explorer") await vscode.commands.executeCommand("revealFileInOS", output);
    } catch {
      logExport("Export failed before the exporter could complete.");
      void vscode.window.showErrorMessage("CodeBundler could not prepare the local export.");
    } finally {
      if (tempConfigPath) await deleteTempConfig(tempConfigPath);
    }
  });
}
