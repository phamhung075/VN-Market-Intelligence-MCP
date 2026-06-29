/**
 * Domain — Insider Sentiment Calculator (P0-5-INSIDER-SENTIMENT)
 *
 * Pure computation layer — no I/O. Implements FR-1 through FR-4:
 *   FR-1: Net buy-sell value per window (30d / 90d / 180d) in billion VND.
 *   FR-2: Free-float-normalized score clamped [-1, +1] using market_cap_bn proxy.
 *   FR-3: ACCUMULATION / DISTRIBUTION / MIXED / NEUTRAL classification label.
 *   FR-4: Large-deal flags (default threshold: 10 billion VND).
 *
 * HARD CONSTRAINTS (no-fake-data):
 *   - price = 0 rows → EXCLUDED + WARN (caller must supply warnFn)
 *   - executed_volume = 0 rows → EXCLUDED silently
 *   - type = 'other' rows → EXCLUDED (not buy or sell)
 *   - market_cap_bn = null → net_sentiment_score = null (cannot normalize)
 *   - null return means "no valid data in window" — never fabricate a value
 *
 * Layer: domain/services/market-data (pure — no database or network access)
 *
 * @module domain/services/market-data/insiderSentimentCalculator
 */

// ---------------------------------------------------------------------------
// Input types (data rows from infrastructure layer)
// ---------------------------------------------------------------------------

