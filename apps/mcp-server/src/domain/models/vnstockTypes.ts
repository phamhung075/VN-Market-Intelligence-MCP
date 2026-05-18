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
  // Ratios
  pe: number;
  pb: number;
  roe: number;               // %
  roa: number;               // %
  debtToEquity: number;
  netProfitMargin: number;   // %
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
