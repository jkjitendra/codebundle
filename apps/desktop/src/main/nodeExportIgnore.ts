/** Simple root-relative ignore matching shared by the Node fallback exporter. */

export function normalizeExportPath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function isNodeExportExcluded(relativePath: string, patterns: readonly string[]): boolean {
  const path = normalizeExportPath(relativePath);
  const parts = path.split("/").filter(Boolean);

  return patterns.some((rawPattern) => {
    const pattern = normalizeExportPath(rawPattern);
    if (!pattern) return false;
    const variants = pattern.includes("**/") ? [pattern, pattern.replace("**/", "")] : [pattern];
    return variants.some((variant) => matchesPattern(path, parts, variant));
  });
}

function matchesPattern(path: string, parts: string[], pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3).replace(/^\/+|\/+$/g, "");
    if (!prefix) return false;
    if (!prefix.includes("/")) return parts.some((part) => simpleGlobMatch(part, prefix));
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (!pattern.includes("/")) return parts.some((part) => simpleGlobMatch(part, pattern));
  if (!hasGlob(pattern)) return path === pattern || path.startsWith(`${pattern}/`);
  return simpleGlobMatch(path, pattern);
}

function hasGlob(pattern: string): boolean {
  return /[*?[]/.test(pattern);
}

/** Deliberately small glob matcher: *, **, and ? match the current app behavior. */
function simpleGlobMatch(value: string, pattern: string): boolean {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`).test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
