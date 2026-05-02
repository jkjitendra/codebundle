import type { CodeBundleConfigPreview, PrepareExportConfigResult, RunExportResult, ScanSummary } from "../lib/types";

interface ExportSummaryProps {
  scanSummary: ScanSummary | null;
  selectedFilesCount: number;
  selectedFoldersCount: number;
  estimatedExportFileCount: number;
  configPreview: CodeBundleConfigPreview | null;
  prepareResult: PrepareExportConfigResult | null;
  exportResult: RunExportResult | null;
  revealError: string | null;
  copyStatus: string | null;
  onRevealOutput: (path: string) => void;
  onCopyOutput: (path: string) => void;
}

export function ExportSummary({
  scanSummary,
  selectedFilesCount,
  selectedFoldersCount,
  estimatedExportFileCount,
  configPreview,
  prepareResult,
  exportResult,
  revealError,
  copyStatus,
  onRevealOutput,
  onCopyOutput
}: ExportSummaryProps): JSX.Element {
  return (
    <section style={styles.section}>
      <h2 style={styles.heading}>Selection Summary</h2>
      <div style={styles.metrics}>
        <Metric label="Selected files" value={selectedFilesCount} />
        <Metric label="Selected folders" value={selectedFoldersCount} />
        <Metric label="Estimated export files" value={estimatedExportFileCount} />
      </div>
      {scanSummary ? (
        <div style={styles.scanStats}>
          Scanned {scanSummary.totalFiles} files and {scanSummary.totalFolders} folders. Skipped{" "}
          {scanSummary.skippedFiles} files.
        </div>
      ) : null}
      {prepareResult ? (
        prepareResult.success ? (
          <div style={styles.successBox}>
            <strong>Config prepared</strong>
            <span>Temp config: {prepareResult.tempConfigPath}</span>
            <span>Output file: {prepareResult.summary.outputFile}</span>
            <span>
              Files {prepareResult.summary.filesCount}, folders {prepareResult.summary.foldersCount}, excludes{" "}
              {prepareResult.summary.excludeCount}
            </span>
          </div>
        ) : (
          <div style={styles.errorBox}>
            <strong>{prepareResult.error.code}</strong>
            <span>{prepareResult.error.details}</span>
          </div>
        )
      ) : null}
      {exportResult ? (
        exportResult.success ? (
          <div style={styles.successBox}>
            <strong>Export complete</strong>
            <span>Output file: {exportResult.outputFile}</span>
            <span>Exported files: {exportResult.summary.exportedFiles}</span>
            <span>
              Skipped binary {exportResult.summary.skippedBinary}, large {exportResult.summary.skippedLarge}, excluded{" "}
              {exportResult.summary.skippedExcluded}
            </span>
            <span>
              Skipped missing {exportResult.summary.skippedMissing}, invalid {exportResult.summary.skippedInvalid}
            </span>
            <div style={styles.actionRow}>
              <button type="button" style={styles.revealButton} onClick={() => onRevealOutput(exportResult.outputFile)}>
                Reveal Output
              </button>
              <button type="button" style={styles.revealButton} onClick={() => onCopyOutput(exportResult.outputFile)}>
                Copy output path
              </button>
            </div>
            {revealError ? <span>{revealError}</span> : null}
            {copyStatus ? <span>{copyStatus}</span> : null}
          </div>
        ) : (
          <div style={styles.errorBox}>
            <strong>{exportResult.error.code}</strong>
            <span>{exportResult.error.message}</span>
            {exportResult.error.details ? <span>{exportResult.error.details}</span> : null}
          </div>
        )
      ) : null}
      {configPreview ? (
        <details style={styles.details}>
          <summary style={styles.summary}>Config preview</summary>
          <pre style={styles.pre}>{JSON.stringify(configPreview, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div style={styles.metric}>
      <span style={styles.metricValue}>{value}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  );
}

const styles = {
  section: {
    display: "grid",
    gap: 12
  },
  heading: {
    margin: 0,
    color: "#162032",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10
  },
  metric: {
    display: "grid",
    gap: 3,
    padding: 10,
    border: "1px solid #dfe4ec",
    borderRadius: 6,
    background: "#fbfcfe"
  },
  metricValue: {
    color: "#162032",
    fontSize: 22,
    fontWeight: 800
  },
  metricLabel: {
    color: "#687386",
    fontSize: 12
  },
  scanStats: {
    color: "#596477",
    fontSize: 13,
    lineHeight: 1.45
  },
  successBox: {
    display: "grid",
    gap: 5,
    padding: 12,
    border: "1px solid #a8d7c1",
    borderRadius: 6,
    background: "#f0fbf5",
    color: "#1c5c43",
    fontSize: 12,
    lineHeight: 1.45,
    overflowWrap: "anywhere"
  },
  errorBox: {
    display: "grid",
    gap: 5,
    padding: 12,
    border: "1px solid #efb5b5",
    borderRadius: 6,
    background: "#fff4f4",
    color: "#8a2b2b",
    fontSize: 12,
    lineHeight: 1.45,
    overflowWrap: "anywhere"
  },
  revealButton: {
    justifySelf: "start",
    height: 32,
    padding: "0 11px",
    border: "1px solid #1d6f52",
    borderRadius: 6,
    background: "#ffffff",
    color: "#1d6f52",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8
  },
  details: {
    display: "grid",
    gap: 8
  },
  summary: {
    cursor: "pointer",
    color: "#25334a",
    fontSize: 13,
    fontWeight: 700
  },
  pre: {
    maxHeight: 260,
    overflow: "auto",
    margin: 0,
    padding: 12,
    border: "1px solid #dfe4ec",
    borderRadius: 6,
    background: "#101827",
    color: "#edf2f7",
    fontSize: 12,
    lineHeight: 1.45
  }
} as const;
