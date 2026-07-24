/**
 * Infrastructure — vnstock Cash Flow Store
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith). One store+get pair per entity.
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import { bridgeOCFToFinancialReports } from "../schema-financial-reports.js";
import type { VnstockCashFlow } from "../../../domain/models/vnstockTypes.js";
import { markFetched } from "./fetchLog.js";

/**
 * Store a cash flow row. Uses INSERT OR REPLACE (UPSERT on unique key).
 *
 * Fix 1 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): use datetime('now') for fetched_at
 * instead of cf.fetchedAt (Python-supplied timestamp may be stale by batch delay).
 * Fix 2: return { changes } for caller to accumulate actual DB rows written.
 */
export function storeCashFlow(cf: VnstockCashFlow): { changes: number } {
  const db = getDb();
  const result = db.prepare(
    `INSERT OR REPLACE INTO vnstock_cash_flow
     (code, year_report, quarter, operating_cf_bn, investing_cf_bn,
      financing_cf_bn, net_cf_bn, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    cf.code, cf.yearReport, cf.quarter,
    cf.operatingCashFlow, cf.investingCashFlow,
    cf.financingCashFlow, cf.netCashFlow,
    cf.source,
  );
  markFetched(cf.code, "cash_flow");
  // Task 1878a: bridge OCF to financial_reports immediately after store.
  // Updates ALL quarters for this ticker (idempotent, covers historical rows).
  bridgeOCFToFinancialReports(db, cf.code);
  return { changes: result.changes };
}

/**
 * Retrieve the most recent cash flow for a stock (by year_report DESC, quarter DESC).
 */
export function getLatestCashFlow(code: string): VnstockCashFlow | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_cash_flow
       WHERE code = ?
       ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    operatingCashFlow: row.operating_cf_bn,
    investingCashFlow: row.investing_cf_bn,
    financingCashFlow: row.financing_cf_bn,
    netCashFlow: row.net_cf_bn,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}
