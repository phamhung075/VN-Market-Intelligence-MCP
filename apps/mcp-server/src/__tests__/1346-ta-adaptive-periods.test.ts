Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1346 — TDD tests for defaultComputeTa RSI fail-close behaviour
 *
 * RSIFIX-2 update: defaultComputeTa is now async (delegates to Go TA engine).
 * Min-candle gate raised from 15 to 35 (Go convergence recommendation).
 * market_prices_history fallback removed.
 *
 * TC-1: daily_ohlcv has 7 rows  → null (below 35-candle gate)
 * TC-2: daily_ohlcv has 10 rows → null (below 35-candle gate)
 * TC-3: daily_ohlcv has 14 rows → null (below 35-candle gate)
 * TC-4: daily_ohlcv has 15 rows → null (RSIFIX-2: 15 < 35 new gate; old test expected TaSignal)
 * TC-5: daily_ohlcv has 20 rows → null (RSIFIX-2: 20 < 35 new gate; old test expected TaSignal)
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

describe("1346 — defaultComputeTa RSI fail-close (RSIFIX-2: gate=35, async Go engine)", () => {
  it("TC-1: returns null when daily_ohlcv has 7 rows (below 35-candle gate)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 7);

    const result = await defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("TC-2: 10 rows → null (below 35-candle gate)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 10);

    const result = await defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("TC-3: 14 rows → null (below 35-candle gate)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 14);

    const result = await defaultComputeTa("VCB", db);

    expect(result).toBeNull();
  });

  it("TC-4: 15 rows → null (RSIFIX-2: 15 < 35 new gate)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 15);

    const result = await defaultComputeTa("VCB", db);

    // RSIFIX-2: gate raised to 35; 15 rows is no longer sufficient
    expect(result).toBeNull();
  });

  it("TC-5: 20 rows → null (RSIFIX-2: 20 < 35 new gate)", async () => {
    const db = buildDb();
    seedOhlcv(db, "VCB", 20);

    const result = await defaultComputeTa("VCB", db);

    // RSIFIX-2: 20 < 35 → null
    expect(result).toBeNull();
  });
});
