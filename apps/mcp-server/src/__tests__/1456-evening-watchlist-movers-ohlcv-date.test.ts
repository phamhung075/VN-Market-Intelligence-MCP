Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1456 — evening movers: ohlcv_change CTE uses MAX(date) not date('now')
 *
 * Root cause: WHERE t.date = date('now') returns 0 rows on weekends / after
 * 00:00 UTC, because daily_ohlcv.MAX(date) lags behind wall-clock date.
 *
 * Fix: replace date('now') with (SELECT MAX(date) FROM daily_ohlcv).
 *
 * Tests:
 *   (a) OHLCV seeded with yesterday's date (not today) → watchlistMovers non-empty
 *   (b) MAX(date) = today path still works (regression guard)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DB schema (mirrors 1446 pattern)
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

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/** Stub options: no TA, no VN-index fetch, no news, no predictions */
function baseOptions(db: Database) {
  return {
    db,
    reportsDir: "/tmp/__test-1456__",
    computeTaFn: () => null,
    getOhlcvRowCountFn: () => 0,
    fetchVnIndexFn: async () => null,
    getNewsCountFn: () => 0,
    getPredictionSignalsFn: async () => [],
    getPnlFn: async () => null,
  } as const;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test (a): OHLCV seeded with PAST dates (simulates weekend / post-midnight UTC)
// ─────────────────────────────────────────────────────────────────────────────

describe("1456 (a) — OHLCV with past dates (weekend / post-midnight UTC simulation)", () => {
  it("VCB seeded with dates 2 and 3 days ago → watchlistMovers non-empty (>= 1% change)", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE')`).run();

    // Simulate weekend: latest daily_ohlcv date is 2 days ago (e.g. Friday),
    // while date('now') would be Sunday → old code returns 0 rows.
    const now = new Date();
    const latestTradingDay = new Date(now.getTime() - 2 * 24 * 3600_000);
    const prevTradingDay = new Date(now.getTime() - 3 * 24 * 3600_000);

    const latestStr = latestTradingDay.toISOString().slice(0, 10);
    const prevStr = prevTradingDay.toISOString().slice(0, 10);

    // prev: 80000, latest: 86000 → +7.5% change
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 80000, 80000, 80000, 80000, 100000)`,
    ).run("VCB", prevStr);

    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 86000, 86000, 86000, 86000, 120000)`,
    ).run("VCB", latestStr);

    const summary = await assembleEveningSummary(baseOptions(db));

    // With old code (date('now')), this returns [] because latest date != today.
    // With fix (MAX(date)), VCB should appear with ~7.5% change.
    const vcb = summary.watchlistMovers.find((m) => m.code === "VCB");
    expect(vcb).toBeDefined();
    expect(Math.abs(vcb!.changePct)).toBeGreaterThanOrEqual(1.0);

    db.close();
  });

  it("HPG seeded 3 days ago → watchlistMovers contains HPG with -5% change", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('HPG', 'HOSE')`).run();

    const now = new Date();
    const latest = new Date(now.getTime() - 3 * 24 * 3600_000);
    const prev = new Date(now.getTime() - 4 * 24 * 3600_000);

    const latestStr = latest.toISOString().slice(0, 10);
    const prevStr = prev.toISOString().slice(0, 10);

    // prev: 50000, latest: 47500 → -5% change
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 50000, 50000, 50000, 50000, 200000)`,
    ).run("HPG", prevStr);

    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 47500, 47500, 47500, 47500, 180000)`,
    ).run("HPG", latestStr);

    const summary = await assembleEveningSummary(baseOptions(db));

    const hpg = summary.watchlistMovers.find((m) => m.code === "HPG");
    expect(hpg).toBeDefined();
    expect(hpg!.changePct).toBeLessThan(-1.0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (b): MAX(date) = today still works (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("1456 (b) — MAX(date) = today path (regression guard)", () => {
  it("VHM seeded with today and yesterday → still appears in movers", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VHM', 'HOSE')`).run();

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600_000);

    const todayStr = now.toISOString().slice(0, 10);
    const yestStr = yesterday.toISOString().slice(0, 10);

    // yesterday: 60000, today: 63600 → +6% change
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 60000, 60000, 60000, 60000, 100000)`,
    ).run("VHM", yestStr);

    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 63600, 63600, 63600, 63600, 110000)`,
    ).run("VHM", todayStr);

    const summary = await assembleEveningSummary(baseOptions(db));

    const vhm = summary.watchlistMovers.find((m) => m.code === "VHM");
    expect(vhm).toBeDefined();
    expect(Math.abs(vhm!.changePct)).toBeGreaterThanOrEqual(1.0);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (c): Task 1461 — Mon+Fri seed, skip Sat/Sun → prev trading day = Fri
// ─────────────────────────────────────────────────────────────────────────────

describe("1461 (c) — Monday uses Friday as previous trading day (skip weekend)", () => {
  it("VCB seeded Mon+Fri (no Sat/Sun rows) → watchlistMovers non-empty", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('VCB', 'HOSE')`).run();

    // Mon 2026-04-14, Fri 2026-04-11 — no Sat/Sun rows exist
    const monStr = "2026-04-14"; // Monday (MAX date in table)
    const friStr = "2026-04-11"; // Friday (prev trading day)

    // Fri: 80000, Mon: 86000 → +7.5% change
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 80000, 80000, 80000, 80000, 100000)`,
    ).run("VCB", friStr);

    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 86000, 86000, 86000, 86000, 120000)`,
    ).run("VCB", monStr);

    const summary = await assembleEveningSummary(baseOptions(db));

    // Old code: y.date = date('2026-04-14', '-1 day') = '2026-04-13' (Sunday) → no row → NULL → empty
    // Fixed code: y.date = MAX(date WHERE date < '2026-04-14') = '2026-04-11' (Friday) → +7.5%
    const vcb = summary.watchlistMovers.find((m) => m.code === "VCB");
    expect(vcb).toBeDefined();
    expect(Math.abs(vcb!.changePct)).toBeGreaterThanOrEqual(1.0);

    db.close();
  });

  it("post-holiday: seed Wed+Mon (skip Tue holiday) → prev trading day = Mon", async () => {
    const db = setupTestDb();

    db.prepare(`INSERT INTO watchlist (code, exchange) VALUES ('HPG', 'HOSE')`).run();

    // Wed=2026-04-15 (latest), Mon=2026-04-13 (prev trading day, skip Tue holiday 04-14)
    const wedStr = "2026-04-15";
    const monStr = "2026-04-13";

    // Mon: 50000, Wed: 47500 → -5% change
    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 50000, 50000, 50000, 50000, 200000)`,
    ).run("HPG", monStr);

    db.prepare(
      `INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume)
       VALUES (?, ?, 47500, 47500, 47500, 47500, 180000)`,
    ).run("HPG", wedStr);

    const summary = await assembleEveningSummary(baseOptions(db));

    // Old code: y.date = date('2026-04-15', '-1 day') = '2026-04-14' (holiday) → no row → NULL → empty
    // Fixed code: y.date = MAX(date WHERE date < '2026-04-15') = '2026-04-13' (Monday) → -5%
    const hpg = summary.watchlistMovers.find((m) => m.code === "HPG");
    expect(hpg).toBeDefined();
    expect(hpg!.changePct).toBeLessThan(-1.0);

    db.close();
  });
});
