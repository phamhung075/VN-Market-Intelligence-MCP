Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1446 — evening movers: daily_ohlcv fallback for change_pct
 *
 * Root cause: LEFT JOIN market_prices + WHERE ABS(COALESCE(mp.change_pct, 0)) >= 1.0
 * silently drops tickers with no market_prices row (COALESCE to 0 fails >= 1.0 filter).
 *
 * Tests:
 *   (a) ticker with OHLCV only (no market_prices row) appears in movers when daily change >= 1%
 *   (b) market_prices.change_pct preferred over OHLCV fallback when both present
 *   (c) ticker with < 1% OHLCV change excluded from movers
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DB schema
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      exchange    TEXT
    );

    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code   TEXT NOT NULL,
      date   TEXT NOT NULL,
      open   REAL,
      high   REAL,
      low    REAL,
      close  REAL,
      volume REAL,
      PRIMARY KEY (code, date)
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      level        TEXT NOT NULL,
      source_title TEXT,
      sentiment    TEXT,
      impact_score REAL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      message               TEXT,
      affected_actions_json TEXT
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Seed OHLCV for two consecutive dates: yesterday + today */
function seedOhlcv(
  db: Database,
  code: string,
  yesterdayClose: number,
  todayClose: number,
) {
  // Use deterministic date strings relative to "today" in test context
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600_000);

  const todayStr = today.toISOString().slice(0, 10);
  const yestStr = yesterday.toISOString().slice(0, 10);

  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, 100000)`,
  ).run(code, yestStr, yesterdayClose, yesterdayClose, yesterdayClose, yesterdayClose);

  db.prepare(
    `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, 120000)`,
  ).run(code, todayStr, todayClose, todayClose, todayClose, todayClose);
}

/** Stub options: no TA computation, no VN-index fetch, no news query, no predictions */
function baseOptions(db: Database) {
  return {
    db,
    reportsDir: "/tmp/__test-1446__",
    computeTaFn: () => null,
    getOhlcvRowCountFn: () => 0,
    fetchVnIndexFn: async () => null,
    getNewsCountFn: () => 0,
    getPredictionSignalsFn: async () => [],
    getPnlFn: async () => null,
  } as const;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test (a): OHLCV-only ticker with >= 1% change appears in movers
// ─────────────────────────────────────────────────────────────────────────────

describe("1446 (a) — OHLCV-only ticker with >= 1% change appears in movers", () => {
  it("VHM with -5.17% OHLCV change and no market_prices row → appears in watchlistMovers", async () => {
    const db = setupTestDb();

    // Watchlist: VHM, no market_prices row
    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VHM', 'HOSE')`).run();

    // OHLCV: yesterday 50000, today 47414 → change = (47414-50000)/50000 * 100 = -5.172%
    seedOhlcv(db, "VHM", 50000, 47414);

    const summary = await assembleEveningSummary(baseOptions(db));

    const vhm = summary.watchlistMovers.find((m) => m.code === "VHM");
    expect(vhm).toBeDefined();
    expect(Math.abs(vhm!.changePct)).toBeGreaterThanOrEqual(1.0);
    expect(vhm!.changePct).toBeLessThan(-1.0);

    db.close();
  });

  it("VRE with -3.38% OHLCV change and no market_prices row → appears in movers", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VRE', 'HOSE')`).run();
    // yesterday 29600, today 28600 → (28600-29600)/29600*100 ≈ -3.378%
    seedOhlcv(db, "VRE", 29600, 28600);

    const summary = await assembleEveningSummary(baseOptions(db));

    const vre = summary.watchlistMovers.find((m) => m.code === "VRE");
    expect(vre).toBeDefined();
    expect(vre!.changePct).toBeLessThan(-1.0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (b): market_prices.change_pct preferred over OHLCV fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("1446 (b) — market_prices.change_pct preferred over OHLCV when present", () => {
  it("VCB has market_prices row (change_pct=2.5) + OHLCV row (would give 10%) → uses 2.5", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE')`).run();

    // market_prices: change_pct = 2.5%
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, updated_at, exchange)
       VALUES ('VCB', 85000, 2.5, datetime('now'), 'HOSE')`,
    ).run();

    // OHLCV: yesterday 80000, today 88000 → 10% (should NOT win)
    seedOhlcv(db, "VCB", 80000, 88000);

    const summary = await assembleEveningSummary(baseOptions(db));

    const vcb = summary.watchlistMovers.find((m) => m.code === "VCB");
    expect(vcb).toBeDefined();
    // Must use market_prices value (2.5), not OHLCV-computed (10)
    expect(Math.abs(vcb!.changePct - 2.5)).toBeLessThan(0.01);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (c): < 1% OHLCV change → ticker excluded from movers
// ─────────────────────────────────────────────────────────────────────────────

describe("1446 (c) — ticker with < 1% OHLCV change excluded from movers", () => {
  it("FPT with 0.5% OHLCV change and no market_prices row → absent from movers", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('FPT', 'HOSE')`).run();

    // yesterday 100000, today 100500 → 0.5% change — below threshold
    seedOhlcv(db, "FPT", 100000, 100500);

    const summary = await assembleEveningSummary(baseOptions(db));

    const fpt = summary.watchlistMovers.find((m) => m.code === "FPT");
    expect(fpt).toBeUndefined();

    db.close();
  });

  it("ticker with no market_prices and no OHLCV rows → absent from movers (no crash)", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('AAA', 'HOSE')`).run();
    // No OHLCV, no market_prices

    const summary = await assembleEveningSummary(baseOptions(db));

    const aaa = summary.watchlistMovers.find((m) => m.code === "AAA");
    expect(aaa).toBeUndefined();

    db.close();
  });
});
