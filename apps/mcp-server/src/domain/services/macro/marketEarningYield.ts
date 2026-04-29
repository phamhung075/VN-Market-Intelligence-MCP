/**
 * Domain Service — Market Earning Yield
 *
 * Computes the market-wide earnings yield from a list of watchlist tickers
 * with their P/E ratios. This is a PURE domain function — zero infrastructure
 * imports, zero DB access.
 *
 * Formula:
 *   earningYield = (1 / medianPE) * 100  (expressed as a percentage, e.g. 7.32)
 *
 * Coverage guard:
 *   If fewer than 70% of watchlist tickers have a valid PE, the function
 *   refuses to compute and returns { refused: true, coverageRatio, coverageCount }.
 *
 * Caller responsibility:
 *   - Filter out tickers with pe <= 0 before calling this function.
 *   - Pass totalWatchlist = total watchlist size (not just those with PE data).
 *
 * Sprint: 1426 — Báu Phase 2 (Dinh Gia)
 * Task: TASK-1426a
 *
 * @module domain/services/macro/marketEarningYield
 */

/** A ticker with a pre-computed P/E ratio. pe must be > 0. */
export interface TickerPE {
  /** Stock code, e.g. "VCB" */
  code: string;
  /** P/E ratio — pre-computed from vnstock_financials.pe column, or
   *  from currentPrice * 1000 / eps if the stored pe is null.
   *  Must be > 0; caller must exclude pe <= 0 entries. */
  pe: number;
}

/** Successful result of computeMarketEarningYield(). */
export interface MarketEarningYieldResult {
  /** Median P/E across all valid tickers */
  medianPE: number;
  /** Earnings yield = (1 / medianPE) * 100 — expressed as a percentage (e.g. 7.32) */
  earningYield: number;
  /** Fraction of watchlist tickers with valid PE — e.g. 0.93 = 28/30 */
  coverageRatio: number;
  /** Number of tickers with valid PE — e.g. 28 */
  coverageCount: number;
  /** Total watchlist size used as denominator — e.g. 30 */
  totalWatchlist: number;
  /** "YYYY-QN" string of the latest vnstock_financials period seen — e.g. "2024-Q4" */
  dataAsOf: string;
  /** ISO 8601 timestamp of computation */
  computedAt: string;
}

/** Refused result — returned when coverage < MIN_COVERAGE_RATIO. */
export interface MarketEarningYieldRefused {
  refused: true;
  coverageRatio: number;
  coverageCount: number;
}

/** Minimum fraction of watchlist that must have valid PE before computing. */
const MIN_COVERAGE_RATIO = 0.7;

/**
 * Computes the market-wide median P/E and earnings yield.
 *
 * @param tickers        Tickers with valid pe > 0. Caller must pre-filter zeros/negatives.
 * @param totalWatchlist Total watchlist size (denominator for coverage ratio).
 * @param dataAsOf       "YYYY-QN" label of the latest financial period seen.
 * @returns              MarketEarningYieldResult on success, MarketEarningYieldRefused when
 *                       coverage < 70% or totalWatchlist is 0.
 */
export function computeMarketEarningYield(
  tickers: TickerPE[],
  totalWatchlist: number,
  dataAsOf: string,
): MarketEarningYieldResult | MarketEarningYieldRefused {
  const coverageCount = tickers.length;

  // ── Coverage guard ─────────────────────────────────────────────────────────
  // Refuse if totalWatchlist is 0 (division-by-zero guard) or coverage < 70%.
  const coverageRatio = totalWatchlist > 0 ? coverageCount / totalWatchlist : 0;

  if (totalWatchlist === 0 || coverageRatio < MIN_COVERAGE_RATIO) {
    return { refused: true, coverageRatio, coverageCount };
  }

  // ── Median computation ────────────────────────────────────────────────────
  const sorted = [...tickers].sort((a, b) => a.pe - b.pe);
  const n = sorted.length;
  let medianPE: number;

  if (n % 2 === 1) {
    // Odd count: middle element
    // n >= 1 guaranteed by coverage guard (coverageRatio >= 0.7 > 0)
    medianPE = sorted[Math.floor(n / 2)]!.pe;
  } else {
    // Even count: average of the two middle elements
    // n >= 2 guaranteed because n is even and coverage guard ensures n >= 1
    const lo = sorted[n / 2 - 1]!.pe;
    const hi = sorted[n / 2]!.pe;
    medianPE = (lo + hi) / 2;
  }

  // ── Earnings yield ────────────────────────────────────────────────────────
  const earningYield = (1 / medianPE) * 100;

  return {
    medianPE,
    earningYield,
    coverageRatio,
    coverageCount,
    totalWatchlist,
    dataAsOf,
    computedAt: new Date().toISOString(),
  };
}
