Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1462 — fix(evening-summary): market_prices freshness guard on watchlistMovers query
 *
 * Root cause: assembleEveningSummary.ts LEFT JOINs market_prices without an
 * updated_at guard. A stale row (e.g. VCB updated 4 days ago) passes the
 * ABS(change_pct) >= 1.0 filter and appears as the only mover every evening.
 *
 * Tests:
 *   (a) Stale market_prices row (updated_at = 4 days ago) → NOT in watchlistMovers
 *   (b) Fresh market_prices row (updated_at = now) → IS in watchlistMovers
 *   (c) Stale market_prices + fresh OHLCV → OHLCV computed_pct surfaces (OHLCV path)
 *   (d) Fallback path (no OHLCV): stale market_prices row excluded, ticker absent
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

/** Seed OHLCV for two consecutive dates: yesterday + today */
function seedOhlcv(
  db: Database,
  code: string,
  yesterdayClose: number,
  todayClose: number,
) {
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

/** Stub options: no TA, no VN-Index, no news, no predictions, no P&L */
function baseOptions(db: Database) {
  return {
    db,
    reportsDir: "/tmp/__test-1462__",
    computeTaFn: () => null,
    getOhlcvRowCountFn: () => 0,
    fetchVnIndexFn: async () => null,
    getNewsCountFn: () => 0,
    getPredictionSignalsFn: async () => [],
    getPnlFn: async () => null,
  } as const;
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) Stale market_prices (>3 days) → NOT in watchlistMovers (OHLCV path)
// ─────────────────────────────────────────────────────────────────────────────

describe("1462 (a) — stale market_prices row (4 days old) excluded from watchlistMovers", () => {
  it("VCB with stale change_pct=88000 row (4 days ago) does NOT appear in movers", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE')`).run();

    // Stale market_prices row — 4 days ago, high change_pct that would pass >= 1.0
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, updated_at, exchange)
       VALUES ('VCB', 88000, 5.2, datetime('now', '-4 days'), 'HOSE')`,
    ).run();

    // No OHLCV rows — ticker must be fully excluded
    const summary = await assembleEveningSummary(baseOptions(db));

    const vcb = summary.watchlistMovers.find((m) => m.code === "VCB");
    expect(vcb).toBeUndefined();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Fresh market_prices (updated now) → IS in watchlistMovers (fallback path)
// ─────────────────────────────────────────────────────────────────────────────

describe("1462 (b) — fresh market_prices row (updated now) IS in watchlistMovers", () => {
  it("VCB with fresh change_pct=2.5 (updated now) appears in movers", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE')`).run();

    // Fresh market_prices row
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, updated_at, exchange)
       VALUES ('VCB', 88000, 2.5, datetime('now'), 'HOSE')`,
    ).run();

    const summary = await assembleEveningSummary(baseOptions(db));

    const vcb = summary.watchlistMovers.find((m) => m.code === "VCB");
    expect(vcb).toBeDefined();
    expect(Math.abs(vcb!.changePct - 2.5)).toBeLessThan(0.01);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) Stale market_prices + fresh OHLCV → OHLCV computed_pct surfaces (OHLCV path)
// ─────────────────────────────────────────────────────────────────────────────

describe("1462 (c) — stale market_prices + fresh OHLCV → OHLCV computed_pct used", () => {
  it("VHM: stale mp row ignored, OHLCV -5.17% surfaces instead", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VHM', 'HOSE')`).run();

    // Stale market_prices — would give 3.0% if used
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, updated_at, exchange)
       VALUES ('VHM', 47414, 3.0, datetime('now', '-4 days'), 'HOSE')`,
    ).run();

    // Fresh OHLCV: yesterday 50000, today 47414 → -5.17% computed
    seedOhlcv(db, "VHM", 50000, 47414);

    const summary = await assembleEveningSummary(baseOptions(db));

    const vhm = summary.watchlistMovers.find((m) => m.code === "VHM");
    expect(vhm).toBeDefined();
    // OHLCV computed_pct = (47414-50000)/50000*100 ≈ -5.17, NOT stale 3.0
    expect(vhm!.changePct).toBeLessThan(-1.0);
    expect(Math.abs(vhm!.changePct - 3.0)).toBeGreaterThan(0.5); // not the stale value

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) Fallback path: stale market_prices, no OHLCV → ticker absent from movers
// ─────────────────────────────────────────────────────────────────────────────

describe("1462 (d) — fallback path: stale market_prices, no OHLCV → ticker absent", () => {
  it("ticker with only stale market_prices (no OHLCV) is excluded from movers", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('TCB', 'HOSE')`).run();

    // Stale market_prices, no OHLCV
    db.prepare(
      `INSERT INTO market_prices (code, price, change_pct, updated_at, exchange)
       VALUES ('TCB', 45000, 4.1, datetime('now', '-5 days'), 'HOSE')`,
    ).run();

    const summary = await assembleEveningSummary(baseOptions(db));

    const tcb = summary.watchlistMovers.find((m) => m.code === "TCB");
    expect(tcb).toBeUndefined();

    db.close();
  });
});
