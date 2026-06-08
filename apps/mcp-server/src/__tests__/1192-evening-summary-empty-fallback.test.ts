Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 1192 — Evening summary empty-content: silent skip
 *
 * Tests for:
 *   1. When hasContent === false, sendFn is NOT called (silent skip)
 *   2. When hasContent === true, sendFn is called once with normal content
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { VN_OFFSET_MS } from "../domain/services/timeConstants.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { runEveningSummary, resetEveningSummaryGuard } from "../scheduler/briefings/eveningSummaryJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + VN_OFFSET_MS);
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
    predictionDiag: { stored: 0 },
    taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
    taSummary: [],
    newsCount: 0,
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
    predictionDiag: { stored: 0 },
    taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
    taSummary: [],
    newsCount: 0,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fresh in-memory SQLite DB with the market_messages table.
 * This is injected into runEveningSummary so the dedup guard sees an empty
 * table and never short-circuits the test (production-DB bleed fix, task 1376).
 */
function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      message_type TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

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

    await runEveningSummary(async () => emptySummary(), sendFn, makeTestDb());

    expect(calls.length).toBe(0);
  });

  // ── Test 2: when hasContent === true, normal send uses sendFn (not skipped) -
  it("calls sendFn once for normal content (no double-send)", async () => {
    const calls: Array<{ message: string; opts: unknown }> = [];

    const sendFn = async (message: string, opts: unknown) => {
      calls.push({ message, opts });
    };

    await runEveningSummary(async () => fullSummary(), sendFn, makeTestDb());

    // Exactly one send for the normal content path
    expect(calls.length).toBe(1);

    // Normal content message should NOT contain pipeline_health
    expect(calls[0]!.message).not.toContain("get_pipeline_health");
  });
});
