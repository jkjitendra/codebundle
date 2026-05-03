import { useEffect, useRef } from "react";
import { InfoIcon } from "./icons/InfoIcon";

interface LocalFirstInfoProps {
  defaultExcludes: string[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function LocalFirstInfo({ defaultExcludes, isOpen, onToggle, onClose }: LocalFirstInfoProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const previewRules = defaultExcludes.slice(0, 6).join(", ");

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <button
        type="button"
        aria-label="Show local-first information"
        aria-expanded={isOpen}
        onClick={onToggle}
        style={styles.infoButton}
      >
        <InfoIcon />
      </button>
      {isOpen ? (
        <aside style={styles.popover}>
          <strong style={styles.title}>Local-first</strong>
          <p style={styles.copy}>CodeBundle runs locally and does not upload files.</p>
          <p style={styles.copy}>Run Export creates the final Markdown/TXT file using the local exporter.</p>
          <p style={styles.rules}>Default exclusions: {previewRules}</p>
        </aside>
      ) : null}
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative"
  },
  infoButton: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    border: "1px solid #c4cad5",
    borderRadius: 999,
    background: "#ffffff",
    color: "#25334a",
    cursor: "pointer"
  },
  popover: {
    position: "absolute",
    top: 38,
    right: 0,
    zIndex: 20,
    display: "grid",
    gap: 7,
    width: 330,
    padding: 14,
    border: "1px solid #d8cdb8",
    borderRadius: 8,
    background: "#fffaf0",
    boxShadow: "0 12px 28px rgba(16, 24, 40, 0.16)"
  },
  title: {
    color: "#3b2e18",
    fontSize: 14,
    letterSpacing: 0
  },
  copy: {
    margin: 0,
    color: "#554322",
    fontSize: 13,
    lineHeight: 1.45
  },
  rules: {
    margin: 0,
    color: "#6e5a33",
    fontSize: 12,
    lineHeight: 1.45
  }
} as const;
