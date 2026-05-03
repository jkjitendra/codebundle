interface ExportControlsProps {
  outputFile: string | null;
  canPrepareExport: boolean;
  canRunExport: boolean;
  isPreparingExport: boolean;
  isExporting: boolean;
  exportStatus: string | null;
  onOutputFileChange: (value: string) => void;
  onChooseOutputFile: () => void;
  onPrepareExport: () => void;
  onRunExport: () => void;
  onCancelExport: () => void;
}

export function ExportControls({
  outputFile,
  canPrepareExport,
  canRunExport,
  isPreparingExport,
  isExporting,
  exportStatus,
  onOutputFileChange,
  onChooseOutputFile,
  onPrepareExport,
  onRunExport,
  onCancelExport
}: ExportControlsProps): JSX.Element {
  return (
    <section style={styles.section}>
      <div>
        <h2 style={styles.heading}>Output File</h2>
        <p style={styles.copy}>Choose where the Markdown or text export will be written.</p>
      </div>
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
      <div style={styles.actions}>
        <button
          type="button"
          style={canRunExport ? styles.runButton : styles.disabledButton}
          disabled={!canRunExport || isExporting}
          onClick={onRunExport}
        >
          {isExporting ? "Exporting..." : "Run Export"}
        </button>
        {isExporting ? (
          <button type="button" style={styles.cancelButton} onClick={onCancelExport}>
            Cancel Export
          </button>
        ) : null}
        <button
          type="button"
          style={canPrepareExport ? styles.prepareButton : styles.disabledButton}
          disabled={!canPrepareExport || isPreparingExport || isExporting}
          onClick={onPrepareExport}
        >
          {isPreparingExport ? "Preparing..." : "Prepare Export"}
        </button>
      </div>
      {exportStatus ? <p style={styles.status}>{exportStatus}</p> : null}
      <p style={styles.note}>
        <b>Run Export</b> creates the final Markdown/TXT file.<br />
        <b>Prepare Export</b> only validates and writes a temporary debug config.
      </p>
    </section>
  );
}

const styles = {
  section: {
    display: "grid",
    gap: 14
  },
  heading: {
    margin: 0,
    color: "#162032",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0
  },
  copy: {
    margin: "5px 0 0",
    color: "#596477",
    fontSize: 14,
    lineHeight: 1.45
  },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10
  },
  pathInput: {
    height: 42,
    minWidth: 0,
    overflow: "hidden",
    padding: "0 12px",
    border: "1px solid #d7dce5",
    borderRadius: 6,
    background: "#ffffff",
    color: "#273244",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxSizing: "border-box"
  },
  secondaryButton: {
    height: 42,
    padding: "0 14px",
    border: "1px solid #a7b0c0",
    borderRadius: 6,
    background: "#ffffff",
    color: "#25334a",
    fontSize: 14,
    fontWeight: 650,
    cursor: "pointer"
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap"
  },
  disabledButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #c4cad5",
    borderRadius: 6,
    background: "#e4e8ef",
    color: "#707b8e",
    fontSize: 14,
    fontWeight: 700,
    cursor: "not-allowed"
  },
  runButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #25334a",
    borderRadius: 6,
    background: "#25334a",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  },
  prepareButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #1d6f52",
    borderRadius: 6,
    background: "#1d6f52",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  },
  cancelButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #b42318",
    borderRadius: 6,
    background: "#ffffff",
    color: "#b42318",
    fontSize: 14,
    fontWeight: 700,
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
