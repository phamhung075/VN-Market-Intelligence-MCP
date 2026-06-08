/**
 * 1862j — W-3 Sigma Dedup Safeguard
 *
 * Tests for:
 *   A) The pre/post row-count safeguard: if the dedup DELETE removes >50% of
 *      market_prices_history rows, it must ABORT (rollback) and emit a
 *      critical finding instead of committing the catastrophic deletion.
 *
 *   B) Regression guard: normal dedup (only true intraday duplicates) must
 *      still work correctly and NOT trigger the safeguard.
 *
 *   C) Sigma readiness is preserved: 30+ distinct days of data per stock
 *      must survive a W-3 run even when some days had intraday duplicates.
 *
 * Root cause recap (2026-05-10):
 *   runWeeklyAudit W-3 dedup deleted ALL but the latest row per (code, date).
 *   With 417 stocks having 30+ daily rows, the dedup kept only 1 row per
 *   (code, date) but wiped all rows that shared the same date — leaving each
 *   stock with only a few rows, well below the σ=30 threshold.
 *   All 417/30 READY stocks dropped to 2/30 NOT READY.
 *
 * The safeguard: before DELETE, COUNT total rows. After DELETE (in a
 * transaction), COUNT again. If deleted > 50% of pre-count, ROLLBACK.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runWeeklyAudit } from "../scheduler/news-analysis/dataAuditJob.js";

const AUDIT_TIMEOUT_MS = 60_000;

// ── Shared schema ─────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY,
      price REAL,
      change_amt REAL,
      change_pct REAL,
      volume REAL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      signals_json TEXT,
      affected_actions_json TEXT,
      analysis_ids_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      resolution_notes TEXT,
      notified_telegram INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT,
      sentiment TEXT,
      impact_score REAL,
      impact_direction TEXT,
      data_env TEXT
);

    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      validation_status TEXT DEFAULT 'pending',
      validation_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_agent ON agent_feedback(agent);

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT,
      resolved INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'banking'
    );

    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      brent_crude_usd REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz REAL NOT NULL DEFAULT 0,
      usd_vnd_rate REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      overnight_rate_pct REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_prices_history (
      code TEXT NOT NULL,
      price REAL NOT NULL,
      volume REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);

    CREATE TABLE IF NOT EXISTS audit_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_daily_audit_at TEXT,
      last_weekly_audit_at TEXT,
      last_daily_findings TEXT,
      last_weekly_findings TEXT
    );
  `);

  return db;
}

/** Insert N days of UNIQUE daily rows for a given stock code. */
function insertDailyHistory(db: Database, code: string, days: number): void {
  for (let i = days; i >= 1; i--) {
    db.prepare(`
      INSERT OR IGNORE INTO market_prices_history (code, price, volume, fetched_at, exchange)
      VALUES (?, ?, ?, datetime('now', '-' || ? || ' days', 'start of day', '+9 hours'), 'HOSE')
    `).run(code, 80000 + i, 100000 + i, i);
  }
}

