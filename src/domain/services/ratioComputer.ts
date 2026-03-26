/**
 * Task 045 — Financial Ratio Computation
 *
 * Domain service: computes all 22+ financial ratios from FinancialRatios interface.
 * Pure function, no I/O. Returns null for any ratio where denominator is zero.
 */

import type {
  BalanceSheet,
  IncomeStatement,
  CashFlowStatement,
  FinancialRatios,
} from "../../../bctc-schema";

export interface ComputeRatiosParams {
  bs: BalanceSheet;
  is: IncomeStatement;
  cf: CashFlowStatement;
  shares?: number;
  price?: number;
  prevBs?: BalanceSheet;
}

/**
 * Safe division — returns null when denominator is 0, never Infinity or NaN.
 */
function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  const result = numerator / denominator;
  if (!Number.isFinite(result)) return null;
  return result;
}

/**
 * Compute all financial ratios from parsed BCTC statements.
 *
 * @param params.bs    - Balance Sheet for the period
 * @param params.is    - Income Statement for the period
 * @param params.cf    - Cash Flow Statement for the period
 * @param params.shares - Shares outstanding (actual count, not millions)
 * @param params.price  - Market price per share (VND) — optional, for valuation ratios
 * @param params.prevBs - Previous period Balance Sheet — for average-based ratios (ROE, ROA, etc.)
 */
