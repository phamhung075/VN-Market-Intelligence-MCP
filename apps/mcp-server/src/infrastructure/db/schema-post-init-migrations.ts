/**
 * initDatabase() post-init migrations — extracted from schema.ts
 * (FIX-CI-SIZELINT-SCHEMA-TS-DEFLAKE-REGRESSION-372L, 2026-08-07).
 *
 * Cohesive unit: every statement here runs on EVERY initDatabase() call,
 * unconditionally — NOT gated by the WeakSet one-time-DDL-sweep guard that
 * stays in schema.ts (Task 1489/TASK_2001 depend on that tail re-running
 * every call). Idempotent by construction throughout (IF NOT EXISTS /
 * INSERT OR IGNORE / conditional UPDATE / PK-guarded upsert).
 */

import type { Database } from "bun:sqlite";

import { migrateWatchlistThresholds } from "./seedWatchlist.js";
import { migrateForeignFlowColumns, backfillDailyForeignFlow } from "./schema-foreign-flow-migrations.js";

/**
 * Migrations/backfills that run on EVERY initDatabase() call — see file
 * banner above for why this is NOT gated by the WeakSet DDL-sweep guard.
 */
export async function runPostInitMigrations(db: Database): Promise<void> {
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

  // TASK_2001 (SUBTASK-DAILY-FF-2, ARCH-DAILY-FOREIGN-FLOW-TABLE): one-time idempotent
  // backfill of legacy daily_ohlcv.foreign_* history into daily_foreign_flow. Must run
  // after migrateForeignFlowColumns (legacy columns guaranteed to exist) and after
  // initMarketDataTables (daily_foreign_flow table guaranteed to exist). R-6 ordering:
  // MUST complete before the writer cutover (SUBTASK-DAILY-FF-3) ships.
  backfillDailyForeignFlow(db);
}
