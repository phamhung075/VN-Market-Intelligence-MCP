// src/__tests__/1391-bb-stale-candle-skip.test.ts
// Task 1391 — FIX: bbAlertScanJob must skip tickers whose latest candle is not from today.
// Prevents stale yesterday-close prices being embedded in alert messages at dispatch time.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";
import { runBbAlertScan } from "../scheduler/alerts/bbAlertScanJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DDL
// ─────────────────────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY,
    exchange TEXT NOT NULL DEFAULT 'HOSE')`);
  db.run(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT, price REAL, fetched_at TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      affected_actions_json TEXT NOT NULL,
      analysis_ids_json TEXT,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT
    )
  `);
  return db;
}

function countAlerts(db: Database): number {
  return (db.query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts").get()?.cnt ?? 0);
}

function makeBbFn(
  bb20: { upper: number; mid: number; lower: number }
): (code: string) => Promise<ComputeTAResponse> {
  return async (code) => ({
    code,
    trend: "TREN_DUNG" as const,
    bb: { upper: bb20.upper, middle: bb20.mid, lower: bb20.lower },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1391 — bbAlertScanJob: skip stale candle (not today)", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
    db.run("INSERT INTO watchlist (code) VALUES ('FPT')");
  });

  it("AC-1: skips ticker when latest candle date is yesterday (stale snapshot)", async () => {
    // Insert yesterday's candle only — this simulates the stale cache scenario
    // (FPT message id 335: price from yesterday's close, direction inverted vs current)
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    db.run(
      `INSERT INTO market_prices_history (code, price, fetched_at)
       VALUES ('FPT', 73100, '${yesterday}T09:00:00Z')`
    );

    // BB says breakout_up — but candle is stale, so no alert must fire
    const result = await runBbAlertScan({
      db,
      computeFn: makeBbFn({ upper: 72000, mid: 70000, lower: 68000 }),
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(0);
    expect(countAlerts(db)).toBe(0);
  });

  it("AC-2: fires alert when latest candle is from today (fresh snapshot)", async () => {
    // Today's candle — fresh, should fire
    const today = new Date().toISOString().slice(0, 10);
    db.run(
      `INSERT INTO market_prices_history (code, price, fetched_at)
       VALUES ('FPT', 74400, '${today}T09:00:00Z')`
    );

    const result = await runBbAlertScan({
      db,
      computeFn: makeBbFn({ upper: 73000, mid: 71000, lower: 69000 }),
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(1);
    expect(countAlerts(db)).toBe(1);

    // Verify the message contains today's live price, not yesterday's
    const alert = db
      .query<{ message: string }, []>("SELECT message FROM alerts LIMIT 1")
      .get();
    expect(alert?.message).toContain("74400");
    expect(alert?.message).not.toContain("73100");
  });

  it("AC-3: skips ticker with only 2-day-old candles even if BB says breakout", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    db.run(
      `INSERT INTO market_prices_history (code, price, fetched_at)
       VALUES ('FPT', 73100, '${twoDaysAgo}T09:00:00Z')`
    );

    const result = await runBbAlertScan({
      db,
      computeFn: makeBbFn({ upper: 72000, mid: 70000, lower: 68000 }),
      nowFn: () => new Date(),
    });

    expect(result.fired).toBe(0);
    expect(countAlerts(db)).toBe(0);
  });
});
