import { useEffect, useMemo, useState } from "react";
import { ExcludeRulesEditor } from "./components/ExcludeRulesEditor";
import { ExportControls } from "./components/ExportControls";
import { ExportPreviewModal } from "./components/ExportPreviewModal";
import { ExportToast } from "./components/ExportToast";
import { FileTree } from "./components/FileTree";
import { InlineInfo } from "./components/InlineInfo";
import { LocalFirstInfo } from "./components/LocalFirstInfo";
import { ProjectPicker } from "./components/ProjectPicker";
import { SecretScanWarning } from "./components/SecretScanWarning";
import {
  buildConfigPreview,
  clearSelection,
  createEmptySelection,
  getSelectionSummary,
  isFileSelected,
  selectPaths,
  toggleNodeSelection
} from "./lib/selection";
import { formatBytes, formatTokenCount, getContextBadges } from "./lib/tokenEstimate";
import { buildFileTree, buildTreeIndex, collectDirectoryPaths, collectExtensions, collectFilePaths, filterTree } from "./lib/treeUtils";
import type {
  AppInfo,
  CodeBundleConfigPreview,
  CodeBundlePreferences,
  FileTreeNode,
  PrepareExportConfigResult,
  PreviewResult,
  RunExportResult,
  ScanProjectResult,
  SecretScanResult,
  ValidateDroppedFolderResult
} from "./lib/types";

const DEFAULT_MAX_FILE_SIZE_KB = 500;
const TOAST_DISMISS_MS = 9_000;
const DEFAULT_PREVIEW_MAX_LINES = 500;
const DEFAULT_PREVIEW_MAX_BYTES = 200_000;
const settingsIcon = new URL("../../../../resources/icons/settings.svg", import.meta.url).href;

type PendingAction = "export" | "preview";

interface ExportToastState {
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
  outputFile?: string;
}

export type FolderDropResult = { success: true } | { success: false; message?: string };

interface DroppedProjectFolderHandlerOptions {
  validateDroppedFolder: (path: string) => Promise<ValidateDroppedFolderResult>;
  confirmHomeDirectory: () => boolean;
  setProjectFolder: (folder: string) => void;
  resetProjectState: () => void;
  scanProjectFolder: (folder: string, allowHomeDirectory?: boolean) => Promise<void>;
}

export async function handleDroppedProjectFolder(
  droppedPath: string,
  options: DroppedProjectFolderHandlerOptions
): Promise<FolderDropResult> {
  const result = await options.validateDroppedFolder(droppedPath);

  if (!result.success) {
    if (result.error.code !== "HOME_DIRECTORY") {
      return { success: false, message: result.error.message };
    }

    if (!options.confirmHomeDirectory()) {
      return { success: false };
    }

    const folderToScan = result.resolvedPath ?? droppedPath;
    options.setProjectFolder(folderToScan);
    options.resetProjectState();
    await options.scanProjectFolder(folderToScan, true);
    return { success: true };
  }

  options.setProjectFolder(result.resolvedPath);
  options.resetProjectState();
  await options.scanProjectFolder(result.resolvedPath);
  return { success: true };
}

