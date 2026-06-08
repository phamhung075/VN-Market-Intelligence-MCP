Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1082 — market_prices → daily_ohlcv fallback
 *
 * When market_prices is empty for a code (e.g. pre-market, after overnight
 * wipe, or VPS push gap), user-facing functions must fall back to the latest
 * daily_ohlcv close price instead of returning null/N/A.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

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
    CREATE TABLE IF NOT EXISTS watchlist (
      code         TEXT PRIMARY KEY,
      company_name TEXT,
      exchange     TEXT DEFAULT 'HOSE',
      domain       TEXT DEFAULT 'unknown',
      added_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS positions (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      shares     REAL NOT NULL,
      avg_price  REAL NOT NULL,
      opened_at  TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at  TEXT,
      close_price REAL,
      notes      TEXT
    );
  `);

  return db;
}

describe("Task 1082 — market_prices fallback to daily_ohlcv", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();

    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('FPT', '2026-04-09', 78000, 79500, 77800, 79100, 5000000, '2026-04-09T08:30:00Z');
    `);
    db.exec(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('VNM', '2026-04-09', 62000, 63500, 61800, 63200, 3000000, '2026-04-09T08:30:00Z');
    `);

    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES ('GOLD', 4790.9, 0.5, 0, '2026-04-10T04:00:00Z');
    `);

    db.exec(`
      INSERT INTO watchlist (code, company_name, exchange) VALUES ('FPT', 'FPT Corporation', 'HOSE');
      INSERT INTO watchlist (code, company_name, exchange) VALUES ('VNM', 'Vinamilk', 'HOSE');
    `);

    db.exec(`
      INSERT INTO positions (id, code, shares, avg_price, opened_at)
      VALUES ('pos-1', 'FPT', 5000, 80300, '2026-03-01');
    `);
  });

  it("listOpenPositions falls back to daily_ohlcv when market_prices empty", async () => {
    const { listOpenPositions } = await import(
      "../infrastructure/db/positionStore.js"
    );
    const positions = listOpenPositions(db);
    expect(positions.length).toBe(1);
    const pos = positions[0]!;
    expect(pos.currentPrice).toBe(79100);
    expect(pos.unrealizedPnl).not.toBe(0);
  });

  it("listOpenPositions prefers market_prices when available", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES ('FPT', 80000, 1.5, 100000, '2026-04-10T04:00:00Z');
    `);

    const { listOpenPositions } = await import(
      "../infrastructure/db/positionStore.js"
    );
    const positions = listOpenPositions(db);
    expect(positions[0]!.currentPrice).toBe(80000);
  });

  it("currentPriceQuery falls back to daily_ohlcv", async () => {
    const { currentPriceQuery } = await import(
      "../infrastructure/db/priceQueries.js"
    );
    const rows = db
      .prepare(
        `SELECT w.code, ${currentPriceQuery("w.code")} AS price
         FROM watchlist w
         ORDER BY w.code`,
      )
      .all() as { code: string; price: number | null }[];

    expect(rows.length).toBe(2);
    expect(rows[0]!.code).toBe("FPT");
    expect(rows[0]!.price).toBe(79100);
    expect(rows[1]!.code).toBe("VNM");
    expect(rows[1]!.price).toBe(63200);
  });

  it("currentPriceQuery prefers market_prices over daily_ohlcv", async () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES ('FPT', 80500, 1.5, 100000, '2026-04-10T04:00:00Z');
    `);

    const { currentPriceQuery } = await import(
      "../infrastructure/db/priceQueries.js"
    );
    const rows = db
      .prepare(
        `SELECT w.code, ${currentPriceQuery("w.code")} AS price
         FROM watchlist w
         ORDER BY w.code`,
      )
      .all() as { code: string; price: number | null }[];

    expect(rows[0]!.code).toBe("FPT");
    expect(rows[0]!.price).toBe(80500);
    expect(rows[1]!.code).toBe("VNM");
    expect(rows[1]!.price).toBe(63200);
  });
});
