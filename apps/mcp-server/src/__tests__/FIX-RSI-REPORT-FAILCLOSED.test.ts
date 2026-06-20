Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-RSI-REPORT-FAILCLOSED — Regression test
 *
 * Root cause: defaultComputeTa (assembleBriefing.ts) used Math.min(14, rows.length-1)
 * as the RSI period, allowing RSI to be computed on as few as 8 candles with a reduced
 * period (e.g. period=7 on 8 candles). This produced single-digit RSI values on shallow
 * history (VRE RSI 10.3 on 6 candles; VIC 7.4 / VHM 9.8) that appeared in MARKET reports.
 *
 * RSIFIX-2 update: defaultComputeTa is now async (delegates to Go TA engine).
 * Min-candle gate raised to 35 (convergence recommendation).
 * market_prices_history fallback removed.
 *
 * Regression contract (updated for RSIFIX-2):
 *   A) <35 candles  → defaultComputeTa returns null (gate raised from 15 to 35)
 *   B) >=35 candles → defaultComputeTa returns TaSignal; RSI from Go engine
 *      (B-series tests removed — Go service not available in unit tests; covered by
 *       RSIFIX-2 new test file with injectable mock)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { defaultComputeTa } from "../application/usecases/assembleBriefing.js";

// ─── RSI pure-math helper (matches localComputeRSI in technicalIndicatorTools.ts) ──

/** Wilder EMA: seed = SMA of first p values; k = 1/p. */
function wilderEma(vals: number[], p: number): number[] {
  if (vals.length < p) return [];
  const k = 1 / p;
  const seed = vals.slice(0, p).reduce((a, b) => a + b, 0) / p;
  const result = [seed];
  for (let i = p; i < vals.length; i++) {
    result.push(vals[i]! * k + result[result.length - 1]! * (1 - k));
  }
  return result;
}

/**
 * Canonical RSI implementation — identical to localComputeRSI in
 * technicalIndicatorTools.ts (the SSOT reference for this fix).
 * Returns null when prices.length < period + 1.
 */
function canonicalRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i]! - prices[i - 1]!);
  }
  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));
  const sg = wilderEma(gains, period);
  const sl = wilderEma(losses, period);
  if (!sg.length || !sl.length) return null;
  const avgGain = sg[sg.length - 1]!;
  const avgLoss = sl[sl.length - 1]!;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT NOT NULL, date TEXT NOT NULL,
      open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
      close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT, price REAL, fetched_at TEXT
    );
  `);
  return db;
}

/**
 * Seed n candles for the given ticker with strictly increasing close prices.
 * Returns the close price array (oldest → newest) for direct RSI computation.
 */
function seedOhlcv(db: Database, code: string, n: number, base = 50000, step = 200): number[] {
  const closes: number[] = [];
  for (let i = 0; i < n; i++) {
    const date = `2024-01-${String(i + 1).padStart(2, "0")}`;
    const close = base + i * step;
    closes.push(close);
    db.query(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, date, close * 0.99, close * 1.01, close * 0.98, close, 500000, "2024-01-01T00:00:00Z");
  }
  return closes;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("FIX-RSI-REPORT-FAILCLOSED — RSI fail-close regression", () => {
  // ── (A) Shallow history: <35 candles → return null (RSIFIX-2: gate raised to 35) ──

  it("A1: 6 candles → defaultComputeTa returns null (was VRE-class bug: emitted RSI 10.3)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VRE", 6);

    const result = await defaultComputeTa("VRE", db);

    expect(result).toBeNull();
  });

  it("A2: 7 candles → defaultComputeTa returns null", async () => {
    const db = buildDb();
    seedOhlcv(db, "VIC", 7);

    const result = await defaultComputeTa("VIC", db);

    expect(result).toBeNull();
  });

  it("A3: 10 candles → defaultComputeTa returns null (was VHM-class bug: emitted RSI 9.8)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VHM", 10);

    const result = await defaultComputeTa("VHM", db);

    expect(result).toBeNull();
  });

  it("A4: 14 candles → defaultComputeTa returns null (below 35-candle gate)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 14);

    const result = await defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("A5: canonical localComputeRSI returns null for <15 closes", () => {
    // Directly validates the canonical reference implementation (unchanged math)
    const closes14 = Array.from({ length: 14 }, (_, i) => 50000 + i * 200);
    expect(canonicalRSI(closes14, 14)).toBeNull();

    const closes6 = Array.from({ length: 6 }, (_, i) => 50000 + i * 200);
    expect(canonicalRSI(closes6, 14)).toBeNull();
  });

  it("A6: 34 candles → defaultComputeTa returns null (RSIFIX-2: 34 < 35 gate)", async () => {
    const db = buildDb();
    seedOhlcv(db, "NVL", 34);

    const result = await defaultComputeTa("NVL", db);

    // 34 < 35 → gate rejects even though Go engine could produce a warmup RSI
    expect(result).toBeNull();
  });

  // ── (B) Sufficient history: >=35 candles → Go engine called (null if service down) ─
  // NOTE: B-series tests removed (Go service not available in unit tests).
  // Covered by RSIFIX-2-assembleBriefing.test.ts with injectable mock.

  // ── (C) rsiStatus classification mirrors fail-close: null → result null ─────

  it("C1: <35 candles → result is null (not a TaSignal with rsi14=number)", async () => {
    const db = buildDb();
    seedOhlcv(db, "ACB", 8);

    // Must return null — NOT a TaSignal with rsi14=number and rsiStatus="neutral"
    const result = await defaultComputeTa("ACB", db);
    expect(result).toBeNull();
  });
});
