interface ExcludeRulesEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ExcludeRulesEditor({ value, onChange }: ExcludeRulesEditorProps): JSX.Element {
  return (
    <section style={styles.section}>
      <div>
        <h2 style={styles.heading}>Exclude Patterns</h2>
        <p style={styles.copy}>
          Patterns are relative to the selected project folder. Example: apps/desktop/node_modules/**. If you paste
          codebundle/apps/..., CodeBundle will normalize it.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder={"src/generated/**\n*.log"}
        style={styles.textarea}
      />
    </section>
  );
}

const styles = {
  section: {
    display: "grid",
    gap: 12
  },
  heading: {
    margin: 0,
    color: "#162032",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0
  },
  copy: {
    margin: "5px 0 0",
    color: "#596477",
    fontSize: 14,
    lineHeight: 1.45
  },
  textarea: {
    minHeight: 104,
    resize: "vertical",
    padding: 10,
    border: "1px solid #d7dce5",
    borderRadius: 6,
    color: "#273244",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.45
  }
} as const;
