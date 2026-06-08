/**
 * TASK 1432 — TDD RED: foreign-flow sentinel filter assertions
 *
 * All tests must FAIL (RED) before TASK 1433 is implemented.
 * The sentinel value 9999999 (and -9999999) is injected by the VPS fetcher
 * when no foreign flow data is available. It must be excluded from briefings.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { queryForeignFlowSummary_TEST } from "../application/usecases/assembleBriefing.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'general',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
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
      affected_actions_json TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      resolved_at           TEXT
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );

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

    CREATE TABLE IF NOT EXISTS financial_reports (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter INTEGER,
      period_type    TEXT NOT NULL DEFAULT 'Q1',
      parsed_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS insider_transactions (
      id               TEXT PRIMARY KEY,
      code             TEXT NOT NULL,
      type             TEXT NOT NULL,
      executed_volume  INTEGER NOT NULL DEFAULT 0,
      insider_name     TEXT NOT NULL DEFAULT '',
      from_date        TEXT NOT NULL DEFAULT '',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id              TEXT PRIMARY KEY,
      code            TEXT NOT NULL,
      date            TEXT NOT NULL,
      foreign_volume  INTEGER,
      fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             TEXT PRIMARY KEY,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0,
      bearish_score  REAL NOT NULL DEFAULT 0,
      fragment_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS positions (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL,
      shares     REAL NOT NULL,
      avg_price  REAL NOT NULL,
      closed_at  TEXT
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 — row with foreign_volume = 9999999 is excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: positive sentinel 9999999 excluded", () => {
  it("returns no rows when the only row has foreign_volume=9999999", () => {
    const db = buildTestDb();
    db.exec(`
      INSERT INTO vnstock_trading_stats (id, code, date, foreign_volume, fetched_at)
      VALUES ('r1', 'VCB', '2026-04-17', 9999999, '2026-04-17T10:00:00.000Z')
    `);

    const result = queryForeignFlowSummary_TEST(db, ["VCB"]);
    const hasSentinel = result.some((r) => r.foreignVolume === 9999999);
    expect(hasSentinel).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2 — row with foreign_volume = -9999999 is excluded
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: negative sentinel -9999999 excluded", () => {
  it("returns no rows when the only row has foreign_volume=-9999999", () => {
    const db = buildTestDb();
    db.exec(`
      INSERT INTO vnstock_trading_stats (id, code, date, foreign_volume, fetched_at)
      VALUES ('r2', 'TCB', '2026-04-17', -9999999, '2026-04-17T10:00:00.000Z')
    `);

    const result = queryForeignFlowSummary_TEST(db, ["TCB"]);
    const hasSentinel = result.some((r) => r.foreignVolume === -9999999);
    expect(hasSentinel).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3 — row with valid foreign_volume (500000) is included
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: valid foreign_volume 500000 included", () => {
  it("returns the row with foreign_volume=500000", () => {
    const db = buildTestDb();
    db.exec(`
      INSERT INTO vnstock_trading_stats (id, code, date, foreign_volume, fetched_at)
      VALUES ('r3', 'HPG', '2026-04-17', 500000, '2026-04-17T10:00:00.000Z')
    `);

    const result = queryForeignFlowSummary_TEST(db, ["HPG"]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const row = result.find((r) => r.code === "HPG");
    expect(row).toBeDefined();
    expect(row!.foreignVolume).toBe(500000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 — assembleBriefing output does NOT contain sentinel string
// ─────────────────────────────────────────────────────────────────────────────

import { assembleBriefing } from "../application/usecases/assembleBriefing.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

const NOOP_OPTS = {
  pollNewsFn: async () => {},
  fetchVnIndexFn: async () => null,
  briefingsDir: "/tmp/briefings-test-1432",
};

describe("AC-4: assembleBriefing output free of sentinel strings", () => {
  it("JSON output does not contain '9,999,999' or '9999999'", async () => {
    const db = buildTestDb();
    db.exec(`INSERT INTO watchlist (code, domain) VALUES ('VCB', 'banking')`);
    // Insert sentinel row as the most recent data
    db.exec(`
      INSERT INTO vnstock_trading_stats (id, code, date, foreign_volume, fetched_at)
      VALUES ('s1', 'VCB', '2026-04-17', 9999999, '2026-04-17T10:00:00.000Z')
    `);

    const briefing = await assembleBriefing({ ...NOOP_OPTS, db });
    const json = JSON.stringify(briefing);

    expect(json).not.toContain("9999999");
    expect(json).not.toContain("9,999,999");
  });
});
