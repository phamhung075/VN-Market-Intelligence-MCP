/**
 * Tests for classifyStaleBadge — P1-B4
 * All tests inject `now` explicitly — no vi.useFakeTimers() needed.
 */
import { describe, it, expect } from "vitest";
import { classifyStaleBadge } from "./stale-badge";

describe("classifyStaleBadge", () => {
  // Fixed reference time for all tests
  const NOW = new Date("2026-05-25T10:00:00.000Z");
  const THRESHOLD = 30; // minutes

  it("undefined timestamp returns unknown", () => {
    expect(classifyStaleBadge(undefined, THRESHOLD, NOW)).toBe("unknown");
  });

  it("empty string timestamp returns unknown", () => {
    expect(classifyStaleBadge("", THRESHOLD, NOW)).toBe("unknown");
  });

  it("invalid (unparseable) string returns unknown", () => {
    expect(classifyStaleBadge("not-a-date", THRESHOLD, NOW)).toBe("unknown");
  });

  it("fresh timestamp (5 min ago) returns fresh", () => {
    // 5 minutes before NOW
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(classifyStaleBadge(fiveMinAgo, THRESHOLD, NOW)).toBe("fresh");
  });

  it("stale timestamp (60 min ago) returns stale", () => {
    // 60 minutes before NOW — exceeds 30-min threshold
    const sixtyMinAgo = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(classifyStaleBadge(sixtyMinAgo, THRESHOLD, NOW)).toBe("stale");
  });

  it("timestamp exactly at threshold returns fresh (not stale)", () => {
    // Exactly at threshold — should still be "fresh" (> not >=)
    const atThreshold = new Date(NOW.getTime() - THRESHOLD * 60_000).toISOString();
    expect(classifyStaleBadge(atThreshold, THRESHOLD, NOW)).toBe("fresh");
  });

  it("SQLite-format timestamp (YYYY-MM-DD HH:MM:SS) is parsed correctly", () => {
    // SQLite format — 2 minutes before NOW UTC
    const sqliteTs = "2026-05-25 09:58:00";
    expect(classifyStaleBadge(sqliteTs, THRESHOLD, NOW)).toBe("fresh");
  });

  it("SQLite-format stale timestamp returns stale", () => {
    // SQLite format — 2 hours before NOW UTC
    const sqliteOld = "2026-05-25 08:00:00";
    expect(classifyStaleBadge(sqliteOld, THRESHOLD, NOW)).toBe("stale");
  });
});
