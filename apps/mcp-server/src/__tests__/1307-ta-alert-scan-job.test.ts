// src/__tests__/1307-ta-alert-scan-job.test.ts
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DDL (only tables touched by taAlertScanJob)
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

  // daily_ohlcv is the candle source for TA (CANDLE_SQL uses this table).
  // Tests seed minimal rows so the candle query doesn't throw "no such table".
  // The computeFn is injected — actual close values don't affect test outcomes.
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
      fingerprint TEXT UNIQUE
    )
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: seed MIN_CANDLES (35) rows so the candle-depth guard passes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert 35 recent candle rows for a ticker so that the MIN_CANDLES guard
 * in taAlertScanJob lets execution reach the injected computeFn.
 * The CANDLE_SQL window is `date >= date('now', '-60 days')`, so all rows
 * are placed within the last 35 days (well within the 60-day window).
 */
function seedMinCandles(db: Database, code: string): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, 100000, 101000, 99000, ?, 1000000, ?)`
  );
  const nowMs = Date.now();
  for (let i = 0; i < 35; i++) {
    const daysAgo = 35 - i; // oldest first, newest last
    const d = new Date(nowMs - daysAgo * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const close = 100_000 + (i % 2 === 0 ? 500 : -500); // alternating mid-band
    stmt.run(code, dateStr, close, d.toISOString());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: controlled computeFn factories
// ─────────────────────────────────────────────────────────────────────────────

function makeComputeFn(rsi: number | null): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (code: string, _closes: number[]): Promise<ComputeTAResponse> => ({
    code,
    trend: "TREN_DUNG" as const,
    ...(rsi !== null ? { rsi } : {}),
  });
}

/** computeFn that always throws — used by AC-9's per-ticker override */
function makeThrowingComputeFn(): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (_code: string, _closes: number[]) => {
    throw new Error("Mock TA error for test");
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: count alert rows
// ─────────────────────────────────────────────────────────────────────────────

function countAlerts(db: Database): number {
  return (db.query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts").get()?.cnt ?? 0);
}

function getAlerts(db: Database): Array<{ id: string; signals_json: string; affected_actions_json: string; message: string; severity: string }> {
  return db.query<{ id: string; signals_json: string; affected_actions_json: string; message: string; severity: string }, []>(
    "SELECT id, signals_json, affected_actions_json, message, severity FROM alerts"
  ).all();
}

// ─────────────────────────────────────────────────────────────────────────────
// Import the production function (will fail until implementation exists)
// ─────────────────────────────────────────────────────────────────────────────

import { runTaAlertScan } from "../scheduler/market-data/taAlertScanJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1307 — taAlertScanJob: RSI overbought/oversold intraday alerts", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  // AC-1: Alert fires for overbought RSI
  it("AC-1: fires ta_overbought alert when RSI > 70", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });

    const alerts = getAlerts(db);
    expect(alerts.length).toBe(1);

    const alert = alerts[0]!;
    const signals = JSON.parse(alert.signals_json) as Array<{ type: string; actionCode: string; confidence: number }>;
    const actions = JSON.parse(alert.affected_actions_json) as Array<{ code: string }>;

    expect(signals[0]!.type).toBe("ta_overbought");
    expect(signals[0]!.actionCode).toBe("VCB");
    expect(signals[0]!.confidence).toBe(0.7);
    expect(actions[0]!.code).toBe("VCB");
    expect(alert.message).toContain("VCB");
    expect(alert.message).toContain("quá mua");
    expect(alert.message).toContain("74.2");
    expect(alert.severity).toBe("warning");
  });

  // AC-2: Alert fires for oversold RSI
  it("AC-2: fires ta_oversold alert when RSI < 30", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(27.8),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });

    const alerts = getAlerts(db);
    expect(alerts.length).toBe(1);

    const alert = alerts[0]!;
    const signals = JSON.parse(alert.signals_json) as Array<{ type: string }>;

    expect(signals[0]!.type).toBe("ta_oversold");
    expect(alert.message).toContain("quá bán");
    expect(alert.message).toContain("27.8");
  });

  // AC-3: No alert for neutral RSI (30–70 range)
  it("AC-3: no alert when RSI is neutral (55.0)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(55.0),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-4: No alert when RSI is null (insufficient history)
  it("AC-4: no alert when RSI is null (insufficient candle history)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard; computeFn still returns null RSI

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(null),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-5: Cooldown suppresses second fire within 4 hours
  it("AC-5: cooldown suppresses second alert within 4 hours (T+30min)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard

    const t0 = new Date("2026-04-15T03:00:00Z");

    // First scan fires
    const first = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => t0,
    });
    expect(first).toEqual({ scanned: 1, fired: 1 });
    expect(countAlerts(db)).toBe(1);

    // Second scan at T+30min (within 4h cooldown) — must NOT fire
    const t30 = new Date("2026-04-15T03:30:00Z");
    const second = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => t30,
    });
    expect(second).toEqual({ scanned: 1, fired: 0 });
    // Still only 1 alert in DB
    expect(countAlerts(db)).toBe(1);
  });

  // AC-6: Cooldown AND fingerprint lift after crossing a UTC day boundary
  //
  // FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS update: the fingerprint gate is per UTC
  // day ("scan:{ticker}:{alertType}:{YYYY-MM-DD}").  A second alert for the same
  // (ticker, alertType) is allowed only on a DIFFERENT UTC day.  Within the same
  // calendar day the fingerprint UNIQUE constraint is authoritative — even if the
  // 4h SQL cooldown window has passed.
  //
  // This test simulates the "next-day rescan" scenario: the first alert fires on
  // 2026-04-14 and is backdated to clear the 4h SQL cooldown; the second scan
  // uses nowFn = 2026-04-15, producing a different fingerprint → new row allowed.
  it("AC-6: alert fires again on the next UTC day (fingerprint + cooldown both clear)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard

    // Day-1 scan fires
    await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => new Date("2026-04-14T03:00:00Z"),
    });
    expect(countAlerts(db)).toBe(1);

    // Move the first alert's triggered_at outside the 4h SQL cooldown window
    // (fingerprint is "scan:VCB:ta_overbought:2026-04-14" for this row).
    db.run("UPDATE alerts SET triggered_at = '2026-04-14T22:00:00Z'");

    // Day-2 scan — nowFn produces "2026-04-15T03:00:00Z" → fingerprint
    // "scan:VCB:ta_overbought:2026-04-15" (different day) → new row allowed.
    const second = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });
    expect(second).toEqual({ scanned: 1, fired: 1 });
    // Now 2 alerts in DB — one per UTC day
    expect(countAlerts(db)).toBe(2);
  });

  // AC-7: Multi-ticker scan counts correctly
  it("AC-7: multi-ticker scan: 3 tickers, 2 overbought, 1 neutral → {scanned:3, fired:2}", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('TCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard
    seedMinCandles(db, "TCB");
    seedMinCandles(db, "HPG");

    // We need per-ticker RSI control. The computeFn receives code + closes array.
    // Since computeFn is injected and replaces real computation, we use a stateful approach.
    const rsiByCallOrder = [74.2, 71.5, 50.0]; // VCB→overbought, TCB→overbought, HPG→neutral
    let callIndex = 0;
    const perTickerComputeFn = async (code: string, _closes: number[]): Promise<ComputeTAResponse> => {
      const rsi = rsiByCallOrder[callIndex++] ?? null;
      return {
        code,
        trend: "TREN_DUNG" as const,
        ...(rsi !== null ? { rsi } : {}),
      };
    };

    const result = await runTaAlertScan({
      db,
      computeFn: perTickerComputeFn,
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 3, fired: 2 });
    expect(countAlerts(db)).toBe(2);
  });

  // AC-8: Empty watchlist
  it("AC-8: empty watchlist returns {scanned:0, fired:0} with no DB writes", async () => {
    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(80.0),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result).toEqual({ scanned: 0, fired: 0 });
    expect(countAlerts(db)).toBe(0);
  });

  // AC-9: Per-ticker error does not abort scan
  it("AC-9: error on one ticker is caught; other tickers still processed", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('TCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");
    seedMinCandles(db, "VCB"); // satisfy MIN_CANDLES guard
    seedMinCandles(db, "TCB");
    seedMinCandles(db, "HPG");

    // VCB=overbought (fires), TCB=throws, HPG=overbought (fires)
    const callOrder = [
      { rsi: 74.2, throws: false },
      { rsi: null, throws: true },
      { rsi: 75.0, throws: false },
    ];
    let callIdx = 0;
    const isolatedComputeFn = async (code: string, _closes: number[]): Promise<ComputeTAResponse> => {
      const spec = callOrder[callIdx++]!;
      if (spec.throws) {
        throw new Error("Mock TA computation failure for TCB");
      }
      return {
        code,
        trend: "TREN_DUNG" as const,
        ...(spec.rsi !== null ? { rsi: spec.rsi } : {}),
      };
    };

    const result = await runTaAlertScan({
      db,
      computeFn: isolatedComputeFn,
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    // Per TECH-094 AC-9 note: errored tickers are counted in scanned
    expect(result.scanned).toBe(3);
    expect(result.fired).toBe(2);
    // VCB and HPG alerts fired; TCB error was caught silently
    expect(countAlerts(db)).toBe(2);
  });

  // ── FIX-ALERT-SCAN-REJECT-STUB-BAR-P0: stub-bar guard ──────────────────────

  /**
   * Seed N-1 valid historical candles (volume=1_000_000) then append a stub
   * latest bar (close=stubClose, volume=stubVolume) as the most recent row.
   * This simulates a foreign-flow writer inserting an all-zero bar for today
   * AFTER the historical series is already populated.
   */
  function seedCandlesWithStubLatest(
    db: Database,
    code: string,
    stubClose: number,
    stubVolume: number,
  ): void {
    const nowMs = Date.now();
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, 100000, 101000, 99000, ?, ?, ?)`
    );
    // Insert 35 historical candles with valid data (oldest → newest but NOT today)
    for (let i = 0; i < 35; i++) {
      const daysAgo = 36 - i; // 36 days ago → 2 days ago (avoids today slot)
      const d = new Date(nowMs - daysAgo * 86_400_000);
      const dateStr = d.toISOString().slice(0, 10);
      const close = 100_000 + (i % 2 === 0 ? 500 : -500);
      stmt.run(code, dateStr, close, 1_000_000, d.toISOString());
    }
    // Insert stub bar as the latest (today or recent)
    const todayStr = new Date(nowMs - 86_400_000).toISOString().slice(0, 10); // yesterday (still ≥35 candles total)
    db.run(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, 0, 0, 0, ?, ?, '')`,
      [code, todayStr, stubClose, stubVolume]
    );
  }

  // SB-1: latest bar close=0, volume=0 → skip (no single-digit RSI alert)
  it("SB-1: no alert when latest bar has close=0 volume=0 (all-zero stub, even with overbought RSI signal)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedCandlesWithStubLatest(db, "VCB", 0, 0);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2), // would normally fire ta_overbought
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(0);
    expect(countAlerts(db)).toBe(0);
  });

  // SB-2: latest bar close=0 with any volume → skip
  it("SB-2: no alert when latest bar has close=0 regardless of volume", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedCandlesWithStubLatest(db, "VCB", 0, 500_000);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(25.0), // would normally fire ta_oversold
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(0);
    expect(countAlerts(db)).toBe(0);
  });

  // SB-3: latest bar volume=0 with positive close → skip
  it("SB-3: no alert when latest bar has volume=0 even if close is positive", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedCandlesWithStubLatest(db, "VCB", 100_000, 0);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => new Date(),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(0);
    expect(countAlerts(db)).toBe(0);
  });

  // SB-4: valid bar (close > 0, volume > 0) still fires (regression guard)
  it("SB-4: alert fires normally when latest bar has valid close and volume (stub guard does not block valid bar)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedMinCandles(db, "VCB"); // all candles valid (close>0, volume=1_000_000)

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFn(74.2),
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(1);
    expect(countAlerts(db)).toBe(1);
  });

  // SB-5: stub ticker skipped; sibling with valid bar still fires (generic all-ticker)
  it("SB-5: stub ticker skipped; sibling valid ticker still fires (generic guard, no inter-ticker contamination)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('TCB')");
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");

    // TCB: stub latest bar → skip
    seedCandlesWithStubLatest(db, "TCB", 0, 0);
    // VCB: valid bars → fires
    seedMinCandles(db, "VCB");

    // TCB and VCB iterated in insertion order; computeFn only called for VCB (TCB stub-skipped)
    const rsiByTicker: Record<string, number> = { TCB: 74.2, VCB: 74.2 };
    const perTickerComputeFn = async (code: string, _closes: number[]): Promise<ComputeTAResponse> => ({
      code,
      trend: "TREN_DUNG" as const,
      rsi: rsiByTicker[code] ?? 50,
    });

    const result = await runTaAlertScan({
      db,
      computeFn: perTickerComputeFn,
      nowFn: () => new Date("2026-04-15T03:00:00Z"),
    });

    expect(result.scanned).toBe(2);
    expect(result.fired).toBe(1);
    expect(countAlerts(db)).toBe(1);

    // Only VCB alert — no TCB RSI alert
    const alerts = getAlerts(db);
    const actions = JSON.parse(alerts[0]!.affected_actions_json) as Array<{ code: string }>;
    expect(actions[0]!.code).toBe("VCB");
  });
});
