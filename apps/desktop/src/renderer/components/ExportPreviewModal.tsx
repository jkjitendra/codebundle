import { useState } from "react";
import type { PreviewResult } from "../lib/types";

interface ExportPreviewModalProps {
  preview: PreviewResult;
  onClose: () => void;
  onConfirmExport: () => void;
}

export const TRUNCATED_COPY_NOTICE = "Copy Preview copies only the visible preview, not the full export.";

export function getPreviewStats(preview: PreviewResult): Array<{ label: string; value: string }> {
  return [
    { label: "Selected files:", value: preview.totalSelectedFiles.toLocaleString("en-US") },
    { label: "Previewed files:", value: preview.previewedFiles.toLocaleString("en-US") },
    { label: "Lines:", value: preview.totalLines.toLocaleString("en-US") }
  ];
}

export function getCopyPreviewContent(preview: PreviewResult): string {
  return preview.content;
}

export function ExportPreviewModal({
  preview,
  onClose,
  onConfirmExport
}: ExportPreviewModalProps): JSX.Element {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const previewStats = getPreviewStats(preview);

  async function copyPreview(): Promise<void> {
    try {
      await navigator.clipboard.writeText(getCopyPreviewContent(preview));
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus("Copy failed.");
      setTimeout(() => setCopyStatus(null), 2000);
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.previewIcon}>👁</span>
            <h2 style={styles.title}>Export Preview</h2>
          </div>
          <button type="button" aria-label="Close preview" onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.statsBar}>
          <span style={styles.formatBadge}>
            {preview.format === "markdown" ? "Markdown" : "Text"}
          </span>
          {previewStats.map((stat, index) => (
            <span key={stat.label} style={styles.statGroup}>
              {index > 0 ? <span style={styles.statDivider}>·</span> : null}
              <span style={styles.statItem}>
                <span style={styles.statLabel}>{stat.label}</span>
                <span style={styles.statValue}>{stat.value}</span>
              </span>
            </span>
          ))}
          {preview.truncated ? (
            <span style={styles.truncatedBadge}>Truncated</span>
          ) : null}
        </div>

        {preview.truncated ? (
          <p style={styles.truncatedNotice}>
            Preview is truncated. The full export will include all selected files. {TRUNCATED_COPY_NOTICE}
          </p>
        ) : null}

        <div style={styles.contentWrapper}>
          <pre style={styles.content}>{preview.content}</pre>
        </div>

        <div style={styles.actions}>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            Close
          </button>
          <button type="button" style={styles.copyButton} onClick={() => void copyPreview()}>
            {copyStatus ?? "Copy Preview"}
          </button>
          <button type="button" style={styles.confirmButton} onClick={onConfirmExport}>
            Confirm Export
          </button>
        </div>
      </div>
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
    background: "rgba(16, 24, 40, 0.55)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)"
  },
  modal: {
    width: "min(860px, 94vw)",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
    boxSizing: "border-box" as const,
    padding: "24px 26px 22px",
    borderRadius: 20,
    background: "#ffffff",
    boxShadow: "0 24px 64px rgba(16, 24, 40, 0.18), 0 4px 12px rgba(16, 24, 40, 0.08)",
    overflow: "hidden" as const
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },
  previewIcon: {
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "#eef0ff",
    fontSize: 18,
    lineHeight: 1,
    flexShrink: 0
  },
  title: {
    margin: 0,
    color: "#101828",
    fontSize: 20,
    fontWeight: 850,
    letterSpacing: 0
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
    display: "grid",
    placeItems: "center",
    flexShrink: 0
  },
  statsBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap" as const
  },
  formatBadge: {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: "0 10px",
    borderRadius: 8,
    background: "#eef0ff",
    border: "1px solid #c7cbf2",
    color: "#4653c8",
    fontSize: 12,
    fontWeight: 750
  },
  statItem: {
    display: "flex",
    alignItems: "baseline",
    gap: 5
  },
  statGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 12
  },
  statLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: 700
  },
  statValue: {
    color: "#344054",
    fontSize: 14,
    fontWeight: 850
  },
  statDivider: {
    color: "#d0d5dd",
    fontSize: 14,
    fontWeight: 700
  },
  truncatedBadge: {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: "0 10px",
    borderRadius: 8,
    background: "#fffaeb",
    border: "1px solid #fedf89",
    color: "#93370d",
    fontSize: 12,
    fontWeight: 750
  },
  truncatedNotice: {
    margin: 0,
    padding: "10px 14px",
    borderRadius: 10,
    background: "#fffaeb",
    border: "1px solid #fedf89",
    color: "#93370d",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45
  },
  contentWrapper: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto" as const,
    borderRadius: 14,
    border: "1px solid #e1e7ef",
    background: "#fafbfe"
  },
  content: {
    margin: 0,
    padding: "16px 18px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.6,
    color: "#1f2937",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    tabSize: 2
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    paddingTop: 2,
    flexWrap: "wrap" as const,
    flexShrink: 0
  },
  secondaryButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #d0d5dd",
    borderRadius: 12,
    background: "#ffffff",
    color: "#344054",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  },
  copyButton: {
    height: 42,
    padding: "0 18px",
    border: "1px solid #1d7f5f",
    borderRadius: 12,
    background: "#ffffff",
    color: "#1d7f5f",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 120
  },
  confirmButton: {
    height: 42,
    padding: "0 22px",
    border: "1px solid #243b63",
    borderRadius: 12,
    background: "#243b63",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  }
} as const;