/** Insert duplicate rows (same code, same DATE but different time) to simulate intraday pushes. */
function insertIntradayDuplicates(
  db: Database,
  code: string,
  date: string,
  count: number,
): void {
  for (let h = 9; h < 9 + count; h++) {
    const ts = `${date} ${String(h).padStart(2, "0")}:00:00`;
    db.prepare(`
      INSERT OR IGNORE INTO market_prices_history (code, price, volume, fetched_at, exchange)
      VALUES (?, ?, ?, ?, 'HOSE')
    `).run(code, 80000 + h, 100000, ts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe("1862j — W-3 Safeguard: catastrophic deletion aborted", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  /**
   * AC-1: Safeguard triggers when dedup would delete >50% of rows.
   *
   * Scenario: 10 stocks × 1 row each (all from the SAME date but different
   * times — all are intraday duplicates on the same day). W-3 would normally
   * keep only 1 per (code, date) = 10 rows, deleting 90 rows (90% of 100).
   * The safeguard must ABORT, leave all 100 rows intact, and emit a critical
   * finding with check="duplicate_price_history_aborted".
   */
  it("AC-1: aborts dedup when deletion would exceed 50% of rows", async () => {
    // Insert 10 stocks, each with 10 intraday duplicates on the same date
    // (all on 2026-05-09 at different hours)
    const stocks = ["VNM", "FPT", "VCB", "BID", "HPG", "MWG", "VHM", "GAS", "VIC", "TCB"];
    for (const code of stocks) {
      insertIntradayDuplicates(db, code, "2026-05-09", 10);
    }

    const rowsBefore = (db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM market_prices_history",
    ).get())!.cnt;
    expect(rowsBefore).toBe(100);

    const findings = await runWeeklyAudit(db, async () => {}, async () => 0);

    const rowsAfter = (db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM market_prices_history",
    ).get())!.cnt;

    // Safeguard must have aborted — all rows preserved
    expect(rowsAfter).toBe(rowsBefore);

    // Must emit a critical finding instead of auto_cleaned
    const f = findings.find((x) => x.check === "duplicate_price_history_aborted");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.action).toBe("escalated");
    expect(f!.detail).toContain("aborted");
  }, AUDIT_TIMEOUT_MS);

  /**
   * AC-2: Normal dedup (few duplicates, well below 50% threshold) proceeds
   * correctly and sigma data is NOT affected.
   *
   * Scenario: 5 stocks × 30 unique daily rows + 1 extra intraday duplicate
   * each. Dedup removes 5 rows out of 155 total (3.2% < 50%) — proceeds.
   * After dedup, each stock still has 30 rows → sigma readiness preserved.
   */
  it("AC-2: normal dedup proceeds when deletion is below 50% threshold", async () => {
    const stocks = ["VNM", "FPT", "VCB", "BID", "HPG"];
    for (const code of stocks) {
      // 30 unique daily rows (different dates, days 1..30 ago at 09:00)
      insertDailyHistory(db, code, 30);
      // 1 intraday duplicate on day-1 (same DATE as the day-1 row, different hour)
      db.prepare(`
        INSERT OR IGNORE INTO market_prices_history (code, price, volume, fetched_at, exchange)
        VALUES (?, ?, ?, datetime('now', '-1 days', 'start of day', '+10 hours'), 'HOSE')
      `).run(code, 99999, 200000);
    }

    const rowsBefore = (db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM market_prices_history",
    ).get())!.cnt;
    // 5 stocks × 31 rows each = 155
    expect(rowsBefore).toBe(155);

    const findings = await runWeeklyAudit(db, async () => {}, async () => 0);

    const rowsAfter = (db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM market_prices_history",
    ).get())!.cnt;

    // 5 duplicates removed (1 per stock), 150 rows remain
    expect(rowsAfter).toBe(150);

    // Must emit normal auto_cleaned finding (not aborted)
    const f = findings.find((x) => x.check === "duplicate_price_history");
    expect(f).toBeDefined();
    expect(f!.action).toBe("auto_cleaned");
    expect(f!.rowsAffected).toBe(5);

    // No aborted finding
    const aborted = findings.find((x) => x.check === "duplicate_price_history_aborted");
    expect(aborted).toBeUndefined();
  }, AUDIT_TIMEOUT_MS);

  /**
   * AC-3: Sigma readiness preserved across W-3 run with duplicates.
   *
   * 3 stocks with 30 unique daily rows + 2 intraday duplicates per stock.
   * After dedup: each still has 30 rows → still READY.
   */
  it("AC-3: sigma readiness (30 rows/stock) preserved after normal dedup", async () => {
    const stocks = ["VNM", "FPT", "VCB"];
    for (const code of stocks) {
      insertDailyHistory(db, code, 30);
      // Add 2 intraday duplicates on day-15
      insertIntradayDuplicates(db, code, "2026-04-25", 3); // 3 rows on same date
    }

    const rowsBefore = (db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM market_prices_history",
    ).get())!.cnt;
    // Each stock has up to 33 rows: 30 daily + up to 3 intraday (some may overlap)
    // The exact count depends on whether any of the 30 daily rows share DATE('2026-04-25')
    expect(rowsBefore).toBeGreaterThan(90);

    await runWeeklyAudit(db, async () => {}, async () => 0);

    // Each stock must still have >= 30 distinct rows after dedup
    const stockCounts = db.query<{ code: string; cnt: number }, []>(
      "SELECT code, COUNT(*) as cnt FROM market_prices_history GROUP BY code",
    ).all();

    expect(stockCounts.length).toBe(3);
    for (const s of stockCounts) {
      expect(s.cnt).toBeGreaterThanOrEqual(30);
    }
  }, AUDIT_TIMEOUT_MS);

  /**
   * AC-4: Safeguard finding includes the pre-count and would-delete count
   * in the detail string, so humans can audit what happened.
   */
  it("AC-4: aborted finding detail contains row counts for audit", async () => {
    // 5 stocks × 20 rows all on same date = 100 rows, dedup would keep 5 (95% deleted)
    const stocks = ["VNM", "FPT", "VCB", "BID", "HPG"];
    for (const code of stocks) {
      insertIntradayDuplicates(db, code, "2026-05-09", 20);
    }

    const findings = await runWeeklyAudit(db, async () => {}, async () => 0);

    const f = findings.find((x) => x.check === "duplicate_price_history_aborted");
    expect(f).toBeDefined();
    // Detail must mention how many rows exist and how many would have been deleted
    expect(f!.detail).toMatch(/\d+/); // contains numbers
    expect(f!.detail.toLowerCase()).toContain("abort");
  }, AUDIT_TIMEOUT_MS);

  /**
   * AC-5: Empty table — W-3 runs safely, no safeguard trigger, no crash.
   */
  it("AC-5: empty market_prices_history runs safely with 0 changes", async () => {
    const findings = await runWeeklyAudit(db, async () => {}, async () => 0);

    const rowsAfter = (db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM market_prices_history",
    ).get())!.cnt;
    expect(rowsAfter).toBe(0);

    // Should have a finding for duplicate_price_history with 0 rowsAffected (no aborted)
    const f = findings.find(
      (x) => x.check === "duplicate_price_history" || x.check === "duplicate_price_history_aborted",
    );
    expect(f).toBeDefined();
    if (f!.check === "duplicate_price_history") {
      expect(f!.rowsAffected).toBe(0);
    }
  }, AUDIT_TIMEOUT_MS);
});
