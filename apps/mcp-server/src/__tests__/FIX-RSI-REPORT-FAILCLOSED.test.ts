Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-RSI-REPORT-FAILCLOSED — Regression test
 *
 * Root cause: defaultComputeTa (assembleBriefing.ts) used Math.min(14, rows.length-1)
 * as the RSI period, allowing RSI to be computed on as few as 8 candles with a reduced
 * period (e.g. period=7 on 8 candles). This produced single-digit RSI values on shallow
 * history (VRE RSI 10.3 on 6 candles; VIC 7.4 / VHM 9.8) that appeared in MARKET reports.
 *
 * Fix: RSI period is now fixed at 14. computeRSILocal returns null when prices.length < 15
 * (period + 1), matching the canonical get_technical_indicators tool's localComputeRSI behavior.
 *
 * Regression contract (MUST hold forever):
 *   A) <15 candles  → both canonical (localComputeRSI) and report (defaultComputeTa) return null
 *   B) >=15 candles → both return the SAME plausible value in [0, 100]
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
  // ── (A) Shallow history: <15 candles → both paths must return null ──────────

  it("A1: 6 candles → defaultComputeTa returns null (was VRE-class bug: emitted RSI 10.3)", () => {
    const db = buildDb();
    seedOhlcv(db, "VRE", 6);

    const result = defaultComputeTa("VRE", db);

    expect(result).toBeNull();
  });

  it("A2: 7 candles → defaultComputeTa returns null", () => {
    const db = buildDb();
    seedOhlcv(db, "VIC", 7);

    const result = defaultComputeTa("VIC", db);

    expect(result).toBeNull();
  });

  it("A3: 10 candles → defaultComputeTa returns null (was VHM-class bug: emitted RSI 9.8)", () => {
    const db = buildDb();
    seedOhlcv(db, "VHM", 10);

    const result = defaultComputeTa("VHM", db);

    expect(result).toBeNull();
  });

  it("A4: 14 candles → defaultComputeTa returns null (one below minimum)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 14);

    const result = defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("A5: canonical localComputeRSI returns null for <15 closes", () => {
    // Directly validates the canonical reference implementation
    const closes14 = Array.from({ length: 14 }, (_, i) => 50000 + i * 200);
    expect(canonicalRSI(closes14, 14)).toBeNull();

    const closes6 = Array.from({ length: 6 }, (_, i) => 50000 + i * 200);
    expect(canonicalRSI(closes6, 14)).toBeNull();
  });

  // ── (B) Sufficient history: >=15 candles → both paths return same value ─────

  it("B1: 15 candles → defaultComputeTa returns TaSignal with numeric rsi14 in [0,100]", () => {
    const db = buildDb();
    const closes = seedOhlcv(db, "VCB", 15);

    const result = defaultComputeTa("VCB", db);

    expect(result).not.toBeNull();
    expect(result?.rsi14).not.toBeNull();
    const rsi = result!.rsi14!;
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);

    // Must match canonical RSI
    const expected = canonicalRSI(closes, 14);
    expect(expected).not.toBeNull();
    expect(rsi).toBeCloseTo(expected!, 5);
  });

  it("B2: 20 candles → report RSI matches canonical RSI exactly", () => {
    const db = buildDb();
    const closes = seedOhlcv(db, "HPG", 20);

    const result = defaultComputeTa("HPG", db);

    expect(result).not.toBeNull();
    const rsi = result!.rsi14;
    expect(rsi).not.toBeNull();
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi!).toBeLessThanOrEqual(100);

    // Report RSI must equal canonical RSI (same math, same period, same data)
    const expected = canonicalRSI(closes, 14);
    expect(expected).not.toBeNull();
    expect(rsi!).toBeCloseTo(expected!, 5);
  });

  it("B3: 60 candles (full lookback) → report RSI matches canonical and is overbought on trending up", () => {
    const db = buildDb();
    const closes = seedOhlcv(db, "FPT", 60, 80000, 300);

    const result = defaultComputeTa("FPT", db);

    expect(result).not.toBeNull();
    const rsi = result!.rsi14;
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThanOrEqual(0);
    expect(rsi!).toBeLessThanOrEqual(100);
    expect(result!.rsiStatus).toBe("overbought"); // strictly increasing prices → RSI near 100

    // Canonical RSI on last 60 candles must match
    const expected = canonicalRSI(closes, 14);
    expect(expected).not.toBeNull();
    expect(rsi!).toBeCloseTo(expected!, 5);
  });

  // ── (C) rsiStatus classification mirrors fail-close: null → "neutral" ───────

  it("C1: <15 candles → rsiStatus is not set (result is null, not neutral with number)", () => {
    const db = buildDb();
    seedOhlcv(db, "ACB", 8);

    // Must return null — NOT a TaSignal with rsi14=number and rsiStatus="neutral"
    const result = defaultComputeTa("ACB", db);
    expect(result).toBeNull();
  });
});
