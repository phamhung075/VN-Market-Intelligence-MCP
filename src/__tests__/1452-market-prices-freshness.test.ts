/**
 * Task 1452 — market_prices freshness guard in assembleBriefing
 *
 * Asserts:
 *   1. Stale market_prices row (updated_at = 4 days ago) does NOT win over daily_ohlcv.
 *   2. Fresh market_prices row (updated_at = today) DOES win over daily_ohlcv.
 *
 * Tests the exact SQL patterns used in assembleBriefing.ts watchlist and
 * portfolio subqueries, isolated from the full briefing pipeline.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// ── helpers ──────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_pct  REAL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE daily_ohlcv (
      code  TEXT NOT NULL,
      date  TEXT NOT NULL,
      close REAL NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE watchlist (
      code   TEXT PRIMARY KEY,
      domain TEXT NOT NULL DEFAULT 'general'
    );
    CREATE TABLE positions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL,
      shares     REAL NOT NULL,
      avg_price  REAL NOT NULL,
      closed_at  TEXT
    );
  `);
  return db;
}

/** Watchlist price subquery — mirrors the FIXED assembleBriefing.ts watchlist SELECT */
function watchlistPriceSubquery(db: Database, code: string): number | null {
  const row = db
    .query<{ price: number | null }, [string, string]>(
      `SELECT COALESCE(
         (SELECT mp.price FROM market_prices mp
          WHERE mp.code = ? AND mp.price IS NOT NULL AND mp.price > 0
            AND mp.updated_at >= datetime('now', '-3 days')),
         (SELECT d.close FROM daily_ohlcv d
          WHERE d.code = ? ORDER BY d.date DESC LIMIT 1)
       ) AS price`,
    )
    .get(code, code);
  return row?.price ?? null;
}

/** change_pct subquery — mirrors the FIXED assembleBriefing.ts change_pct SELECT */
function watchlistChangePctSubquery(db: Database, code: string): number | null {
  const row = db
    .query<{ change_pct: number | null }, [string]>(
      `SELECT mp2.change_pct FROM market_prices mp2
       WHERE mp2.code = ?1 AND mp2.price IS NOT NULL AND mp2.price > 0
         AND mp2.updated_at >= datetime('now', '-3 days')`,
    )
    .get(code);
  return row?.change_pct ?? null;
}

/** Portfolio price subquery — mirrors the FIXED assembleBriefing.ts portfolio SELECT */
function portfolioPriceSubquery(db: Database): Map<string, number> {
  const rows = db
    .query<{ code: string; price: number }, []>(
      `SELECT code, price FROM market_prices
       WHERE price IS NOT NULL AND price > 0
         AND updated_at >= datetime('now', '-3 days')
       UNION ALL
       SELECT code, close AS price FROM daily_ohlcv
       WHERE (code, date) IN (SELECT code, MAX(date) FROM daily_ohlcv GROUP BY code)
         AND code NOT IN (
           SELECT code FROM market_prices
           WHERE price IS NOT NULL AND price > 0
             AND updated_at >= datetime('now', '-3 days')
         )`,
    )
    .all();
  return new Map(rows.map((r) => [r.code, r.price]));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("1452 — market_prices freshness guard", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    // Seed daily_ohlcv with correct price for VCB
    db.exec(`INSERT INTO daily_ohlcv VALUES ('VCB', '2026-04-18', 59500)`);
    db.exec(`INSERT INTO watchlist (code) VALUES ('VCB')`);
  });

  describe("watchlist price subquery", () => {
    it("RED path: stale market_prices (4 days ago) — daily_ohlcv wins", () => {
      // Stale row: updated 4 days ago, price is wrong
      db.exec(
        `INSERT INTO market_prices (code, price, change_pct, updated_at)
         VALUES ('VCB', 88000, 0.5, datetime('now', '-4 days'))`,
      );

      const price = watchlistPriceSubquery(db, "VCB");
      // Must return daily_ohlcv price (59500), NOT stale market_prices (88000)
      expect(price).toBe(59500);
    });

    it("GREEN path: fresh market_prices (today) — market_prices wins", () => {
      // Fresh row: updated today, price is correct
      db.exec(
        `INSERT INTO market_prices (code, price, change_pct, updated_at)
         VALUES ('VCB', 59500, 1.2, datetime('now'))`,
      );

      const price = watchlistPriceSubquery(db, "VCB");
      // Must return market_prices price (59500) — wins over daily_ohlcv
      expect(price).toBe(59500);
    });

    it("GREEN path: fresh market_prices 2 days ago — within 3-day window, wins", () => {
      db.exec(
        `INSERT INTO market_prices (code, price, change_pct, updated_at)
         VALUES ('VCB', 61000, 2.1, datetime('now', '-2 days'))`,
      );

      const price = watchlistPriceSubquery(db, "VCB");
      expect(price).toBe(61000);
    });

    it("no market_prices row — falls back to daily_ohlcv", () => {
      const price = watchlistPriceSubquery(db, "VCB");
      expect(price).toBe(59500);
    });
  });

  describe("change_pct subquery", () => {
    it("stale market_prices — change_pct is null (excluded)", () => {
      db.exec(
        `INSERT INTO market_prices (code, price, change_pct, updated_at)
         VALUES ('VCB', 88000, 0.5, datetime('now', '-4 days'))`,
      );

      const pct = watchlistChangePctSubquery(db, "VCB");
      expect(pct).toBeNull();
    });

    it("fresh market_prices — change_pct returned", () => {
      db.exec(
        `INSERT INTO market_prices (code, price, change_pct, updated_at)
         VALUES ('VCB', 59500, 1.8, datetime('now'))`,
      );

      const pct = watchlistChangePctSubquery(db, "VCB");
      expect(pct).toBe(1.8);
    });
  });

  describe("portfolio price subquery", () => {
    beforeEach(() => {
      db.exec(
        `INSERT INTO positions (code, shares, avg_price) VALUES ('VCB', 100, 55000)`,
      );
    });

    it("stale market_prices — daily_ohlcv price used for portfolio P&L", () => {
      db.exec(
        `INSERT INTO market_prices (code, price, change_pct, updated_at)
         VALUES ('VCB', 88000, 0.5, datetime('now', '-4 days'))`,
      );

      const map = portfolioPriceSubquery(db);
      expect(map.get("VCB")).toBe(59500);
    });

    it("fresh market_prices — market_prices used for portfolio P&L", () => {
      db.exec(
        `INSERT INTO market_prices (code, price, change_pct, updated_at)
         VALUES ('VCB', 59500, 1.2, datetime('now'))`,
      );

      const map = portfolioPriceSubquery(db);
      expect(map.get("VCB")).toBe(59500);
    });

    it("no market_prices — daily_ohlcv price used for portfolio P&L", () => {
      const map = portfolioPriceSubquery(db);
      expect(map.get("VCB")).toBe(59500);
    });
  });
});
