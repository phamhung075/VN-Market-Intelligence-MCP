Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1346 — TDD tests for fix(ta-adaptive): Adaptive RSI/MA Periods in defaultComputeTa
 *
 * TC-1: daily_ohlcv has 7 rows → returns null (below minimum — passes before and after fix)
 * TC-2: daily_ohlcv has 10 rows → returns TaSignal (FAILS before fix — < 15 guard blocks it)
 * TC-3: daily_ohlcv has 8 rows → returns TaSignal (FAILS before fix — < 15 guard blocks it)
 * TC-4: daily_ohlcv has 20 rows → returns TaSignal with RSI period 14, MA period 20
 *        (passes before and after fix — regression guard)
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

describe("1346 — defaultComputeTa adaptive periods", () => {
  it("TC-1: returns null when daily_ohlcv has 7 rows (below minimum — passes before and after fix)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 7);

    const result = defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("TC-2: returns TaSignal when daily_ohlcv has 10 rows (FAILS before fix — < 15 guard)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 10);

    const result = defaultComputeTa("VCB", db);

    expect(result).not.toBeNull();
    expect(result?.code).toBe("VCB");
    expect(result?.rsi14).not.toBeNull();
    expect(result?.ma20).not.toBeNull();
  });

  it("TC-3: returns TaSignal when daily_ohlcv has 8 rows (FAILS before fix — < 15 guard)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 8);

    const result = defaultComputeTa("VCB", db);

    expect(result).not.toBeNull();
    expect(result?.code).toBe("VCB");
    expect(result?.rsi14).not.toBeNull();
    expect(result?.ma20).not.toBeNull();
  });

  it("TC-4: returns TaSignal with full RSI/MA periods when daily_ohlcv has 20 rows (regression guard)", () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 20);

    const result = defaultComputeTa("VCB", db);

    expect(result).not.toBeNull();
    expect(result?.code).toBe("VCB");
    // With 20 rows: RSI period = Math.min(14, 19) = 14, MA period = Math.min(20, 20) = 20
    // Strictly increasing prices → RSI near 100 (overbought)
    expect(result?.rsiStatus).toBe("overbought");
    // Last close (89500) > MA20 → above
    expect(result?.priceVsMa20).toBe("above");
  });
});
