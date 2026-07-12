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
// TASK_2003 (SUBTASK-DAILY-FF-4): production code now reads foreign-flow via the
// daily_ohlcv_with_flow compat view. Reuse the real schema init/migration
// functions (no duplicated DDL) to upgrade this ad-hoc fixture so the view resolves.
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { migrateForeignFlowColumns } from "../infrastructure/db/schema.js";

const noop = async (_: string) => true;

async function setupTestDb(): Promise<Database> {
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
      sent_by TEXT NOT NULL DEFAULT 'server',
      confidence_score REAL,
      validated_at TEXT,
      fingerprint TEXT UNIQUE
    )
  `);

  // FU-ALERT-COWRITE-SCHEDULER-JOBS: agent_signals required for storeAlerts co-write
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      alert_id TEXT,
      is_correlation_stub INTEGER DEFAULT 0
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

  // TASK_2003: this ad-hoc fixture predates daily_ohlcv_with_flow and lacks
  // updated_at — add it (idempotent guard) then create daily_foreign_flow +
  // the compat view via the real init path so the view resolves.
  const cols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
    .all()
    .map((r) => r.name);
  if (!cols.includes("updated_at")) {
    db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);
  }
  initMarketDataTables(db);
  await migrateForeignFlowColumns(db);

  return db;
}

describe("Task 1517 — foreignFlowAlertJob reads daily_ohlcv.foreign_net_vol", () => {
  it("AC1: result.highSignals >= 1 with no vnstock_trading_stats rows", async () => {
    const db = await setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.highSignals).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("AC2: result.stocksSkipped === 0 — VNM not zero-gated", async () => {
    const db = await setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.stocksSkipped).toBe(0);
    db.close();
  });

  it("AC3: alert row inserted for VNM in alerts table", async () => {
    const db = await setupTestDb();
    await runForeignFlowAlertJob(db, { sendWork: noop });
    const row = db
      .query("SELECT id FROM alerts WHERE id LIKE 'foreign-flow-VNM-%'")
      .get();
    expect(row).toBeTruthy();
    db.close();
  });

  it("AC4: result.stocksScanned === 1", async () => {
    const db = await setupTestDb();
    const result = await runForeignFlowAlertJob(db, { sendWork: noop });
    expect(result.stocksScanned).toBe(1);
    db.close();
  });
});
