import { useEffect, useMemo, useState } from "react";
import { ExcludeRulesEditor } from "./components/ExcludeRulesEditor";
import { ExportControls } from "./components/ExportControls";
import { ExportSummary } from "./components/ExportSummary";
import { FileTree } from "./components/FileTree";
import { ProjectPicker } from "./components/ProjectPicker";
import { WarningPanel } from "./components/WarningPanel";
import { buildConfigPreview, clearSelection, getSelectionSummary, selectFiles, toggleNodeSelection } from "./lib/selection";
import { buildFileTree, collectDirectoryPaths, collectExtensions, collectFilePaths, filterTree } from "./lib/treeUtils";
import type {
  AppInfo,
  CodeBundlePreferences,
  FileTreeNode,
  PrepareExportConfigResult,
  RunExportResult,
  ScanProjectResult
} from "./lib/types";

const DEFAULT_MAX_FILE_SIZE_KB = 500;

export default function App(): JSX.Element {
  const [projectFolder, setProjectFolder] = useState<string | null>(null);
  const [outputFile, setOutputFile] = useState<string | null>(null);
  const [defaultExcludes, setDefaultExcludes] = useState<string[]>([]);
  const [excludeText, setExcludeText] = useState("");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [scanResult, setScanResult] = useState<ScanProjectResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
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
  const [prepareResult, setPrepareResult] = useState<PrepareExportConfigResult | null>(null);
  const [exportResult, setExportResult] = useState<RunExportResult | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const tree = useMemo(() => buildFileTree(scanResult?.nodes ?? []), [scanResult]);
  const filteredTree = useMemo(
    () =>
      filterTree(tree, {
        search,
        extension: extensionFilter,
        showSelectedOnly,
        selectedFiles
      }),
    [tree, search, extensionFilter, showSelectedOnly, selectedFiles]
  );
  const extensions = useMemo(() => collectExtensions(tree), [tree]);
  const excludePatterns = useMemo(() => parseExcludePatterns(excludeText), [excludeText]);
  const configExcludePatterns = useMemo(
    () => [...new Set([...defaultExcludes, ...excludePatterns])],
    [defaultExcludes, excludePatterns]
  );
  const selectionSummary = useMemo(() => getSelectionSummary(tree, selectedFiles), [tree, selectedFiles]);
  const outputFormat = outputFile?.toLowerCase().endsWith(".txt") ? "text" : "markdown";
  const configPreview = useMemo(() => {
    if (!projectFolder || !outputFile || !scanResult) {
      return null;
    }
    return buildConfigPreview({
      projectRoot: projectFolder,
      outputFile,
      format: outputFormat,
      tree,
      selectedFiles,
      exclude: configExcludePatterns,
      maxFileSizeKb,
      respectGitIgnore,
      followSymlinks
    });
  }, [
    projectFolder,
    outputFile,
    scanResult,
    outputFormat,
    tree,
    selectedFiles,
    configExcludePatterns,
    maxFileSizeKb,
    respectGitIgnore,
    followSymlinks
  ]);
  const canPrepareExport =
    Boolean(configPreview && (configPreview.mode === "all" || configPreview.include.length > 0 || configPreview.files.length + configPreview.folders.length > 0)) &&
    !isPreparingExport &&
    !isExporting;
  const canRunExport = canPrepareExport;

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
        setSelectedFiles(clearSelection());
        setExpandedFolders(new Set());
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to choose a project folder.");
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
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to choose an output file.");
    }
  }

  async function scanSelectedProject(allowHomeDirectory = false): Promise<void> {
    if (!projectFolder) {
      return;
    }

    setError(null);
    setWarnings([]);
    setIsScanning(true);

    try {
      const result = await window.codeBundle.scanProject({
        projectRoot: projectFolder,
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
      setSelectedFiles(clearSelection());
      setExpandedFolders(new Set(result.nodes.filter((node) => node.type === "directory").map((node) => node.path)));
      setWarnings(result.warnings ?? []);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to scan project folder.";
      if (message.includes("HOME_DIRECTORY_REQUIRES_CONFIRMATION")) {
        const confirmed = window.confirm("Scanning your home directory can include many personal files. Continue?");
        if (confirmed) {
          await scanSelectedProject(true);
          return;
        }
      } else {
        setError(cleanScannerError(message));
      }
    } finally {
      setIsScanning(false);
    }
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
    setSelectedFiles((current) => toggleNodeSelection(node, current));
  }

  function selectVisibleFiles(): void {
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setSelectedFiles((current) => selectFiles(collectFilePaths(filteredTree), current));
  }

  function deselectAll(): void {
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setSelectedFiles(clearSelection());
  }

  async function prepareExportConfig(): Promise<void> {
    if (!configPreview || !canPrepareExport) {
      return;
    }

    setError(null);
    setPrepareResult(null);
    setIsPreparingExport(true);

    try {
      const result = await window.codeBundle.prepareExportConfig(configPreview);
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

  async function runExport(): Promise<void> {
    if (!configPreview || !canRunExport) {
      return;
    }

    setError(null);
    setPrepareResult(null);
    setExportResult(null);
    setRevealError(null);
    setCopyStatus(null);
    setIsExporting(true);
    setExportStatus("Preparing config...");

    try {
      setExportStatus("Resolving Python...");
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      setExportStatus("Running exporter...");
      const result = await window.codeBundle.runExport(configPreview);
      setExportResult(result);
      setRevealError(null);
      setExportStatus(result.success ? "Export complete." : null);
    } catch (caughtError) {
      setExportResult({
        success: false,
        error: {
          code: "EXPORT_FAILED",
          message: "CodeBundle export failed.",
          details: caughtError instanceof Error ? caughtError.message : "Unknown export error."
        }
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
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>CodeBundle</h1>
          <p style={styles.tagline}>Bundle project files into one AI-ready export.</p>
        </div>
        {appInfo ? <div style={styles.version}>v{appInfo.version}</div> : null}
      </header>

      <WarningPanel defaultExcludes={defaultExcludes} />

      {warnings.length > 0 ? <div style={styles.warning}>{warnings.join(" ")}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.grid}>
        <section style={styles.panel}>
          <ProjectPicker
            projectFolder={projectFolder}
            isScanning={isScanning}
            onChooseProjectFolder={chooseProjectFolder}
            onScanProject={() => void scanSelectedProject()}
          />
          <div style={styles.divider} />
          <ExportControls
            outputFile={outputFile}
            canPrepareExport={canPrepareExport}
            canRunExport={canRunExport}
            isPreparingExport={isPreparingExport}
            isExporting={isExporting}
            exportStatus={exportStatus}
            onChooseOutputFile={chooseOutputFile}
            onPrepareExport={() => void prepareExportConfig()}
            onRunExport={() => void runExport()}
            onCancelExport={() => void cancelExport()}
          />
          <div style={styles.divider} />
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
                  setMaxFileSizeKb(Number(event.target.value) || DEFAULT_MAX_FILE_SIZE_KB);
                }}
                style={styles.numberInput}
              />
            </label>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={respectGitIgnore}
                onChange={(event) => {
                  setPrepareResult(null);
                  setExportResult(null);
                  setRevealError(null);
                  setCopyStatus(null);
                  setRespectGitIgnore(event.target.checked);
                }}
              />
              Respect .gitignore
            </label>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={followSymlinks}
                onChange={(event) => {
                  setPrepareResult(null);
                  setExportResult(null);
                  setRevealError(null);
                  setCopyStatus(null);
                  setFollowSymlinks(event.target.checked);
                }}
              />
              Follow symlinks
            </label>
          </section>
          <div style={styles.divider} />
          <ExcludeRulesEditor
            value={excludeText}
            onChange={(value) => {
              setPrepareResult(null);
              setExportResult(null);
              setRevealError(null);
              setCopyStatus(null);
              setExcludeText(value);
            }}
          />
          <div style={styles.divider} />
          <ExportSummary
            scanSummary={scanResult?.summary ?? null}
            selectedFilesCount={selectionSummary.selectedFilesCount}
            selectedFoldersCount={selectionSummary.selectedFoldersCount}
            estimatedExportFileCount={selectionSummary.estimatedExportFileCount}
            configPreview={configPreview}
            prepareResult={prepareResult}
            exportResult={exportResult}
            revealError={revealError}
            copyStatus={copyStatus}
            onRevealOutput={(path) => void revealOutput(path)}
            onCopyOutput={(path) => void copyOutputPath(path)}
          />
        </section>

        <section style={styles.panel}>
          <div>
            <h2 style={styles.panelHeading}>Files</h2>
            <p style={styles.panelCopy}>Scan a project, then choose files and folders for a future export.</p>
          </div>

          <div style={styles.filters}>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search files"
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
              selectedFiles={selectedFiles}
              expandedFolders={expandedFolders}
              onToggleExpanded={toggleExpanded}
              onToggleSelection={toggleSelection}
            />
          ) : (
            <div style={styles.placeholder}>Choose a project folder and scan it to load local file metadata.</div>
          )}
        </section>
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
    padding: 28,
    background: "#f7f8fb",
    color: "#162032",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 22
  },
  title: {
    margin: 0,
    color: "#121a2a",
    fontSize: 34,
    fontWeight: 800,
    letterSpacing: 0
  },
  tagline: {
    margin: "7px 0 0",
    color: "#596477",
    fontSize: 16,
    lineHeight: 1.45
  },
  version: {
    padding: "5px 9px",
    border: "1px solid #d7dce5",
    borderRadius: 6,
    background: "#ffffff",
    color: "#596477",
    fontSize: 12,
    fontWeight: 700
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(360px, 0.74fr) minmax(420px, 1.26fr)",
    gap: 18,
    marginTop: 18
  },
  panel: {
    display: "grid",
    gap: 18,
    alignContent: "start",
    padding: 20,
    border: "1px solid #dfe4ec",
    borderRadius: 8,
    background: "#ffffff",
    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)"
  },
  divider: {
    height: 1,
    background: "#e8ecf2"
  },
  panelHeading: {
    margin: 0,
    color: "#162032",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0
  },
  panelCopy: {
    margin: "5px 0 0",
    color: "#596477",
    fontSize: 14,
    lineHeight: 1.45
  },
  options: {
    display: "grid",
    gap: 10
  },
  fieldLabel: {
    display: "grid",
    gap: 6,
    color: "#344054",
    fontSize: 13,
    fontWeight: 700
  },
  numberInput: {
    height: 38,
    padding: "0 10px",
    border: "1px solid #d7dce5",
    borderRadius: 6,
    color: "#273244",
    fontSize: 14
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#344054",
    fontSize: 13,
    fontWeight: 650
  },
  filters: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 150px auto",
    alignItems: "center",
    gap: 10
  },
  searchInput: {
    height: 38,
    padding: "0 11px",
    border: "1px solid #d7dce5",
    borderRadius: 6,
    color: "#273244",
    fontSize: 14
  },
  select: {
    height: 38,
    padding: "0 9px",
    border: "1px solid #d7dce5",
    borderRadius: 6,
    background: "#ffffff",
    color: "#273244",
    fontSize: 14
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#344054",
    fontSize: 13,
    fontWeight: 650,
    whiteSpace: "nowrap"
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8
  },
  smallButton: {
    height: 34,
    padding: "0 11px",
    border: "1px solid #a7b0c0",
    borderRadius: 6,
    background: "#ffffff",
    color: "#25334a",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer"
  },
  placeholder: {
    display: "grid",
    minHeight: 260,
    placeItems: "center",
    border: "1px dashed #b7bfce",
    borderRadius: 6,
    background: "#fbfcfe",
    color: "#6a7485",
    fontSize: 14,
    textAlign: "center"
  },
  warning: {
    marginTop: 14,
    padding: 12,
    border: "1px solid #d8cdb8",
    borderRadius: 6,
    background: "#fffaf0",
    color: "#554322",
    fontSize: 14
  },
  error: {
    marginTop: 14,
    padding: 12,
    border: "1px solid #efb5b5",
    borderRadius: 6,
    background: "#fff4f4",
    color: "#8a2b2b",
    fontSize: 14
  }
} as const;
