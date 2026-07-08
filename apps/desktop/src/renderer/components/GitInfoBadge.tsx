import type { GitProjectInfo } from "../lib/types";

interface GitInfoBadgeProps {
  git?: GitProjectInfo;
}

/**
 * Renders a compact Git context badge below the scan summary.
 *
 * States:
 *  - No git prop → render nothing (no scan yet)
 *  - gitAvailable === false → "Git: Git not available"
 *  - isGitRepository === false → "Git: Not a Git repository"
 *  - isGitRepository === true but no identifying info → "Git: Repository detected"
 *  - Detached HEAD → "Git: detached HEAD · {shortCommit}"
 *  - Normal → "Git: {branch} · {shortCommit} · clean|modified"
 *
 * Never displays raw error details. The `warning` field is surfaced only as a
 * `title` tooltip on the badge for debugging, not as visible text.
 */
export function GitInfoBadge({ git }: GitInfoBadgeProps) {
  if (!git) {
    return null;
  }

  const label = buildLabel(git);

  return (
    <p
      style={styles.badge}
      title={git.warning ?? undefined}
      aria-label={`Git status: ${label}`}
    >
      {label}
    </p>
  );
}

function buildLabel(git: GitProjectInfo): string {
  if (!git.gitAvailable) {
    return "Git: Git not available";
  }

  if (!git.isGitRepository) {
    return "Git: Not a Git repository";
  }

  // isGitRepository is true — build a detailed label.
  const parts: string[] = [];

  if (git.isDetachedHead) {
    parts.push("detached HEAD");
  } else if (git.branch) {
    parts.push(git.branch);
  }

  if (git.shortCommit) {
    parts.push(git.shortCommit);
  }

  // Only show working tree status if we have it.
  if (typeof git.hasTrackedChanges === "boolean") {
    parts.push(git.hasTrackedChanges ? "modified" : "clean");
  }

  if (parts.length === 0) {
    // Git repo detected but no specific metadata could be read.
    return "Git: Repository detected";
  }

  return `Git: ${parts.join(" · ")}`;
}

const styles = {
  badge: {
    margin: "4px 0 0 0",
    fontSize: "11px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    color: "#667085",
    lineHeight: 1.4,
    userSelect: "text" as const
  }
} as const;
