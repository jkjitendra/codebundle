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
        x
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
    padding: "14px 38px 14px 14px",
    border: "1px solid #cfd6e2",
    borderRadius: 8,
    background: "#ffffff",
    boxShadow: "0 16px 36px rgba(16, 24, 40, 0.18)",
    color: "#162032"
  },
  success: {
    borderColor: "#9bd5bd",
    background: "#f0fbf5"
  },
  error: {
    borderColor: "#efb5b5",
    background: "#fff4f4"
  },
  info: {
    borderColor: "#b9c7dd",
    background: "#f4f7fb"
  },
  dismissButton: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 22,
    height: 22,
    border: "1px solid transparent",
    borderRadius: 999,
    background: "transparent",
    color: "#5f6b7c",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800
  },
  title: {
    fontSize: 14,
    lineHeight: 1.35
  },
  message: {
    color: "#465266",
    fontSize: 13,
    lineHeight: 1.4
  },
  path: {
    overflow: "hidden",
    color: "#25334a",
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
    border: "1px solid #1d6f52",
    borderRadius: 6,
    background: "#ffffff",
    color: "#1d6f52",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer"
  }
} as const;
