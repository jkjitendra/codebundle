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
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    border: "1px solid #d9e0ea",
    borderRadius: 999,
    background: "#ffffff",
    color: "#243047",
    cursor: "pointer",
    padding: 0
  },
  popover: {
    position: "absolute",
    top: 42,
    right: 0,
    zIndex: 20,
    display: "grid",
    gap: 8,
    width: 330,
    padding: 16,
    border: "1px solid #d9e0ea",
    borderRadius: 14,
    background: "#ffffff",
    boxShadow: "0 16px 40px rgba(16, 24, 40, 0.14)"
  },
  title: {
    color: "#101828",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0
  },
  copy: {
    margin: 0,
    color: "#475467",
    fontSize: 13,
    lineHeight: 1.45
  },
  rules: {
    margin: 0,
    color: "#667085",
    fontSize: 12,
    lineHeight: 1.45
  }
} as const;
