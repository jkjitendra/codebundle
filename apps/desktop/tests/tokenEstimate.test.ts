import { describe, expect, it } from "vitest";
import {
  EXPORT_HEADER_OVERHEAD_BYTES,
  PER_FILE_MARKDOWN_OVERHEAD_BYTES,
  estimateTokenCount,
  formatBytes,
  formatTokenCount,
  getContextBadges,
  getContextBadgeState
} from "../src/renderer/lib/tokenEstimate";

// ─── estimateTokenCount ─────────────────────────────────────────────

describe("estimateTokenCount", () => {
  it("returns 0 for 0 bytes", () => {
    expect(estimateTokenCount(0)).toBe(0);
  });

  it("returns 0 for negative bytes", () => {
    expect(estimateTokenCount(-100)).toBe(0);
  });

  it("returns 1 for 4 bytes", () => {
    expect(estimateTokenCount(4)).toBe(1);
  });

  it("returns 25 for 100 bytes", () => {
    expect(estimateTokenCount(100)).toBe(25);
  });

  it("ceils non-round byte values", () => {
    expect(estimateTokenCount(1)).toBe(1);
    expect(estimateTokenCount(5)).toBe(2);
    expect(estimateTokenCount(7)).toBe(2);
    expect(estimateTokenCount(9)).toBe(3);
    expect(estimateTokenCount(13)).toBe(4);
  });

  it("handles large values (1 MB)", () => {
    const oneMb = 1024 * 1024;
    expect(estimateTokenCount(oneMb)).toBe(Math.ceil(oneMb / 4));
  });

  it("handles large values (10 MB)", () => {
    const tenMb = 10 * 1024 * 1024;
    expect(estimateTokenCount(tenMb)).toBe(Math.ceil(tenMb / 4));
  });

  it("returns exact values for multiples of 4", () => {
    expect(estimateTokenCount(8)).toBe(2);
    expect(estimateTokenCount(16)).toBe(4);
    expect(estimateTokenCount(400)).toBe(100);
    expect(estimateTokenCount(4000)).toBe(1000);
  });
});

// ─── getContextBadgeState ───────────────────────────────────────────

describe("getContextBadgeState", () => {
  it("returns green when tokens <= 80% of limit", () => {
    expect(getContextBadgeState(0, 128_000)).toBe("green");
    expect(getContextBadgeState(50_000, 128_000)).toBe("green");
    expect(getContextBadgeState(102_400, 128_000)).toBe("green"); // exactly 80%
  });

  it("returns amber when tokens > 80% and <= 100% of limit", () => {
    expect(getContextBadgeState(102_401, 128_000)).toBe("amber");
    expect(getContextBadgeState(120_000, 128_000)).toBe("amber");
    expect(getContextBadgeState(128_000, 128_000)).toBe("amber"); // exactly 100%
  });

  it("returns red when tokens > limit", () => {
    expect(getContextBadgeState(128_001, 128_000)).toBe("red");
    expect(getContextBadgeState(200_000, 128_000)).toBe("red");
    expect(getContextBadgeState(1_000_000, 128_000)).toBe("red");
  });

  it("handles 200K limit correctly", () => {
    expect(getContextBadgeState(100_000, 200_000)).toBe("green");
    expect(getContextBadgeState(160_000, 200_000)).toBe("green"); // 80%
    expect(getContextBadgeState(160_001, 200_000)).toBe("amber");
    expect(getContextBadgeState(200_001, 200_000)).toBe("red");
  });

  it("handles 1M limit correctly", () => {
    expect(getContextBadgeState(500_000, 1_000_000)).toBe("green");
    expect(getContextBadgeState(800_000, 1_000_000)).toBe("green"); // 80%
    expect(getContextBadgeState(800_001, 1_000_000)).toBe("amber");
    expect(getContextBadgeState(1_000_001, 1_000_000)).toBe("red");
  });

  it("returns green for 0 tokens", () => {
    expect(getContextBadgeState(0, 128_000)).toBe("green");
    expect(getContextBadgeState(0, 200_000)).toBe("green");
    expect(getContextBadgeState(0, 1_000_000)).toBe("green");
  });
});

// ─── getContextBadges ───────────────────────────────────────────────

