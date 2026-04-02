/**
 * Task 182 — Portfolio Risk Calculator
 *
 * Pure domain service: computes VaR 95%, max drawdown, and per-stock heat-map
 * metrics from position snapshots and daily price history.
 *
 * No I/O — all inputs are passed as parameters. This service is safe to call
 * from tests, the MCP tool layer, and the application layer.
 *
 * Units:
 *   - Prices in raw VND (matching market_prices table)
 *   - Percentages as 0-100 scale (e.g. 5.3 means 5.3%)
 *   - VND amounts as plain VND (not million VND)
 *
 * @module domain/services/portfolioRiskCalculator
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A single daily price record (subset of market_prices_history). */
export interface DailyPriceRow {
  code: string;
  price: number;
  fetched_at: string;
}

/** Open position snapshot (produced by positionStore.listOpenPositions). */
export interface PositionSnapshot {
  code: string;
  shares: number;
  /** Average purchase price in VND. */
  avgPrice: number;
  /** Latest price from market_prices table; null if unavailable. */
  currentPrice: number | null;
  /** Total cost = shares × avgPrice */
  costBasis: number;
  /** Current market value = shares × currentPrice (0 if null). */
  currentValue: number;
}

/** Per-stock risk metrics for the heat map. */
export interface HeatMapRow {
  code: string;
  /** Weight of this stock in the portfolio by market value (0-100). */
  weightPct: number;
  /** Daily volatility: stddev of daily returns (0-100 scale). */
  volPct: number;
  /** Stock-level VaR 95% in percentage terms (negative = loss). */
  var95Pct: number;
  /** Vietnamese risk label. */
  status: "Binh thuong" | "Cao" | "Rat cao";
}

/** Full portfolio risk report. */
export interface PortfolioRiskResult {
  /** Total portfolio market value in VND. */
  totalValue: number;
  /** Number of days used for the lookback. */
  days: number;
  /** Portfolio-level VaR 95% as percentage (negative = loss). */
  var95Pct: number;
  /** Portfolio-level VaR 95% in VND (negative = loss). */
  var95Vnd: number;
  /** Portfolio max drawdown percentage (negative or 0). */
  maxDrawdownPct: number;
  /** ISO date string of the drawdown peak (undefined if no drawdown). */
  maxDrawdownStart: string | undefined;
  /** ISO date string of the drawdown trough (undefined if no drawdown). */
  maxDrawdownEnd: string | undefined;
  /** Per-stock heat-map rows. */
  heatMap: HeatMapRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute daily returns from a sorted (ascending by date) price series.
 * Returns an empty array if fewer than 2 prices.
 */
function dailyReturns(prices: number[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const cur = prices[i];
    const prev = prices[i - 1];
    if (prev == null || cur == null || prev === 0) continue;
    result.push((cur - prev) / prev);
  }
  return result;
}

/**
 * Value at Risk at 95% confidence level via historical simulation.
 *
 * Sort daily returns ascending and return the 5th-percentile return.
 * Returns 0 if there are no returns.
 *
 * @param returns - Daily return fractions (e.g. -0.05 = -5%)
 */
function var95(returns: number[]): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  // 5th percentile index (floor)
  const idx = Math.floor(sorted.length * 0.05);
  const val = sorted[Math.max(0, idx)];
  return (val ?? 0) * 100; // convert to percentage
}

/**
 * Standard deviation of a number array.
 * Returns 0 for empty or single-element arrays.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Maximum drawdown from a sequence of prices.
 *
 * Iterates through the price series, tracking the running peak.
 * Returns the worst peak-to-trough decline as a negative percentage,
 * plus the ISO dates at peak and trough.
 *
 * Returns 0 if prices have only 1 data point or if prices never decline.
 */
function maxDrawdown(prices: number[], dates: string[]): {
  pct: number;
  startDate: string | undefined;
  endDate: string | undefined;
} {
  if (prices.length < 2) return { pct: 0, startDate: undefined, endDate: undefined };

  let peakPrice: number = prices[0] ?? 0;
  let peakDate: string = dates[0] ?? "";
  let worstDrawdown = 0;
  let worstStart: string | undefined;
  let worstEnd: string | undefined;

  for (let i = 1; i < prices.length; i++) {
    const curPrice = prices[i] ?? 0;
    const curDate = dates[i] ?? "";
    if (curPrice > peakPrice) {
      peakPrice = curPrice;
      peakDate = curDate;
    } else {
      const drawdown = peakPrice > 0 ? (curPrice - peakPrice) / peakPrice : 0;
      if (drawdown < worstDrawdown) {
        worstDrawdown = drawdown;
        worstStart = peakDate;
        worstEnd = curDate;
      }
    }
  }

  return {
    pct: worstDrawdown * 100,
    startDate: worstStart,
    endDate: worstEnd,
  };
}

/**
 * Classify risk level in Vietnamese based on daily volatility (percentage).
 *
 * Thresholds:
 *   < 2%   → "Binh thuong"  (Normal)
 *   2–3%   → "Cao"          (High)
 *   > 3%   → "Rat cao"      (Very high)
 */