export default function App(): JSX.Element {
  const [projectFolder, setProjectFolder] = useState<string | null>(null);
  const [outputFile, setOutputFile] = useState<string | null>(null);
  const [defaultExcludes, setDefaultExcludes] = useState<string[]>([]);
  const [excludeText, setExcludeText] = useState("");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [scanResult, setScanResult] = useState<ScanProjectResult | null>(null);
  const [selection, setSelection] = useState(() => createEmptySelection());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [extensionFilter, setExtensionFilter] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [respectGitIgnore, setRespectGitIgnore] = useState(true);
  const [followSymlinks, setFollowSymlinks] = useState(false);
  const [maxFileSizeKb, setMaxFileSizeKb] = useState(DEFAULT_MAX_FILE_SIZE_KB);
  const [isScanning, setIsScanning] = useState(false);
  const [isPreparingExport, setIsPreparingExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSecretScanning, setIsSecretScanning] = useState(false);
  const [secretScanResult, setSecretScanResult] = useState<SecretScanResult | null>(null);
  const [pendingExportConfig, setPendingExportConfig] = useState<CodeBundleConfigPreview | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [configPreview, setConfigPreview] = useState<CodeBundleConfigPreview | null>(null);
  const [prepareResult, setPrepareResult] = useState<PrepareExportConfigResult | null>(null);
  const [exportResult, setExportResult] = useState<RunExportResult | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [toast, setToast] = useState<ExportToastState | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const tree = useMemo(() => buildFileTree(scanResult?.nodes ?? []), [scanResult]);
  const treeIndex = useMemo(() => buildTreeIndex(tree), [tree]);
  const filteredTree = useMemo(
    () =>
      filterTree(tree, {
        search,
        extension: extensionFilter,
        showSelectedOnly,
        isSelected: (path) => isFileSelected(path, selection, treeIndex)
      }),
    [tree, treeIndex, search, extensionFilter, showSelectedOnly, selection]
  );
  const extensions = useMemo(() => collectExtensions(tree), [tree]);
  const excludePatterns = useMemo(() => parseExcludePatterns(excludeText), [excludeText]);
  const configExcludePatterns = useMemo(
    () => [...new Set([...defaultExcludes, ...excludePatterns])],
    [defaultExcludes, excludePatterns]
  );
  const selectionSummary = useMemo(() => getSelectionSummary(selection, treeIndex), [selection, treeIndex]);
  const outputFormat = outputFile?.toLowerCase().endsWith(".txt") ? "text" : "markdown";
  const canPrepareExport =
    Boolean(projectFolder && outputFile && scanResult && selectionSummary.estimatedExportFileCount > 0) &&
    !isPreparingExport &&
    !isExporting &&
    !isSecretScanning &&
    !isGeneratingPreview;
  const canRunExport = canPrepareExport;
  const canGeneratePreview =
    Boolean(projectFolder && outputFile && scanResult && selectionSummary.estimatedExportFileCount > 0) &&
    !isPreparingExport &&
    !isExporting &&
    !isSecretScanning &&
    !isGeneratingPreview;

  function createConfigPreview(): CodeBundleConfigPreview | null {
    if (!projectFolder || !outputFile || !scanResult) {
      return null;
    }
    return buildConfigPreview({
      projectRoot: projectFolder,
      outputFile,
      format: outputFormat,
      selection,
      exclude: configExcludePatterns,
      maxFileSizeKb,
      respectGitIgnore,
      followSymlinks
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadBridgeData(): Promise<void> {
      try {
        const [rules, info, preferences] = await Promise.all([
          window.codeBundle.getDefaultExcludes(),
          window.codeBundle.getAppInfo(),
          window.codeBundle.getPreferences()
        ]);

        if (isMounted) {
          setDefaultExcludes(rules);
          setAppInfo(info);
          setProjectFolder(preferences.recentProjectFolder);
          setOutputFile(preferences.recentOutputFile);
          setMaxFileSizeKb(preferences.maxFileSizeKb);
          setRespectGitIgnore(preferences.respectGitIgnore);
          setFollowSymlinks(preferences.followSymlinks);
          setExcludeText(preferences.excludeText);
          setPreferencesLoaded(true);
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to read desktop app bridge data.");
          setPreferencesLoaded(true);
        }
      }
    }

    void loadBridgeData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }

    void window.codeBundle.savePreferences({
      recentProjectFolder: projectFolder,
      recentOutputFile: outputFile,
      maxFileSizeKb,
      respectGitIgnore,
      followSymlinks,
      excludeText
    });
  }, [preferencesLoaded, projectFolder, outputFile, maxFileSizeKb, respectGitIgnore, followSymlinks, excludeText]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function chooseProjectFolder(): Promise<void> {
    setError(null);
    try {
      const selectedFolder = await window.codeBundle.chooseProjectFolder();
      if (selectedFolder) {
        setProjectFolder(selectedFolder);
        setScanResult(null);
        setPrepareResult(null);
        setExportResult(null);
        setRevealError(null);
        setCopyStatus(null);
        setToast(null);
        setConfigPreview(null);
        setSelection(clearSelection());
        setExpandedFolders(new Set());
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to choose a project folder.");
    }
  }

  function updateProjectFolder(value: string): void {
    setProjectFolder(value.length > 0 ? value : null);
    resetProjectState();
  }

  function resetProjectState(): void {
    setScanResult(null);
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setToast(null);
    setConfigPreview(null);
    setSelection(clearSelection());
    setExpandedFolders(new Set());
    setWarnings([]);
  }

  async function handleFolderDropped(droppedPath: string): Promise<FolderDropResult> {
    setError(null);
    try {
      return await handleDroppedProjectFolder(droppedPath, {
        validateDroppedFolder: window.codeBundle.validateDroppedFolder,
        confirmHomeDirectory: () =>
          window.confirm("Scanning your home directory can include many personal files. Continue?"),
        setProjectFolder,
        resetProjectState,
        scanProjectFolder
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not validate the dropped folder.";
      setError(message);
      return { success: false, message };
    }
  }

  async function chooseOutputFile(): Promise<void> {
    setError(null);
    try {
      const selectedOutput = await window.codeBundle.chooseOutputFile();
      if (selectedOutput) {
        setOutputFile(selectedOutput);
        setPrepareResult(null);
        setExportResult(null);
        setRevealError(null);
        setCopyStatus(null);
        setToast(null);
        setConfigPreview(null);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to choose an output file.");
    }
  }

  function updateOutputFile(value: string): void {
    setOutputFile(value.length > 0 ? value : null);
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setToast(null);
    setConfigPreview(null);
  }

  async function scanProjectFolder(folder: string, allowHomeDirectory = false): Promise<void> {
    if (!folder) {
      return;
    }

    setError(null);
    setWarnings([]);
    setIsScanning(true);

    try {
      const result = await window.codeBundle.scanProject({
        projectRoot: folder,
        maxFileSizeKb,
        exclude: excludePatterns,
        respectGitIgnore,
        followSymlinks,
        allowHomeDirectory
      });
      setScanResult(result);
      setPrepareResult(null);
      setExportResult(null);
      setRevealError(null);
      setCopyStatus(null);
      setToast(null);
      setConfigPreview(null);
      setSelection(clearSelection());
      setExpandedFolders(new Set(result.nodes.filter((node) => node.type === "directory").map((node) => node.path)));
      setWarnings(result.warnings ?? []);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to scan project folder.";
      if (message.includes("HOME_DIRECTORY_REQUIRES_CONFIRMATION")) {
        const confirmed = window.confirm("Scanning your home directory can include many personal files. Continue?");
        if (confirmed) {
          await scanProjectFolder(folder, true);
          return;
        }
      } else {
        setError(cleanScannerError(message));
      }
    } finally {
      setIsScanning(false);
    }
  }

  async function scanSelectedProject(allowHomeDirectory = false): Promise<void> {
    if (!projectFolder) {
      return;
    }

    await scanProjectFolder(projectFolder, allowHomeDirectory);
  }

  function toggleExpanded(path: string): void {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleSelection(node: FileTreeNode): void {
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setToast(null);
    setConfigPreview(null);
    setSelection((current) => toggleNodeSelection(node, current, treeIndex));
  }

  function selectVisibleFiles(): void {
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setToast(null);
    setConfigPreview(null);
    setSelection((current) => selectPaths(collectFilePaths(filteredTree), current, treeIndex));
  }

  function deselectAll(): void {
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setToast(null);
    setConfigPreview(null);
    setSelection(clearSelection());
  }

  async function prepareExportConfig(): Promise<void> {
    const nextConfigPreview = createConfigPreview();
    if (!nextConfigPreview || !canPrepareExport) {
      return;
    }

    setError(null);
    setPrepareResult(null);
    setConfigPreview(nextConfigPreview);
    setIsPreparingExport(true);

    try {
      const result = await window.codeBundle.prepareExportConfig(nextConfigPreview);
      setPrepareResult(result);
    } catch (caughtError) {
      setPrepareResult({
        success: false,
        error: {
          code: "INVALID_EXPORT_CONFIG",
          message: "The export config is invalid.",
          details: caughtError instanceof Error ? caughtError.message : "Unable to prepare export config."
        }
      });
    } finally {
      setIsPreparingExport(false);
    }
  }

  function getSelectedRelativeFilePaths(): string[] {
    return treeIndex.filePaths.filter((relativePath) => isFileSelected(relativePath, selection, treeIndex));
  }

  async function runSecretScanThenAct(nextConfigPreview: CodeBundleConfigPreview, action: PendingAction): Promise<void> {
    setError(null);
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setToast(null);
    setConfigPreview(nextConfigPreview);
    setSecretScanResult(null);
    setPreviewResult(null);
    setShowPreviewModal(false);

    // Step 1: Scan for secrets
    setIsSecretScanning(true);
    setExportStatus("Scanning for secrets...");

    try {
      const relativeFilePaths = getSelectedRelativeFilePaths();
      const scanSecretResult = await window.codeBundle.scanForSecrets({
        projectRoot: projectFolder!,
        filePaths: relativeFilePaths,
        maxFileSizeKb
      });

      if (scanSecretResult.findings.length > 0) {
        // Show warning modal — user decides whether to continue
        setSecretScanResult(scanSecretResult);
        setPendingExportConfig(nextConfigPreview);
        setPendingAction(action);
        setExportStatus(null);
        setIsSecretScanning(false);
        return;
      }
    } catch (caughtError) {
      // Secret scan failure should not block action — warn and continue
      setToast({
        kind: "info",
        title: "Secret scan skipped",
        message: caughtError instanceof Error ? caughtError.message : "Could not scan for secrets."
      });
    } finally {
      setIsSecretScanning(false);
    }

    // Step 2: No secrets found, proceed with action
    if (action === "export") {
      await executeExport(nextConfigPreview);
    } else {
      await executeGeneratePreview(nextConfigPreview);
    }
  }

  async function runExport(): Promise<void> {
    const nextConfigPreview = createConfigPreview();
    if (!nextConfigPreview || !canRunExport) {
      return;
    }
    await runSecretScanThenAct(nextConfigPreview, "export");
  }

  async function generatePreview(): Promise<void> {
    const nextConfigPreview = createConfigPreview();
    if (!nextConfigPreview || !canGeneratePreview) {
      return;
    }
    // Use concrete selected file paths from the UI tree, not folders.
    // The UI tree already reflects default excludes, custom excludes,
    // max-size scan behavior, and .gitignore behavior.
    const selectedFiles = getSelectedRelativeFilePaths();
    const previewConfig = {
      ...nextConfigPreview,
      files: selectedFiles,
      folders: [] as string[]
    };
    await runSecretScanThenAct(previewConfig, "preview");
  }

  function handleSecretScanCancel(): void {
    const action = pendingAction;
    setSecretScanResult(null);
    setPendingExportConfig(null);
    setPendingAction(null);
    setExportStatus(null);
    setToast({
      kind: "info",
      title: action === "preview" ? "Preview cancelled" : "Export cancelled",
      message: action === "preview"
        ? "Preview was cancelled after secret scan findings."
        : "Export was cancelled after secret scan findings."
    });
  }

  async function handleSecretScanContinue(): Promise<void> {
    const config = pendingExportConfig;
    const action = pendingAction;
    setSecretScanResult(null);
    setPendingExportConfig(null);
    setPendingAction(null);
    if (config) {
      if (action === "preview") {
        await executeGeneratePreview(config);
      } else {
        await executeExport(config);
      }
    }
  }

  async function executeGeneratePreview(nextConfigPreview: CodeBundleConfigPreview): Promise<void> {
    setIsGeneratingPreview(true);
    setExportStatus("Generating preview...");

    try {
      const result = await window.codeBundle.generatePreview({
        config: nextConfigPreview,
        maxPreviewLines: DEFAULT_PREVIEW_MAX_LINES,
        maxPreviewBytes: DEFAULT_PREVIEW_MAX_BYTES
      });

      if (result.success) {
        setPreviewResult(result.preview);
        setShowPreviewModal(true);
        setExportStatus(null);
      } else {
        setToast({
          kind: "error",
          title: "Preview failed",
          message: result.error.details ?? result.error.message
        });
        setExportStatus(null);
      }
    } catch (caughtError) {
      setToast({
        kind: "error",
        title: "Preview failed",
        message: caughtError instanceof Error ? caughtError.message : "Could not generate preview."
      });
      setExportStatus(null);
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  function handlePreviewConfirmExport(): void {
    setShowPreviewModal(false);
    const config = configPreview;
    setPreviewResult(null);
    if (config) {
      void executeExport(config);
    }
  }

  function handlePreviewClose(): void {
    setShowPreviewModal(false);
    setPreviewResult(null);
  }

  async function executeExport(nextConfigPreview: CodeBundleConfigPreview): Promise<void> {
    setIsExporting(true);
    setExportStatus("Preparing config...");

    try {
      setExportStatus("Resolving Python...");
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      setExportStatus("Running exporter...");
      const result = await window.codeBundle.runExport(nextConfigPreview);
      setExportResult(result);
      setRevealError(null);
      setExportStatus(result.success ? "Export complete." : null);
      setToast(
        result.success
          ? {
            kind: "success",
            title: "Export completed",
            outputFile: result.outputFile
          }
          : {
            kind: result.error.code === "EXPORT_CANCELLED" ? "info" : "error",
            title: result.error.code === "EXPORT_CANCELLED" ? "Export cancelled" : "Export failed",
            message: result.error.details ?? result.error.message
          }
      );
    } catch (caughtError) {
      const failureResult: RunExportResult = {
        success: false,
        error: {
          code: "EXPORT_FAILED",
          message: "CodeBundle export failed.",
          details: caughtError instanceof Error ? caughtError.message : "Unknown export error."
        }
      };
      setExportResult(failureResult);
      setToast({
        kind: "error",
        title: "Export failed",
        message: failureResult.error.details ?? failureResult.error.message
      });
      setExportStatus(null);
    } finally {
      setIsExporting(false);
    }
  }

  async function cancelExport(): Promise<void> {
    setExportStatus("Cancelling export...");
    const result = await window.codeBundle.cancelExport();
    setExportResult(result);
    setToast({
      kind: "info",
      title: "Export cancelled",
      message: result.success ? undefined : result.error.message
    });
    setIsExporting(false);
    setExportStatus(null);
  }

  function expandAllVisible(): void {
    setExpandedFolders(new Set(collectDirectoryPaths(filteredTree)));
  }

  async function revealOutput(path: string): Promise<void> {
    setRevealError(null);
    const result = await window.codeBundle.revealPath(path);
    if (!result.success) {
      setRevealError(result.error.details ?? result.error.message);
    }
  }

  async function copyOutputPath(path: string): Promise<void> {
    setCopyStatus(null);
    try {
      await navigator.clipboard.writeText(path);
      setCopyStatus("Output path copied.");
    } catch {
      setCopyStatus("Could not copy output path.");
    }
  }

  function collapseAll(): void {
    setExpandedFolders(new Set());
  }

  return (
    <main style={styles.shell}>
      <div style={styles.shellInner}>
        {secretScanResult ? (
          <SecretScanWarning
            scanResult={secretScanResult}
            onCancel={handleSecretScanCancel}
            onContinue={() => void handleSecretScanContinue()}
            continueLabel={pendingAction === "preview" ? "Continue to Preview" : "Continue Anyway"}
            cancelLabel={pendingAction === "preview" ? "Cancel Preview" : "Cancel Export"}
          />
        ) : null}
        {showPreviewModal && previewResult ? (
          <ExportPreviewModal
            preview={previewResult}
            onClose={handlePreviewClose}
            onConfirmExport={handlePreviewConfirmExport}
          />
        ) : null}
        {toast ? (
          <ExportToast
            kind={toast.kind}
            title={toast.title}
            message={toast.message}
            outputFile={toast.outputFile}
            onRevealOutput={(path) => void revealOutput(path)}
            onCopyOutput={(path) => void copyOutputPath(path)}
            onDismiss={() => setToast(null)}
          />
        ) : null}
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>CodeBundle</h1>
            <p style={styles.tagline}>Bundle selected project files into one AI-ready export.</p>
          </div>
          <div style={styles.headerActions}>
            <div style={styles.localBadge}>
              <span style={styles.localDot} />
              Local-first
            </div>
            {appInfo ? <div style={styles.version}>v{appInfo.version}</div> : null}
            <LocalFirstInfo
              defaultExcludes={defaultExcludes}
              isOpen={isInfoOpen}
              onToggle={() => setIsInfoOpen((current) => !current)}
              onClose={() => setIsInfoOpen(false)}
            />
          </div>
        </header>

        {warnings.length > 0 ? <div style={styles.warning}>{warnings.join(" ")}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.grid}>
          <div style={styles.leftColumn}>
            <section style={styles.card}>
              <ProjectPicker
                projectFolder={projectFolder}
                isScanning={isScanning}
                onProjectFolderChange={updateProjectFolder}
                onChooseProjectFolder={() => void chooseProjectFolder()}
                onScanProject={() => void scanSelectedProject()}
                onFolderDropped={(path) => handleFolderDropped(path)}
              />
            </section>

            <section style={styles.card}>
              <ExportControls
                outputFile={outputFile}
                canPrepareExport={canPrepareExport}
                canRunExport={canRunExport}
                canGeneratePreview={canGeneratePreview}
                isPreparingExport={isPreparingExport}
                isExporting={isExporting}
                isSecretScanning={isSecretScanning}
                isGeneratingPreview={isGeneratingPreview}
                exportStatus={exportStatus}
                onOutputFileChange={updateOutputFile}
                onChooseOutputFile={chooseOutputFile}
                onPrepareExport={() => void prepareExportConfig()}
                onRunExport={() => void runExport()}
                onCancelExport={() => void cancelExport()}
                onGeneratePreview={() => void generatePreview()}
              />
            </section>

            <section style={styles.card}>
              <div style={styles.cardHeadingRow}>
                <span style={{ ...styles.iconBadge, ...styles.purpleBadge }}>
                  <img src={settingsIcon} alt="" aria-hidden="true" style={styles.badgeIcon} />
                </span>
                <h2 style={styles.cardHeading}>Export Options</h2>
              </div>
              <section style={styles.options}>
                <label style={styles.fieldLabel}>
                  Max file size KB
                  <input
                    type="number"
                    min={1}
                    value={maxFileSizeKb}
                    onChange={(event) => {
                      setPrepareResult(null);
                      setExportResult(null);
                      setRevealError(null);
                      setCopyStatus(null);
                      setToast(null);
                      setConfigPreview(null);
                      setMaxFileSizeKb(Number(event.target.value) || DEFAULT_MAX_FILE_SIZE_KB);
                    }}
                    style={styles.numberInput}
                  />
                </label>
                <div style={styles.checkRow}>
                  <label style={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={respectGitIgnore}
                      onChange={(event) => {
                        setPrepareResult(null);
                        setExportResult(null);
                        setRevealError(null);
                        setCopyStatus(null);
                        setToast(null);
                        setConfigPreview(null);
                        setRespectGitIgnore(event.target.checked);
                      }}
                    />
                    Respect .gitignore
                  </label>
                  <InlineInfo label="Explain Respect .gitignore">
                    <strong style={styles.infoTitle}>Respect .gitignore</strong>
                    <span>
                      When on, CodeBundle reads the project's root .gitignore and skips matching files/folders during scan
                      and export.
                    </span>
                    <span>
                      When off, CodeBundle ignores .gitignore rules and only applies CodeBundle's default/custom exclude
                      rules.
                    </span>
                    <span>
                      Note: current .gitignore support is lightweight root .gitignore matching, not full Git-compatible
                      nested ignore behavior.
                    </span>
                  </InlineInfo>
                </div>
                <div style={styles.checkRow}>
                  <label style={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={followSymlinks}
                      onChange={(event) => {
                        setPrepareResult(null);
                        setExportResult(null);
                        setRevealError(null);
                        setCopyStatus(null);
                        setToast(null);
                        setConfigPreview(null);
                        setFollowSymlinks(event.target.checked);
                      }}
                    />
                    Follow symlinks
                  </label>
                  <InlineInfo label="Explain Follow symlinks">
                    <strong style={styles.infoTitle}>Follow symlinks</strong>
                    <span>When off, CodeBundle skips symbolic links. This avoids accidentally scanning linked files or folders.</span>
                    <span>
                      When on, CodeBundle follows symbolic links during scan/export. Linked targets are still checked by path
                      safety rules.
                    </span>
                    <span>Recommended: keep this off unless your project intentionally uses linked folders.</span>
                  </InlineInfo>
                </div>
              </section>
            </section>

            <section style={styles.card}>
              <ExcludeRulesEditor
                value={excludeText}
                onChange={(value) => {
                  setPrepareResult(null);
                  setExportResult(null);
                  setRevealError(null);
                  setCopyStatus(null);
                  setToast(null);
                  setConfigPreview(null);
                  setExcludeText(value);
                }}
              />
            </section>
          </div>

          <section style={styles.filesPanel}>
            <div style={styles.filesHeader}>
              <div style={styles.filesTitleBlock}>
                <h2 style={styles.filesHeading}>Files</h2>
                <p style={styles.panelCopy}>Scan a project, then choose files and folders for a future export.</p>
              </div>
              <div style={styles.filesStats}>
                <div style={styles.filesEstimate}>
                  <span style={styles.filesEstimateLabel}>Estimated export files</span>
                  <span style={styles.filesEstimateValue}>{selectionSummary.estimatedExportFileCount}</span>
                </div>
                <div style={styles.tokenStatsRow}>
                  <div style={styles.tokenStat}>
                    <span style={styles.tokenStatLabel}>Size</span>
                    <span style={styles.tokenStatValue}>{formatBytes(selectionSummary.estimatedTotalBytes)}</span>
                  </div>
                  <span style={styles.tokenStatDivider}>·</span>
                  <div style={styles.tokenStat}>
                    <span style={styles.tokenStatLabel}>Tokens</span>
                    <span style={styles.tokenStatValue}>{formatTokenCount(selectionSummary.estimatedTokenCount)}</span>
                  </div>
                </div>
                {selectionSummary.estimatedTokenCount > 0 ? (
                  <div style={styles.contextBadgesRow}>
                    {getContextBadges(selectionSummary.estimatedTokenCount).map((badge) => (
                      <span
                        key={badge.label}
                        style={{
                          ...styles.contextBadge,
                          ...(badge.state === "green" ? styles.contextBadgeGreen : badge.state === "amber" ? styles.contextBadgeAmber : styles.contextBadgeRed)
                        }}
                      >
                        {badge.state === "green" ? "✓" : badge.state === "amber" ? "⚠" : "✗"} {badge.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {scanResult ? (
                  <p style={styles.filesScanText}>
                    Scanned {scanResult.summary.totalFiles} files and {scanResult.summary.totalFolders} folders. Skipped{" "}
                    {scanResult.summary.skippedFiles} files.
                  </p>
                ) : null}
              </div>
            </div>

            <div style={styles.filters}>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search files or folders..."
                style={styles.searchInput}
              />
              <select value={extensionFilter} onChange={(event) => setExtensionFilter(event.target.value)} style={styles.select}>
                <option value="">All extensions</option>
                {extensions.map((extension) => (
                  <option key={extension} value={extension}>
                    {extension}
                  </option>
                ))}
              </select>
              <label style={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={showSelectedOnly}
                  onChange={(event) => setShowSelectedOnly(event.target.checked)}
                />
                Selected only
              </label>
            </div>

            <div style={styles.toolbar}>
              <button type="button" style={styles.smallButton} onClick={selectVisibleFiles} disabled={!scanResult}>
                Select all visible
              </button>
              <button type="button" style={styles.smallButton} onClick={deselectAll} disabled={!scanResult}>
                Deselect all
              </button>
              <button type="button" style={styles.smallButton} onClick={expandAllVisible} disabled={!scanResult}>
                Expand all
              </button>
              <button type="button" style={styles.smallButton} onClick={collapseAll} disabled={!scanResult}>
                Collapse all
              </button>
            </div>

            {scanResult ? (
              <FileTree
                nodes={filteredTree}
                treeIndex={treeIndex}
                selection={selection}
                expandedFolders={expandedFolders}
                onToggleExpanded={toggleExpanded}
                onToggleSelection={toggleSelection}
              />
            ) : (
              <div style={styles.placeholder}>Choose a project folder and scan it to load local file metadata.</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function parseExcludePatterns(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function cleanScannerError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}


const styles = {
  shell: {
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: "34px 38px 38px",
    background: "#f5f7fb",
    color: "#101828",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  },
  shellInner: {
    width: "100%"
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 24
  },
  title: {
    margin: 0,
    color: "#101828",
    fontSize: 44,
    fontWeight: 900,
    letterSpacing: 0
  },
  tagline: {
    margin: "8px 0 0",
    color: "#667085",
    fontSize: 16,
    lineHeight: 1.45
  },
  version: {
    display: "inline-flex",
    alignItems: "center",
    height: 32,
    padding: "0 12px",
    border: "1px solid #d9e0ea",
    borderRadius: 10,
    background: "#ffffff",
    color: "#344054",
    fontSize: 13,
    fontWeight: 700
  },
  localBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 32,
    padding: "0 12px",
    border: "1px solid #d9e0ea",
    borderRadius: 10,
    background: "#ffffff",
    color: "#344054",
    fontSize: 13,
    fontWeight: 700
  },
  localDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    background: "#57b98a",
    boxShadow: "0 0 0 3px #e8f8ef"
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: 10
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "420px minmax(0, 1fr)",
    alignItems: "stretch",
    gap: 20,
    marginTop: 20
  },
  leftColumn: {
    display: "grid",
    gap: 12
  },
  card: {
    boxSizing: "border-box",
    padding: 18,
    border: "1px solid #d9e0ea",
    borderRadius: 18,
    background: "#ffffff",
    boxShadow: "0 10px 24px rgba(16, 24, 40, 0.05)"
  },
  cardHeadingRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14
  },
  iconBadge: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    borderRadius: 999,
    fontSize: 17,
    fontWeight: 800
  },
  badgeIcon: {
    width: 19,
    height: 19,
    display: "block"
  },
  purpleBadge: {
    background: "#eef0ff",
    color: "#4653c8"
  },
  cardHeading: {
    margin: 0,
    color: "#101828",
    fontSize: 18,
    fontWeight: 850,
    letterSpacing: 0
  },
  filesPanel: {
    display: "grid",
    alignContent: "start",
    alignSelf: "stretch",
    gridTemplateRows: "auto auto auto minmax(0, 1fr)",
    gap: 18,
    boxSizing: "border-box",
    minWidth: 0,
    padding: 22,
    border: "1px solid #d9e0ea",
    borderRadius: 20,
    background: "#ffffff",
    boxShadow: "0 12px 32px rgba(16, 24, 40, 0.06)"
  },
  filesHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20
  },
  filesTitleBlock: {
    flex: "1 1 360px",
    minWidth: 0
  },
  filesHeading: {
    margin: 0,
    color: "#101828",
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: 0
  },
  panelCopy: {
    margin: "8px 0 0",
    color: "#667085",
    fontSize: 15,
    lineHeight: 1.45
  },
  filesStats: {
    display: "grid",
    justifyItems: "end",
    gap: 8,
    flex: "0 1 390px",
    minWidth: 280
  },
  filesEstimate: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 12
  },
  filesEstimateLabel: {
    color: "#101828",
    fontSize: 13,
    fontWeight: 800
  },
  filesEstimateValue: {
    color: "#1d7f5f",
    fontSize: 38,
    fontWeight: 900,
    lineHeight: 1
  },
  filesScanText: {
    margin: 0,
    color: "#667085",
    fontSize: 13,
    lineHeight: 1.45,
    textAlign: "right"
  },
  tokenStatsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10
  },
  tokenStat: {
    display: "flex",
    alignItems: "baseline",
    gap: 6
  },
  tokenStatLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: 700
  },
  tokenStatValue: {
    color: "#344054",
    fontSize: 14,
    fontWeight: 850
  },
  tokenStatDivider: {
    color: "#d0d5dd",
    fontSize: 14,
    fontWeight: 700
  },
  contextBadgesRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 6,
    flexWrap: "wrap" as const
  },
  contextBadge: {
    display: "inline-flex",
    alignItems: "center",
    height: 24,
    padding: "0 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 750,
    letterSpacing: 0.2
  },
  contextBadgeGreen: {
    background: "#ecfdf3",
    border: "1px solid #a6f4c5",
    color: "#027a48"
  },
  contextBadgeAmber: {
    background: "#fffaeb",
    border: "1px solid #fedf89",
    color: "#93370d"
  },
  contextBadgeRed: {
    background: "#fef3f2",
    border: "1px solid #fecdca",
    color: "#b42318"
  },
  options: {
    display: "grid",
    gap: 12
  },
  fieldLabel: {
    display: "grid",
    gap: 8,
    color: "#344054",
    fontSize: 13,
    fontWeight: 750
  },
  numberInput: {
    height: 42,
    boxSizing: "border-box",
    padding: "0 12px",
    border: "1px solid #d9e0ea",
    borderRadius: 12,
    background: "#fbfcff",
    color: "#101828",
    fontSize: 14,
    outline: "none"
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#344054",
    fontSize: 13,
    fontWeight: 700
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 24
  },
  infoTitle: {
    color: "#101828",
    fontSize: 12,
    fontWeight: 800
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    marginTop: 6
  },
  searchInput: {
    flex: "1 1 320px",
    height: 44,
    boxSizing: "border-box",
    padding: "0 14px",
    border: "1px solid #d9e0ea",
    borderRadius: 12,
    background: "#ffffff",
    color: "#101828",
    fontSize: 14,
    outline: "none"
  },
  select: {
    flex: "0 0 190px",
    height: 44,
    boxSizing: "border-box",
    padding: "0 12px",
    border: "1px solid #d9e0ea",
    borderRadius: 12,
    background: "#ffffff",
    color: "#101828",
    fontSize: 14,
    outline: "none"
  },
  toggleLabel: {
    display: "flex",
    flex: "0 0 auto",
    alignItems: "center",
    gap: 8,
    height: 44,
    color: "#344054",
    fontSize: 13,
    fontWeight: 750,
    whiteSpace: "nowrap"
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10
  },
  smallButton: {
    height: 40,
    padding: "0 14px",
    border: "1px solid #c8d1df",
    borderRadius: 10,
    background: "#ffffff",
    color: "#243047",
    fontSize: 13,
    fontWeight: 750,
    cursor: "pointer"
  },
  placeholder: {
    display: "grid",
    minHeight: 360,
    height: "100%",
    boxSizing: "border-box",
    placeItems: "center",
    border: "1px dashed #cbd5e1",
    borderRadius: 14,
    background: "#fbfcff",
    color: "#667085",
    fontSize: 14,
    textAlign: "center"
  },
  warning: {
    margin: "0 0 14px",
    padding: 14,
    border: "1px solid #d8cdb8",
    borderRadius: 14,
    background: "#fffaf0",
    color: "#554322",
    fontSize: 14
  },
  error: {
    margin: "0 0 14px",
    padding: 14,
    border: "1px solid #efb5b5",
    borderRadius: 14,
    background: "#fff4f4",
    color: "#8a2b2b",
    fontSize: 14
  }
} as const;
