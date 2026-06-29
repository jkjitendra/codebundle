import { useCallback, useRef, useState } from "react";

export type ProjectFolderDropResult = { success: true } | { success: false; message?: string };

interface ProjectPickerProps {
  projectFolder: string | null;
  isScanning: boolean;
  onProjectFolderChange: (value: string) => void;
  onChooseProjectFolder: () => void;
  onScanProject: () => void;
  onFolderDropped: (path: string) => Promise<ProjectFolderDropResult>;
}

const folderIcon = new URL("../../../../../resources/icons/folder.svg", import.meta.url).href;
export const DEFAULT_DROP_ERROR_MESSAGE = "Could not use the dropped item. Please drop a folder.";

export function getDropErrorMessage(result: ProjectFolderDropResult): string | null {
  if (result.success) {
    return null;
  }
  return result.message ?? null;
}

export function getDroppedFilePath(
  file: File & { path?: string },
  getPathForFile: (file: File) => string
): string | null {
  try {
    const pathFromBridge = getPathForFile(file);
    if (pathFromBridge.length > 0) {
      return pathFromBridge;
    }
  } catch {
    // Fall back to legacy Electron File.path behavior below.
  }

  return file.path && file.path.length > 0 ? file.path : null;
}

export function ProjectPicker({
  projectFolder,
  isScanning,
  onProjectFolderChange,
  onChooseProjectFolder,
  onScanProject,
  onFolderDropped
}: ProjectPickerProps): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropErrorMessage, setDropErrorMessage] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
      setDropErrorMessage(null);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Signal we accept this drop
    if (event.dataTransfer.types.includes("Files")) {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
      setDropErrorMessage(null);
    }
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    setDropErrorMessage(null);

    const items = Array.from(event.dataTransfer.files);
    if (items.length === 0) {
      return;
    }

    // Electron 32+ requires webUtils.getPathForFile; keep File.path fallback for older runtimes.
    const file = event.dataTransfer.files[0] as File & { path?: string };
    const droppedPath = getDroppedFilePath(file, window.codeBundle.getPathForFile);

    if (!droppedPath) {
      setDropErrorMessage(DEFAULT_DROP_ERROR_MESSAGE);
      return;
    }

    const result = await onFolderDropped(droppedPath);
    setDropErrorMessage(getDropErrorMessage(result));
  }, [onFolderDropped]);

  const dropZoneStyle = dropErrorMessage
    ? styles.dropZoneError
    : isDragOver
      ? styles.dropZoneActive
      : styles.dropZone;

  return (
    <section style={styles.section}>
      <div style={styles.headingRow}>
        <span style={styles.iconBadge}>
          <img src={folderIcon} alt="" aria-hidden="true" style={styles.badgeIcon} />
        </span>
        <h2 style={styles.heading}>Project Setup</h2>
      </div>

      {/* Drop zone wraps the entire input row */}
      <div
        style={dropZoneStyle}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => void handleDrop(e)}
        role="region"
        aria-label="Project folder drop zone"
        aria-dropeffect="copy"
      >
        {isDragOver ? (
          <div style={styles.dropOverlay}>
            <span style={styles.dropIcon}>📂</span>
            <span style={styles.dropLabel}>Drop folder to set as project root</span>
          </div>
        ) : (
          <div style={styles.fieldLabel}>
            <span>Project Folder</span>
            <div style={styles.row}>
              <input
                id="project-folder-input"
                type="text"
                value={projectFolder ?? ""}
                onChange={(event) => onProjectFolderChange(event.target.value)}
                placeholder="Paste a path or drag a folder here"
                style={styles.pathInput}
                aria-label="Project folder path"
              />
              <button type="button" style={styles.button} onClick={onChooseProjectFolder}>
                Choose Folder
              </button>
            </div>
            {dropErrorMessage ? (
              <p style={styles.dropErrorText} role="alert">
                {dropErrorMessage}
              </p>
            ) : (
              <p style={styles.dropHint}>
                Or drag &amp; drop a folder anywhere in this box
              </p>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        style={styles.scanButton}
        onClick={onScanProject}
        disabled={!projectFolder || isScanning}
      >
        {isScanning ? "Scanning..." : "Scan Project"}
      </button>
      <p style={styles.copy}>Select a folder to scan for files and folders.</p>
    </section>
  );
}

const dropZoneBase = {
  borderRadius: 14,
  border: "2px dashed #d9e0ea",
  background: "#fbfcff",
  transition: "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease",
  minHeight: 84,
  padding: "14px 14px 10px"
} as const;

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
  // Drop zone variants
  dropZone: {
    ...dropZoneBase
  },
  dropZoneActive: {
    ...dropZoneBase,
    border: "2px dashed #1d7f5f",
    background: "#f0faf5",
    boxShadow: "0 0 0 4px rgba(29, 127, 95, 0.10)"
  },
  dropZoneError: {
    ...dropZoneBase,
    border: "2px dashed #d92d20",
    background: "#fff5f5"
  },
  dropOverlay: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    pointerEvents: "none" as const
  },
  dropIcon: {
    fontSize: 28,
    lineHeight: 1
  },
  dropLabel: {
    color: "#1d7f5f",
    fontSize: 13,
    fontWeight: 750
  },
  dropHint: {
    margin: "4px 0 0",
    color: "#98a2b3",
    fontSize: 12,
    lineHeight: 1.4
  },
  dropErrorText: {
    margin: "4px 0 0",
    color: "#d92d20",
    fontSize: 12,
    lineHeight: 1.4
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
    boxSizing: "border-box" as const,
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
    whiteSpace: "nowrap" as const
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
