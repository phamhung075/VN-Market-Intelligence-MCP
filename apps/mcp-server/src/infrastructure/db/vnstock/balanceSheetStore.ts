/**
 * Infrastructure — vnstock Balance Sheet Store
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith). One store+get pair per entity.
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import type { VnstockBalanceSheet } from "../../../domain/models/vnstockTypes.js";
import { markFetched } from "./fetchLog.js";

/**
 * Store a balance sheet row. Uses INSERT OR REPLACE (UPSERT on unique key).
 *
 * Fix 1 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): use datetime('now') for fetched_at
 * instead of bs.fetchedAt (Python-supplied timestamp may be stale by batch delay).
 * Fix 2: return { changes } for caller to accumulate actual DB rows written.
 */
export function storeBalanceSheet(bs: VnstockBalanceSheet): { changes: number } {
  const db = getDb();
  const result = db.prepare(
    `INSERT OR REPLACE INTO vnstock_balance_sheet
     (code, year_report, quarter, total_assets_bn, total_liabilities_bn, total_equity_bn,
      cash_bn, short_term_debt_bn, long_term_debt_bn, receivables_bn, inventory_bn,
      source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    bs.code, bs.yearReport, bs.quarter,
    bs.totalAssets, bs.totalLiabilities, bs.totalEquity,
    bs.cash, bs.shortTermDebt, bs.longTermDebt, bs.receivables, bs.inventory,
    bs.source,
  );
  markFetched(bs.code, "balance_sheet");
  return { changes: result.changes };
}

/**
 * Retrieve the most recent balance sheet for a stock (by year_report DESC, quarter DESC).
 */
export function getLatestBalanceSheet(code: string): VnstockBalanceSheet | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_balance_sheet
       WHERE code = ?
       ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    totalAssets: row.total_assets_bn,
    totalLiabilities: row.total_liabilities_bn,
    totalEquity: row.total_equity_bn,
    cash: row.cash_bn,
    shortTermDebt: row.short_term_debt_bn,
    longTermDebt: row.long_term_debt_bn,
    receivables: row.receivables_bn,
    inventory: row.inventory_bn,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}