function classifyRisk(volPct: number): "Binh thuong" | "Cao" | "Rat cao" {
  if (volPct >= 3) return "Rat cao";
  if (volPct >= 2) return "Cao";
  return "Binh thuong";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute portfolio risk metrics.
 *
 * @param positions     - Open positions with current market values
 * @param priceHistory  - Map of stock code → sorted daily price rows
 * @param days          - Lookback period (informational; actual history may differ)
 * @returns             PortfolioRiskResult with VaR, drawdown, and heat map
 */
export function computePortfolioRisk(
  positions: PositionSnapshot[],
  priceHistory: Record<string, DailyPriceRow[]>,
  days: number,
): PortfolioRiskResult {
  // ── Empty case ──────────────────────────────────────────────────────────────
  if (positions.length === 0) {
    return {
      totalValue: 0,
      days,
      var95Pct: 0,
      var95Vnd: 0,
      maxDrawdownPct: 0,
      maxDrawdownStart: undefined,
      maxDrawdownEnd: undefined,
      heatMap: [],
    };
  }

  // ── Total portfolio value ───────────────────────────────────────────────────
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);

  // ── Per-stock heat map ──────────────────────────────────────────────────────
  const heatMap: HeatMapRow[] = [];

  for (const pos of positions) {
    const weightPct = totalValue > 0 ? (pos.currentValue / totalValue) * 100 : 0;

    const history = priceHistory[pos.code] ?? [];
    // Sort by fetched_at ascending (earliest first)
    const sorted = [...history].sort((a, b) =>
      a.fetched_at < b.fetched_at ? -1 : a.fetched_at > b.fetched_at ? 1 : 0,
    );
    const prices = sorted.map((r) => r.price);
    const returns = dailyReturns(prices);

    const volPct = stddev(returns) * 100;
    const var95Pct = var95(returns);

    heatMap.push({
      code: pos.code,
      weightPct,
      volPct,
      var95Pct,
      status: classifyRisk(volPct),
    });
  }

  // ── Portfolio-level daily returns (weighted sum) ────────────────────────────
  // Build a daily portfolio return series by weighting each stock's returns
  // by its portfolio weight. Use the shortest common return series length.

  const stockReturns: { returns: number[]; weight: number }[] = [];
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (!pos) continue;
    const history = priceHistory[pos.code] ?? [];
    const sorted = [...history].sort((a, b) =>
      a.fetched_at < b.fetched_at ? -1 : a.fetched_at > b.fetched_at ? 1 : 0,
    );
    const prices = sorted.map((r) => r.price);
    const returns = dailyReturns(prices);
    const weight = totalValue > 0 ? pos.currentValue / totalValue : 0;
    if (returns.length > 0) {
      stockReturns.push({ returns, weight });
    }
  }

  let portfolioVar95Pct = 0;
  if (stockReturns.length > 0) {
    const minLen = Math.min(...stockReturns.map((s) => s.returns.length));
    const portfolioDailyReturns: number[] = [];
    for (let day = 0; day < minLen; day++) {
      let dayReturn = 0;
      for (const { returns, weight } of stockReturns) {
        dayReturn += (returns[day] ?? 0) * weight;
      }
      portfolioDailyReturns.push(dayReturn);
    }
    portfolioVar95Pct = var95(portfolioDailyReturns);
  }
  const portfolioVar95Vnd = (portfolioVar95Pct / 100) * totalValue;

  // ── Portfolio-level max drawdown (on total portfolio value series) ──────────
  // Reconstruct a combined portfolio value time series by summing each stock's
  // weighted price. Use the shortest common series.

  const portfolioHistory: { price: number; date: string }[] = [];

  // Collect all dates present in any stock history
  const allDatesSet = new Set<string>();
  for (const pos of positions) {
    for (const row of priceHistory[pos.code] ?? []) {
      allDatesSet.add(row.fetched_at.slice(0, 10)); // use date part only
    }
  }
  const allDates = [...allDatesSet].sort();

  for (const date of allDates) {
    let portfolioValue = 0;
    let allPresent = true;
    for (const pos of positions) {
      const history = priceHistory[pos.code] ?? [];
      // Find the price row closest to this date
      const row = history
        .filter((r) => r.fetched_at.slice(0, 10) <= date)
        .sort((a, b) => (a.fetched_at < b.fetched_at ? 1 : -1))[0];
      if (!row) {
        allPresent = false;
        break;
      }
      portfolioValue += row.price * pos.shares;
    }
    if (allPresent) {
      portfolioHistory.push({ price: portfolioValue, date });
    }
  }

  let portfolioMaxDrawdown = 0;
  let drawdownStart: string | undefined;
  let drawdownEnd: string | undefined;

  if (portfolioHistory.length >= 2) {
    const dd = maxDrawdown(
      portfolioHistory.map((p) => p.price),
      portfolioHistory.map((p) => p.date),
    );
    portfolioMaxDrawdown = dd.pct;
    drawdownStart = dd.startDate;
    drawdownEnd = dd.endDate;
  } else if (positions.length > 0) {
    // Fall back to first available stock's history
    const firstCode = positions[0]?.code ?? "";
    const history = priceHistory[firstCode] ?? [];
    const sorted = [...history].sort((a, b) =>
      a.fetched_at < b.fetched_at ? -1 : a.fetched_at > b.fetched_at ? 1 : 0,
    );
    if (sorted.length >= 2) {
      const dd = maxDrawdown(
        sorted.map((r) => r.price),
        sorted.map((r) => r.fetched_at),
      );
      portfolioMaxDrawdown = dd.pct;
      drawdownStart = dd.startDate;
      drawdownEnd = dd.endDate;
    }
  }

  return {
    totalValue,
    days,
    var95Pct: portfolioVar95Pct,
    var95Vnd: portfolioVar95Vnd,
    maxDrawdownPct: portfolioMaxDrawdown,
    maxDrawdownStart: drawdownStart,
    maxDrawdownEnd: drawdownEnd,
    heatMap,
  };
}
