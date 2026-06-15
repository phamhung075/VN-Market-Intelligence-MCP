/**
 * Domain Models — Vnstock Types (Task 1871f — DDD fix)
 *
 * Pure TypeScript interfaces for vnstock data shapes.
 * ZERO imports — all types use only TypeScript built-ins.
 *
 * Previously leaked into domain via infrastructure/fetchers/vnstockBridge.ts.
 * Extracted here to satisfy DDD inward-only rule.
 *
 * Layer: domain/models — may be imported by any layer.
 */

export interface VnstockFinancials {
  code: string;
  yearReport: number;
  quarter: number;
  source: "vnstock";
  // Income statement
  revenue: number;           // billion VND
  revenueYoY: number;        // %
  netProfit: number;         // billion VND
  netProfitYoY: number;      // %
  eps: number;               // VND
  // Ratios — null when the vnstock ratio API returns missing/absent column
  // (FIX-ERRAUDIT-W2-MCP-DATALAYER: was number → 0.0 fallback; 0 is implausible
  //  for bank ROE and collides with "no data"; now null = missing, 0 = genuine 0)
  pe: number | null;
  pb: number | null;
  roe: number | null;        // % (null when ratio column absent in vnstock API)
  roa: number | null;        // % (null when ratio column absent)
  debtToEquity: number | null;
  netProfitMargin: number | null; // %
  // Banking specific
  nim: number | null;        // % (null for non-bank)
  npl: number | null;        // % (null for non-bank)
  fetchedAt: string;
}

export interface VnstockTradingStats {
  code: string;
  foreignRoom: number;
  foreignVolume: number;
  currentHoldingRatio: number;
  maxHoldingRatio: number;
  avgVolume2w: number;
  high52w: number;
  low52w: number;
  pctFromHigh52w: number;
  pctFromLow52w: number;
  /** Market capitalisation in billion VND (null when vnstock ratio API unavailable). FIX-B-1. */
  marketCapBn: number | null;
  fetchedAt: string;
}

export interface VnstockOfficer {
  code: string;
  name: string;
  position: string;
  ownPercent: number;
  quantity: number;
}

export interface VnstockShareholder {
  code: string;
  name: string;
  quantity: number;
  ownPercent: number;
}

export interface VnstockBalanceSheet {
  code: string;
  yearReport: number;
  quarter: number;
  totalAssets: number;       // billion VND
  totalLiabilities: number;
  totalEquity: number;
  cash: number;              // cash and equivalents
  shortTermDebt: number;
  longTermDebt: number;
  receivables: number;
  inventory: number;
  source: "vnstock";
  fetchedAt: string;
}

export interface VnstockCashFlow {
  code: string;
  yearReport: number;
  quarter: number;
  operatingCashFlow: number | null; // billion VND (null when VCI key absent)
  investingCashFlow: number;
  financingCashFlow: number;
  netCashFlow: number;
  source: "vnstock";
  fetchedAt: string;
}
