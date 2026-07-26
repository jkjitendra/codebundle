import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanFilesForSecrets, scanTextForSecrets } from "../src/secretScanner";

describe("secret scanner", () => {
  it("detects common secrets and redacts their values", () => {
    const text = ["aws = AKIAIOSFODNN7EXAMPLE", "github = ghp_abcdefghijklmnopqrstuvwxyz12345678901234567890", "api_key = 'supersecretvalue'", "-----BEGIN PRIVATE KEY-----\nABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/ABCDEFG\n-----END PRIVATE KEY-----"].join("\n");
    const findings = scanTextForSecrets(text, "secrets.txt");
    expect(findings.map((finding) => finding.ruleLabel)).toEqual(expect.arrayContaining(["AWS Access Key ID", "GitHub Token", "Secret Assignment", "Private Key Block"]));
    expect(findings.every((finding) => finding.redactedMatch.endsWith("***"))).toBe(true);
    expect(JSON.stringify(findings)).not.toContain("supersecretvalue");
  });
  it("caps findings and skips oversized or binary files", async () => {
    const root = await mkdtemp(join(tmpdir(), "codebundler-vscode-secrets-"));
    try {
      await writeFile(join(root, "many.txt"), Array.from({ length: 30 }, (_, index) => `token = 'value-${index}-abcdefgh'`).join("\n"));
      await writeFile(join(root, "binary.dat"), Buffer.from([0, 1, 2, 3]));
      await writeFile(join(root, "large.txt"), "x".repeat(2_000));
      const scan = await scanFilesForSecrets(root, ["many.txt", "binary.dat", "large.txt"], 1);
      expect(scan.findings).toHaveLength(20);
      expect(scan.findings.every((finding) => finding.filePath === "many.txt")).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