/** One insider transaction row (columns needed for sentiment computation). */
export interface InsiderTxRow {
  code: string;
  type: 'buy' | 'sell' | 'other';
  executedVolume: number;   // executed_volume INTEGER
  price: number;            // price REAL
  fromDate: string;         // from_date TEXT YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** FR-1: Net buy-sell result for one time window. */
export interface WindowResult {
  /** Net buy-sell value in billion VND (null when 0 valid buy/sell rows). */
  netBnVnd: number | null;
  /** Count of distinct from_date values with valid (price>0, vol>0) buy/sell rows. */
  distinctDates: number;
}

/** FR-2: Normalized score computation result. */
export interface NormResult {
  /** Score in [-1, +1]; null when denominator unavailable or no 90d data. */
  score: number | null;
  /** Human-readable reason when score is null. */
  null_reason: string | null;
}

/** FR-3: Classification label. */
export type InsiderLabel = 'ACCUMULATION' | 'DISTRIBUTION' | 'MIXED' | 'NEUTRAL';

/** FR-4: Large-deal flag output. */
export interface LargeDealsResult {
  large_deals_30d: boolean;
  large_deal_count_30d: number;
  /** Largest single deal value in 30d window (billion VND); null when no large deals. */
  largest_deal_value_30d_bn_vnd: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default large-deal threshold in VND (10 billion = 10_000_000_000). */
export const DEFAULT_LARGE_DEAL_THRESHOLD_VND = 10_000_000_000;

// ---------------------------------------------------------------------------
// FR-1: Net buy-sell computation
// ---------------------------------------------------------------------------

/**
 * Compute net buy-sell value (buy_value − sell_value) for a set of rows.
 *
 * Exclusion rules (applied in this order):
 *   1. type ≠ 'buy' | 'sell' → skip
 *   2. executedVolume ≤ 0    → skip (not executed)
 *   3. price ≤ 0             → skip + WARN via warnFn (data quality issue)
 *
 * Returns null when no valid buy/sell rows exist (honest null for empty window).
 *
 * @param rows    - Insider transaction rows already filtered to the desired window.
 * @param warnFn  - Optional warn callback for price=0 rows (injected; no direct logging).
 */
export function computeWindowNetBuySell(
  rows: InsiderTxRow[],
  warnFn?: (msg: string) => void,
): WindowResult {
  let buyVnd = 0;
  let sellVnd = 0;
  const validDates = new Set<string>();

  for (const row of rows) {
    // Skip non-trade types
    if (row.type !== 'buy' && row.type !== 'sell') continue;
    // Skip unexecuted rows (spec: executed_volume=0 excluded)
    if (row.executedVolume <= 0) continue;
    // Exclude zero-price rows (data quality issue) + WARN
    if (row.price <= 0) {
      warnFn?.(
        `[insider-sentiment] price≤0 row excluded: code=${row.code} fromDate=${row.fromDate} ` +
        `executedVolume=${row.executedVolume}`,
      );
      continue;
    }

    const dealVnd = row.executedVolume * row.price;
    if (row.type === 'buy') buyVnd += dealVnd;
    else sellVnd += dealVnd;
    validDates.add(row.fromDate);
  }

  const distinctDates = validDates.size;
  // Return null when no valid rows (honest null — not zero)
  const netBnVnd = distinctDates > 0 ? (buyVnd - sellVnd) / 1e9 : null;

  return { netBnVnd, distinctDates };
}

// ---------------------------------------------------------------------------
// FR-2: Free-float-normalized score
// ---------------------------------------------------------------------------

/**
 * Compute the free-float-normalized net insider sentiment score.
 *
 * Formula: net_buy_sell_90d_bn_vnd / market_cap_bn, clamped to [-1, +1].
 * Both numerator and denominator are in billion VND → dimensionless ratio.
 *
 * Null conditions (honest null — never default-fill the denominator):
 *   - net90dBnVnd is null → INSUFFICIENT_DATA
 *   - marketCapBn is null → MARKET_CAP_BN_UNAVAILABLE
 *   - marketCapBn ≤ 0    → MARKET_CAP_BN_ZERO
 *
 * @param net90dBnVnd  - Net buy-sell for 90d window in billion VND.
 * @param marketCapBn  - Market cap proxy in billion VND (from vnstock_trading_stats).
 */
export function computeNormalizedScore(
  net90dBnVnd: number | null,
  marketCapBn: number | null,
): NormResult {
  if (net90dBnVnd === null) {
    return {
      score: null,
      null_reason: 'INSUFFICIENT_DATA: no valid buy/sell transactions in 90d window',
    };
  }
  if (marketCapBn === null) {
    return {
      score: null,
      null_reason: 'MARKET_CAP_BN_UNAVAILABLE: market_cap_bn IS NULL for ticker (cannot normalize)',
    };
  }
  if (marketCapBn <= 0) {
    return {
      score: null,
      null_reason: 'MARKET_CAP_BN_ZERO: market_cap_bn is zero or negative (invalid denominator)',
    };
  }

  // net90dBnVnd and marketCapBn both in billion VND → ratio is dimensionless
  const raw = net90dBnVnd / marketCapBn;
  const clamped = Math.max(-1, Math.min(1, raw));
  return { score: clamped, null_reason: null };
}

// ---------------------------------------------------------------------------
// FR-3: ACCUMULATION / DISTRIBUTION / MIXED / NEUTRAL label
// ---------------------------------------------------------------------------

/**
 * Derive insider activity classification label.
 *
 * Rules (per spec FR-3):
 *   ACCUMULATION — net_90d > 0 AND net_30d > 0 (sustained buying in both windows)
 *   DISTRIBUTION — net_90d < 0 AND net_30d < 0 (sustained selling in both windows)
 *   MIXED        — signs diverge between windows, or one window null with other non-zero
 *   NEUTRAL      — both null (no buy/sell activity), or both exactly 0
 *
 * @param net30dBnVnd - Net value for 30d window (billion VND); null when no data.
 * @param net90dBnVnd - Net value for 90d window (billion VND); null when no data.
 */
export function computeInsiderLabel(
  net30dBnVnd: number | null,
  net90dBnVnd: number | null,
): InsiderLabel {
  // Both null → no activity at all
  if (net30dBnVnd === null && net90dBnVnd === null) return 'NEUTRAL';
  // Both exactly zero → no net activity
  if (net30dBnVnd === 0 && net90dBnVnd === 0) return 'NEUTRAL';

  // Both positive → sustained buying = ACCUMULATION
  if (
    net30dBnVnd !== null &&
    net90dBnVnd !== null &&
    net30dBnVnd > 0 &&
    net90dBnVnd > 0
  ) return 'ACCUMULATION';

  // Both negative → sustained selling = DISTRIBUTION
  if (
    net30dBnVnd !== null &&
    net90dBnVnd !== null &&
    net30dBnVnd < 0 &&
    net90dBnVnd < 0
  ) return 'DISTRIBUTION';

  // Anything else: signs diverge or one window lacks data → MIXED
  return 'MIXED';
}

// ---------------------------------------------------------------------------
// FR-4: Large-deal flags
// ---------------------------------------------------------------------------

/**
 * Detect large single insider deals in the 30d window.
 *
 * A deal is "large" when executedVolume × price > thresholdVnd (default 10B VND).
 * Zero-price and zero-volume rows are excluded (consistent with computeWindowNetBuySell).
 *
 * @param rows30d       - Rows already filtered to the 30d window.
 * @param thresholdVnd  - Large-deal threshold in VND. Default: 10_000_000_000.
 */
export function computeLargeDeals(
  rows30d: InsiderTxRow[],
  thresholdVnd: number = DEFAULT_LARGE_DEAL_THRESHOLD_VND,
): LargeDealsResult {
  let count = 0;
  let largestVnd = 0;

  for (const row of rows30d) {
    // Only count buy/sell with valid executed volume and price
    if (row.type !== 'buy' && row.type !== 'sell') continue;
    if (row.executedVolume <= 0 || row.price <= 0) continue;

    const dealVnd = row.executedVolume * row.price;
    if (dealVnd > thresholdVnd) {
      count++;
      if (dealVnd > largestVnd) largestVnd = dealVnd;
    }
  }

  return {
    large_deals_30d: count > 0,
    large_deal_count_30d: count,
    largest_deal_value_30d_bn_vnd: count > 0 ? largestVnd / 1e9 : null,
  };
}
