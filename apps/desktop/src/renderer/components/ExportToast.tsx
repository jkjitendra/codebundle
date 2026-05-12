interface ExportToastProps {
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
  outputFile?: string;
  onRevealOutput?: (path: string) => void;
  onCopyOutput?: (path: string) => void;
  onDismiss: () => void;
}

export function ExportToast({
  kind,
  title,
  message,
  outputFile,
  onRevealOutput,
  onCopyOutput,
  onDismiss
}: ExportToastProps): JSX.Element {
  return (
    <div style={{ ...styles.toast, ...(kind === "success" ? styles.success : kind === "error" ? styles.error : styles.info) }}>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss} style={styles.dismissButton}>
        ×
      </button>
      <strong style={styles.title}>{title}</strong>
      {message ? <span style={styles.message}>{message}</span> : null}
      {outputFile ? <span style={styles.path}>{outputFile}</span> : null}
      {outputFile ? (
        <div style={styles.actions}>
          {onRevealOutput ? (
            <button type="button" style={styles.actionButton} onClick={() => onRevealOutput(outputFile)}>
              Reveal Output
            </button>
          ) : null}
          {onCopyOutput ? (
            <button type="button" style={styles.actionButton} onClick={() => onCopyOutput(outputFile)}>
              Copy Path
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  toast: {
    position: "fixed",
    top: 22,
    right: 24,
    zIndex: 40,
    display: "grid",
    gap: 7,
    width: 360,
    maxWidth: "calc(100vw - 48px)",
    padding: "16px 42px 16px 16px",
    border: "1px solid #d9e0ea",
    borderRadius: 16,
    background: "#ffffff",
    boxShadow: "0 18px 42px rgba(16, 24, 40, 0.14)",
    color: "#101828"
  },
  success: {
    borderColor: "#a8d7c1",
    background: "#e8f8ef"
  },
  error: {
    borderColor: "#efb5b5",
    background: "#fff4f4"
  },
  info: {
    borderColor: "#b9d7f2",
    background: "#eaf5ff"
  },
  dismissButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    border: "1px solid transparent",
    borderRadius: 999,
    background: "transparent",
    color: "#667085",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 800
  },
  title: {
    fontSize: 14,
    lineHeight: 1.35
  },
  message: {
    color: "#475467",
    fontSize: 13,
    lineHeight: 1.4
  },
  path: {
    overflow: "hidden",
    color: "#243047",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 11,
    lineHeight: 1.4,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2
  },
  actionButton: {
    height: 30,
    padding: "0 10px",
    border: "1px solid #1d7f5f",
    borderRadius: 10,
    background: "#ffffff",
    color: "#1d7f5f",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
  }
} as const;
