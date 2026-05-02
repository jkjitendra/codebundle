interface ProjectPickerProps {
  projectFolder: string | null;
  isScanning: boolean;
  onChooseProjectFolder: () => void;
  onScanProject: () => void;
}

export function ProjectPicker({
  projectFolder,
  isScanning,
  onChooseProjectFolder,
  onScanProject
}: ProjectPickerProps): JSX.Element {
  return (
    <section style={styles.section}>
      <div>
        <h2 style={styles.heading}>Project Folder</h2>
        <p style={styles.copy}>Choose the local folder that will become the export root.</p>
      </div>
      <div style={styles.row}>
        <div style={styles.pathValue}>{projectFolder ?? "No project folder selected"}</div>
        <button type="button" style={styles.button} onClick={onChooseProjectFolder}>
          Choose Folder
        </button>
      </div>
      <button type="button" style={styles.scanButton} onClick={onScanProject} disabled={!projectFolder || isScanning}>
        {isScanning ? "Scanning..." : "Scan Project"}
      </button>
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
  button: {
    height: 42,
    padding: "0 14px",
    border: "1px solid #25334a",
    borderRadius: 6,
    background: "#25334a",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 650,
    cursor: "pointer"
  },
  scanButton: {
    height: 42,
    border: "1px solid #1d6f52",
    borderRadius: 6,
    background: "#1d6f52",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  }
} as const;
