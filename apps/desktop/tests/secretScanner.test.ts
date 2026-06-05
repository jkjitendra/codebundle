import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLikelyConfigPropertySecret,
  isLikelyPemPrivateKeyBlock,
  redactValue,
  scanContentForSecrets,
  scanFileForSecrets,
  scanFilesForSecrets,
  SECRET_SCAN_RULES
} from "../src/main/secretScanner";
import type { SecretFinding, SecretScanResult } from "../src/shared/types";

// ─── Helpers ────────────────────────────────────────────────────────

async function createTempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "codebundle-secret-scan-"));
}

function assertNoRawSecrets(findings: SecretFinding[], rawSecrets: string[]): void {
  const serialized = JSON.stringify(findings);
  for (const raw of rawSecrets) {
    expect(serialized).not.toContain(raw);
  }
}

function assertNoRawSecretsInResult(result: SecretScanResult, rawSecrets: string[]): void {
  const serialized = JSON.stringify(result);
  for (const raw of rawSecrets) {
    expect(serialized).not.toContain(raw);
  }
}

// ─── Redaction ──────────────────────────────────────────────────────

describe("redactValue", () => {
  it("redacts values longer than 3 characters", () => {
    expect(redactValue("AKIAIOSFODNN7EXAMPLE")).toBe("AKI***");
    expect(redactValue("ghp_abc123def456ghi789jkl012mno345pqrstu6")).toBe("ghp***");
  });

  it("fully redacts values of 3 characters or fewer", () => {
    expect(redactValue("abc")).toBe("***");
    expect(redactValue("ab")).toBe("***");
    expect(redactValue("a")).toBe("***");
    expect(redactValue("")).toBe("***");
  });

  it("never returns the original value for realistic secrets", () => {
    const secrets = [
      "AKIAIOSFODNN7EXAMPLE",
      "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "xoxb-xxx-yyy-zzz-000",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N"
    ];
    for (const secret of secrets) {
      const redacted = redactValue(secret);
      expect(redacted).not.toBe(secret);
      expect(redacted.endsWith("***")).toBe(true);
    }
  });
});

// ─── Rule Detection ─────────────────────────────────────────────────

