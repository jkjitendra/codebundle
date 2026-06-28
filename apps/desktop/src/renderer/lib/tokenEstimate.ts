const BYTES_PER_TOKEN = 4;

/** Estimated bytes for export header, project metadata, and summary. */
export const EXPORT_HEADER_OVERHEAD_BYTES = 500;
/** Estimated bytes per file for heading, path line, code fences, and newlines. */
export const PER_FILE_MARKDOWN_OVERHEAD_BYTES = 120;

export type ContextBadgeState = "green" | "amber" | "red";

export interface ContextBadge {
  label: string;
  limit: number;
  state: ContextBadgeState;
}

const CONTEXT_WINDOW_LIMITS: readonly { label: string; limit: number }[] = [
  { label: "128K context", limit: 128_000 },
  { label: "200K context", limit: 200_000 },
  { label: "1M context", limit: 1_000_000 }
];

/**
 * Estimates the number of tokens from a byte count.
 * Uses the standard industry approximation of ~1 token per 4 bytes.
 * This is dependency-free and avoids bundling a tokenizer library.
 */
export function estimateTokenCount(totalBytes: number): number {
  if (totalBytes <= 0) {
    return 0;
  }
  return Math.ceil(totalBytes / BYTES_PER_TOKEN);
}

/**
 * Returns the badge state for a given token count and context window limit.
 * - Green: ≤ 80% of limit
 * - Amber: > 80% and ≤ 100% of limit
 * - Red: > limit
 */
export function getContextBadgeState(tokenCount: number, limit: number): ContextBadgeState {
  if (tokenCount > limit) {
    return "red";
  }
  if (tokenCount > limit * 0.8) {
    return "amber";
  }
  return "green";
}

/**
 * Returns context window badges with states computed from the given token count.
 */
export function getContextBadges(tokenCount: number): ContextBadge[] {
  return CONTEXT_WINDOW_LIMITS.map(({ label, limit }) => ({
    label,
    limit,
    state: getContextBadgeState(tokenCount, limit)
  }));
}

/**
 * Formats a byte count into a human-readable string.
 * Examples: "0 B", "512 B", "1.2 KB", "3.5 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/**
 * Formats a token count with comma separators and a ~ prefix.
 * Examples: "0", "~250", "~12,500", "~1,250,000"
 */
export function formatTokenCount(tokens: number): string {
  if (tokens === 0) {
    return "0";
  }
  return `~${tokens.toLocaleString("en-US")}`;
}
