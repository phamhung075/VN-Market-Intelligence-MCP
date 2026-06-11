// src/__tests__/1309-bb-alert-scan-job.test.ts
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DDL (only tables touched by bbAlertScanJob)
// ─────────────────────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    ,
    exchange TEXT NOT NULL DEFAULT 'HOSE')
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT,
      price REAL,
      fetched_at TEXT
    )
  `);

  // daily_ohlcv is the candle source for CANDLE_SQL (bbAlertScanJob uses this table).
  // Tests insert rows with today's UTC date so the stale-candle guard passes.
  // The computeFn is injected — actual close values provided here are used for
  // the stale-candle date check and the BB position message (close price).
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

/** Insert a daily_ohlcv row for today's UTC date with the given close price. */
function insertTodayCandle(db: Database, code: string, close: number): void {
  const today = new Date().toISOString().slice(0, 10);
  db.run(
    "INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, '')",
    [code, today, close, close, close, close]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: controlled computeFn factory for BB tests
//
// Unlike RSI tests, BB tests require at least 1 row in market_prices_history
// for the ticker so the candle query returns a non-empty array (providing a
// real close value). The computeFn is injected to return controlled bb20 bands.
// ─────────────────────────────────────────────────────────────────────────────

function makeComputeFn(
  bb20: { upper: number; mid: number; lower: number } | null
): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (code: string, _closes: number[]): Promise<ComputeTAResponse> => ({
    code,
    trend: "TREN_DUNG" as const,
    ...(bb20 != null ? { bb: { upper: bb20.upper, middle: bb20.mid, lower: bb20.lower } } : {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: count alert rows
// ─────────────────────────────────────────────────────────────────────────────

function countAlerts(db: Database): number {
  return (db.query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts").get()?.cnt ?? 0);
}

function getAlerts(db: Database): Array<{
  id: string;
  signals_json: string;
  affected_actions_json: string;
  message: string;
  severity: string;
}> {
  return db.query<{
    id: string;
    signals_json: string;
    affected_actions_json: string;
    message: string;
    severity: string;
  }, []>(
    "SELECT id, signals_json, affected_actions_json, message, severity FROM alerts"
  ).all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Import the production function (will fail until implementation exists)
// ─────────────────────────────────────────────────────────────────────────────

import { runBbAlertScan } from "../scheduler/alerts/bbAlertScanJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1309 — bbAlertScanJob: Bollinger Band breakout intraday alerts", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  // AC-1: Breakout-up alert fires (close > bb20.upper)
  it("AC-1: fires ta_bb_breakout_up alert when close > bb20.upper", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    // Provide today's candle so stale-candle guard passes; close = 88000
    insertTodayCandle(db, "VCB", 88000);

    const result = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86500, mid: 84000, lower: 82000 }),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });

    const alerts = getAlerts(db);
    expect(alerts.length).toBe(1);

    const alert = alerts[0]!;
    const signals = JSON.parse(alert.signals_json) as Array<{
      type: string;
      actionCode: string;
      confidence: number;
    }>;
    const actions = JSON.parse(alert.affected_actions_json) as Array<{ code: string }>;

    expect(signals[0]!.type).toBe("ta_bb_breakout_up");
    expect(signals[0]!.actionCode).toBe("VCB");
    expect(signals[0]!.confidence).toBe(0.65);
    expect(actions[0]!.code).toBe("VCB");
    expect(alert.message).toContain("VCB");
    expect(alert.message).toContain("88000");
    expect(alert.message).toContain("86500");
    expect(alert.message).toContain("bứt phá tăng");
    expect(alert.severity).toBe("warning");
  });

  // AC-2: Breakout-down alert fires (close < bb20.lower)
  it("AC-2: fires ta_bb_breakout_down alert when close < bb20.lower", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");
    // Provide today's candle so stale-candle guard passes; close = 22000
    insertTodayCandle(db, "HPG", 22000);

    const result = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 24000, mid: 23050, lower: 23100 }),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });

    const alerts = getAlerts(db);
    expect(alerts.length).toBe(1);

    const alert = alerts[0]!;
    const signals = JSON.parse(alert.signals_json) as Array<{ type: string }>;

    expect(signals[0]!.type).toBe("ta_bb_breakout_down");
    expect(alert.message).toContain("HPG");
    expect(alert.message).toContain("22000");
    expect(alert.message).toContain("23100");
    expect(alert.message).toContain("bứt phá giảm");
  });

  // AC-3: No alert when price is inside band
  it("AC-3: no alert when close is inside bb20 band", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    // close = 84000, inside [82000, 86000]
    insertTodayCandle(db, "VCB", 84000);

    const result = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86000, mid: 84000, lower: 82000 }),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-4: No alert when bb20 is null (insufficient candle history)
  it("AC-4: no alert when bb20 is null (fewer than 20 candles)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    insertTodayCandle(db, "VCB", 88000);

    const result = await runBbAlertScan({
      db,
      computeFn: makeComputeFn(null),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-5: No alert when candles array is empty (no price history for ticker)
  it("AC-5: no alert when daily_ohlcv has no rows for ticker", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    // No rows inserted into daily_ohlcv — stale-candle guard skips this ticker

    const result = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86500, mid: 84000, lower: 82000 }),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-6: Cooldown suppresses repeat breakout_up within 4 hours
  it("AC-6: cooldown suppresses second ta_bb_breakout_up alert within 4 hours (T+30min)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    insertTodayCandle(db, "VCB", 88000);

    const t0 = new Date("2026-04-15T03:00:00Z");

    // First scan fires
    const first = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86500, mid: 84000, lower: 82000 }),
      nowFn: () => t0,
    });
    expect(first).toEqual({ scanned: 1, fired: 1 });
    expect(countAlerts(db)).toBe(1);

    // Second scan at T+30min (within 4h cooldown) — must NOT fire
    const t30 = new Date("2026-04-15T03:30:00Z");
    const second = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86500, mid: 84000, lower: 82000 }),
      nowFn: () => t30,
    });
    expect(second).toEqual({ scanned: 1, fired: 0 });
    // Still only 1 alert in DB
    expect(countAlerts(db)).toBe(1);
  });

  // AC-7: Cooldown lifts after 4 hours
  it("AC-7: cooldown does not suppress alert after 4 hours (triggered_at manipulated to >4h ago)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    insertTodayCandle(db, "VCB", 88000);

    const t0 = new Date("2026-04-15T03:00:00Z");

    // First scan fires
    await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86500, mid: 84000, lower: 82000 }),
      nowFn: () => t0,
    });
    expect(countAlerts(db)).toBe(1);

    // Manipulate the first alert's triggered_at to be definitely outside the 4h window
    // The cooldown uses SQLite's datetime('now', '-4 hours') which uses real wall clock.
    db.run("UPDATE alerts SET triggered_at = '2026-04-14T22:00:00Z'");

    // Second scan — cooldown should have lifted
    const second = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86500, mid: 84000, lower: 82000 }),
      nowFn: () => t0,
    });
    expect(second).toEqual({ scanned: 1, fired: 1 });
    // Now 2 alerts in DB
    expect(countAlerts(db)).toBe(2);
  });

  // AC-8: Multi-ticker scan: 3 tickers, 2 above upper, 1 inside band
  it("AC-8: multi-ticker scan: 3 tickers, 2 breakout-up, 1 inside band → {scanned:3, fired:2}", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('TCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");

    // VCB: close=88000 > upper=86500 → fires
    insertTodayCandle(db, "VCB", 88000);
    // TCB: close=90000 > upper=87000 → fires
    insertTodayCandle(db, "TCB", 90000);
    // HPG: close=50000 inside [45000, 55000] → no alert
    insertTodayCandle(db, "HPG", 50000);

    // Per-ticker BB: mapped by alphabetical iteration order (runBbAlertScan uses ORDER BY code).
    // Alphabetical: HPG → TCB → VCB.
    const bbByCallOrder = [
      { upper: 55000, mid: 50000, lower: 45000 },  // HPG (alpha 0) — 50000 inside → no alert
      { upper: 87000, mid: 85000, lower: 83000 },  // TCB (alpha 1) — 90000 > 87000 → fires
      { upper: 86500, mid: 84000, lower: 82000 },  // VCB (alpha 2) — 88000 > 86500 → fires
    ];
    let callIndex = 0;
    const perTickerComputeFn = async (code: string, _closes: number[]): Promise<ComputeTAResponse> => {
      const bb20 = bbByCallOrder[callIndex++] ?? null;
      return {
        code,
        trend: "TREN_DUNG" as const,
        ...(bb20 != null ? { bb: { upper: bb20.upper, middle: bb20.mid, lower: bb20.lower } } : {}),
      };
    };

    const result = await runBbAlertScan({
      db,
      computeFn: perTickerComputeFn,
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 3, fired: 2 });
    expect(countAlerts(db)).toBe(2);
  });

  // AC-9: Empty watchlist — no DB writes
  it("AC-9: empty watchlist returns {scanned:0, fired:0} with no DB writes", async () => {
    const result = await runBbAlertScan({
      db,
      computeFn: makeComputeFn({ upper: 86500, mid: 84000, lower: 82000 }),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 0, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // Extra: Per-ticker error isolation — other tickers still processed
  it("per-ticker error isolation: error on one ticker does not abort scan", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('TCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");

    insertTodayCandle(db, "VCB", 88000);
    insertTodayCandle(db, "TCB", 90000);
    insertTodayCandle(db, "HPG", 88000);

    // VCB=fires, TCB=throws, HPG=fires
    const callOrder = [
      { bb20: { upper: 86500, mid: 84000, lower: 82000 }, throws: false },
      { bb20: null, throws: true },
      { bb20: { upper: 86500, mid: 84000, lower: 82000 }, throws: false },
    ];
    let callIdx = 0;
    const isolatedComputeFn = async (code: string, _closes: number[]): Promise<ComputeTAResponse> => {
      const spec = callOrder[callIdx++]!;
      if (spec.throws) {
        throw new Error("Mock BB computation failure for TCB");
      }
      return {
        code,
        trend: "TREN_DUNG" as const,
        ...(spec.bb20 != null ? { bb: { upper: spec.bb20.upper, middle: spec.bb20.mid, lower: spec.bb20.lower } } : {}),
      };
    };

    const result = await runBbAlertScan({
      db,
      computeFn: isolatedComputeFn,
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    // Errored tickers are counted in scanned; VCB and HPG fired
    expect(result.scanned).toBe(3);
    expect(result.fired).toBe(2);
    expect(countAlerts(db)).toBe(2);
  });
});
