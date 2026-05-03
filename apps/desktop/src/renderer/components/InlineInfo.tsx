import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { InfoIcon } from "./icons/InfoIcon";

interface InlineInfoProps {
  label: string;
  children: ReactNode;
}

export function InlineInfo({ label, children }: InlineInfoProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <span ref={wrapperRef} style={styles.wrapper}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        style={styles.infoButton}
      >
        <InfoIcon size={13} />
      </button>
      {isOpen ? <span style={styles.popover}>{children}</span> : null}
    </span>
  );
}

const styles = {
  wrapper: {
    position: "relative",
    display: "inline-grid",
    placeItems: "center",
    verticalAlign: "middle"
  },
  infoButton: {
    width: 20,
    height: 20,
    display: "grid",
    placeItems: "center",
    border: "1px solid #c4cad5",
    borderRadius: 999,
    background: "#ffffff",
    color: "#596477",
    cursor: "pointer",
    padding: 0
  },
  popover: {
    position: "absolute",
    left: 0,
    top: 26,
    zIndex: 30,
    display: "grid",
    gap: 7,
    width: 320,
    padding: 12,
    border: "1px solid #d8cdb8",
    borderRadius: 8,
    background: "#fffaf0",
    boxShadow: "0 12px 28px rgba(16, 24, 40, 0.16)",
    color: "#554322",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.45
  }
} as const;