describe("getContextBadges", () => {
  it("returns 3 badges", () => {
    const badges = getContextBadges(50_000);
    expect(badges).toHaveLength(3);
  });

  it("returns correct labels", () => {
    const badges = getContextBadges(0);
    expect(badges.map((b) => b.label)).toEqual(["128K context", "200K context", "1M context"]);
  });

  it("all green for small token count", () => {
    const badges = getContextBadges(10_000);
    expect(badges.every((b) => b.state === "green")).toBe(true);
  });

  it("shows mixed states for medium token count", () => {
    const badges = getContextBadges(170_000);
    const states = badges.map((b) => b.state);
    expect(states[0]).toBe("red");    // 128K: 170K > 128K
    expect(states[1]).toBe("amber");  // 200K: 170K > 80% of 200K (160K)
    expect(states[2]).toBe("green");  // 1M: 170K < 80% of 1M (800K)
  });

  it("all red for very large token count", () => {
    const badges = getContextBadges(2_000_000);
    expect(badges.every((b) => b.state === "red")).toBe(true);
  });
});

// ─── formatBytes ────────────────────────────────────────────────────

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats negative bytes as 0 B", () => {
    expect(formatBytes(-100)).toBe("0 B");
  });

  it("formats small byte values", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobyte values", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5120)).toBe("5.0 KB");
  });

  it("rounds kilobyte values >= 10", () => {
    expect(formatBytes(10240)).toBe("10 KB");
    expect(formatBytes(51200)).toBe("50 KB");
  });

  it("formats megabyte values", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(3670016)).toBe("3.5 MB");
  });

  it("rounds megabyte values >= 10", () => {
    expect(formatBytes(10485760)).toBe("10 MB");
    expect(formatBytes(52428800)).toBe("50 MB");
  });
});

// ─── formatTokenCount ───────────────────────────────────────────────

describe("formatTokenCount", () => {
  it("formats 0 without prefix", () => {
    expect(formatTokenCount(0)).toBe("0");
  });

  it("formats non-zero with ~ prefix", () => {
    expect(formatTokenCount(250)).toBe("~250");
  });

  it("formats with comma separators", () => {
    expect(formatTokenCount(12500)).toBe("~12,500");
    expect(formatTokenCount(1250000)).toBe("~1,250,000");
  });

  it("formats single digit with ~ prefix", () => {
    expect(formatTokenCount(1)).toBe("~1");
  });
});

// ─── Export Overhead Constants ──────────────────────────────────────

describe("export overhead constants", () => {
  it("EXPORT_HEADER_OVERHEAD_BYTES is 500", () => {
    expect(EXPORT_HEADER_OVERHEAD_BYTES).toBe(500);
  });

  it("PER_FILE_MARKDOWN_OVERHEAD_BYTES is 120", () => {
    expect(PER_FILE_MARKDOWN_OVERHEAD_BYTES).toBe(120);
  });

  it("overhead formula: header + fileCount * perFile", () => {
    const rawBytes = 1000;
    const fileCount = 5;
    const total = rawBytes + EXPORT_HEADER_OVERHEAD_BYTES + fileCount * PER_FILE_MARKDOWN_OVERHEAD_BYTES;
    // 1000 + 500 + 5 * 120 = 2100
    expect(total).toBe(2100);
    expect(estimateTokenCount(total)).toBe(Math.ceil(2100 / 4)); // 525
  });

  it("0 files means 0 overhead", () => {
    const rawBytes = 0;
    const fileCount = 0;
    // When fileCount is 0, overhead should not be applied
    const total = fileCount > 0 ? rawBytes + EXPORT_HEADER_OVERHEAD_BYTES + fileCount * PER_FILE_MARKDOWN_OVERHEAD_BYTES : 0;
    expect(total).toBe(0);
    expect(estimateTokenCount(total)).toBe(0);
  });

  it("single file overhead is header + 1 * perFile", () => {
    const rawBytes = 400;
    const fileCount = 1;
    const total = rawBytes + EXPORT_HEADER_OVERHEAD_BYTES + fileCount * PER_FILE_MARKDOWN_OVERHEAD_BYTES;
    // 400 + 500 + 120 = 1020
    expect(total).toBe(1020);
    expect(estimateTokenCount(total)).toBe(255); // ceil(1020/4)
  });
});
