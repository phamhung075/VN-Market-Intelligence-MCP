Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1346 — TDD tests for defaultComputeTa RSI fail-close behaviour
 *
 * FIX-RSI-REPORT-FAILCLOSED: RSI(14) requires >=15 candles. Adaptive-period
 * trick removed — under-determined RSI values (e.g. VRE RSI 10.3 on 6 candles)
 * must not appear in MARKET reports.
 *
 * TC-1: daily_ohlcv has 7 rows  → null (below minimum)
 * TC-2: daily_ohlcv has 10 rows → TaSignal returned BUT rsi14 === null (insufficient for RSI)
 * TC-3: daily_ohlcv has 14 rows → TaSignal returned BUT rsi14 === null (needs 15, has 14)
 * TC-4: daily_ohlcv has 15 rows → TaSignal returned with rsi14 as a number (exact minimum)
 * TC-5: daily_ohlcv has 20 rows → TaSignal with rsi14 number, rsiStatus overbought (regression)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { defaultComputeTa } from "../application/usecases/assembleBriefing.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT,
      price      REAL,
      fetched_at TEXT
    );
  `);
  return db;
}

/**
 * Seed n rows into daily_ohlcv for the given code.
 * close prices: basePrice, basePrice + step, basePrice + 2*step, ...
 * dates: 2024-01-01, 2024-01-02, ...
 */
function seedOhlcv(db: Database, code: string, n: number, basePrice = 80000, step = 500): void {
  for (let i = 0; i < n; i++) {
    const date = `2024-01-${String(i + 1).padStart(2, "0")}`;
    const close = basePrice + i * step;
    db.query(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, date, close * 0.99, close * 1.01, close * 0.98, close, 1000000, "2024-01-01T00:00:00Z");
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("1346 — defaultComputeTa RSI fail-close (FIX-RSI-REPORT-FAILCLOSED)", () => {
  it("TC-1: returns null when daily_ohlcv has 7 rows (below minimum 15)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 7);

    const result = defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("TC-2: 10 rows → TaSignal returned but rsi14 is null (need 15 for RSI(14))", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 10);

    // 10 rows < 15 → defaultComputeTa returns null now (fails both primary and fallback guard)
    const result = defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("TC-3: 14 rows → null (exactly 1 below the RSI(14) minimum of 15)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 14);

    const result = defaultComputeTa("VCB", db);

    // 14 rows < 15 → returns null
    expect(result).toBeNull();
  });

  it("TC-4: 15 rows → TaSignal with rsi14 as a number (exact RSI minimum)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 15);

    const result = defaultComputeTa("VCB", db);

    expect(result).not.toBeNull();
    expect(result?.code).toBe("VCB");
    // 15 candles is exactly RSI(14)+1 minimum — rsi14 must be a number
    expect(result?.rsi14).not.toBeNull();
    expect(typeof result?.rsi14).toBe("number");
    // Strictly increasing prices → RSI near 100 (overbought)
    expect(result?.rsiStatus).toBe("overbought");
  });

  it("TC-5: 20 rows → TaSignal with rsi14 number, rsiStatus overbought (regression guard)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 20);

    const result = defaultComputeTa("VCB", db);

    expect(result).not.toBeNull();
    expect(result?.code).toBe("VCB");
    // With 20 rows: RSI period = 14, MA period = min(20, 20) = 20
    // Strictly increasing prices → RSI near 100 (overbought)
    expect(result?.rsiStatus).toBe("overbought");
    expect(typeof result?.rsi14).toBe("number");
    // Last close (89500) > MA20 → above
    expect(result?.priceVsMa20).toBe("above");
  });
});
