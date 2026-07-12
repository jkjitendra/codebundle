import { useState } from "react";
import type { GitDiffMode, GitProjectInfo } from "../lib/types";

interface GitDiffSelectorProps {
  git?: GitProjectInfo;
  disabled: boolean;
  isLoading: boolean;
  onSelectChangedFiles: (options: {
    mode: GitDiffMode;
    baseRef?: string;
    includeUntracked: boolean;
  }) => Promise<void> | void;
}

/**
 * Git Diff-Only selector panel.
 *
 * Shows below GitInfoBadge and before the file tree filters.
 * Allows users to select only files changed in Git diff without
 * manually selecting them in the tree.
 *
 * States:
 *  - No git prop or no scan: render nothing
 *  - gitAvailable === false or isGitRepository === false: disabled message
 *  - isGitRepository === true: show mode selector and "Select changed files" button
 */
export function GitDiffSelector({
  git,
  disabled,
  isLoading,
  onSelectChangedFiles
}: GitDiffSelectorProps): JSX.Element | null {
  const [mode, setMode] = useState<GitDiffMode>("workingTree");
  const [baseRef, setBaseRef] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);

  if (!git) {
    return null;
  }

  const isGitUnavailable = !git.gitAvailable || !git.isGitRepository;
  const isActionDisabled = disabled || isLoading || isGitUnavailable;

  function handleClick(): void {
    if (isActionDisabled) return;
    onSelectChangedFiles({
      mode,
      baseRef: mode === "branch" && baseRef.trim() ? baseRef.trim() : undefined,
      includeUntracked
    });
  }

  return (
    <div style={styles.container} aria-label="Git Diff selector">
      <div style={styles.headerRow}>
        <span style={styles.label}>Git Diff</span>
        {isGitUnavailable && (
          <span style={styles.unavailableNote}>
            {!git.gitAvailable ? "Git not available" : "Not a Git repository"}
          </span>
        )}
      </div>

      {!isGitUnavailable && (
        <>
          <div style={styles.row}>
            <label htmlFor="git-diff-mode-select" style={styles.fieldLabel}>
              Mode
            </label>
            <select
              id="git-diff-mode-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as GitDiffMode)}
              disabled={isActionDisabled}
              style={isActionDisabled ? styles.selectDisabled : styles.select}
              aria-label="Git diff mode"
            >
              <option value="workingTree">Working tree changes</option>
              <option value="branch">Branch comparison</option>
            </select>
          </div>

          {mode === "branch" && (
            <div style={styles.row}>
              <label htmlFor="git-diff-base-ref" style={styles.fieldLabel}>
                Base branch / ref
              </label>
              <input
                id="git-diff-base-ref"
                type="text"
                value={baseRef}
                onChange={(e) => setBaseRef(e.target.value)}
                placeholder="e.g. main, origin/main"
                disabled={isActionDisabled}
                style={isActionDisabled ? styles.inputDisabled : styles.input}
                aria-label="Base branch or ref for comparison"
              />
            </div>
          )}

          <div style={styles.checkboxRow}>
            <label style={styles.checkboxLabel} htmlFor="git-diff-untracked">
              <input
                id="git-diff-untracked"
                type="checkbox"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
                disabled={isActionDisabled}
                style={styles.checkbox}
              />
              Include untracked files
            </label>
          </div>

          <button
            id="git-diff-select-btn"
            type="button"
            onClick={handleClick}
            disabled={isActionDisabled || (mode === "branch" && !baseRef.trim())}
            style={
              isActionDisabled || (mode === "branch" && !baseRef.trim())
                ? styles.buttonDisabled
                : styles.button
            }
            aria-label="Select changed files from Git diff"
          >
            {isLoading ? "Loading diff..." : "Select changed files"}
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    margin: "8px 0 0",
    padding: "10px",
    borderRadius: "8px",
    background: "#f8f9fc",
    border: "1px solid #e4e8f0",
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px"
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px"
  },
  label: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#344054",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em"
  },
  unavailableNote: {
    fontSize: "11px",
    color: "#667085",
    fontStyle: "italic" as const
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  fieldLabel: {
    fontSize: "11px",
    color: "#667085",
    minWidth: "64px",
    flexShrink: 0
  },
  select: {
    flex: 1,
    fontSize: "12px",
    padding: "3px 6px",
    borderRadius: "6px",
    border: "1px solid #cfd8e6",
    background: "#ffffff",
    color: "#344054",
    cursor: "pointer"
  },
  selectDisabled: {
    flex: 1,
    fontSize: "12px",
    padding: "3px 6px",
    borderRadius: "6px",
    border: "1px solid #e4e8f0",
    background: "#f2f4f7",
    color: "#98a2b3",
    cursor: "not-allowed"
  },
  input: {
    flex: 1,
    fontSize: "12px",
    padding: "3px 7px",
    borderRadius: "6px",
    border: "1px solid #cfd8e6",
    background: "#ffffff",
    color: "#344054",
    outline: "none"
  },
  inputDisabled: {
    flex: 1,
    fontSize: "12px",
    padding: "3px 7px",
    borderRadius: "6px",
    border: "1px solid #e4e8f0",
    background: "#f2f4f7",
    color: "#98a2b3",
    cursor: "not-allowed"
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center"
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#475467",
    cursor: "pointer",
    userSelect: "none" as const
  },
  checkbox: {
    accentColor: "#1d7f5f",
    cursor: "pointer"
  },
  button: {
    alignSelf: "flex-start",
    fontSize: "12px",
    padding: "4px 12px",
    borderRadius: "6px",
    border: "1px solid #1d7f5f",
    background: "#1d7f5f",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 500,
    transition: "opacity 0.15s ease"
  },
  buttonDisabled: {
    alignSelf: "flex-start",
    fontSize: "12px",
    padding: "4px 12px",
    borderRadius: "6px",
    border: "1px solid #e4e8f0",
    background: "#f2f4f7",
    color: "#98a2b3",
    cursor: "not-allowed",
    fontWeight: 500
  }
} as const;
