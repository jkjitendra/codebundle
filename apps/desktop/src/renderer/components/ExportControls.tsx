interface ExportControlsProps {
  outputFile: string | null;
  canPrepareExport: boolean;
  canRunExport: boolean;
  isPreparingExport: boolean;
  isExporting: boolean;
  onChooseOutputFile: () => void;
  onPrepareExport: () => void;
  onRunExport: () => void;
}

export function ExportControls({
  outputFile,
  canPrepareExport,
  canRunExport,
  isPreparingExport,
  isExporting,
  onChooseOutputFile,
  onPrepareExport,
  onRunExport
}: ExportControlsProps): JSX.Element {
  return (
    <section style={styles.section}>
      <div>
        <h2 style={styles.heading}>Output File</h2>
        <p style={styles.copy}>Choose where the Markdown or text export will be written.</p>
      </div>
      <div style={styles.row}>
        <div style={styles.pathValue}>{outputFile ?? "No output file selected"}</div>
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
        <button
          type="button"
          style={canPrepareExport ? styles.prepareButton : styles.disabledButton}
          disabled={!canPrepareExport || isPreparingExport || isExporting}
          onClick={onPrepareExport}
        >
          {isPreparingExport ? "Preparing..." : "Prepare Export"}
        </button>
      </div>
      <p style={styles.note}>Run Export invokes the local Python exporter. Prepare Export only writes a debug temp config.</p>
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
  pathValue: {
    minHeight: 42,
    display: "flex",
    alignItems: "center",
    overflow: "hidden",
    padding: "0 12px",
    border: "1px solid #d7dce5",
    borderRadius: 6,
    background: "#ffffff",
    color: "#273244",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
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
  note: {
    margin: 0,
    color: "#687386",
    fontSize: 12,
    lineHeight: 1.45
  }
} as const;
