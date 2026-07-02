import { useCallback, useState } from "react";
import type { RecentProject } from "../lib/types";

interface RecentProjectsProps {
  projects: RecentProject[];
  onSelect: (path: string) => void;
  onRemove: (path: string) => Promise<void> | void;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1_000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}

export function truncatePath(fullPath: string): string {
  const segments = fullPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.length <= 3) {
    return fullPath;
  }
  return `…/${segments.slice(-3).join("/")}`;
}

export function RecentProjects({ projects, onSelect, onRemove }: RecentProjectsProps): JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const [removingPath, setRemovingPath] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (path: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setRemovingPath(path);
      try {
        await onRemove(path);
      } finally {
        setRemovingPath(null);
      }
    },
    [onRemove]
  );

  if (projects.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <button
        type="button"
        style={styles.toggle}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="recent-projects-list"
      >
        <span style={styles.toggleLeft}>
          <span style={styles.toggleIcon}>{isOpen ? "▾" : "▸"}</span>
          <span style={styles.toggleLabel}>Recent Projects</span>
          <span style={styles.badge}>{projects.length}</span>
        </span>
      </button>

      {isOpen ? (
        <ul id="recent-projects-list" style={styles.list} role="list">
          {projects.map((project) => (
            <li key={project.path} style={styles.item}>
              <div style={styles.itemContent}>
                <div style={styles.itemTop}>
                  <span style={styles.projectName}>{project.name}</span>
                  <span style={styles.timeLabel}>{formatRelativeTime(project.lastOpenedAt)}</span>
                </div>
                <span style={styles.projectPath}>{truncatePath(project.path)}</span>
              </div>
              <div style={styles.actions}>
                <button
                  type="button"
                  style={styles.useButton}
                  onClick={() => onSelect(project.path)}
                  title={`Use ${project.name}`}
                >
                  Use
                </button>
                <button
                  type="button"
                  style={styles.removeButton}
                  onClick={(e) => void handleRemove(project.path, e)}
                  disabled={removingPath === project.path}
                  title={`Remove ${project.name}`}
                  aria-label={`Remove ${project.name} from recent projects`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const styles = {
  container: {
    display: "grid",
    gap: 0
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: 36,
    padding: "0 10px",
    border: "1px solid #e4e8f0",
    borderRadius: 10,
    background: "#f8f9fc",
    color: "#344054",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 120ms ease, border-color 120ms ease"
  },
  toggleLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  toggleIcon: {
    fontSize: 11,
    color: "#667085",
    width: 14,
    textAlign: "center" as const
  },
  toggleLabel: {
    color: "#344054",
    fontSize: 13,
    fontWeight: 750
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    height: 20,
    padding: "0 6px",
    borderRadius: 999,
    background: "#e0e7ff",
    color: "#3730a3",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1
  },
  list: {
    listStyle: "none",
    margin: "6px 0 0",
    display: "grid",
    gap: 4,
    maxHeight: 260,
    overflowY: "auto" as const,
    borderRadius: 10,
    border: "1px solid #e4e8f0",
    background: "#fbfcff",
    padding: 4
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 8,
    transition: "background 100ms ease",
    cursor: "default"
  },
  itemContent: {
    display: "grid",
    gap: 2,
    minWidth: 0,
    flex: "1 1 auto"
  },
  itemTop: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    minWidth: 0
  },
  projectName: {
    color: "#101828",
    fontSize: 13,
    fontWeight: 750,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0
  },
  timeLabel: {
    color: "#98a2b3",
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
    flexShrink: 0
  },
  projectPath: {
    color: "#98a2b3",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0
  },
  useButton: {
    height: 28,
    padding: "0 12px",
    border: "1px solid #c8d1df",
    borderRadius: 8,
    background: "#ffffff",
    color: "#1d7f5f",
    fontSize: 12,
    fontWeight: 750,
    cursor: "pointer",
    transition: "background 100ms ease, border-color 100ms ease"
  },
  removeButton: {
    display: "grid",
    placeItems: "center",
    minWidth: 72,
    height: 28,
    padding: "0 10px",
    border: "1px solid #e4e8f0",
    borderRadius: 8,
    background: "#ffffff",
    color: "#98a2b3",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 100ms ease, color 100ms ease, border-color 100ms ease"
  }
} as const;