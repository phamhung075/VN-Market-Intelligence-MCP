/**
 * SQLite database initialisation and singleton accessor.
 *
 * Sprint 209 — Modular Monolith Phase 1: schema decomposed into domain slices.
 * This file remains the public API surface — all 38+ callers continue to import
 * getDb / initDatabase / closeDb from this path without changes.
 *
 * Slice files (internal, not imported by outside modules):
 *   - schema-market-data.ts      — prices, OHLCV, foreign flow
 *   - schema-financial-reports.ts — BCTC, PDF, vnstock tables
 *   - schema-news.ts             — news, cascade, signals, insider
 *   - schema-alerts.ts           — alerts, mutes, custom rules, price alerts, broker sanctions
 *   - schema-portfolio.ts        — positions, P&L snapshots, targets
 *   - schema-briefings.ts        — briefing_log, market_summaries
 *   - schema-macro.ts            — macro indicators, commodities, SBV, predictions, kinhdich
 *   - schema-system.ts           — cron runs, agent logs, evidence, system tables
 *
 * `initDatabase()` is idempotent: every slice uses CREATE TABLE IF NOT EXISTS and
 * CREATE INDEX IF NOT EXISTS throughout, so calling it multiple times is safe.
 *
 * Numbers stored in million VND unless explicitly noted otherwise.
 */

import { Database } from "bun:sqlite";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { initMarketDataTables } from "./schema-market-data.js";
import { initFinancialReportsTables } from "./schema-financial-reports.js";
import { initNewsTables } from "./schema-news.js";
import { initAlertsTables } from "./schema-alerts.js";
import { initPortfolioTables } from "./schema-portfolio.js";
import { initBriefingsTables } from "./schema-briefings.js";
import { initMacroTables } from "./schema-macro.js";
import { initSystemTables } from "./schema-system.js";
import { initBacktestingTables } from "./schema-backtesting.js";
import { initAgmPlanTables } from "./agmPlanStore.js";
import { seedWatchlist, backfillBctcQ4, backfillBctcQ1_2026, backfillBctcHistorical, migrateWatchlistThresholds } from "./seedWatchlist.js";

/**
 * Default DB path — resolved to absolute path at module load time.
 */
const PROJECT_ROOT = resolve(import.meta.dir, "..", "..", "..");
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, "data", "market.db");

// ── Custom Alert Rules DDL (kept here for ensureCustomAlertRulesTable export) ─
// This function is exported and used by customAlertTools.ts directly.
// The DDL is also part of initAlertsTables() so fresh DBs get it via initDatabase().
const CUSTOM_ALERT_RULES_DDL = `
  CREATE TABLE IF NOT EXISTS custom_alert_rules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT NOT NULL,
    predicate    TEXT NOT NULL,
    threshold    REAL NOT NULL,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    triggered_at TEXT,
    notes        TEXT
  )
`;

