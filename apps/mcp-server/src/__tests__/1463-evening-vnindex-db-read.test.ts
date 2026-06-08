/**
 * TASK 1463 — TDD: Evening Summary VN-Index reads from DB (not live geo-blocked fetch)
 *
 * AC-1: VNINDEX row in market_prices (updated < 3 days ago) → vnIndex populated from DB
 * AC-2: VNINDEX row older than 3 days (stale) → vnIndex undefined (freshness guard)
 * AC-3: No VNINDEX row in market_prices → vnIndex undefined
 *
 * The default fetchVnIndexFn must NOT hit api-finfo.vndirect.com.vn (geo-blocked from France).
 * Instead it reads: SELECT price, change_pct FROM market_prices WHERE code='VNINDEX'
 *   AND updated_at >= datetime('now', '-3 days')
 * Then computes change = Math.round(price * changePct / 100).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
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
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_title TEXT,
      level TEXT,
      sentiment TEXT,
      impact_score REAL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL DEFAULT '',
      severity              TEXT NOT NULL DEFAULT 'info',
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      resolved_at           TEXT,
      resolution_notes      TEXT
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      code         TEXT PRIMARY KEY,
      company_name TEXT,
      exchange     TEXT NOT NULL DEFAULT 'HOSE',
      domain       TEXT NOT NULL DEFAULT 'other',
      notes        TEXT
    );
    CREATE TABLE IF NOT EXISTS prediction_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT,
      signal TEXT,
      severity TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT,
      qty REAL,
      avg_cost REAL,
      status TEXT DEFAULT 'open'
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/** ISO timestamp N days ago */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Fresh VNINDEX row → vnIndex populated
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-1: fresh VNINDEX row in market_prices → vnIndex populated from DB", () => {
  it("vnIndex.close matches DB price", async () => {
    const db = makeDb();
    // Insert a fresh VNINDEX row (30 minutes ago)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.5, 12.0, 0.94, 0, '${thirtyMinAgo}')
    `);

    const summary = await assembleEveningSummary({
      db,
      // NO fetchVnIndexFn — forces default DB-read path
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getNewsCountFn: () => 0,
    });

    expect(summary.vnIndex).toBeDefined();
    expect(summary.vnIndex?.close).toBe(1285.5);
  });

  it("vnIndex.changePct matches DB change_pct", async () => {
    const db = makeDb();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.5, 12.0, 0.94, 0, '${thirtyMinAgo}')
    `);

    const summary = await assembleEveningSummary({
      db,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getNewsCountFn: () => 0,
    });

    expect(summary.vnIndex?.changePct).toBe(0.94);
  });

  it("vnIndex.change = Math.round(price * changePct / 100)", async () => {
    const db = makeDb();
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    // price=1285.5, changePct=0.94 → change = Math.round(1285.5 * 0.94 / 100) = Math.round(12.0837) = 12
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.5, 12.0, 0.94, 0, '${thirtyMinAgo}')
    `);

    const summary = await assembleEveningSummary({
      db,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getNewsCountFn: () => 0,
    });

    expect(summary.vnIndex?.change).toBe(Math.round(1285.5 * 0.94 / 100));
  });

  it("fetchedAt is set to the DB updated_at value", async () => {
    const db = makeDb();
    // Use a dynamic timestamp within the last 3 days (e.g., 1 day ago)
    const updatedAt = daysAgo(1);
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.5, 12.0, 0.94, 0, '${updatedAt}')
    `);

    const summary = await assembleEveningSummary({
      db,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getNewsCountFn: () => 0,
    });

    expect(summary.vnIndex?.fetchedAt).toBe(updatedAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: Stale VNINDEX row (> 3 days old) → vnIndex undefined
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-2: stale VNINDEX row (>3 days) → vnIndex undefined", () => {
  it("vnIndex is undefined when updated_at is 4 days ago", async () => {
    const db = makeDb();
    const fourDaysAgo = daysAgo(4);
    db.exec(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
      VALUES ('VNINDEX', 1285.5, 12.0, 0.94, 0, '${fourDaysAgo}')
    `);

    const summary = await assembleEveningSummary({
      db,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getNewsCountFn: () => 0,
    });

    expect(summary.vnIndex).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: No VNINDEX row → vnIndex undefined
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-3: no VNINDEX row in market_prices → vnIndex undefined", () => {
  it("vnIndex is undefined when market_prices has no VNINDEX code", async () => {
    const db = makeDb();
    // market_prices is empty — no VNINDEX

    const summary = await assembleEveningSummary({
      db,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getNewsCountFn: () => 0,
    });

    expect(summary.vnIndex).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: fetchVnIndexFn option still works (backward compat for injection)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-4: fetchVnIndexFn injection still overrides DB read", () => {
  it("custom fetchVnIndexFn result takes precedence over DB", async () => {
    const db = makeDb();
    // DB has stale/no VNINDEX — but fetchVnIndexFn injects fresh data
    const mockMp = {
      code: "VNINDEX",
      exchange: "HOSE",
      price: 1300,
      previousPrice: 1285,
      changePct: 1.17,
      volume: 0,
      avgVolume: 0,
      fetchedAt: "2026-04-18T15:30:00.000Z",
    };

    const summary = await assembleEveningSummary({
      db,
      fetchVnIndexFn: async () => mockMp,
      getPredictionSignalsFn: async () => [],
      computeTaFn: () => null,
      getOhlcvRowCountFn: () => 0,
      getNewsCountFn: () => 0,
    });

    expect(summary.vnIndex?.close).toBe(1300);
    // With fetchVnIndexFn, change = Math.round(price - previousPrice) = 15
    expect(summary.vnIndex?.change).toBe(15);
  });
});
