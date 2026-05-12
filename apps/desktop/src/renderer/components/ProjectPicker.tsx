interface ProjectPickerProps {
  projectFolder: string | null;
  isScanning: boolean;
  onProjectFolderChange: (value: string) => void;
  onChooseProjectFolder: () => void;
  onScanProject: () => void;
}

const folderIcon = new URL("../../../../../resources/icons/folder.svg", import.meta.url).href;

export function ProjectPicker({
  projectFolder,
  isScanning,
  onProjectFolderChange,
  onChooseProjectFolder,
  onScanProject
}: ProjectPickerProps): JSX.Element {
  return (
    <section style={styles.section}>
      <div style={styles.headingRow}>
        <span style={styles.iconBadge}>
          <img src={folderIcon} alt="" aria-hidden="true" style={styles.badgeIcon} />
        </span>
        <h2 style={styles.heading}>Project Setup</h2>
      </div>
      <div style={styles.fieldLabel}>
        <span>Project Folder</span>
        <div style={styles.row}>
          <input
            type="text"
            value={projectFolder ?? ""}
            onChange={(event) => onProjectFolderChange(event.target.value)}
            placeholder="Paste an absolute project folder path"
            style={styles.pathInput}
          />
          <button type="button" style={styles.button} onClick={onChooseProjectFolder}>
            Choose Folder
          </button>
        </div>
      </div>
      <button type="button" style={styles.scanButton} onClick={onScanProject} disabled={!projectFolder || isScanning}>
        {isScanning ? "Scanning..." : "Scan Project"}
      </button>
      <p style={styles.copy}>Select a folder to scan for files and folders.</p>
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
    background: "#e8f8ef",
    color: "#1d7f5f",
    fontSize: 21,
    fontWeight: 900,
    lineHeight: 1
  },
  badgeIcon: {
    width: 19,
    height: 19,
    display: "block"
  },
  heading: {
    margin: 0,
    color: "#101828",
    fontSize: 18,
    fontWeight: 850,
    letterSpacing: 0
  },
  copy: {
    margin: 0,
    color: "#667085",
    fontSize: 13,
    lineHeight: 1.45
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
  button: {
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
  scanButton: {
    height: 42,
    border: "1px solid #1d7f5f",
    borderRadius: 12,
    background: "#1d7f5f",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  }
} as const;
