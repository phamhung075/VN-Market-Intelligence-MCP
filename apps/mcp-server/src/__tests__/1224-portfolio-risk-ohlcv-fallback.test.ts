Bun.env["DB_PATH"] = ":memory:";

/**
 * Bug 1224 — get_portfolio_risk returns 0 VND when market_prices is empty
 *
 * Root cause: portfolioRiskTool.ts used a plain LEFT JOIN market_prices which
 * returns NULL when VPS has not pushed intraday prices yet (off-hours, holidays,
 * or service gaps). This caused currentValue = 0 and weight = 0%.
 *
 * Fix: use currentPriceQuery() helper (COALESCE market_prices → daily_ohlcv)
 * identical to what listOpenPositions() already does.
 *
 * Tests:
 *   - currentPriceQuery falls back to daily_ohlcv when market_prices is empty
 *   - When daily_ohlcv has data, position currentValue is non-zero
 *   - When market_prices has data, market_prices takes priority over daily_ohlcv
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { currentPriceQuery } from "../infrastructure/db/priceQueries.js";
import { computePortfolioRisk, type PositionSnapshot, type DailyPriceRow } from "../domain/services/portfolioRiskCalculator.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS positions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL,
      shares     REAL NOT NULL,
      avg_price  REAL NOT NULL,
      opened_at  TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at  TEXT,
      notes      TEXT
    );
  `);
  return db;
}

// Simulates the fixed portfolioRiskTool price lookup query.
// Uses two bound params because currentPriceQuery generates two subqueries.
function getPositionCurrentPrice(db: Database, code: string): number | null {
  const sql = `SELECT ${currentPriceQuery("?")} AS price`;
  const row = db.prepare<{ price: number | null }, [string, string]>(sql).get(code, code);
  return row?.price ?? null;
}

describe("Bug 1224 — portfolio risk price fallback to daily_ohlcv", () => {
  it("returns non-null price when market_prices empty but daily_ohlcv has data", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('FPT', '2026-04-14', 76100, 77200, 75800, 76200, 700000, '2026-04-14T08:59:00Z');
    `);

    const price = getPositionCurrentPrice(db, "FPT");
    expect(price).toBe(76200);
  });

  it("returns null when both market_prices and daily_ohlcv are empty", () => {
    const db = makeDb();
    const price = getPositionCurrentPrice(db, "FPT");
    expect(price).toBeNull();
  });

  it("prefers market_prices over daily_ohlcv", () => {
    const db = makeDb();
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES ('FPT', 77000, 1.0, 100000, '2026-04-14T05:00:00Z');
    `);
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('FPT', '2026-04-14', 76100, 77200, 75800, 76200, 700000, '2026-04-14T08:59:00Z');
    `);

    const price = getPositionCurrentPrice(db, "FPT");
    expect(price).toBe(77000); // market_prices wins
  });

  it("computePortfolioRisk totalValue is correct when currentValue is populated", () => {
    // This verifies the domain calc is correct once the tool layer provides right currentValue
    const positions: PositionSnapshot[] = [
      {
        code: "FPT",
        shares: 5000,
        avgPrice: 80300,
        currentPrice: 76200,
        costBasis: 5000 * 80300,
        currentValue: 5000 * 76200, // 381_000_000 VND
      },
    ];

    const priceHistory: Record<string, DailyPriceRow[]> = {
      FPT: [
        { code: "FPT", price: 79100, fetched_at: "2026-04-10T08:59:00Z" },
        { code: "FPT", price: 78300, fetched_at: "2026-04-11T08:59:00Z" },
        { code: "FPT", price: 77700, fetched_at: "2026-04-12T08:59:00Z" },
        { code: "FPT", price: 76000, fetched_at: "2026-04-13T08:59:00Z" },
        { code: "FPT", price: 76200, fetched_at: "2026-04-14T08:59:00Z" },
      ],
    };

    const result = computePortfolioRisk(positions, priceHistory, 30);

    expect(result.totalValue).toBe(381_000_000);
    expect(result.heatMap.length).toBe(1);
    expect(result.heatMap[0]!.weightPct).toBeCloseTo(100, 0);
    expect(result.heatMap[0]!.code).toBe("FPT");
  });

  it("computePortfolioRisk totalValue is 0 when currentValue is 0 (old bug)", () => {
    // Documents the pre-fix behavior: when tool layer fails to get price,
    // currentValue=0 and the result is meaningless
    const positions: PositionSnapshot[] = [
      {
        code: "FPT",
        shares: 5000,
        avgPrice: 80300,
        currentPrice: null,
        costBasis: 5000 * 80300,
        currentValue: 0, // this was the bug — null price → 0
      },
    ];

    const result = computePortfolioRisk(positions, {}, 30);

    expect(result.totalValue).toBe(0);
    expect(result.heatMap[0]!.weightPct).toBe(0);
  });
});
