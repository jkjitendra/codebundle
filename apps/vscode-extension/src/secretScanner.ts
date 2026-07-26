import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { normalizeWorkspaceRelativePath } from "./pathSecurity";

export interface SecretFinding { filePath: string; ruleLabel: string; line: number; redactedMatch: string; }
export interface SecretScanResult { findings: SecretFinding[]; errorCount: number; hasMoreFindings: boolean; }

const MAX_PER_FILE = 20;
const MAX_TOTAL = 200;
const rules: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "AWS Access Key ID", pattern: /AKIA[0-9A-Z]{16}/g },
  { label: "GitHub Token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{82,255}/g },
  { label: "Slack Token", pattern: /xox[bporas]-[A-Za-z0-9-]{10,255}/g },
  { label: "Private Key Block", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g },
  { label: "Secret Assignment", pattern: /(?:api[_-]?key|api[_-]?secret|secret|password|token)\s*[:=]\s*["'][^"'\r\n]{8,}["']/gi },
  { label: "JWT Token", pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g }
];

export function redactMatch(value: string): string {
  return value.length <= 3 ? "***" : `${value.slice(0, 3)}***`;
}

export function scanTextForSecrets(content: string, filePath: string, cap = MAX_PER_FILE): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(content)) && findings.length < cap) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push({ filePath, ruleLabel: rule.label, line, redactedMatch: redactMatch(match[0]) });
    }
  }
  return findings;
}

function looksBinary(buffer: Buffer): boolean {
  return buffer.includes(0) || buffer.subarray(0, 8_192).some((byte) => byte < 7 || (byte > 13 && byte < 32));
}

export async function scanFilesForSecrets(projectRoot: string, files: readonly string[], maxFileSizeKb: number): Promise<SecretScanResult> {
  const findings: SecretFinding[] = [];
  let errorCount = 0;
  let hasMoreFindings = false;
  for (const relativePath of files) {
    if (findings.length >= MAX_TOTAL) { hasMoreFindings = true; break; }
    try {
      const absolutePath = join(projectRoot, relativePath);
      if (normalizeWorkspaceRelativePath(projectRoot, absolutePath) !== relativePath.replaceAll("\\", "/")) {
        errorCount += 1;
        continue;
      }
      const metadata = await stat(absolutePath);
      if (!metadata.isFile() || metadata.size > maxFileSizeKb * 1024) continue;
      const buffer = await readFile(absolutePath);
      if (looksBinary(buffer)) continue;
      const fileFindings = scanTextForSecrets(buffer.toString("utf8"), relativePath);
      const remaining = MAX_TOTAL - findings.length;
      findings.push(...fileFindings.slice(0, remaining));
      if (fileFindings.length > remaining) hasMoreFindings = true;
    } catch {
      errorCount += 1;
    }
  }
  return { findings, errorCount, hasMoreFindings };
}
