// src/__tests__/FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR.test.ts
// Task FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR
// Verifies that bbAlertScanJob suppresses alerts for sub-floor daily volume tickers
// and still fires alerts for tickers at or above the MIN_DAILY_VOLUME_FOR_ALERTS floor.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";
import { runBbAlertScan } from "../scheduler/alerts/bbAlertScanJob.js";
import { MIN_DAILY_VOLUME_FOR_ALERTS } from "../domain/services/alertThresholds.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DDL (only tables touched by bbAlertScanJob)
// ─────────────────────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    )
  `);

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
      user_note TEXT,
      sent_by TEXT NOT NULL DEFAULT 'server',
      confidence_score REAL,
      validated_at TEXT,
      fingerprint TEXT UNIQUE
    )
  `);

  // FU-ALERT-COWRITE-SCHEDULER-JOBS: agent_signals table required for storeAlerts co-write.
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      alert_id TEXT,
      is_correlation_stub INTEGER DEFAULT 0
    )
  `);

  return db;
}

/**
 * Insert a daily_ohlcv row for today's UTC date.
 * volume must be passed explicitly in these tests — we are specifically testing
 * volume threshold behaviour so there is no safe default here.
 */
function insertTodayCandle(db: Database, code: string, close: number, volume: number): void {
  const today = new Date().toISOString().slice(0, 10);
  db.run(
    "INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '')",
    [code, today, close, close, close, close, volume]
  );
}

/** BB compute-fn factory: always returns a breakout_down condition (close below lower). */
function makeBbBreakoutDownFn(
  lower: number
): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (code, _closes) => ({
    code,
    trend: "TREN_DUNG" as const,
    bb: { upper: lower + 20_000, middle: lower + 10_000, lower },
  });
}

function countAlerts(db: Database): number {
  return (db.query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts").get()?.cnt ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR — bbAlertScanJob volume floor gate", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  // LF-1: sub-floor ticker with a band-break → NO alert emitted
  it("LF-1: no alert for sub-floor volume ticker even when price is below BB lower band", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('D2D')");

    // D2D: 6_400 shares — well below the 100K floor
    const subFloorVolume = 6_400;
    // Ensure it's genuinely below the floor constant
    expect(subFloorVolume).toBeLessThan(MIN_DAILY_VOLUME_FOR_ALERTS);

    // close=31_100 below BB lower=31_177 → would be breakout_down if floor was absent
    insertTodayCandle(db, "D2D", 31_100, subFloorVolume);

    const result = await runBbAlertScan({
      db,
      computeFn: makeBbBreakoutDownFn(31_177),
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(0);
    expect(countAlerts(db)).toBe(0);
  });

  // LF-2: above-floor ticker with a band-break → alert fires normally
  it("LF-2: alert fires for above-floor volume ticker with price below BB lower band", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('NVL')");

    // NVL: 500_000 shares — well above the 100K floor
    const aboveFloorVolume = 500_000;
    expect(aboveFloorVolume).toBeGreaterThanOrEqual(MIN_DAILY_VOLUME_FOR_ALERTS);

    // close=11_000 below BB lower=12_000 → breakout_down
    insertTodayCandle(db, "NVL", 11_000, aboveFloorVolume);

    const result = await runBbAlertScan({
      db,
      computeFn: makeBbBreakoutDownFn(12_000),
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(1);
    expect(countAlerts(db)).toBe(1);
  });

  // LF-3: exactly at floor (100_000) with a band-break → alert fires (boundary = pass)
  it("LF-3: alert fires when volume is exactly at MIN_DAILY_VOLUME_FOR_ALERTS (boundary is inclusive pass)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('MWG')");

    // Exactly 100K shares — the boundary case
    const atFloorVolume = MIN_DAILY_VOLUME_FOR_ALERTS;

    // close=50_000 below BB lower=52_000 → breakout_down
    insertTodayCandle(db, "MWG", 50_000, atFloorVolume);

    const result = await runBbAlertScan({
      db,
      computeFn: makeBbBreakoutDownFn(52_000),
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(1);
    expect(countAlerts(db)).toBe(1);
  });

  // LF-4: one sub-floor + one above-floor in the same scan pass — only the liquid one fires
  it("LF-4: mixed scan — sub-floor ticker suppressed, above-floor ticker fires", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('D2D')");
    db.run("INSERT INTO watchlist (code) VALUES ('VNM')");

    // D2D: thin — sub-floor
    insertTodayCandle(db, "D2D", 31_100, 6_400);
    // VNM: liquid — above floor
    insertTodayCandle(db, "VNM", 80_000, 1_000_000);

    // Alphabetical order: D2D → VNM
    const bbCalls = [
      makeBbBreakoutDownFn(31_177), // D2D — would be breakout_down but sub-floor
      makeBbBreakoutDownFn(82_000), // VNM — breakout_down (80_000 < 82_000)
    ];
    let callIndex = 0;
    const perTickerComputeFn = async (code: string, closes: number[]): Promise<ComputeTAResponse> => {
      const fn = bbCalls[callIndex++]!;
      return fn(code, closes);
    };

    const result = await runBbAlertScan({
      db,
      computeFn: perTickerComputeFn,
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(2);
    expect(result.fired).toBe(1);
    expect(countAlerts(db)).toBe(1);

    // Only VNM alert — no D2D alert
    const alert = db
      .query<{ affected_actions_json: string }, []>(
        "SELECT affected_actions_json FROM alerts LIMIT 1"
      )
      .get();
    const actions = JSON.parse(alert!.affected_actions_json) as Array<{ code: string }>;
    expect(actions[0]!.code).toBe("VNM");
  });

  // LF-5: floor constant sanity check (compile-time guard — catches accidental value change)
  it("LF-5: MIN_DAILY_VOLUME_FOR_ALERTS constant equals 100_000", () => {
    expect(MIN_DAILY_VOLUME_FOR_ALERTS).toBe(100_000);
  });
});
