import { useCallback, useState } from "react";
import { formatRelativeTime, truncatePath } from "./RecentProjects";
import type { SavedExportProfile } from "../lib/types";

interface SavedExportProfilesProps {
  profiles: SavedExportProfile[];
  canSave: boolean;
  onSave: (name: string) => void;
  onLoad: (profile: SavedExportProfile) => void;
  onDelete: (id: string) => Promise<void> | void;
}

export function SavedExportProfiles({
  profiles,
  canSave,
  onSave,
  onLoad,
  onDelete
}: SavedExportProfilesProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    const name = window.prompt("Profile name:");
    if (name && name.trim().length > 0) {
      onSave(name.trim());
    }
  }, [onSave]);

  const handleDelete = useCallback(
    async (id: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setDeletingId(id);
      try {
        await onDelete(id);
      } finally {
        setDeletingId(null);
      }
    },
    [onDelete]
  );

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <button
          type="button"
          style={styles.toggle}
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="saved-profiles-list"
        >
          <span style={styles.toggleLeft}>
            <span style={styles.toggleIcon}>{isOpen ? "▾" : "▸"}</span>
            <span style={styles.toggleLabel}>Saved Export Profiles</span>
            {profiles.length > 0 ? (
              <span style={styles.badge}>{profiles.length}</span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          style={{
            ...styles.saveButton,
            ...(canSave ? {} : styles.saveButtonDisabled)
          }}
          onClick={handleSave}
          disabled={!canSave}
          title="Save the current project, output, options, and file selections as a reusable profile"
        >
          Save Current
        </button>
      </div>

      {isOpen ? (
        profiles.length > 0 ? (
          <ul id="saved-profiles-list" style={styles.list} role="list">
            {profiles.map((profile) => (
              <li key={profile.id} style={styles.item}>
                <div style={styles.itemContent}>
                  <div style={styles.itemTop}>
                    <span style={styles.profileName}>{profile.name}</span>
                    <span style={styles.timeLabel}>
                      {formatRelativeTime(profile.lastUsedAt ?? profile.updatedAt)}
                    </span>
                  </div>
                  <div style={styles.itemMeta}>
                    <span style={styles.metaLabel}>{truncatePath(profile.projectRoot)}</span>
                    <span style={styles.metaDot}>·</span>
                    <span style={styles.metaLabel}>
                      {profile.files.length + profile.folders.length} paths
                    </span>
                    <span style={styles.metaDot}>·</span>
                    <span style={styles.metaLabel}>{profile.format}</span>
                  </div>
                </div>
                <div style={styles.actions}>
                  <button
                    type="button"
                    style={styles.loadButton}
                    onClick={() => onLoad(profile)}
                    title={`Load ${profile.name}`}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    style={styles.deleteButton}
                    onClick={(e) => void handleDelete(profile.id, e)}
                    disabled={deletingId === profile.id}
                    title={`Delete ${profile.name}`}
                    aria-label={`Delete ${profile.name} from saved profiles`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div style={styles.emptyState}>
            No saved profiles yet. Select files and click Save Current.
          </div>
        )
      ) : null}
    </div>
  );
}

const styles = {
  container: {
    display: "grid",
    gap: 0
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flex: "1 1 auto",
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
    background: "#dbeafe",
    color: "#1e40af",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1
  },
  saveButton: {
    flexShrink: 0,
    height: 36,
    padding: "0 14px",
    border: "1px solid #c8d1df",
    borderRadius: 10,
    background: "#ffffff",
    color: "#1d7f5f",
    fontSize: 12,
    fontWeight: 750,
    cursor: "pointer",
    transition: "background 100ms ease, border-color 100ms ease"
  },
  saveButtonDisabled: {
    color: "#98a2b3",
    cursor: "not-allowed",
    opacity: 0.6
  },
  list: {
    listStyle: "none",
    margin: "6px 0 0",
    display: "grid",
    gap: 4,
    maxHeight: 300,
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
  profileName: {
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
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: "#98a2b3",
    fontSize: 11,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  },
  metaLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const
  },
  metaDot: {
    flexShrink: 0,
    color: "#d0d5dd"
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0
  },
  loadButton: {
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
  deleteButton: {
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
  },
  emptyState: {
    marginTop: 6,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #e4e8f0",
    background: "#fbfcff",
    color: "#98a2b3",
    fontSize: 12,
    fontWeight: 600,
    textAlign: "center" as const
  }
} as const;
