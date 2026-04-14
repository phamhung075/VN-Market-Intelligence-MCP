/**
 * Task 1192 — Evening summary empty-content fallback Telegram message
 *
 * Tests for:
 *   1. When hasContent === false, sendFn is called once with a fallback message
 *   2. Fallback message is in Vietnamese, plain text, no Markdown
 *   3. Fallback message references get_pipeline_health
 *   4. When hasContent === true, sendFn is NOT called for the fallback path
 *      (normal Telegram send uses the injected sendFn)
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

  // ── Test 1: fallback send is called when hasContent === false ──────────────
  it("calls sendFn once with fallback message when summary has no content", async () => {
    const calls: Array<{ message: string; opts: unknown }> = [];

    const sendFn = async (message: string, opts: unknown) => {
      calls.push({ message, opts });
    };

    await runEveningSummary(async () => emptySummary(), sendFn);

    expect(calls.length).toBe(1);
  });

  // ── Test 2: fallback message is Vietnamese, plain text, no Markdown ────────
  it("fallback message is Vietnamese plain text with no Markdown characters", async () => {
    let capturedMessage = "";

    const sendFn = async (message: string, _opts: unknown) => {
      capturedMessage = message;
    };

    await runEveningSummary(async () => emptySummary(), sendFn);

    // Must have content (not empty)
    expect(capturedMessage.length).toBeGreaterThan(0);

    // Must not contain Markdown bold/italic/code markers
    // Note: underscores are allowed because get_pipeline_health tool name uses them.
    // We check for asterisks, backticks, and hash headings only.
    expect(capturedMessage).not.toMatch(/[*`#]/);

    // Must contain Vietnamese text indicating empty summary
    const lower = capturedMessage.toLowerCase();
    const hasVietnamese =
      lower.includes("tóm tắt") ||
      lower.includes("buổi tối") ||
      lower.includes("không có") ||
      lower.includes("dữ liệu");
    expect(hasVietnamese).toBe(true);
  });

  // ── Test 3: fallback message references get_pipeline_health ───────────────
  it("fallback message references get_pipeline_health for diagnosis", async () => {
    let capturedMessage = "";

    const sendFn = async (message: string, _opts: unknown) => {
      capturedMessage = message;
    };

    await runEveningSummary(async () => emptySummary(), sendFn);

    expect(capturedMessage).toContain("get_pipeline_health");
  });

  // ── Test 4: when hasContent === true, normal send uses sendFn (not skipped) -
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
