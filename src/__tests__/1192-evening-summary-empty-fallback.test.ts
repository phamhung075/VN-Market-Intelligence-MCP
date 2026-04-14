/**
 * Task 1192 — Evening summary empty-content: silent skip
 *
 * Tests for:
 *   1. When hasContent === false, sendFn is NOT called (silent skip)
 *   2. When hasContent === true, sendFn is called once with normal content
 */

process.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach } from "bun:test";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { runEveningSummary, resetEveningSummaryGuard } from "../scheduler/eveningSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + 7 * 3600_000);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptySummary(): EveningSummary {
  return {
    date: todayVietnam(),
    topAlerts: [],
    topStories: [],
    watchlistMovers: [],
    predictionSignals: [],
    generatedAt: new Date().toISOString(),
  };
}

function fullSummary(): EveningSummary {
  return {
    date: todayVietnam(),
    topAlerts: [
      { severity: "warning", message: "VCB giảm mạnh", stocks: [] },
    ],
    topStories: [],
    watchlistMovers: [],
    predictionSignals: [],
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1192 — Evening summary empty-content fallback", () => {
  beforeEach(() => {
    resetEveningSummaryGuard();
  });

  // ── Test 1: no send when hasContent === false (silent skip) ─────────────────
  it("does NOT call sendFn when summary has no content", async () => {
    const calls: Array<{ message: string; opts: unknown }> = [];

    const sendFn = async (message: string, opts: unknown) => {
      calls.push({ message, opts });
    };

    await runEveningSummary(async () => emptySummary(), sendFn);

    expect(calls.length).toBe(0);
  });

  // ── Test 2: when hasContent === true, normal send uses sendFn (not skipped) -
  it("calls sendFn once for normal content (no double-send)", async () => {
    const calls: Array<{ message: string; opts: unknown }> = [];

    const sendFn = async (message: string, opts: unknown) => {
      calls.push({ message, opts });
    };

    await runEveningSummary(async () => fullSummary(), sendFn);

    // Exactly one send for the normal content path
    expect(calls.length).toBe(1);

    // Normal content message should NOT contain pipeline_health
    expect(calls[0]!.message).not.toContain("get_pipeline_health");
  });
});
