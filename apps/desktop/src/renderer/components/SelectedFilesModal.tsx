import { useEffect, useMemo, useState } from "react";

const ROW_HEIGHT = 40;
const LIST_HEIGHT = 400;
const OVERSCAN = 8;

interface SelectedFilesModalProps {
  projectName: string;
  files: string[];
  onClose: () => void;
  onDeselect: (path: string) => void;
}

/**
 * A lightweight, virtualized view of the effective file selection. The list
 * derives directly from the current selection model, so deselected files
 * disappear immediately rather than becoming stale modal state.
 */
export function SelectedFilesModal({
  projectName,
  files,
  onClose,
  onDeselect
}: SelectedFilesModalProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return files;
    }
    return files.filter((path) => path.toLowerCase().includes(normalizedQuery));
  }, [files, query]);
  const requestedStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const startIndex = Math.min(requestedStartIndex, Math.max(0, filteredFiles.length - 1));
  const visibleCount = Math.ceil(LIST_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(filteredFiles.length, startIndex + visibleCount);
  const visibleFiles = filteredFiles.slice(startIndex, endIndex);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setScrollTop(0);
  }, [query]);

  return (
    <div style={styles.overlay} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="selected-files-title"
        style={styles.modal}
      >
        <div style={styles.header}>
          <div>
            <h2 id="selected-files-title" style={styles.title}>Selected files</h2>
            <p style={styles.copy}>
              {projectName} · {files.length.toLocaleString("en-US")} selected
            </p>
          </div>
          <button type="button" aria-label="Close selected files" onClick={onClose} style={styles.closeButton}>×</button>
        </div>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter selected files…"
          style={styles.searchInput}
          autoFocus
        />

        <div
          style={styles.list}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          aria-label="Selected files"
        >
          {filteredFiles.length > 0 ? (
            <div style={{ ...styles.virtualSpace, height: filteredFiles.length * ROW_HEIGHT }}>
              <div style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}>
                {visibleFiles.map((path) => (
                  <div key={path} style={styles.fileRow}>
                    <code style={styles.filePath} title={path}>{path}</code>
                    <button type="button" onClick={() => onDeselect(path)} style={styles.deselectButton}>
                      Deselect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={styles.empty}>
              {files.length === 0 ? "No files are selected." : "No selected files match this filter."}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <span style={styles.footerCopy}>Deselecting a file updates the tree and this list immediately.</span>
          <button type="button" onClick={onClose} style={styles.doneButton}>Done</button>
        </div>
      </section>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 9000,
    display: "grid",
    placeItems: "center",
    padding: 18,
    background: "rgba(16, 24, 40, 0.55)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)"
  },
  modal: {
    width: "min(760px, 94vw)",
    display: "grid",
    gap: 14,
    boxSizing: "border-box" as const,
    padding: "24px 26px 22px",
    borderRadius: 20,
    background: "#ffffff",
    boxShadow: "0 24px 64px rgba(16, 24, 40, 0.18), 0 4px 12px rgba(16, 24, 40, 0.08)"
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16
  },
  title: {
    margin: 0,
    color: "#101828",
    fontSize: 20,
    fontWeight: 850
  },
  copy: {
    margin: "5px 0 0",
    color: "#667085",
    fontSize: 13,
    fontWeight: 650
  },
  closeButton: {
    width: 32,
    height: 32,
    border: "1px solid #d9e0ea",
    borderRadius: 10,
    background: "#ffffff",
    color: "#667085",
    cursor: "pointer",
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1
  },
  searchInput: {
    height: 42,
    boxSizing: "border-box" as const,
    padding: "0 13px",
    border: "1px solid #d9e0ea",
    borderRadius: 10,
    background: "#fbfcff",
    color: "#101828",
    fontSize: 14,
    outline: "none"
  },
  list: {
    height: LIST_HEIGHT,
    overflow: "auto" as const,
    border: "1px solid #e1e7ef",
    borderRadius: 12,
    background: "#fbfcff"
  },
  virtualSpace: {
    position: "relative" as const,
    minHeight: "100%"
  },
  fileRow: {
    height: ROW_HEIGHT,
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxSizing: "border-box" as const,
    padding: "0 10px 0 14px",
    borderBottom: "1px solid #edf1f6"
  },
  filePath: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    color: "#344054",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const
  },
  deselectButton: {
    flexShrink: 0,
    height: 28,
    padding: "0 10px",
    border: "1px solid #f4b4ae",
    borderRadius: 8,
    background: "#fff7f6",
    color: "#b42318",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 750
  },
  empty: {
    display: "grid",
    height: "100%",
    placeItems: "center",
    padding: 20,
    color: "#667085",
    fontSize: 14
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14
  },
  footerCopy: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 1.4
  },
  doneButton: {
    flexShrink: 0,
    height: 38,
    padding: "0 17px",
    border: "1px solid #243b63",
    borderRadius: 10,
    background: "#243b63",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800
  }
} as const;
