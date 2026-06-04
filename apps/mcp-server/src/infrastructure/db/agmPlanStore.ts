/**
 * AGM Plan Store — RAPID-DATA-LAYER FIX-G
 *
 * Two tables:
 *   agm_plan    — planned targets (revenue/PBT/PAT per year, from AGM resolution)
 *   agm_actuals — actual reported values (quarterly + full-year, by norm_id metric)
 *
 * UNIQUE constraints provide idempotent upserts (INSERT OR REPLACE).
 * All monetary values stored in tỷ đồng (billions VND) as value_ty.
 *
 * @module infrastructure/db/agmPlanStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgmPlanRow {
  stock_code: string;
  ptid: number;
  pt_name: string;
  year: number;
  value_raw: number;
  value_ty: number;
  fetched_at: string;
}

export interface AgmActualRow {
  stock_code: string;
  year: number;
  report_term_id: number;
  report_norm_id: number;
  ptid: number;
  value_raw: number;
  value_ty: number;
  fetched_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DDL — called from initDatabase (schema.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create agm_plan and agm_actuals tables if they do not yet exist.
 * Idempotent: uses CREATE TABLE IF NOT EXISTS throughout.
 * Safe to call on every startup.
 */
export function initAgmPlanTables(db: Database): void {
  // Planned targets — one row per (stock_code, ptid, year)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agm_plan (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code  TEXT    NOT NULL,
      ptid        INTEGER NOT NULL,
      pt_name     TEXT    NOT NULL DEFAULT '',
      year        INTEGER NOT NULL,
      value_raw   REAL    NOT NULL DEFAULT 0,
      value_ty    REAL    NOT NULL DEFAULT 0,
      fetched_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(stock_code, ptid, year)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agm_plan_code ON agm_plan(stock_code, year)`);

  // Actual reported values — one row per (stock_code, year, report_term_id, report_norm_id)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agm_actuals (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code       TEXT    NOT NULL,
      year             INTEGER NOT NULL,
      report_term_id   INTEGER NOT NULL,
      report_norm_id   INTEGER NOT NULL,
      ptid             INTEGER NOT NULL DEFAULT 0,
      value_raw        REAL    NOT NULL DEFAULT 0,
      value_ty         REAL    NOT NULL DEFAULT 0,
      fetched_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(stock_code, year, report_term_id, report_norm_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agm_actuals_code ON agm_actuals(stock_code, year)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a batch of AGM planned targets.
 * Uses INSERT OR REPLACE for idempotency (UNIQUE stock_code, ptid, year).
 * Returns number of rows written.
 */
export function upsertAgmPlan(db: Database, rows: AgmPlanRow[]): number {
  if (rows.length === 0) return 0;

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO agm_plan
       (stock_code, ptid, pt_name, year, value_raw, value_ty, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  let count = 0;
  for (const r of rows) {
    stmt.run(
      r.stock_code,
      r.ptid,
      r.pt_name,
      r.year,
      r.value_raw,
      r.value_ty,
      r.fetched_at,
    );
    count++;
  }
  return count;
}

/**
 * Upsert a batch of AGM actuals.
 * Uses INSERT OR REPLACE for idempotency (UNIQUE stock_code, year, report_term_id, report_norm_id).
 * Returns number of rows written.
 */
export function upsertAgmActuals(db: Database, rows: AgmActualRow[]): number {
  if (rows.length === 0) return 0;

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO agm_actuals
       (stock_code, year, report_term_id, report_norm_id, ptid, value_raw, value_ty, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let count = 0;
  for (const r of rows) {
    stmt.run(
      r.stock_code,
      r.year,
      r.report_term_id,
      r.report_norm_id,
      r.ptid,
      r.value_raw,
      r.value_ty,
      r.fetched_at,
    );
    count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch planned targets for a ticker (optionally filtered by year).
 */
export function getAgmPlan(
  db: Database,
  stockCode: string,
  year?: number,
): AgmPlanRow[] {
  const code = stockCode.toUpperCase().trim();

  if (year !== undefined) {
    return db
      .prepare<AgmPlanRow, [string, number]>(
        `SELECT stock_code, ptid, pt_name, year, value_raw, value_ty, fetched_at
         FROM agm_plan
         WHERE stock_code = ? AND year = ?
         ORDER BY ptid ASC`,
      )
      .all(code, year);
  }

  return db
    .prepare<AgmPlanRow, [string]>(
      `SELECT stock_code, ptid, pt_name, year, value_raw, value_ty, fetched_at
       FROM agm_plan
       WHERE stock_code = ?
       ORDER BY year DESC, ptid ASC`,
    )
    .all(code);
}

/**
 * Fetch actual reported values for a ticker (optionally filtered by year).
 */
export function getAgmActuals(
  db: Database,
  stockCode: string,
  year?: number,
): AgmActualRow[] {
  const code = stockCode.toUpperCase().trim();

  if (year !== undefined) {
    return db
      .prepare<AgmActualRow, [string, number]>(
        `SELECT stock_code, year, report_term_id, report_norm_id, ptid, value_raw, value_ty, fetched_at
         FROM agm_actuals
         WHERE stock_code = ? AND year = ?
         ORDER BY report_norm_id ASC, report_term_id ASC`,
      )
      .all(code, year);
  }

  return db
    .prepare<AgmActualRow, [string]>(
      `SELECT stock_code, year, report_term_id, report_norm_id, ptid, value_raw, value_ty, fetched_at
       FROM agm_actuals
       WHERE stock_code = ?
       ORDER BY year DESC, report_norm_id ASC, report_term_id ASC`,
    )
    .all(code);
}
