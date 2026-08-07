/**
 * Foreign-flow DB migration helpers — extracted from schema.ts
 * (FIX-CI-SIZELINT-SCHEMA-TS-DEFLAKE-REGRESSION-372L, 2026-08-07).
 * schema.ts re-exports both for the 15+ existing callers (tests +
 * ohlcvForeignFlowStore.ts doc pointer) that import them directly from
 * schema.js — backward-compat public API, unchanged import paths for them.
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Task 1503 — foreign flow column migration. Run on every boot on existing
// deployments where daily_ohlcv was created without the four foreign flow
// columns. Safe on a fresh DB — ALTER TABLE add is a no-op when col exists.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add foreign flow columns to daily_ohlcv if they do not already exist.
 * Idempotent — safe to call on fresh and existing databases.
 */
export async function migrateForeignFlowColumns(db: Database): Promise<void> {
  const cols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
    .all()
    .map((r) => r.name);

  const toAdd: Array<[string, string]> = [
    ["foreign_buy_vol",   "REAL"],
    ["foreign_sell_vol",  "REAL"],
    ["foreign_net_vol",   "REAL"],
    ["put_through_vol",   "REAL"],
    // FIX-FOREIGN-FLOW-COVERAGE: VND money-value of foreign buy/sell from bgapidatafeed
    // fBValue / fSValue. Optional — null when upstream API omits the field.
    ["foreign_buy_value",  "REAL"],
    ["foreign_sell_value", "REAL"],
  ];

  for (const [col, type] of toAdd) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN ${col} ${type}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK_2001 (SUBTASK-DAILY-FF-2, ARCH-DAILY-FOREIGN-FLOW-TABLE) — one-time
// backfill of legacy `daily_ohlcv.foreign_*` history into the authoritative
// `daily_foreign_flow` table. INSERT OR IGNORE is PK-guarded (code,date) —
// safe/no-op on every boot, additive only. R-6: MUST complete before the
// writer cutover (SUBTASK-DAILY-FF-3) ships. See
// docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Change 4.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-time idempotent backfill: copy all `daily_ohlcv` rows carrying legacy
 * foreign-flow data into `daily_foreign_flow`. Safe to call on every boot —
 * `INSERT OR IGNORE` is a PK-guarded no-op for rows already present.
 */
export function backfillDailyForeignFlow(db: Database): void {
  db.exec(`
    INSERT OR IGNORE INTO daily_foreign_flow
      (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
       foreign_buy_value, foreign_sell_value, updated_at)
    SELECT code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
           foreign_buy_value, foreign_sell_value, updated_at
    FROM daily_ohlcv
    WHERE foreign_buy_vol IS NOT NULL OR foreign_sell_vol IS NOT NULL;
  `);
}
