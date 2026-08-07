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
import { seedWatchlist, backfillBctcQ4, backfillBctcQ1_2026, backfillBctcHistorical } from "./seedWatchlist.js";
import { runPostInitMigrations } from "./schema-post-init-migrations.js";

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

// FIX-MCP-MEMORY-CODE-LEAK: identity-keyed (not boolean) guard for
// initDatabase()'s one-time DDL sweep + seed/backfill block — see the guard
// site below for the full rationale. WeakSet lets a test-scoped Database be
// GC'd normally.
const _initializedDbs = new WeakSet<Database>();

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
  // DEFLAKE-VNSTOCK-3STATEMENT (2026-08-06): busy_timeout MUST be the FIRST
  // pragma executed on a freshly-opened connection — it was previously set
  // LAST (after journal_mode/synchronous/foreign_keys), so any lock held by
  // another connection to the SAME path (a concurrent process, or a prior
  // connection whose OS-level lock hadn't fully released yet) made the very
  // next statement (journal_mode) throw SQLITE_BUSY ("database is locked")
  // immediately instead of retrying for up to 5s. Reproduced live: 20
  // concurrent `bun test` processes opening the same on-disk sqlite path hit
  // this exact stack (getDb -> journal_mode PRAGMA -> SQLITE_BUSY) in ~1/20
  // runs. Setting busy_timeout first makes every subsequent statement on this
  // connection — including this one — honor the retry window.
  _db.exec("PRAGMA busy_timeout=5000");
  // FIX-SQLITE-DOCKER-VIRT-CORRUPTION-RECUR (2026-07-30): Docker Desktop on macOS
  // virtualization layer can corrupt WAL SHM files during container stop/restart.
  // Root cause: macOS Virtualization.VirtualMachine process holds fd on SHM during
  // stop; torn write causes SQLITE_CORRUPT (errno 11) on next open.
  // Prior mitigations (2026-04-25, 2026-07-13, 2026-07-19): bind mount changes.
  // This recurrence (3rd+) indicates WAL mode is incompatible with Docker virt layer.
  // Solution: switch to DELETE journal mode (no SHM files) + synchronous=FULL.
  // Performance impact: ~5-10% write latency increase, acceptable for production stability.
  _db.exec("PRAGMA journal_mode = DELETE");     // Eliminate WAL SHM corruption vector
  _db.exec("PRAGMA synchronous = FULL");         // Ensure every COMMIT hits disk
  _db.exec("PRAGMA foreign_keys = ON");
  _dbStat = statSync(dbPath, { throwIfNoEntry: false });
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

  // FIX-MCP-MEMORY-CODE-LEAK: identity-keyed guard (WeakSet, not a bare
  // boolean — see _initializedDbs above) around the EXPENSIVE, safe-to-run-
  // once section only (domain-slice DDL sweep + seed/backfill below), NOT
  // "Post-init migrations" below (Task 1489 / TASK_2001 depend on that tail
  // re-running every call). Full rationale:
  // docs/architecture-briefs/2026-08-05-fix-mcp-memory-code-leak-initdatabase-guard.md
  const currentDbPath = Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;
  const isTestEnv =
    currentDbPath === ":memory:" ||
    Bun.env["BUN_ENV"] === "test" ||
    typeof Bun.env["BUN_TEST"] !== "undefined";

  if (!_initializedDbs.has(db)) {
    _initializedDbs.add(db);

    // ── Domain slices ────────────────────────────────────────────────────────
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

    // ── Seed default watchlist from mcp.config.json (skip in tests) ──────────
    // Sprint 053 / 1021: the previous version used `return` to skip the
    // seed block in test mode. That also skipped EVERY table defined after this
    // point. Now we only guard the seed logic itself and continue after.
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

    // ── Task 1343a: Restore 30-ticker watchlist + Q4 2025 BCTC backfill ───────
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
  }

  // ── Post-init migrations (always run — NOT guarded, see WeakSet-guard note
  // above) — extracted to schema-post-init-migrations.ts
  // (FIX-CI-SIZELINT-SCHEMA-TS-DEFLAKE-REGRESSION-372L, 2026-08-07) to clear
  // the size-lint baseline via extraction, not a comment-trim/baseline bump.
  await runPostInitMigrations(db);
}

// Re-exported for backward compat — 15+ existing callers (tests +
// ohlcvForeignFlowStore.ts doc pointer) import these two directly from
// schema.js; implementation now lives in schema-foreign-flow-migrations.ts
// (FIX-CI-SIZELINT-SCHEMA-TS-DEFLAKE-REGRESSION-372L).
export { migrateForeignFlowColumns, backfillDailyForeignFlow } from "./schema-foreign-flow-migrations.js";