describe("SECRET_SCAN_RULES detection", () => {
  it("detects AWS access key IDs", () => {
    const content = 'aws_key = "AKIAIOSFODNN7EXAMPLE"';
    const findings = scanContentForSecrets(content, "config.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "aws-access-key")).toBe(true);
    assertNoRawSecrets(findings, ["AKIAIOSFODNN7EXAMPLE"]);
  });

  it("detects GitHub tokens (fine-grained)", () => {
    const token = "ghp_" + "A".repeat(40);
    const content = `const token = "${token}";`;
    const findings = scanContentForSecrets(content, "auth.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "github-token")).toBe(true);
    assertNoRawSecrets(findings, [token]);
  });

  it("detects GitHub personal access tokens (classic)", () => {
    const token = "github_pat_" + "B".repeat(82);
    const content = `export const PAT = "${token}";`;
    const findings = scanContentForSecrets(content, "auth.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "github-token-classic")).toBe(true);
    assertNoRawSecrets(findings, [token]);
  });

  it("detects Slack tokens", () => {
    const token = "xoxb-1234567890-abcdefghij";
    const content = `SLACK_TOKEN="${token}"`;
    const findings = scanContentForSecrets(content, ".env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "slack-token")).toBe(true);
    assertNoRawSecrets(findings, [token]);
  });

  it("detects generic API key assignments", () => {
    const content = 'const config = { api_key: "sk-1234567890abcdef" };';
    const findings = scanContentForSecrets(content, "config.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "generic-api-key")).toBe(true);
    assertNoRawSecrets(findings, ["sk-1234567890abcdef"]);
  });

  it("detects generic secret_key assignments", () => {
    const content = 'SECRET_KEY="my-super-secret-key-value"';
    const findings = scanContentForSecrets(content, "app.py", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "generic-api-key")).toBe(true);
  });

  it("detects JWT tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XlGo";
    const content = `Authorization: Bearer ${jwt}`;
    const findings = scanContentForSecrets(content, "test.http", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "jwt-token")).toBe(true);
    assertNoRawSecrets(findings, [jwt]);
  });

  it("detects env-inline secrets with PASSWORD", () => {
    const content = "DATABASE_PASSWORD=supersecretpassword123\nAPP_NAME=myapp";
    const findings = scanContentForSecrets(content, ".env.local", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
    assertNoRawSecrets(findings, ["supersecretpassword123"]);
  });

  it("detects AUTH_TOKEN in env format", () => {
    const content = "AUTH_TOKEN=abc123def456";
    const findings = scanContentForSecrets(content, ".env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });

  it("detects API_KEY in env format", () => {
    const content = "API_KEY=abc123def4567890";
    const findings = scanContentForSecrets(content, ".env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });

  it("detects STRIPE_KEY in env format", () => {
    const content = "STRIPE_KEY=sk_test_1234567890abcdef";
    const findings = scanContentForSecrets(content, ".env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });

  it("detects ENCRYPTION_KEY in env format", () => {
    const content = "ENCRYPTION_KEY=abcdef1234567890";
    const findings = scanContentForSecrets(content, "config.env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });
});

// ─── Private Key Block Detection ────────────────────────────────────

describe("private-key-block detection", () => {
  it("detects a real PRIVATE KEY block", () => {
    const content = [
      "-----BEGIN PRIVATE KEY-----",
      "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJK",
      "-----END PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "key.pem", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(true);
  });

  it("detects a real RSA PRIVATE KEY block", () => {
    const content = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      "-----END RSA PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "rsa.key", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(true);
  });

  it("detects a real EC PRIVATE KEY block", () => {
    const content = [
      "-----BEGIN EC PRIVATE KEY-----",
      "MHQCAQEEIOLkN6K1THxBXOEOuqC0bJnwUF9SQBCE5JH9xjzLGqAAoAcDDQYJKoZI",
      "-----END EC PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "ec.key", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(true);
  });

  it("detects a real OPENSSH PRIVATE KEY block", () => {
    const content = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW",
      "-----END OPENSSH PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "id_ed25519", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(true);
  });

  it("detects a real multi-line PEM block", () => {
    const content = [
      "-----BEGIN PRIVATE KEY-----",
      "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7YZ",
      "MIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCD",
      "-----END PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "key.pem", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(true);
  });
});

// ─── Private Key False Positive Resistance ──────────────────────────

describe("private-key-block false positive resistance", () => {
  it("does NOT flag Java code that removes PEM headers (AppleClientSecretGenerator regression)", () => {
    const content = `
package com.expensepro.backend.oauth.apple;

public class AppleClientSecretGenerator {
  private PrivateKey loadPrivateKey() {
    String keyContent = Files.readString(Path.of(privateKeyPath));

    // Remove PEM headers and whitespace
    keyContent = keyContent
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replaceAll("\\\\s+", "");

    return null;
  }
}
`;
    const findings = scanContentForSecrets(content, "AppleClientSecretGenerator.java", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag a standalone BEGIN header without END footer", () => {
    const content = '-----BEGIN PRIVATE KEY-----\nconsole.log("hello");';
    const findings = scanContentForSecrets(content, "test.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag a standalone END footer without BEGIN header", () => {
    const content = 'console.log("hello");\n-----END PRIVATE KEY-----';
    const findings = scanContentForSecrets(content, "test.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag BEGIN and END with no body between them", () => {
    const content = "-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----";
    const findings = scanContentForSecrets(content, "empty.pem", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag BEGIN and END with only whitespace between them", () => {
    const content = "-----BEGIN PRIVATE KEY-----\n   \n  \n-----END PRIVATE KEY-----";
    const findings = scanContentForSecrets(content, "empty.pem", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag BEGIN and END with a very short body", () => {
    const content = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----";
    const findings = scanContentForSecrets(content, "tiny.pem", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag BEGIN and END with Java source code between them", () => {
    const content = [
      "-----BEGIN PRIVATE KEY-----",
      '  .replace("some content", "")',
      '  .replaceAll("\\\\n", "");',
      "-----END PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "parser.java", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag PEM headers inside .replace() string literals", () => {
    const content = [
      'content = content.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "");'
    ].join("\n");
    const findings = scanContentForSecrets(content, "util.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag PEM headers in Python string manipulation", () => {
    const content = [
      "-----BEGIN RSA PRIVATE KEY-----",
      'key_content = key_content.replace("-----BEGIN RSA PRIVATE KEY-----", "")',
      'key_content = key_content.replace("-----END RSA PRIVATE KEY-----", "")',
      "-----END RSA PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "crypto.py", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });

  it("does NOT flag BEGIN and END with JSON/object syntax between them", () => {
    const content = [
      "-----BEGIN PRIVATE KEY-----",
      '{ "key": "value", "another": true }',
      "-----END PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "test.json", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "private-key-block")).toBe(false);
  });
});

// ─── isLikelyPemPrivateKeyBlock ─────────────────────────────────────

describe("isLikelyPemPrivateKeyBlock", () => {
  it("returns true for real PEM key blocks", () => {
    const block = [
      "-----BEGIN PRIVATE KEY-----",
      "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJK",
      "-----END PRIVATE KEY-----"
    ].join("\n");
    expect(isLikelyPemPrivateKeyBlock(block)).toBe(true);
  });

  it("returns false for block with no body", () => {
    const block = "-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----";
    expect(isLikelyPemPrivateKeyBlock(block)).toBe(false);
  });

  it("returns false for block with short body", () => {
    const block = "-----BEGIN PRIVATE KEY-----\nABC123\n-----END PRIVATE KEY-----";
    expect(isLikelyPemPrivateKeyBlock(block)).toBe(false);
  });

  it("returns false for block with source code body", () => {
    const block = [
      "-----BEGIN PRIVATE KEY-----",
      '.replace("something", "")',
      ".replaceAll(\"\\\\s+\", \"\");",
      "-----END PRIVATE KEY-----"
    ].join("\n");
    expect(isLikelyPemPrivateKeyBlock(block)).toBe(false);
  });

  it("returns false for block with JSON body", () => {
    const block = [
      "-----BEGIN PRIVATE KEY-----",
      '{ "key": "value", "nested": { "a": 1 } }',
      "-----END PRIVATE KEY-----"
    ].join("\n");
    expect(isLikelyPemPrivateKeyBlock(block)).toBe(false);
  });

  it("returns false when no BEGIN or END markers found", () => {
    expect(isLikelyPemPrivateKeyBlock("just some random text")).toBe(false);
  });
});

// ─── Env-inline-secret KEY detection ────────────────────────────────

describe("env-inline-secret KEY detection", () => {
  it("detects API_KEY in env format", () => {
    const content = "API_KEY=abc123def4567890";
    const findings = scanContentForSecrets(content, "config.env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });

  it("detects STRIPE_KEY in env format", () => {
    const content = "STRIPE_KEY=sk_test_1234567890abcdef";
    const findings = scanContentForSecrets(content, "config.env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });

  it("detects PRIVATE_KEY in env format", () => {
    const content = "PRIVATE_KEY=base64encodedkeyvalue";
    const findings = scanContentForSecrets(content, "config.env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });

  it("detects ENCRYPTION_KEY in env format", () => {
    const content = "ENCRYPTION_KEY=abcdef1234567890";
    const findings = scanContentForSecrets(content, "config.env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(true);
  });
});

// ─── Env-inline-secret False Positives ──────────────────────────────

describe("env-inline-secret false positive resistance", () => {
  it("does not match normal environment variable names without secrets", () => {
    const content = "APP_NAME=codebundle\nNODE_ENV=production\nPORT=3000";
    const findings = scanContentForSecrets(content, ".env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(false);
  });

  it("does not match variables that don't contain secret-related words", () => {
    const content = "DATABASE_HOST=localhost\nREDIS_PORT=6379\nLOG_LEVEL=debug";
    const findings = scanContentForSecrets(content, ".env", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "env-inline-secret")).toBe(false);
  });
});

// ─── Config Property Secret Detection ───────────────────────────────

describe("config-property-secret detection", () => {
  it("detects spring.datasource.password", () => {
    const content = "spring.datasource.password=myPassword123";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(true);
    assertNoRawSecrets(findings, ["myPassword123"]);
  });

  it("detects spring.security.oauth2...client-secret", () => {
    const content = "spring.security.oauth2.client.registration.google.client-secret=abc123456789";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(true);
    assertNoRawSecrets(findings, ["abc123456789"]);
  });

  it("detects jwt.secret", () => {
    const content = "jwt.secret=myJwtSecretValue123";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(true);
    assertNoRawSecrets(findings, ["myJwtSecretValue123"]);
  });

  it("detects aws.secretAccessKey", () => {
    const content = "aws.secretAccessKey=abc123456789";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(true);
    assertNoRawSecrets(findings, ["abc123456789"]);
  });

  it("detects app.api-key", () => {
    const content = "app.api-key=abc123456789";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(true);
    assertNoRawSecrets(findings, ["abc123456789"]);
  });

  it("detects mail.password with spaces around separator", () => {
    const content = "mail.password = myMailPassword";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(true);
  });

  it("detects redis.password with colon separator (YAML style)", () => {
    const content = "redis.password: myRedisPassword";
    const findings = scanContentForSecrets(content, "application.yml", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(true);
  });
});

// ─── Config Property Secret False Positives ─────────────────────────

describe("config-property-secret false positive resistance", () => {
  it("does NOT detect spring.datasource.url", () => {
    const content = "spring.datasource.url=jdbc:mysql://localhost:3306/db";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect server.port", () => {
    const content = "server.port=8080";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect spring.application.name", () => {
    const content = "spring.application.name=expensepro";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect logging.level.root", () => {
    const content = "logging.level.root=INFO";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect apple.private-key-path (path suffix)", () => {
    const content = "apple.private-key-path=/Users/me/AuthKey_ABC123.p8";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect classpath path values", () => {
    const content = "apple.private-key-path=classpath:keys/apple.p8";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect env-variable placeholders like ${DB_PASSWORD}", () => {
    const content = "spring.datasource.password=${DB_PASSWORD}";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect env-variable placeholders with defaults like ${JWT_SECRET:default}", () => {
    const content = "jwt.secret=${JWT_SECRET:defaultValue}";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect placeholder/dummy/changeme/example values", () => {
    const placeholders = ["placeholder", "changeme", "dummy", "example", "your-secret-here"];
    for (const val of placeholders) {
      const content = `spring.datasource.password=${val}`;
      const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
      expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
    }
  });

  it("does NOT detect short values (< 8 chars)", () => {
    const content = "spring.datasource.password=abc";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect key-file path references", () => {
    const content = "ssl.key-file=/etc/ssl/private/server.key";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });

  it("does NOT detect token-url properties", () => {
    const content = "oauth2.token-url=https://auth.example.com/oauth/token";
    const findings = scanContentForSecrets(content, "application.properties", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "config-property-secret")).toBe(false);
  });
});

// ─── isLikelyConfigPropertySecret ───────────────────────────────────

describe("isLikelyConfigPropertySecret", () => {
  it("returns true for real config secrets", () => {
    expect(isLikelyConfigPropertySecret("spring.datasource.password=myPassword123")).toBe(true);
    expect(isLikelyConfigPropertySecret("jwt.secret=myJwtSecretValue123")).toBe(true);
    expect(isLikelyConfigPropertySecret("aws.secretAccessKey=AKIAIOSFODNN7EXAMPLE")).toBe(true);
  });

  it("returns false for empty values", () => {
    expect(isLikelyConfigPropertySecret("spring.datasource.password=")).toBe(false);
  });

  it("returns false for path-suffix keys", () => {
    expect(isLikelyConfigPropertySecret("apple.private-key-path=/path/to/key.p8")).toBe(false);
    expect(isLikelyConfigPropertySecret("ssl.secret-file=/etc/ssl/secret.pem")).toBe(false);
    expect(isLikelyConfigPropertySecret("token-url=https://example.com/token")).toBe(false);
  });

  it("returns false for env-variable placeholders", () => {
    expect(isLikelyConfigPropertySecret("spring.datasource.password=${DB_PASSWORD}")).toBe(false);
    expect(isLikelyConfigPropertySecret("jwt.secret=${JWT_SECRET:}")).toBe(false);
    expect(isLikelyConfigPropertySecret("jwt.secret=${JWT_SECRET:default}")).toBe(false);
  });

  it("returns false for placeholder values", () => {
    expect(isLikelyConfigPropertySecret("spring.datasource.password=changeme")).toBe(false);
    expect(isLikelyConfigPropertySecret("spring.datasource.password=placeholder")).toBe(false);
    expect(isLikelyConfigPropertySecret("spring.datasource.password=example")).toBe(false);
  });

  it("returns false for short values", () => {
    expect(isLikelyConfigPropertySecret("spring.datasource.password=abc")).toBe(false);
    expect(isLikelyConfigPropertySecret("spring.datasource.password=1234567")).toBe(false);
  });

  it("returns false for lines without separator", () => {
    expect(isLikelyConfigPropertySecret("just-a-password-string")).toBe(false);
  });
});

// ─── False Positive Resistance (general) ────────────────────────────

describe("false positive resistance", () => {
  it("does not match normal code", () => {
    const content = [
      'const greeting = "Hello, world!";',
      "function add(a: number, b: number) { return a + b; }",
      "import React from 'react';",
      "export default App;",
      "const MAX_RETRIES = 3;"
    ].join("\n");
    const findings = scanContentForSecrets(content, "app.ts", SECRET_SCAN_RULES, 20);
    expect(findings).toHaveLength(0);
  });

  it("does not match short values in API key patterns", () => {
    const content = 'const config = { api_key: "short" };';
    const findings = scanContentForSecrets(content, "config.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "generic-api-key")).toBe(false);
  });

  it("does not match comments about API keys without actual values", () => {
    const content = "// TODO: add api_key configuration here";
    const findings = scanContentForSecrets(content, "config.ts", SECRET_SCAN_RULES, 20);
    expect(findings.some((f) => f.ruleId === "generic-api-key")).toBe(false);
  });
});

// ─── Line Numbers ───────────────────────────────────────────────────

describe("line number accuracy", () => {
  it("returns correct line numbers for findings", () => {
    const content = [
      "// line 1",
      "// line 2",
      'const key = "AKIAIOSFODNN7EXAMPLE";',
      "// line 4"
    ].join("\n");
    const findings = scanContentForSecrets(content, "test.ts", SECRET_SCAN_RULES, 20);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].line).toBe(3);
  });

  it("returns correct line numbers for PEM blocks", () => {
    const content = [
      "line1",
      "line2",
      "line3",
      "line4",
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      "-----END RSA PRIVATE KEY-----"
    ].join("\n");
    const findings = scanContentForSecrets(content, "key.pem", SECRET_SCAN_RULES, 20);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].line).toBe(5);
  });
});

// ─── Per-file Cap ───────────────────────────────────────────────────

describe("per-file finding cap", () => {
  it("caps findings per file at the specified limit", () => {
    // Create content with many AWS keys
    const lines = Array.from({ length: 30 }, (_, i) => `KEY${i}=AKIA${"A".repeat(16)}`);
    const content = lines.join("\n");
    const findings = scanContentForSecrets(content, "many-keys.ts", SECRET_SCAN_RULES, 5);
    expect(findings.length).toBeLessThanOrEqual(5);
  });
});

// ─── File Scanning ──────────────────────────────────────────────────

describe("scanFileForSecrets", () => {
  it("scans a real file and returns redacted findings", async () => {
    const root = await createTempProject();
    const awsKey = "AKIAIOSFODNN7EXAMPLE";
    await writeFile(join(root, "config.ts"), `const key = "${awsKey}";\n`, "utf8");

    const result = await scanFileForSecrets(
      join(root, "config.ts"),
      root,
      500 * 1024,
      SECRET_SCAN_RULES,
      20
    );

    expect(result.error).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].filePath).toBe("config.ts");
    assertNoRawSecrets(result.findings, [awsKey]);
    await rm(root, { recursive: true, force: true });
  });

  it("skips files larger than maxFileSizeBytes", async () => {
    const root = await createTempProject();
    const awsKey = "AKIAIOSFODNN7EXAMPLE";
    await writeFile(join(root, "big.ts"), `const key = "${awsKey}";\n`, "utf8");

    const result = await scanFileForSecrets(
      join(root, "big.ts"),
      root,
      10, // 10 bytes max
      SECRET_SCAN_RULES,
      20
    );

    expect(result.findings).toHaveLength(0);
    expect(result.error).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it("returns error flag for missing files", async () => {
    const root = await createTempProject();
    const result = await scanFileForSecrets(
      join(root, "nonexistent.ts"),
      root,
      500 * 1024,
      SECRET_SCAN_RULES,
      20
    );
    expect(result.error).toBe(true);
    expect(result.findings).toHaveLength(0);
    await rm(root, { recursive: true, force: true });
  });
});

// ─── Batch Scanning (relative paths) ────────────────────────────────

describe("scanFilesForSecrets", () => {
  it("accepts relative paths and resolves them against projectRoot", async () => {
    const root = await createTempProject();
    const awsKey = "AKIAIOSFODNN7EXAMPLE";
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "config.ts"), `const k = "${awsKey}";\n`, "utf8");

    const result = await scanFilesForSecrets({
      projectRoot: root,
      filePaths: ["src/config.ts"],
      maxFileSizeKb: 500
    });

    expect(result.scannedFileCount).toBe(1);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].filePath).toBe("src/config.ts");
    assertNoRawSecretsInResult(result, [awsKey]);
    await rm(root, { recursive: true, force: true });
  });

  it("scans multiple files and aggregates findings", async () => {
    const root = await createTempProject();
    const awsKey = "AKIAIOSFODNN7EXAMPLE";
    const slackToken = "xoxb-123456789-abcdefghij";
    await writeFile(join(root, "a.ts"), `const k = "${awsKey}";\n`, "utf8");
    await writeFile(join(root, "b.ts"), `SLACK="${slackToken}";\n`, "utf8");

    const result = await scanFilesForSecrets({
      projectRoot: root,
      filePaths: ["a.ts", "b.ts"],
      maxFileSizeKb: 500
    });

    expect(result.scannedFileCount).toBe(2);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    assertNoRawSecretsInResult(result, [awsKey, slackToken]);
    await rm(root, { recursive: true, force: true });
  });

  it("rejects relative paths that escape projectRoot via ..", async () => {
    const root = await createTempProject();
    await writeFile(join(root, "ok.ts"), 'export const x = "AKIAIOSFODNN7EXAMPLE";\n', "utf8");

    const result = await scanFilesForSecrets({
      projectRoot: root,
      filePaths: ["ok.ts", "../../etc/passwd", "../outside.ts"],
      maxFileSizeKb: 500
    });

    // Should only include the valid file inside the project root
    expect(result.scannedFileCount).toBe(1);
    await rm(root, { recursive: true, force: true });
  });

  it("rejects empty and non-string paths", async () => {
    const root = await createTempProject();
    await writeFile(join(root, "ok.ts"), "export const x = 1;\n", "utf8");

    const result = await scanFilesForSecrets({
      projectRoot: root,
      filePaths: ["ok.ts", "", "   "],
      maxFileSizeKb: 500
    });

    // Empty strings should be filtered out, leaving only ok.ts
    expect(result.scannedFileCount).toBeLessThanOrEqual(2);
    await rm(root, { recursive: true, force: true });
  });

  it("counts errors for unreadable files", async () => {
    const root = await createTempProject();
    await writeFile(join(root, "ok.ts"), "export const x = 1;\n", "utf8");

    const result = await scanFilesForSecrets({
      projectRoot: root,
      filePaths: ["ok.ts", "missing.ts"],
      maxFileSizeKb: 500
    });

    expect(result.errorCount).toBe(1);
    await rm(root, { recursive: true, force: true });
  });

  it("sets hasMoreFindings when global cap is reached", async () => {
    const root = await createTempProject();
    await mkdir(join(root, "files"), { recursive: true });
    // Create enough files to exceed the 200 global cap
    for (let i = 0; i < 15; i++) {
      const lines = Array.from({ length: 20 }, (_, j) => `KEY_${i}_${j}=AKIA${"A".repeat(16)}`);
      await writeFile(join(root, "files", `keys-${i}.env`), lines.join("\n"), "utf8");
    }

    const filePaths = Array.from({ length: 15 }, (_, i) => `files/keys-${i}.env`);
    const result = await scanFilesForSecrets({
      projectRoot: root,
      filePaths,
      maxFileSizeKb: 500
    });

    expect(result.findings.length).toBeLessThanOrEqual(200);
    expect(result.hasMoreFindings).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it("returns clean results for projects without secrets", async () => {
    const root = await createTempProject();
    await writeFile(join(root, "app.ts"), "console.log('hello');\n", "utf8");
    await writeFile(join(root, "utils.ts"), "export function add(a: number, b: number) { return a + b; }\n", "utf8");

    const result = await scanFilesForSecrets({
      projectRoot: root,
      filePaths: ["app.ts", "utils.ts"],
      maxFileSizeKb: 500
    });

    expect(result.findings).toHaveLength(0);
    expect(result.scannedFileCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.hasMoreFindings).toBe(false);
    await rm(root, { recursive: true, force: true });
  });
});

// ─── Raw Secret Value Leak Prevention ───────────────────────────────

describe("raw secret values never appear in results", () => {
  const secretsMap: Record<string, string> = {
    "AWS key": 'const k = "AKIAIOSFODNN7EXAMPLE";',
    "GitHub token": `const t = "ghp_${"X".repeat(40)}";`,
    "Slack token": 'const s = "xoxb-123456789012-abcdefghijk";',
    "JWT": 'const j = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XlGo";',
    "Private key": [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      "-----END RSA PRIVATE KEY-----"
    ].join("\n"),
    "Generic API key": 'api_key: "sk-1234567890abcdef-ghij"',
    "Env secret": "MY_SECRET_TOKEN=super-secret-value-123456"
  };

  for (const [label, content] of Object.entries(secretsMap)) {
    it(`never leaks raw value for ${label}`, async () => {
      const root = await createTempProject();
      await writeFile(join(root, "test.ts"), content, "utf8");

      const result = await scanFilesForSecrets({
        projectRoot: root,
        filePaths: ["test.ts"],
        maxFileSizeKb: 500
      });

      // Extract the actual secret values from the content using the same patterns
      for (const finding of result.findings) {
        // The redactedMatch should never equal the full matched text
        expect(finding.redactedMatch.endsWith("***")).toBe(true);
        // The redactedMatch should be short (prefix + ***)
        expect(finding.redactedMatch.length).toBeLessThanOrEqual(6);
      }

      // The entire serialized result should not contain any raw pattern match
      const serialized = JSON.stringify(result);
      // Check that no secret longer than 6 chars from content appears in the result
      const longTokens = content.match(/[A-Za-z0-9_-]{7,}/g) ?? [];
      for (const token of longTokens) {
        // Skip tokens that are part of rule labels or field names
        if (["Private", "api_key", "PRIVATE"].includes(token)) {
          continue;
        }
        // Tokens that are part of the key names or generic words are fine
        if (token.length <= 10 && /^[A-Z_]+$/.test(token)) {
          continue;
        }
        expect(serialized).not.toContain(token);
      }

      await rm(root, { recursive: true, force: true });
    });
  }
});

// ─── Finding Shape ──────────────────────────────────────────────────

describe("finding shape", () => {
  it("has all required fields", () => {
    const content = 'const k = "AKIAIOSFODNN7EXAMPLE";';
    const findings = scanContentForSecrets(content, "config.ts", SECRET_SCAN_RULES, 20);
    expect(findings.length).toBeGreaterThan(0);
    const finding = findings[0];
    expect(finding).toHaveProperty("filePath");
    expect(finding).toHaveProperty("ruleId");
    expect(finding).toHaveProperty("ruleLabel");
    expect(finding).toHaveProperty("severity");
    expect(finding).toHaveProperty("line");
    expect(finding).toHaveProperty("redactedMatch");
    expect(typeof finding.filePath).toBe("string");
    expect(typeof finding.ruleId).toBe("string");
    expect(typeof finding.ruleLabel).toBe("string");
    expect(["high", "medium"]).toContain(finding.severity);
    expect(typeof finding.line).toBe("number");
    expect(typeof finding.redactedMatch).toBe("string");
  });
});
