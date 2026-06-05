interface ExportControlsProps {
  outputFile: string | null;
  canPrepareExport: boolean;
  canRunExport: boolean;
  isPreparingExport: boolean;
  isExporting: boolean;
  isSecretScanning: boolean;
  exportStatus: string | null;
  onOutputFileChange: (value: string) => void;
  onChooseOutputFile: () => void;
  onPrepareExport: () => void;
  onRunExport: () => void;
  onCancelExport: () => void;
}

const fileIcon = new URL("../../../../../resources/icons/file.svg", import.meta.url).href;

export function ExportControls({
  outputFile,
  canPrepareExport,
  canRunExport,
  isPreparingExport,
  isExporting,
  isSecretScanning,
  exportStatus,
  onOutputFileChange,
  onChooseOutputFile,
  onPrepareExport,
  onRunExport,
  onCancelExport
}: ExportControlsProps): JSX.Element {
  return (
    <section style={styles.section}>
      <div style={styles.headingRow}>
        <span style={styles.iconBadge}>
          <img src={fileIcon} alt="" aria-hidden="true" style={styles.badgeIcon} />
        </span>
        <h2 style={styles.heading}>Output File</h2>
      </div>
      <div style={styles.fieldLabel}>
        <span>Output File</span>
        <div style={styles.row}>
          <input
            type="text"
            value={outputFile ?? ""}
            onChange={(event) => onOutputFileChange(event.target.value)}
            placeholder="Paste an absolute .md or .txt output path"
            style={styles.pathInput}
          />
          <button type="button" style={styles.secondaryButton} onClick={onChooseOutputFile}>
            Choose Output
          </button>
        </div>
      </div>
      <div style={styles.actions}>
        <button
          type="button"
          style={canRunExport ? styles.runButton : styles.disabledButton}
          disabled={!canRunExport || isExporting || isSecretScanning}
          onClick={onRunExport}
        >
          {isSecretScanning ? "Scanning for secrets..." : isExporting ? "Exporting..." : "Run Export"}
        </button>
        {isExporting ? (
          <button type="button" style={styles.cancelButton} onClick={onCancelExport}>
            Cancel Export
          </button>
        ) : null}
      </div>
      {exportStatus ? <p style={styles.status}>{exportStatus}</p> : null}
      <details style={styles.advanced}>
        <summary style={styles.advancedSummary}>Advanced / Debug</summary>
        <div style={styles.advancedContent}>
          <button
            type="button"
            style={canPrepareExport ? styles.prepareButton : styles.disabledButton}
            disabled={!canPrepareExport || isPreparingExport || isExporting}
            onClick={onPrepareExport}
          >
            {isPreparingExport ? "Preparing..." : "Prepare Export"}
          </button>
          <p style={styles.note}>Prepare Export only validates and writes a temporary debug config.</p>
        </div>
      </details>
    </section>
  );
}

const styles = {
  section: {
    display: "grid",
    gap: 13
  },
  headingRow: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },
  iconBadge: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "#eaf5ff",
    color: "#2563eb",
    fontSize: 21,
    fontWeight: 900,
    lineHeight: 1
  },
  badgeIcon: {
    width: 20,
    height: 20,
    display: "block"
  },
  heading: {
    margin: 0,
    color: "#101828",
    fontSize: 18,
    fontWeight: 850,
    letterSpacing: 0
  },
  fieldLabel: {
    display: "grid",
    gap: 8,
    color: "#344054",
    fontSize: 13,
    fontWeight: 750
  },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    minWidth: 0
  },
  pathInput: {
    height: 42,
    boxSizing: "border-box",
    minWidth: 0,
    overflow: "hidden",
    padding: "0 12px",
    border: "1px solid #d9e0ea",
    borderRadius: 12,
    background: "#fbfcff",
    color: "#344054",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    outline: "none",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  secondaryButton: {
    height: 42,
    padding: "0 14px",
    border: "1px solid #c8d1df",
    borderRadius: 12,
    background: "#ffffff",
    color: "#243047",
    fontSize: 13,
    fontWeight: 750,
    cursor: "pointer"
  },
  actions: {
    display: "grid",
    gap: 8
  },
  advanced: {
    display: "grid",
    gap: 8,
    marginTop: 2
  },
  advancedSummary: {
    cursor: "pointer",
    color: "#344054",
    fontSize: 13,
    fontWeight: 750
  },
  advancedContent: {
    display: "grid",
    justifyItems: "start",
    gap: 8,
    paddingTop: 2
  },
  disabledButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #d9e0ea",
    borderRadius: 12,
    background: "#edf1f7",
    color: "#707b8e",
    fontSize: 14,
    fontWeight: 800,
    cursor: "not-allowed"
  },
  runButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #243b63",
    borderRadius: 12,
    background: "#243b63",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  },
  prepareButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #1d7f5f",
    borderRadius: 12,
    background: "#1d7f5f",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  },
  cancelButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #b42318",
    borderRadius: 12,
    background: "#ffffff",
    color: "#b42318",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  },
  status: {
    margin: 0,
    color: "#25334a",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.45
  },
  note: {
    margin: 0,
    color: "#687386",
    fontSize: 12,
    lineHeight: 1.45
  }
} as const;