export function computeFinancialRatios(params: ComputeRatiosParams): FinancialRatios {
  const { bs, is: inc, cf, shares, price, prevBs } = params;

  // ── Averages (use prev period if available, otherwise use current) ──
  const avgAssets = prevBs
    ? (bs.totalAssets + prevBs.totalAssets) / 2
    : bs.totalAssets;
  const avgEquity = prevBs
    ? (bs.equity.total + prevBs.equity.total) / 2
    : bs.equity.total;
  const avgInventory = prevBs
    ? (bs.currentAssets.inventory + prevBs.currentAssets.inventory) / 2
    : bs.currentAssets.inventory;
  const avgReceivables = prevBs
    ? (bs.currentAssets.accountsReceivable + prevBs.currentAssets.accountsReceivable) / 2
    : bs.currentAssets.accountsReceivable;
  const avgPayables = prevBs
    ? (bs.currentLiabilities.accountsPayable + prevBs.currentLiabilities.accountsPayable) / 2
    : bs.currentLiabilities.accountsPayable;

  // ── Debt aggregates ──
  const totalDebt = bs.currentLiabilities.shortTermDebt + bs.longTermLiabilities.longTermDebt;
  const netDebt = totalDebt - bs.currentAssets.cash;

  // ── Profitability ──
  const grossMarginPct = safeDivide(inc.grossProfit, inc.netRevenue) !== null
    ? safeDivide(inc.grossProfit, inc.netRevenue)! * 100
    : null;
  const operatingMarginPct = safeDivide(inc.operatingProfit, inc.netRevenue) !== null
    ? safeDivide(inc.operatingProfit, inc.netRevenue)! * 100
    : null;
  const netMarginPct = safeDivide(inc.netProfit, inc.netRevenue) !== null
    ? safeDivide(inc.netProfit, inc.netRevenue)! * 100
    : null;
  const ebitdaMarginPct = safeDivide(inc.ebitda, inc.netRevenue) !== null
    ? safeDivide(inc.ebitda, inc.netRevenue)! * 100
    : null;

  const roe = safeDivide(inc.netProfit, avgEquity) !== null
    ? safeDivide(inc.netProfit, avgEquity)! * 100
    : null;
  const roa = safeDivide(inc.netProfit, avgAssets) !== null
    ? safeDivide(inc.netProfit, avgAssets)! * 100
    : null;

  // ROIC = NOPAT / Invested Capital
  // NOPAT = Operating Profit × (1 - effective tax rate)
  // Invested Capital = Equity + Net Debt
  // Guard: return null when operatingProfit is zero (no meaningful ROIC without operating income)
  const effectiveTaxRate = safeDivide(inc.totalIncomeTax, inc.profitBeforeTax);
  const nopat = effectiveTaxRate !== null && inc.operatingProfit !== 0
    ? inc.operatingProfit * (1 - effectiveTaxRate)
    : null;
  const investedCapital = bs.equity.total + netDebt;
  const roic = nopat !== null && safeDivide(nopat, investedCapital) !== null
    ? safeDivide(nopat, investedCapital)! * 100
    : null;

  // ── Liquidity ──
  const currentRatio = safeDivide(bs.currentAssets.total, bs.currentLiabilities.total);
  const quickRatio = safeDivide(
    bs.currentAssets.total - bs.currentAssets.inventory,
    bs.currentLiabilities.total
  );
  const cashRatio = safeDivide(bs.currentAssets.cash, bs.currentLiabilities.total);

  // ── Leverage / Solvency ──
  const debtToEquity = safeDivide(totalDebt, bs.equity.total);
  const debtToAssets = safeDivide(bs.totalLiabilities, bs.totalAssets);
  const netDebtToEbitda = inc.ebitda > 0 ? safeDivide(netDebt, inc.ebitda) : null;
  const interestCoverageRatio = safeDivide(inc.ebit, inc.interestExpenses);

  // ── Efficiency ──
  const assetTurnover = safeDivide(inc.netRevenue, avgAssets);
  const inventoryTurnover = safeDivide(inc.cogs, avgInventory);
  const inventoryDays = inventoryTurnover !== null ? safeDivide(365, inventoryTurnover) : null;
  const receivablesTurnover = safeDivide(inc.netRevenue, avgReceivables);
  const receivablesDays = receivablesTurnover !== null ? safeDivide(365, receivablesTurnover) : null;
  const payablesTurnover = safeDivide(inc.cogs, avgPayables);
  const payablesDays = payablesTurnover !== null ? safeDivide(365, payablesTurnover) : null;

  const cashConversionCycle =
    inventoryDays !== null && receivablesDays !== null && payablesDays !== null
      ? inventoryDays + receivablesDays - payablesDays
      : null;

  // ── Per Share ──
  const hasShares = shares !== undefined && shares > 0;
  const bvps = hasShares ? safeDivide(bs.equity.total, shares) : null;
  const revenuePerShare = hasShares ? safeDivide(inc.netRevenue, shares) : null;
  const fcfPerShare = hasShares ? safeDivide(cf.freeCashFlow, shares) : null;

  // ── Valuation (requires market price) ──
  const pe = price && inc.eps > 0 ? safeDivide(price, inc.eps) : null;
  const pb = price && bvps !== null && bvps > 0 ? safeDivide(price, bvps) : null;
  const ps = price && revenuePerShare !== null && revenuePerShare > 0
    ? safeDivide(price, revenuePerShare)
    : null;
  const evToEbitda =
    inc.ebitda > 0 && price && hasShares
      ? safeDivide(price * shares! + netDebt, inc.ebitda)
      : null;

  // Dividend yield: DPS = |dividendsPaid| / shares; yield = DPS / price × 100
  const dividendYieldPct = (() => {
    if (!price || !hasShares || cf.dividendsPaid >= 0) return null;
    const dps = Math.abs(cf.dividendsPaid) / shares!;
    const yld = safeDivide(dps, price);
    return yld !== null ? yld * 100 : null;
  })();

  return {
    grossMarginPct: grossMarginPct as number,
    operatingMarginPct: operatingMarginPct as number,
    netMarginPct: netMarginPct as number,
    ebitdaMarginPct: ebitdaMarginPct as number,
    roe: roe as number,
    roa: roa as number,
    roic: roic as number,
    currentRatio: currentRatio as number,
    quickRatio: quickRatio as number,
    cashRatio: cashRatio as number,
    debtToEquity: debtToEquity as number,
    debtToAssets: debtToAssets as number,
    netDebt,
    netDebtToEbitda: netDebtToEbitda as number,
    interestCoverageRatio: interestCoverageRatio as number,
    assetTurnover: assetTurnover as number,
    inventoryTurnover: inventoryTurnover as number,
    inventoryDays: inventoryDays as number,
    receivablesTurnover: receivablesTurnover as number,
    receivablesDays: receivablesDays as number,
    payablesTurnover: payablesTurnover as number,
    payablesDays: payablesDays as number,
    cashConversionCycle: cashConversionCycle as number,
    eps: inc.eps,
    bvps: bvps as number,
    revenuePerShare: revenuePerShare as number,
    fcfPerShare: fcfPerShare as number,
    pe,
    pb,
    ps,
    evToEbitda,
    dividendYieldPct,
  };
}
