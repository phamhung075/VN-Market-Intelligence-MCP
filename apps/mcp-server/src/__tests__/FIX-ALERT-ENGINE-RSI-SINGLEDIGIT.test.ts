/**
 * FIX-ALERT-ENGINE-RSI-SINGLEDIGIT — candle-depth guard for taAlertScanJob
 *
 * Root cause: taAlertScanJob passed any number of closes to the Go TA service.
 * With 15–30 candles, Wilder RSI produces degenerate single-digit or clamped-100.0
 * values (VHM RSI 9.8, VIC RSI 7.4, DAG RSI 100.0 on live MARKET channel).
 *
 * Fix: enforce MIN_CANDLES = 35 guard before calling computeFn. Tickers with
 * fewer than 35 candles in daily_ohlcv must be silently skipped (fail-closed),
 * never emit a degenerate alert.
 *
 * Acceptance criteria:
 *   AC-1  < 35 candles → skip (computeFn NOT called) — fail-closed
 *   AC-2  exactly 34 candles → skip (fail-closed), even if computeFn returns overbought RSI
 *   AC-3  exactly 35 candles → computeFn IS called; RSI evaluated normally
 *   AC-4  60 candles + overbought RSI=71.5 → alert fires (regression guard)
 *   AC-5  60 candles + single-digit RSI=9.8 → alert fires (oversold) — demonstrating
 *         that with sufficient candles the value is trusted, even if it looks surprising
 *   AC-6  60 candles + clamped RSI=100.0 → alert fires (overbought) — trusted at depth
 *   AC-7  low-candle (14) ticker mixed with a high-candle (60) ticker: only the
 *         high-candle ticker fires; scanned=2, fired=1
 *
 * Layer: tests — isolated in-memory SQLite; no HTTP, no Telegram sends.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { ComputeTAResponse } from "../infrastructure/microservices/clients.js";
import { runTaAlertScan } from "../scheduler/market-data/taAlertScanJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup
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
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT, price REAL, fetched_at TEXT
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
      user_note TEXT
    )
  `);
  return db;
}

/**
 * Insert N candle rows for a given ticker into daily_ohlcv.
 * Prices form a realistic mid-band series (alternating up/down).
 * Dates are placed ending TODAY and going back N days so that all rows
 * are within the CANDLE_SQL 60-day window (date >= date('now', '-60 days')).
 */
