/**
 * Task 1850c — FIX: stale change_pct must not appear in bootstrap market context
 *
 * When market_prices row is >24h old, change_pct is from a prior trading session
 * and is misleading (e.g. -21.63% shown when current session is +2.04%).
 * buildWatchlistSection must suppress change_pct (show N/A) for stale rows.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import Database from "bun:sqlite";
import { buildWatchlistSection } from "../domain/services/marketContextBuilder.js";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'test',
      notes TEXT,
      alert_drop_pct REAL NOT NULL DEFAULT 5,
      alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY,
      price REAL,
      change_pct REAL,
      volume REAL,
      updated_at TEXT
    )
  `);
  return db;
}

describe("Task 1850c — stale change_pct suppression in watchlist section", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("shows change_pct when price is fresh (<24h)", () => {
    db.run(`INSERT INTO watchlist (code, exchange, domain) VALUES ('HSG', 'HOSE', 'steel')`);
    const freshTime = new Date(Date.now() - 1 * 3600_000).toISOString(); // 1h ago
    db.run(
      `INSERT INTO market_prices (code, price, change_pct, volume, updated_at) VALUES ('HSG', 15800, 2.04, 5000000, ?)`,
      [freshTime],
    );

    const section = buildWatchlistSection(db);
    expect(section).toContain("+2.04%");
  });

  it("suppresses change_pct when price is stale (>24h)", () => {
    db.run(`INSERT INTO watchlist (code, exchange, domain) VALUES ('HSG', 'HOSE', 'steel')`);
    const staleTime = new Date(Date.now() - 26 * 3600_000).toISOString(); // 26h ago
    db.run(
      `INSERT INTO market_prices (code, price, change_pct, volume, updated_at) VALUES ('HSG', 15800, -21.63, 5000000, ?)`,
      [staleTime],
    );

    const section = buildWatchlistSection(db);
    // Must NOT show the stale -21.63%
    expect(section).not.toContain("-21.63%");
    // Must still show the price
    expect(section).toContain("HSG");
    // Must mark as stale
    expect(section).toContain("[STALE]");
  });

  it("handles null change_pct gracefully", () => {
    db.run(`INSERT INTO watchlist (code, exchange, domain) VALUES ('VCB', 'HOSE', 'bank')`);
    const freshTime = new Date(Date.now() - 1 * 3600_000).toISOString();
    db.run(
      `INSERT INTO market_prices (code, price, change_pct, volume, updated_at) VALUES ('VCB', 85000, NULL, 2000000, ?)`,
      [freshTime],
    );

    const section = buildWatchlistSection(db);
    expect(section).toContain("VCB");
    // No crash, no percentage shown
    expect(section).not.toContain("%");
  });
});