export function ensureCustomAlertRulesTable(db: Database): void {
  db.exec(CUSTOM_ALERT_RULES_DDL);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_code ON custom_alert_rules(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_status ON custom_alert_rules(status)`);
}

let _db: Database | null = null;
let _dbStat: ReturnType<typeof statSync> | null = null;

/**
 * Returns the singleton `bun:sqlite` Database instance.
 * Opens the database on first call and creates the data directory if needed.
 * Re-reads DB_PATH env var on each new connection so tests can override it.
 */
export function getDb(): Database {
  // Re-read env var each time — tests may set it after module load
  const dbPath = Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;

  // FIX A: Detect if file was replaced (inode changed)
  // This catches the case where the database file was deleted and recreated
  // while the server was running, preventing writes to stale file descriptors.
  if (_db && dbPath !== ":memory:") {
    const oldStat = _dbStat;
    const newStat = statSync(dbPath, { throwIfNoEntry: false });
    if (!oldStat || !newStat || oldStat.ino !== newStat.ino) {
      // File was replaced — close stale connection
      try {
        _db.close();
      } catch {
        // ignore close errors
      }
      _db = null;
      _dbStat = null;
    }
  }

  if (_db) return _db;

  // Ensure data directory exists — skip for the special `:memory:` path
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    try { mkdirSync(dir, { recursive: true }); } catch (e: any) { if (e.code !== "EEXIST") throw e; }
  }

  _db = new Database(dbPath);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec("PRAGMA wal_autocheckpoint=4000");
  _db.exec("PRAGMA busy_timeout=5000");
  _dbStat = statSync(dbPath, { throwIfNoEntry: false });

  // FU-SCHEMA-DRIFT-P8: self-heal on fresh singleton (reconciled P5)
  // Fires only on _db=null branch. All slice inits are idempotent (IF NOT EXISTS).
  // initFinancialReportsTables excluded (RISK-2: view compile ordering).
  initMarketDataTables(_db);
  initAlertsTables(_db);
  initMacroTables(_db);
  initPortfolioTables(_db);
  initNewsTables(_db);
  initBriefingsTables(_db);
  initSystemTables(_db);
  initBacktestingTables(_db);
  initAgmPlanTables(_db);

  return _db;
}

/**
 * Closes and resets the singleton database connection.
 *
 * Intended for use in tests only — allows a fresh connection after the
 * underlying DB file has been deleted or replaced.
 */
export function closeDb(): void {
  if (_db) {
    try {
      _db.close();
    } catch (_) {
      // ignore errors on close (e.g. already closed)
    }
    _db = null;
  }
}

/**
 * Creates all application tables and indexes (idempotent).
 *
 * Safe to call at startup and in tests — every statement uses
 * CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
 *
 * Tables are organised into domain slices for maintainability:
 *   Market data → schema-market-data.ts
 *   Financial reports → schema-financial-reports.ts
 *   News / cascade → schema-news.ts
 *   Alerts → schema-alerts.ts
 *   Portfolio → schema-portfolio.ts
 *   Briefings → schema-briefings.ts
 *   Macro / external → schema-macro.ts
 *   System / infra → schema-system.ts
 */
export async function initDatabase(dbArg?: import("bun:sqlite").Database): Promise<void> {
  const db = dbArg ?? getDb();

  // ── Domain slices ──────────────────────────────────────────────────────────
  initMarketDataTables(db);
  initAlertsTables(db);
  initFinancialReportsTables(db);
  initNewsTables(db);
  initPortfolioTables(db);
  initBriefingsTables(db);
  initMacroTables(db);
  initSystemTables(db);
  initBacktestingTables(db);
  // FIX-G: AGM plan + actuals tables
  initAgmPlanTables(db);

  // ── Seed default watchlist from mcp.config.json (skip in tests) ────────────
  // Sprint 053 / 1021: the previous version used `return` to skip the
  // seed block in test mode. That also skipped EVERY table defined after this
  // point. Now we only guard the seed logic itself and continue after.
  const currentDbPath = Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;
  const isTestEnv =
    currentDbPath === ":memory:" ||
    Bun.env["BUN_ENV"] === "test" ||
    typeof Bun.env["BUN_TEST"] !== "undefined";
  if (!isTestEnv) {
    try {
      const { mcpConfig } = await import("../config.js");
      const defaultStocks = mcpConfig.market.watchlist;
      if (defaultStocks.length > 0) {
        const existing = db.query("SELECT COUNT(*) as c FROM watchlist").get() as { c: number };
        if (existing.c === 0) {
          const { getStockProfile } = await import("../../domain/services/sectorPeers.js");
          const ins = db.prepare(
            "INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new) VALUES (?, ?, ?, datetime('now'), -3, 5, 7, 1)"
          );
          for (const code of defaultStocks) {
            const profile = getStockProfile(code);
            ins.run(
              code,
              profile?.exchange ?? "HOSE",
              profile?.domain ?? "other",
            );
          }
        }
      }
    } catch { /* config not available — skip seeding */ }
  }

  // ── Task 1343a: Restore 30-ticker watchlist + Q4 2025 BCTC backfill ─────────
  // Upserts the canonical 30-ticker watchlist (idempotent) and enqueues any
  // missing Q4 2025 BCTC fetches. Runs always (not just on empty table) so
  // post-migration DBs with partial data get restored to full 30-ticker state.
  if (!isTestEnv) {
    seedWatchlist(db);
    backfillBctcQ4(db);
    // Task 1782: seed Q1-2026 rows unconditionally — bypasses the month-1..4
    // gate in detectTargetQuarter() that keeps targeting Q4-2025 through April.
    backfillBctcQ1_2026(db);
    // BCTC-HIST-SEED: seed last 8 quarters (Q3-2025 → Q4-2023) for all tickers.
    // INSERT OR IGNORE makes this idempotent across restarts.
    // Actual data arrives async as VPS fetch+refine pipeline drains the queue.
    backfillBctcHistorical(db);
  }

  // ── Post-init migrations ───────────────────────────────────────────────────

  // Task 1407 — HUT domain migration
  db.exec(
    `UPDATE watchlist SET domain = 'construction' WHERE code = 'HUT' AND domain = 'real_estate'`
  );

  // Task 1869b-seed — populate watchlist alert_drop_pct defaults
  // Standard tier: -7.0 (replaces old schema default -3 / NULL rows)
  // High-vol tier: -9.0 (NVL, DPM, REE, VNH, KBC, MWG, TCH)
  // Idempotent: rows already at correct value are untouched.
  migrateWatchlistThresholds(db);

  // Sprint 079 / Task 1204: delete corrupted VCB Q1-2025 record
  db.prepare(`
    DELETE FROM financial_reports
    WHERE action_code = 'VCB'
      AND period_year = 2025
      AND period_type = 'Q1'
      AND extraction_confidence < 0.1
  `).run();

  // Sprint 079 / Task 1201+1202: backfill missing Q4-2025 BCTC queue rows
  {
    const BACKFILL_079 = [
      { code: "BID", year: 2025, quarter: "Q4" },
      { code: "EIB", year: 2025, quarter: "Q4" },
      { code: "SHB", year: 2025, quarter: "Q4" },
      { code: "VCB", year: 2025, quarter: "Q4" },
      { code: "FPT", year: 2025, quarter: "Q4" },
      { code: "HPG", year: 2025, quarter: "Q4" },
      { code: "VCB", year: 2025, quarter: "Q1" },
    ];
    const backfillStmt = db.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
      VALUES (?, ?, ?, 'pending', 0)
      ON CONFLICT(action_code, period_year, period_quarter)
      DO UPDATE SET status = 'pending', attempts = 0, last_attempt = NULL
      WHERE status = 'failed' OR attempts >= 5
    `);
    for (const entry of BACKFILL_079) {
      backfillStmt.run(entry.code, entry.year, entry.quarter);
    }
  }

  // Task 1489: purge test-contamination rows
  db.exec(`DELETE FROM tracked_indicators WHERE source = 'test'`);
  // Task 1490: purge known system_logs test-contamination rows (extended: report #2590)
  db.exec(`DELETE FROM system_logs WHERE message IN ('only this appears', 'error message', 'check timestamp', 'warning message', 'this should appear')`);

  // Task 198: wire foreign flow column migration so daily_ohlcv always has all 4 columns.
  await migrateForeignFlowColumns(db);
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1503 — foreign flow column migration
// Run after initDatabase() on existing deployments where daily_ohlcv was created
// without the four foreign flow columns.
// Safe to call on a fresh DB — ALTER TABLE IF NOT EXISTS is a no-op when col exists.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add foreign flow columns to daily_ohlcv if they do not already exist.
 * Idempotent — safe to call on fresh and existing databases.
 */
export async function migrateForeignFlowColumns(db: import("bun:sqlite").Database): Promise<void> {
  const cols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
    .all()
    .map((r) => r.name);

  const toAdd: Array<[string, string]> = [
    ["foreign_buy_vol",  "REAL"],
    ["foreign_sell_vol", "REAL"],
    ["foreign_net_vol",  "REAL"],
    ["put_through_vol",  "REAL"],
  ];

  for (const [col, type] of toAdd) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN ${col} ${type}`);
    }
  }
}
