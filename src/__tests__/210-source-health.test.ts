/**
 * Task 210 — News Source Health Monitoring
 *
 * Tests for:
 *   - SourceHealthTracker records successes and failures
 *   - Status transitions: ok → degraded → down
 *   - getHealth returns correct shape for unknown and known sources
 *   - getAllHealth returns all tracked sources
 *   - isDown returns true at 5+ consecutive failures
 *   - recordSuccess resets failure count and restores status to ok
 *   - lastSuccessAt is updated on success and preserved across failures
 *   - lastErrorMessage is stored on failure, cleared on success
 *   - get_source_health MCP tool returns formatted table
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { SourceHealthTracker } from "../domain/services/sourceHealthTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — SourceHealthTracker domain service
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 210 — SourceHealthTracker", () => {
  let tracker: SourceHealthTracker;

  beforeEach(() => {
    tracker = new SourceHealthTracker();
  });

  // ── getHealth — unknown source returns default shape ──────────────────────

  it("returns default health for unknown source", () => {
    const health = tracker.getHealth("cafef");
    expect(health.source).toBe("cafef");
    expect(health.status).toBe("ok");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastSuccessAt).toBeNull();
    expect(health.lastErrorMessage).toBeNull();
  });

  // ── recordSuccess ────────────────────────────────────────────────────────

  it("recordSuccess sets status to ok and updates lastSuccessAt", () => {
    const before = new Date().toISOString();
    tracker.recordSuccess("cafef");
    const after = new Date().toISOString();
    const health = tracker.getHealth("cafef");

    expect(health.status).toBe("ok");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastErrorMessage).toBeNull();
    expect(health.lastSuccessAt).not.toBeNull();
    expect(health.lastSuccessAt! >= before).toBe(true);
    expect(health.lastSuccessAt! <= after).toBe(true);
  });

  it("recordSuccess resets consecutive failures to 0", () => {
    tracker.recordFailure("cafef", "timeout");
    tracker.recordFailure("cafef", "timeout");
    tracker.recordSuccess("cafef");

    const health = tracker.getHealth("cafef");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.status).toBe("ok");
  });

  it("recordSuccess clears lastErrorMessage", () => {
    tracker.recordFailure("cafef", "connection refused");
    tracker.recordSuccess("cafef");
    const health = tracker.getHealth("cafef");
    expect(health.lastErrorMessage).toBeNull();
  });

  // ── recordFailure — status transitions ───────────────────────────────────

  it("status becomes degraded after 1 failure", () => {
    tracker.recordFailure("vnexpress", "HTTP 503");
    const health = tracker.getHealth("vnexpress");
    expect(health.status).toBe("degraded");
    expect(health.consecutiveFailures).toBe(1);
    expect(health.lastErrorMessage).toBe("HTTP 503");
  });

  it("status stays degraded at 4 consecutive failures", () => {
    for (let i = 0; i < 4; i++) {
      tracker.recordFailure("vnexpress", "error");
    }
    expect(tracker.getHealth("vnexpress").status).toBe("degraded");
    expect(tracker.getHealth("vnexpress").consecutiveFailures).toBe(4);
  });

  it("status becomes down at 5 consecutive failures", () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordFailure("google_news", "connection timeout");
    }
    const health = tracker.getHealth("google_news");
    expect(health.status).toBe("down");
    expect(health.consecutiveFailures).toBe(5);
  });

  it("status stays down beyond 5 consecutive failures", () => {
    for (let i = 0; i < 8; i++) {
      tracker.recordFailure("trading_economics", "error");
    }
    expect(tracker.getHealth("trading_economics").status).toBe("down");
    expect(tracker.getHealth("trading_economics").consecutiveFailures).toBe(8);
  });

  it("lastErrorMessage is updated to the most recent error", () => {
    tracker.recordFailure("cafef", "first error");
    tracker.recordFailure("cafef", "second error");
    expect(tracker.getHealth("cafef").lastErrorMessage).toBe("second error");
  });

  // ── isDown ────────────────────────────────────────────────────────────────

  it("isDown returns false for unknown source", () => {
    expect(tracker.isDown("unknown_source")).toBe(false);
  });

  it("isDown returns false with 4 failures", () => {
    for (let i = 0; i < 4; i++) {
      tracker.recordFailure("cafef", "err");
    }
    expect(tracker.isDown("cafef")).toBe(false);
  });

  it("isDown returns true with 5 consecutive failures", () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordFailure("cafef", "err");
    }
    expect(tracker.isDown("cafef")).toBe(true);
  });

  it("isDown returns false after recovery from down state", () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordFailure("cafef", "err");
    }
    tracker.recordSuccess("cafef");
    expect(tracker.isDown("cafef")).toBe(false);
  });

  // ── getAllHealth ───────────────────────────────────────────────────────────

  it("getAllHealth returns empty array when no sources tracked", () => {
    expect(tracker.getAllHealth()).toEqual([]);
  });

  it("getAllHealth returns all tracked sources", () => {
    tracker.recordSuccess("cafef");
    tracker.recordSuccess("vnexpress");
    tracker.recordFailure("reuters", "403");

    const all = tracker.getAllHealth();
    const sources = all.map((h) => h.source);
    expect(sources).toContain("cafef");
    expect(sources).toContain("vnexpress");
    expect(sources).toContain("reuters");
    expect(all).toHaveLength(3);
  });

  it("getAllHealth does not return unknown sources", () => {
    tracker.recordSuccess("cafef");
    const all = tracker.getAllHealth();
    expect(all).toHaveLength(1);
    expect(all[0]!.source).toBe("cafef");
  });

  // ── lastSuccessAt preserved across failures ───────────────────────────────

  it("lastSuccessAt is preserved when failures occur after success", () => {
    tracker.recordSuccess("cafef");
    const successTime = tracker.getHealth("cafef").lastSuccessAt;

    tracker.recordFailure("cafef", "error");
    tracker.recordFailure("cafef", "error");

    expect(tracker.getHealth("cafef").lastSuccessAt).toBe(successTime);
  });

  // ── SourceHealth shape correctness ────────────────────────────────────────

  it("SourceHealth contains all required fields", () => {
    tracker.recordSuccess("test_source");
    const health = tracker.getHealth("test_source");

    expect(Object.keys(health)).toEqual(
      expect.arrayContaining([
        "source",
        "status",
        "lastSuccessAt",
        "consecutiveFailures",
        "lastErrorMessage",
      ]),
    );
  });

  // ── Multiple independent sources don't affect each other ─────────────────

  it("failures on one source do not affect another source", () => {
    for (let i = 0; i < 5; i++) {
      tracker.recordFailure("cafef", "err");
    }
    tracker.recordSuccess("vnexpress");

    expect(tracker.getHealth("cafef").status).toBe("down");
    expect(tracker.getHealth("vnexpress").status).toBe("ok");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration test — get_source_health MCP tool formatting
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 210 — formatSourceHealth output", () => {
  it("formats a table with Vietnamese labels", async () => {
    const { formatSourceHealthTable } = await import(
      "../interface/mcp/tools/sourceHealthTools.js"
    );

    const tracker = new SourceHealthTracker();
    tracker.recordSuccess("CafeF RSS");
    tracker.recordSuccess("VnExpress RSS");
    for (let i = 0; i < 3; i++) tracker.recordFailure("Google News", "timeout");
    for (let i = 0; i < 7; i++) tracker.recordFailure("Trading Economics", "503");

    const output = formatSourceHealthTable(tracker.getAllHealth());

    // Header present
    expect(output).toContain("Tinh trang nguon du lieu");
    // Source names present
    expect(output).toContain("CafeF RSS");
    expect(output).toContain("Trading Economics");
    // Status Vietnamese labels
    expect(output).toContain("OK");
    expect(output).toContain("Suy giam");
    expect(output).toContain("Ngung");
    // Down source gets warning symbol
    expect(output).toContain("⚠");
  });

  it("returns a message when no sources are tracked", async () => {
    const { formatSourceHealthTable } = await import(
      "../interface/mcp/tools/sourceHealthTools.js"
    );
    const output = formatSourceHealthTable([]);
    expect(output).toContain("Chua co du lieu");
  });
});