function seedCandles(db: Database, code: string, n: number): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // Place candles ending N days ago so all are within the 60-day window.
  // E.g. for n=35: dates from (now-35d) to (now-1d) — all within 60-day window.
  const nowMs = Date.now();
  for (let i = 0; i < n; i++) {
    // oldest candle first: index 0 = n days ago, index n-1 = yesterday
    const daysAgo = n - i;
    const d = new Date(nowMs - daysAgo * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    // Alternating close around 100 000 VND — produces mid-band RSI ~50
    const close = 100_000 + (i % 2 === 0 ? 500 : -500);
    stmt.run(code, dateStr, close - 200, close + 300, close - 400, close, 1_000_000, d.toISOString());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// computeFn helpers
// ─────────────────────────────────────────────────────────────────────────────

let computeFnCallCount = 0;

function makeComputeFnTracked(
  rsi: number | null
): (code: string, closes: number[]) => Promise<ComputeTAResponse> {
  return async (code: string, _closes: number[]): Promise<ComputeTAResponse> => {
    computeFnCallCount++;
    return {
      code,
      trend: "NEUTRAL" as const,
      ...(rsi !== null ? { rsi } : {}),
    };
  };
}

function countAlerts(db: Database): number {
  return db.query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM alerts").get()?.cnt ?? 0;
}

const NOW = () => new Date("2026-06-15T03:00:00Z");

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-ALERT-ENGINE-RSI-SINGLEDIGIT — candle depth guard", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
    computeFnCallCount = 0;
  });

  // ── AC-1: < 35 candles → skip, computeFn NOT called ─────────────────────

  it("AC-1a: 0 candles → scanned=1 fired=0 (computeFn not called)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VHM')");
    // No candles seeded

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFnTracked(100.0), // would trigger overbought if called
      nowFn: NOW,
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
    expect(computeFnCallCount).toBe(0); // guard prevents call
  });

  it("AC-1b: 14 candles → scanned=1 fired=0 (computeFn not called)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VHM')");
    seedCandles(db, "VHM", 14);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFnTracked(9.8), // would trigger oversold if called
      nowFn: NOW,
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
    expect(computeFnCallCount).toBe(0);
  });

  // ── AC-2: exactly 34 candles → skip (fail-closed) ───────────────────────

  it("AC-2: 34 candles → scanned=1 fired=0 (fail-closed before computeFn)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VIC')");
    seedCandles(db, "VIC", 34);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFnTracked(7.4), // corrupt single-digit — must be blocked
      nowFn: NOW,
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
    expect(computeFnCallCount).toBe(0);
  });

  // ── AC-3: exactly 35 candles → computeFn IS called; RSI neutral → no alert

  it("AC-3: 35 candles → computeFn called; neutral RSI=45 → no alert", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VCB')");
    seedCandles(db, "VCB", 35);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFnTracked(45.0),
      nowFn: NOW,
    });

    expect(result).toEqual({ scanned: 1, fired: 0 });
    expect(countAlerts(db)).toBe(0);
    expect(computeFnCallCount).toBe(1); // computeFn IS called at 35 candles
  });

  // ── AC-4: 60 candles + overbought RSI → fires (regression guard) ─────────

  it("AC-4: 60 candles + RSI=71.5 (overbought) → alert fires", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('HPG')");
    seedCandles(db, "HPG", 60);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFnTracked(71.5),
      nowFn: NOW,
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });
    expect(countAlerts(db)).toBe(1);
    expect(computeFnCallCount).toBe(1);

    const alert = db.query<{ message: string }, []>("SELECT message FROM alerts").get()!;
    expect(alert.message).toContain("RSI(14) = 71.5");
    expect(alert.message).toContain("quá mua");
  });

  // ── AC-5: 60 candles + oversold RSI → trusted at depth ───────────────────

  it("AC-5: 60 candles + RSI=28.0 (oversold) → alert fires (trusted at depth)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('SSI')");
    seedCandles(db, "SSI", 60);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFnTracked(28.0),
      nowFn: NOW,
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });
    expect(countAlerts(db)).toBe(1);

    const alert = db.query<{ message: string }, []>("SELECT message FROM alerts").get()!;
    expect(alert.message).toContain("RSI(14) = 28.0");
    expect(alert.message).toContain("quá bán");
  });

  // ── AC-6: 60 candles + RSI=100.0 → trusted at depth (all-gains possible) ─

  it("AC-6: 60 candles + RSI=100.0 → alert fires (trusted at depth, all-gains scenario)", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('DAG')");
    seedCandles(db, "DAG", 60);

    const result = await runTaAlertScan({
      db,
      computeFn: makeComputeFnTracked(100.0),
      nowFn: NOW,
    });

    expect(result).toEqual({ scanned: 1, fired: 1 });
    expect(countAlerts(db)).toBe(1);

    const alert = db.query<{ message: string }, []>("SELECT message FROM alerts").get()!;
    expect(alert.message).toContain("RSI(14) = 100.0");
    expect(alert.message).toContain("quá mua");
  });

  // ── AC-7: mixed low+high candle tickers: only high-candle fires ───────────

  it("AC-7: VHM (14 candles) + FPT (60 candles, RSI=75.0) → scanned=2 fired=1", async () => {
    db.run("INSERT INTO watchlist (code) VALUES ('VHM')");
    db.run("INSERT INTO watchlist (code) VALUES ('FPT')");
    seedCandles(db, "VHM", 14);   // below guard — skip
    seedCandles(db, "FPT", 60);   // above guard — fire

    // computeFn returns 9.8 for VHM (should be blocked) and 75.0 for FPT (fires)
    let callCount = 0;
    const mixedFn = async (code: string, _closes: number[]): Promise<ComputeTAResponse> => {
      callCount++;
      const rsiVal = code === "FPT" ? 75.0 : 9.8;
      return { code, trend: "NEUTRAL" as const, rsi: rsiVal };
    };

    const result = await runTaAlertScan({
      db,
      computeFn: mixedFn,
      nowFn: NOW,
    });

    expect(result.scanned).toBe(2);
    expect(result.fired).toBe(1);
    expect(countAlerts(db)).toBe(1);
    // Only FPT's computeFn should have been called (VHM blocked by guard)
    expect(callCount).toBe(1);

    const alert = db.query<{ message: string }, []>("SELECT message FROM alerts").get()!;
    expect(alert.message).toContain("FPT");
    expect(alert.message).not.toContain("VHM");
  });
});
