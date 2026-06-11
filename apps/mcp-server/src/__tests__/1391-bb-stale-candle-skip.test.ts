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
  // daily_ohlcv is the candle source for CANDLE_SQL after the ALERT-WRITER-RECONCILE fix.
  // The stale-candle guard checks daily_ohlcv.date (YYYY-MM-DD) against today's UTC date.
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
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
): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (code, _closes) => ({
    code,
    trend: "TREN_DUNG" as const,
    bb: { upper: bb20.upper, middle: bb20.mid, lower: bb20.lower },
  });
}

/** Insert a daily_ohlcv row with the given date (YYYY-MM-DD) and close price. */
function insertCandle(db: Database, code: string, date: string, close: number): void {
  db.run(
    "INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, '')",
    [code, date, close, close, close, close]
  );
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
    insertCandle(db, "FPT", yesterday, 73100);

    // BB says breakout_up — but candle is stale (not today's date), so no alert must fire
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
    insertCandle(db, "FPT", today, 74400);

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
    insertCandle(db, "FPT", twoDaysAgo, 73100);

    const result = await runBbAlertScan({
      db,
      computeFn: makeBbFn({ upper: 72000, mid: 70000, lower: 68000 }),
      nowFn: () => new Date(),
    });

    expect(result.fired).toBe(0);
    expect(countAlerts(db)).toBe(0);
  });
});
