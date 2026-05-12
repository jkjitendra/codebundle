interface ExcludeRulesEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const filterIcon = new URL("../../../../../resources/icons/filter.svg", import.meta.url).href;

export function ExcludeRulesEditor({ value, onChange }: ExcludeRulesEditorProps): JSX.Element {
  return (
    <section style={styles.section}>
      <div style={styles.headingRow}>
        <span style={styles.iconBadge}>
          <img src={filterIcon} alt="" aria-hidden="true" style={styles.badgeIcon} />
        </span>
        <h2 style={styles.heading}>Exclude Patterns</h2>
      </div>
      <p style={styles.copy}>
        One pattern per line. Supports glob syntax. Patterns are relative to the selected project folder. Example:
        apps/desktop/node_modules/**
      </p>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder={"node_modules/\n.git/\ndist/\n*.log"}
        style={styles.textarea}
      />
    </section>
  );
}

const styles = {
  section: {
    display: "grid",
    gap: 10
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
    background: "#fff3e8",
    color: "#e26d13",
    fontSize: 15,
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
    fontSize: 12,
    lineHeight: 1.45
  },
  textarea: {
    minHeight: 104,
    boxSizing: "border-box",
    resize: "vertical",
    padding: 12,
    border: "1px solid #d9e0ea",
    borderRadius: 12,
    background: "#fbfcff",
    color: "#344054",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.5,
    outline: "none"
  }
} as const;
