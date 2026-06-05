import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { SecretFinding, SecretScanOptions, SecretScanResult } from "../shared/types";
import { assertSafeProjectRoot, isPathInside } from "./pathSecurity";

const MAX_FINDINGS_PER_FILE = 20;
const MAX_TOTAL_FINDINGS = 200;
const SCAN_CONCURRENCY = 4;
const REDACT_VISIBLE_CHARS = 3;

const PEM_MIN_BODY_LENGTH = 40;
const PEM_SOURCE_CODE_TOKENS = [".replace(", ");", '",', "',", "{", "}"];
const CONFIG_SECRET_MIN_VALUE_LENGTH = 8;
const CONFIG_SECRET_PATH_SUFFIXES = ["path", "file", "location", "url", "uri"];
const CONFIG_SECRET_PLACEHOLDER_VALUES = [
  "placeholder", "changeme", "dummy", "example", "your-secret-here",
  "change-me", "todo", "fixme", "replace-me", "xxx"
];

export interface SecretScanRule {
  id: string;
  label: string;
  severity: "high" | "medium";
  pattern: RegExp;
  /** Optional post-match validator. Return false to reject the match as a false positive. */
  validate?: (match: string, content: string, matchIndex: number) => boolean;
}

export const SECRET_SCAN_RULES: readonly SecretScanRule[] = [
  {
    id: "aws-access-key",
    label: "AWS Access Key ID",
    severity: "high",
    pattern: /AKIA[0-9A-Z]{16}/g
  },
  {
    id: "github-token",
    label: "GitHub Token",
    severity: "high",
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g
  },
  {
    id: "github-token-classic",
    label: "GitHub Personal Access Token (classic)",
    severity: "high",
    pattern: /github_pat_[A-Za-z0-9_]{82,255}/g
  },
  {
    id: "slack-token",
    label: "Slack Token",
    severity: "high",
    pattern: /xox[bporas]-[A-Za-z0-9-]{10,255}/g
  },
  {
    id: "private-key-block",
    label: "Private Key Block",
    severity: "high",
    pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY-----/g,
    validate: (match) => isLikelyPemPrivateKeyBlock(match)
  },
  {
    id: "generic-api-key",
    label: "Generic API Key / Secret Assignment",
    severity: "medium",
    pattern: /(?:api_key|apikey|api_secret|secret_key|access_token|auth_token|client_secret|private_key|encryption_key)\s*[:=]\s*["'][A-Za-z0-9\-_./+]{8,}["']/gi
  },
  {
    id: "jwt-token",
    label: "JWT Token",
    severity: "medium",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g
  },
  {
    id: "env-inline-secret",
    label: "Inline Secret in Environment Variable",
    severity: "medium",
    pattern: /^[A-Z_]*(?:SECRET|PASSWORD|TOKEN|CREDENTIAL|AUTH|KEY)[A-Z_]*\s*=\s*\S.+$/gm
  },
  {
    id: "config-property-secret",
    label: "Config Property Secret",
    severity: "medium",
    pattern: /^[a-zA-Z0-9._-]*(?:password|passwd|secret|client-secret|api-key|apikey|token|private-key|private_key|access-key|secret-key|secretAccessKey|credential)[a-zA-Z0-9._-]*\s*[=:]\s*\S.+$/gim,
    validate: (match) => isLikelyConfigPropertySecret(match)
  }
];

/**
 * Validates whether a matched PEM block contains plausible private key material.
 * Returns false for standalone headers, source code manipulating PEM strings, or
 * blocks with no meaningful base64 body.
 */
export function isLikelyPemPrivateKeyBlock(rawMatch: string): boolean {
  // Find BEGIN and END positions
  const beginPattern = /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY-----/;
  const endPattern = /-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY-----/;

  const beginMatch = beginPattern.exec(rawMatch);
  const endMatch = endPattern.exec(rawMatch);
  if (!beginMatch || !endMatch) {
    return false;
  }

  // Extract body between BEGIN and END lines
  const bodyStart = beginMatch.index + beginMatch[0].length;
  const bodyEnd = endMatch.index;
  if (bodyEnd <= bodyStart) {
    return false;
  }

  const body = rawMatch.slice(bodyStart, bodyEnd);

  // Remove blank lines and whitespace-only lines
  const bodyLines = body.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const bodyContent = bodyLines.join("").trim();

  // Require minimum body length
  if (bodyContent.length < PEM_MIN_BODY_LENGTH) {
    return false;
  }

  // Reject if body contains source code syntax tokens
  for (const token of PEM_SOURCE_CODE_TOKENS) {
    if (bodyContent.includes(token)) {
      return false;
    }
  }

  // Require body to be mostly PEM/base64 characters: A-Z a-z 0-9 + / = whitespace
  const base64Chars = bodyContent.replace(/[\sA-Za-z0-9+/=]/g, "");
  if (base64Chars.length / bodyContent.length > 0.1) {
    return false;
  }

  return true;
}

/**
 * Validates whether a matched config property line contains a plausible secret value.
 * Rejects path references, env-variable placeholders, dev placeholders, and short values.
 */
export function isLikelyConfigPropertySecret(matchedLine: string): boolean {
  // Split into key and value on the first = or :
  const separatorIndex = matchedLine.search(/[=:]/);
  if (separatorIndex === -1) {
    return false;
  }

  const key = matchedLine.slice(0, separatorIndex).trim().toLowerCase();
  const value = matchedLine.slice(separatorIndex + 1).trim();

  // Reject empty values
  if (value.length === 0) {
    return false;
  }

  // Reject property keys ending with path/file/location/url/uri suffixes
  for (const suffix of CONFIG_SECRET_PATH_SUFFIXES) {
    if (key.endsWith(suffix) || key.endsWith(`-${suffix}`) || key.endsWith(`_${suffix}`) || key.endsWith(`.${suffix}`)) {
      return false;
    }
  }

  // Reject env-variable placeholder references: ${VAR}, ${VAR:}, ${VAR:default}
  if (/^\$\{[^}]*\}$/.test(value)) {
    return false;
  }

  // Reject obvious placeholder values
  const lowerValue = value.toLowerCase();
  for (const placeholder of CONFIG_SECRET_PLACEHOLDER_VALUES) {
    if (lowerValue === placeholder) {
      return false;
    }
  }

  // Reject values shorter than minimum length
  if (value.length < CONFIG_SECRET_MIN_VALUE_LENGTH) {
    return false;
  }

  return true;
}

