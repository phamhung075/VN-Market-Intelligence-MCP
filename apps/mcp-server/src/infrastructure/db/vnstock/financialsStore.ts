/**
 * Infrastructure — vnstock Financials Store
 *
 * FACTORY-INFRA-split-stores-and-migrations: extracted from vnstockStore.ts
 * (937L monolith). One store+get pair per entity.
 *
 * Layer: infrastructure/db/vnstock
 */

import { getDb } from "../schema.js";
import { bridgeNetProfitToFinancialReports } from "../schema-financial-reports.js";
import type { VnstockFinancials } from "../../../domain/models/vnstockTypes.js";
import { markFetched } from "./fetchLog.js";

/**
 * Fix 1 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): use datetime('now') for fetched_at
 * instead of f.fetchedAt (Python script datetime.now() — may be stale by batch delay).
 * SQLite server time ensures MAX(fetched_at) staleness queries reflect actual write time.
 *
 * Fix 2 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): return { changes } so callers can
 * accumulate actual DB rows written. changes=1 means a row was inserted or replaced;
 * changes=0 would indicate no write occurred (defensive — INSERT OR REPLACE always writes).
 * Note: Bun sqlite stmt.run() returns { changes, lastInsertRowid }; use that not db.changes.
 * Math.min(changes, 1) not needed — Bun's driver reports 1 even for a REPLACE (not 2).
 */
export function storeFinancials(f: VnstockFinancials): { changes: number } {
  const db = getDb();
  const result = db.prepare(
    `INSERT OR REPLACE INTO vnstock_financials
     (code, year_report, quarter, revenue_bn, revenue_yoy, net_profit_bn, net_profit_yoy,
      eps, pe, pb, roe, roa, debt_to_equity, net_profit_margin, nim, npl, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    f.code, f.yearReport, f.quarter, f.revenue, f.revenueYoY, f.netProfit, f.netProfitYoY,
    f.eps, f.pe, f.pb, f.roe, f.roa, f.debtToEquity, f.netProfitMargin,
    f.nim, f.npl, f.source,
  );
  markFetched(f.code, "financials");
  // Task 1941d: lift net_profit_bn into financial_reports.net_profit_api_bridge
  // so cashFlowTool prefers the API value over OCR extraction for OCF/NI ratio.
  bridgeNetProfitToFinancialReports(getDb(), f.code);
  return { changes: result.changes };
}

export function getLatestFinancials(code: string): VnstockFinancials | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_financials WHERE code = ? ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    source: row.source,
    revenue: row.revenue_bn,
    revenueYoY: row.revenue_yoy,
    netProfit: row.net_profit_bn,
    netProfitYoY: row.net_profit_yoy,
    eps: row.eps,
    pe: row.pe,
    pb: row.pb,
    roe: row.roe,
    roa: row.roa,
    debtToEquity: row.debt_to_equity,
    netProfitMargin: row.net_profit_margin,
    nim: row.nim,
    npl: row.npl,
    fetchedAt: row.fetched_at,
  };
}
