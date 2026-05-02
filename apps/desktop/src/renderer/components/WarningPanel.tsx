interface WarningPanelProps {
  defaultExcludes: string[];
}

export function WarningPanel({ defaultExcludes }: WarningPanelProps): JSX.Element {
  const previewRules = defaultExcludes.slice(0, 6).join(", ");

  return (
    <aside style={styles.panel}>
      <strong style={styles.title}>Local-first</strong>
      <p style={styles.copy}>CodeBundle runs locally and does not upload files.</p>
      <p style={styles.rules}>Default exclusions loaded: {previewRules}</p>
    </aside>
  );
}

const styles = {
  panel: {
    display: "grid",
    gap: 6,
    padding: 16,
    border: "1px solid #d8cdb8",
    borderRadius: 6,
    background: "#fffaf0"
  },
  title: {
    color: "#3b2e18",
    fontSize: 14,
    letterSpacing: 0
  },
  copy: {
    margin: 0,
    color: "#554322",
    fontSize: 14,
    lineHeight: 1.45
  },
  rules: {
    margin: 0,
    color: "#6e5a33",
    fontSize: 12,
    lineHeight: 1.45
  }
} as const;
