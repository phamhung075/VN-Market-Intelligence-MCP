/**
 * Task 1517a — RED
 *
 * Proves runForeignFlowAlertJob fires HIGH signals from daily_ohlcv.foreign_net_vol
 * when zero rows exist in vnstock_trading_stats.
 *
 * Expected RED failures: AC1/AC2/AC3 — current impl queries vnstock_trading_stats
 * (no rows) → zero-data guard fires → stocksSkipped=1, highSignals=0, no alert.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runForeignFlowAlertJob } from "../scheduler/market-data/foreignFlowAlertJob.js";

const noop = async (_: string) => true;

function setupTestDb(): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      company_name TEXT,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct REAL NOT NULL DEFAULT -3,
      alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7,
      alert_report_new INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL,
      signals_json TEXT,
      affected_actions_json TEXT,
      analysis_ids_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      user_note TEXT,
      sent_by TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      magnitude REAL,
      confidence REAL,
      source_agent TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      ttl_days INTEGER NOT NULL DEFAULT 30,
      expires_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code          TEXT NOT NULL,
      date          TEXT NOT NULL,
      open          REAL,
      high          REAL,
      low           REAL,
      close         REAL,
      volume        REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    )
  `);

  // vnstock_trading_stats intentionally NOT created
  // to verify old source is NOT used

  // Seed watchlist
  db.run("INSERT INTO watchlist (code) VALUES ('VNM')");

  // Seed daily_ohlcv: d0 baseline + 3-day net BUY streak of 150_000/day
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-15", 0],
  );
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-16", 150_000],
  );
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-17", 150_000],
  );
  db.run(
    "INSERT INTO daily_ohlcv VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)",
    ["VNM", "2026-04-18", 150_000],
  );

  return db;
}

describe("Task 1517 — foreignFlowAlertJob reads daily_ohlcv.foreign_net_vol", () => {
  it("AC1: result.highSignals >= 1 with no vnstock_trading_stats rows", async () => {
    const db = setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.highSignals).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("AC2: result.stocksSkipped === 0 — VNM not zero-gated", async () => {
    const db = setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.stocksSkipped).toBe(0);
    db.close();
  });

  it("AC3: alert row inserted for VNM in alerts table", async () => {
    const db = setupTestDb();
    await runForeignFlowAlertJob(db, { sendWork: noop });
    const row = db
      .query("SELECT id FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'")
      .get();
    expect(row).toBeTruthy();
    db.close();
  });

  it("AC4: result.stocksScanned === 1", async () => {
    const db = setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.stocksScanned).toBe(1);
    db.close();
  });
});
