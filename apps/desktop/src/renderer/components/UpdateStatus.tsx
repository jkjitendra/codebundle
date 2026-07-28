import { useEffect, useState } from "react";
import type { UpdateState } from "../lib/types";

interface UpdateStatusProps {
  state: UpdateState;
  onCheck: () => void;
  onInstall: () => void;
}

export function UpdateStatus({ state, onCheck, onInstall }: UpdateStatusProps): JSX.Element {
  const busy = state.status === "checking" || state.status === "downloading";
  const [deferred, setDeferred] = useState(false);
  useEffect(() => {
    if (state.status !== "downloaded") setDeferred(false);
  }, [state.status, state.version]);
  return (
    <section aria-label="Application updates" style={styles.card}>
      <div style={styles.copy}>
        <strong style={styles.title}>Updates</strong>
        <span style={styles.message}>{state.message}</span>
        {state.status === "downloading" && typeof state.percent === "number" ? (
          <div aria-label={`Download progress ${state.percent}%`} style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${state.percent}%` }} />
          </div>
        ) : null}
      </div>
      <div style={styles.actions}>
        {state.status === "downloaded" ? (
          <div style={styles.downloadedActions}>
            <button type="button" onClick={onInstall} style={styles.primaryButton}>Restart to Install</button>
            {deferred ? (
              <span style={styles.laterCopy}>Update ready.</span>
            ) : (
              <button type="button" onClick={() => setDeferred(true)} style={styles.button}>Later</button>
            )}
          </div>
        ) : (
          <button type="button" onClick={onCheck} disabled={busy} style={{ ...styles.button, ...(busy ? styles.buttonDisabled : {}) }}>
            {busy ? "Checking…" : "Check for Updates"}
          </button>
        )}
      </div>
    </section>
  );
}

const styles = {
  card: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    padding: "12px 14px",
    border: "1px solid #d9e0ea",
    borderRadius: 12,
    background: "#ffffff"
  },
  copy: { display: "grid", gap: 3, minWidth: 0 },
  title: { color: "#101828", fontSize: 13, fontWeight: 800 },
  message: { color: "#667085", fontSize: 12, lineHeight: 1.35 },
  actions: { flexShrink: 0 },
  downloadedActions: { display: "flex", alignItems: "center", gap: 8 },
  laterCopy: { color: "#667085", fontSize: 12, fontWeight: 600 },
  button: {
    border: "1px solid #cdd6e3", borderRadius: 8, background: "#ffffff", color: "#344054", padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer"
  },
  buttonDisabled: { cursor: "wait", opacity: 0.65 },
  primaryButton: {
    border: "1px solid #2563eb", borderRadius: 8, background: "#2563eb", color: "#ffffff", padding: "8px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer"
  },
  progressTrack: { width: 180, height: 5, borderRadius: 999, overflow: "hidden", background: "#e7edf5", marginTop: 4 },
  progressFill: { height: "100%", borderRadius: 999, background: "#2563eb", transition: "width 160ms ease" }
} as const;
