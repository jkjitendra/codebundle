import type { CodeBundleConfigPreview, ScanSummary } from "../lib/types";

interface ExportSummaryProps {
  scanSummary: ScanSummary | null;
  selectedFilesCount: number;
  selectedFoldersCount: number;
  estimatedExportFileCount: number;
  configPreview: CodeBundleConfigPreview | null;
}

export function ExportSummary({
  scanSummary,
  selectedFilesCount,
  selectedFoldersCount,
  estimatedExportFileCount,
  configPreview
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