export function redactValue(raw: string): string {
  if (raw.length <= REDACT_VISIBLE_CHARS) {
    return "***";
  }
  return raw.slice(0, REDACT_VISIBLE_CHARS) + "***";
}

export function scanContentForSecrets(
  content: string,
  relativeFilePath: string,
  rules: readonly SecretScanRule[],
  maxPerFile: number
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  // Pre-split lines for efficient line-number lookup
  const lineBreaks: number[] = [];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      lineBreaks.push(i);
    }
  }

  function getLineNumber(charIndex: number): number {
    let lo = 0;
    let hi = lineBreaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (lineBreaks[mid] < charIndex) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo + 1; // 1-indexed
  }

  for (const rule of rules) {
    if (findings.length >= maxPerFile) {
      break;
    }

    // Reset global regex state
    rule.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(content)) !== null) {
      if (findings.length >= maxPerFile) {
        break;
      }

      // Apply optional validator to reject false positives
      if (rule.validate && !rule.validate(match[0], content, match.index)) {
        continue;
      }

      findings.push({
        filePath: relativeFilePath,
        ruleId: rule.id,
        ruleLabel: rule.label,
        severity: rule.severity,
        line: getLineNumber(match.index),
        redactedMatch: redactValue(match[0])
      });
    }
  }

  return findings;
}

export async function scanFileForSecrets(
  absolutePath: string,
  projectRoot: string,
  maxFileSizeBytes: number,
  rules: readonly SecretScanRule[],
  maxPerFile: number
): Promise<{ findings: SecretFinding[]; error: boolean }> {
  const relativeFilePath = relative(projectRoot, absolutePath).replaceAll("\\", "/");

  try {
    // Defensive max file size guard
    const stats = await stat(absolutePath);
    if (!stats.isFile() || stats.size > maxFileSizeBytes) {
      return { findings: [], error: false };
    }

    const content = await readFile(absolutePath, "utf8");
    const findings = scanContentForSecrets(content, relativeFilePath, rules, maxPerFile);
    return { findings, error: false };
  } catch {
    return { findings: [], error: true };
  }
}

export async function scanFilesForSecrets(options: SecretScanOptions): Promise<SecretScanResult> {
  const projectRoot = assertSafeProjectRoot(options.projectRoot);
  const maxFileSizeBytes = Math.max(1, options.maxFileSizeKb) * 1024;

  // Resolve relative paths to absolute and validate each is inside project root
  const validPaths = options.filePaths
    .filter((p) => typeof p === "string" && p.length > 0)
    .map((relativePath) => resolve(projectRoot, relativePath))
    .filter((absolutePath) => isPathInside(projectRoot, absolutePath));

  const allFindings: SecretFinding[] = [];
  let errorCount = 0;
  let hasMoreFindings = false;

  // Process files in batches with limited concurrency
  for (let i = 0; i < validPaths.length; i += SCAN_CONCURRENCY) {
    if (allFindings.length >= MAX_TOTAL_FINDINGS) {
      hasMoreFindings = true;
      break;
    }

    const batch = validPaths.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(
      batch.map((filePath) =>
        scanFileForSecrets(
          filePath,
          projectRoot,
          maxFileSizeBytes,
          SECRET_SCAN_RULES,
          MAX_FINDINGS_PER_FILE
        )
      )
    );

    for (const result of results) {
      if (result.error) {
        errorCount += 1;
        continue;
      }

      for (const finding of result.findings) {
        if (allFindings.length >= MAX_TOTAL_FINDINGS) {
          hasMoreFindings = true;
          break;
        }
        allFindings.push(finding);
      }
    }
  }

  return {
    findings: allFindings,
    scannedFileCount: validPaths.length,
    errorCount,
    hasMoreFindings
  };
}
