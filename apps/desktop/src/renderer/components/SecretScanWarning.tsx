import type { SecretFinding, SecretScanResult } from "../lib/types";

interface SecretScanWarningProps {
  scanResult: SecretScanResult;
  onCancel: () => void;
  onContinue: () => void;
  continueLabel?: string;
  cancelLabel?: string;
}

export function SecretScanWarning({
  scanResult,
  onCancel,
  onContinue,
  continueLabel = "Continue Anyway",
  cancelLabel = "Cancel Export"
}: SecretScanWarningProps): JSX.Element {
  const highCount = scanResult.findings.filter((f) => f.severity === "high").length;
  const mediumCount = scanResult.findings.filter((f) => f.severity === "medium").length;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.warningIcon}>⚠</span>
          <h2 style={styles.title}>Potential Secrets Detected</h2>
        </div>

        <p style={styles.description}>
          The selected files contain <strong>{scanResult.findings.length}</strong> potential
          secret{scanResult.findings.length !== 1 ? "s" : ""} that may be included in the export.
        </p>

        <div style={styles.severityRow}>
          {highCount > 0 ? (
            <span style={styles.highBadge}>
              {highCount} high severity
            </span>
          ) : null}
          {mediumCount > 0 ? (
            <span style={styles.mediumBadge}>
              {mediumCount} medium severity
            </span>
          ) : null}
        </div>

        <div style={styles.findingsList}>
          {scanResult.findings.map((finding, index) => (
            <FindingRow key={`${finding.filePath}-${finding.line}-${finding.ruleId}-${index}`} finding={finding} />
          ))}
        </div>

        {scanResult.hasMoreFindings ? (
          <p style={styles.cappedNotice}>
            Results capped — additional findings were not shown.
          </p>
        ) : null}

        {scanResult.errorCount > 0 ? (
          <p style={styles.errorNotice}>
            {scanResult.errorCount} file{scanResult.errorCount !== 1 ? "s" : ""} could not be scanned.
          </p>
        ) : null}

        <p style={styles.reminder}>
          Secrets in exported files may be shared unintentionally. Review the findings above before continuing.
        </p>

        <div style={styles.actions}>
          <button type="button" style={styles.cancelButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" style={styles.continueButton} onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: SecretFinding }): JSX.Element {
  return (
    <div style={styles.findingRow}>
      <div style={styles.findingMain}>
        <span style={finding.severity === "high" ? styles.findingSeverityHigh : styles.findingSeverityMedium}>
          {finding.severity}
        </span>
        <span style={styles.findingRule}>{finding.ruleLabel}</span>
      </div>
      <div style={styles.findingDetails}>
        <span style={styles.findingPath}>{finding.filePath}:{finding.line}</span>
        <code style={styles.findingRedacted}>{finding.redactedMatch}</code>
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
    width: "min(640px, 92vw)",
    maxHeight: "82vh",
    display: "grid",
    gap: 16,
    boxSizing: "border-box" as const,
    padding: "28px 28px 24px",
    borderRadius: 20,
    background: "#ffffff",
    boxShadow: "0 24px 64px rgba(16, 24, 40, 0.18), 0 4px 12px rgba(16, 24, 40, 0.08)",
    overflowY: "auto" as const
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },
  warningIcon: {
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "#fef3cd",
    fontSize: 20,
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
  description: {
    margin: 0,
    color: "#344054",
    fontSize: 14,
    lineHeight: 1.5
  },
  severityRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap" as const
  },
  highBadge: {
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    padding: "0 12px",
    borderRadius: 8,
    background: "#fef3f2",
    border: "1px solid #fecdca",
    color: "#b42318",
    fontSize: 12,
    fontWeight: 750
  },
  mediumBadge: {
    display: "inline-flex",
    alignItems: "center",
    height: 28,
    padding: "0 12px",
    borderRadius: 8,
    background: "#fffaeb",
    border: "1px solid #fedf89",
    color: "#93370d",
    fontSize: 12,
    fontWeight: 750
  },
  findingsList: {
    display: "grid",
    gap: 6,
    maxHeight: 280,
    overflowY: "auto" as const,
    padding: "8px 0"
  },
  findingRow: {
    display: "grid",
    gap: 4,
    padding: "10px 14px",
    borderRadius: 12,
    background: "#f9fafb",
    border: "1px solid #eaecf0"
  },
  findingMain: {
    display: "flex",
    alignItems: "center",
    gap: 10
  },
  findingSeverityHigh: {
    display: "inline-flex",
    alignItems: "center",
    height: 22,
    padding: "0 8px",
    borderRadius: 6,
    background: "#fef3f2",
    color: "#b42318",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5
  },
  findingSeverityMedium: {
    display: "inline-flex",
    alignItems: "center",
    height: 22,
    padding: "0 8px",
    borderRadius: 6,
    background: "#fffaeb",
    color: "#93370d",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5
  },
  findingRule: {
    color: "#101828",
    fontSize: 13,
    fontWeight: 700
  },
  findingDetails: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingLeft: 2
  },
  findingPath: {
    color: "#667085",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12
  },
  findingRedacted: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 6,
    background: "#f2f4f7",
    color: "#475467",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12
  },
  cappedNotice: {
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
  errorNotice: {
    margin: 0,
    color: "#667085",
    fontSize: 13,
    lineHeight: 1.45
  },
  reminder: {
    margin: 0,
    color: "#667085",
    fontSize: 13,
    lineHeight: 1.5
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    paddingTop: 4
  },
  cancelButton: {
    height: 44,
    padding: "0 22px",
    border: "1px solid #243b63",
    borderRadius: 12,
    background: "#243b63",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  },
  continueButton: {
    height: 44,
    padding: "0 22px",
    border: "1px solid #d0d5dd",
    borderRadius: 12,
    background: "#ffffff",
    color: "#344054",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer"
  }
} as const;
