/**
 * financialsStore.ts
 *
 * Read-only infrastructure store for the `vnstock_financials` table.
 * Part of the TASK17-PAGE16 endpoint wave (GET /api/financials).
 *
 * Table: vnstock_financials
 *   code TEXT NOT NULL, year_report INTEGER NOT NULL, quarter INTEGER NOT NULL,
 *   revenue_bn REAL, revenue_yoy REAL, net_profit_bn REAL, net_profit_yoy REAL,
 *   eps INTEGER, pe REAL, pb REAL, roe REAL, roa REAL, debt_to_equity REAL,
 *   net_profit_margin REAL, nim REAL, npl REAL, fetched_at TEXT NOT NULL,
 *   UNIQUE(code, year_report, quarter, source).
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   79 rows, 78 distinct codes (MBS has 2 periods), fresh through 2026-06-10.
 *   All key columns (pe,pb,roe,roa,revenue_bn,net_profit_bn,eps) are non-null.
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries are fully static — NEVER string-interpolate user input.
 *
 * @module infrastructure/db/financialsStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row from vnstock_financials (selected columns only — id/source/fetched_at excluded).
 * All metric columns are nullable to match the DB schema (REAL columns without NOT NULL).
 */
export type FinancialRow = {
  code: string;
  yearReport: number;
  quarter: number;
  revenueBn: number | null;
  revenueYoy: number | null;
  netProfitBn: number | null;
  netProfitYoy: number | null;
  eps: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  netProfitMargin: number | null;
  nim: number | null;
  npl: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB row type (snake_case from SQLite)
// ─────────────────────────────────────────────────────────────────────────────

type RawFinancialRow = {
  code: string;
  year_report: number;
  quarter: number;
  revenue_bn: number | null;
  revenue_yoy: number | null;
  net_profit_bn: number | null;
  net_profit_yoy: number | null;
  eps: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  net_profit_margin: number | null;
  nim: number | null;
  npl: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Row mapper
// ─────────────────────────────────────────────────────────────────────────────

function mapRawRow(r: RawFinancialRow): FinancialRow {
  return {
    code:             r.code,
    yearReport:       r.year_report,
    quarter:          r.quarter,
    revenueBn:        r.revenue_bn,
    revenueYoy:       r.revenue_yoy,
    netProfitBn:      r.net_profit_bn,
    netProfitYoy:     r.net_profit_yoy,
    eps:              r.eps,
    pe:               r.pe,
    pb:               r.pb,
    roe:              r.roe,
    roa:              r.roa,
    debtToEquity:     r.debt_to_equity,
    netProfitMargin:  r.net_profit_margin,
    nim:              r.nim,
    npl:              r.npl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return ONE row per code: the LATEST period (highest year_report, then highest
 * quarter). Uses a correlated NOT EXISTS subquery — fully static SQL, no
 * string interpolation.
 *
 * Live count: 78 rows (one per distinct code; MBS has 2 periods — latest wins).
 *
 * @param db - SQLite database instance (injected)
 * @returns Array of FinancialRow, one per code, ordered by code ASC
 */
export function getLatestPerCode(db: Database): FinancialRow[] {
  const rows = db
    .prepare(
      `SELECT code, year_report, quarter, revenue_bn, revenue_yoy,
              net_profit_bn, net_profit_yoy, eps, pe, pb, roe, roa,
              debt_to_equity, net_profit_margin, nim, npl
       FROM vnstock_financials f
       WHERE NOT EXISTS (
         SELECT 1 FROM vnstock_financials g
         WHERE g.code = f.code
           AND (
             g.year_report > f.year_report
             OR (g.year_report = f.year_report AND g.quarter > f.quarter)
           )
       )
       ORDER BY code ASC`,
    )
    .all() as RawFinancialRow[];
  return rows.map(mapRawRow);
}

/**
 * Return the MAX fetched_at value across the entire table.
 * Represents the most recent data pull — used as the snapshot timestamp.
 *
 * @param db - SQLite database instance (injected)
 * @returns ISO string of MAX(fetched_at) or null if table is empty
 */
export function getAsOf(db: Database): string | null {
  const row = db
    .prepare(`SELECT MAX(fetched_at) AS as_of FROM vnstock_financials`)
    .get() as { as_of: string | null };
  return row?.as_of ?? null;
}
