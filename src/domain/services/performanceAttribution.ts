/**
 * Domain service — Performance Attribution
 *
 * Computes retrospective performance attribution by grouping historical alerts
 * by signal type and measuring the 3-day price outcome for each.
 *
 * This is a pure domain function with no I/O dependencies.
 * All price data must be supplied by the caller (typically from
 * market_prices_history via the infrastructure layer).
 *
 * Scoring rules:
 *   - price_drop  → expected direction "down": +5% price drop = HIT
 *   - price_surge → expected direction "up":   +5% price rise = HIT
 *   - news_mention / volume_spike / other → direction "neutral": not scored
 *   - Price changes < 0.1% are treated as noise and marked UNKNOWN
 *   - Only prices within the 1–3 day window after the alert are considered
 *
 * @module domain/services/performanceAttribution
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Per-signal-type attribution summary. */
export interface SignalPerformance {
  /** The signal type key (e.g. "price_drop", "news_mention"). */
  signalType: string;
  /** Total number of alerts with this signal type in the period. */
  totalAlerts: number;
  /** Alerts where the price moved in the expected direction (>= 0.1% change). */
  hitCount: number;
  /** Alerts where the price moved against the expected direction (>= 0.1% change). */
  missCount: number;
  /**
   * Average price-change percentage over the 3-day window for all scoreable
   * alerts (hit + miss). Sign matches the actual direction (positive = up,
   * negative = down). 0 when no scoreable data is available.
   */
  avgReturnPct: number;
  /**
   * Hit rate as an integer percentage 0–100.
   * Calculated as hitCount / (hitCount + missCount) * 100.
   * Returns 0 when there are no scoreable alerts.
   */
  winRate: number;
}

/** Alert input record expected by computeAttribution(). */
export interface AlertInput {
  /** Signal type string, e.g. "price_drop". */
  signalType: string;
  /** Stock ticker code, e.g. "VNM". */
  actionCode: string;
  /** ISO 8601 timestamp of when the alert was triggered. */
  triggeredAt: string;
}

/** Single price datapoint in the history. */
export interface PricePoint {
  /** ISO 8601 date string. */
  date: string;
  /** Price in VND (any consistent unit). */
  price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum 1-day lookahead in ms. */
const MIN_LOOKAHEAD_MS = 1 * 86_400_000;

/** Maximum 3-day lookahead in ms. */
const MAX_LOOKAHEAD_MS = 3 * 86_400_000;

/** Price changes below this threshold are treated as noise and marked UNKNOWN. */
const NOISE_THRESHOLD_PCT = 0.1;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type Direction = "up" | "down" | "neutral";

/**
 * Map a signal type to its expected price direction.
 *
 * @param signalType - Signal type string from alerts.signals_json
 * @returns Expected price direction for scoring
 */
function expectedDirection(signalType: string): Direction {
  if (signalType === "price_drop") return "down";
  if (signalType === "price_surge") return "up";
  return "neutral";
}

type ScoreResult = "HIT" | "MISS" | "UNKNOWN";

interface ScoreDetail {
  result: ScoreResult;
  /** Actual price change pct (NaN when no data). */
  changePct: number;
}

/**
 * Score one alert against the supplied price history for its stock.
 *
 * @param dir     - Expected direction derived from signal type
 * @param alertTs - Alert timestamp in ms
 * @param prices  - Sorted array of price points for the stock
 */
function scoreOne(
  dir: Direction,
  alertTs: number,
  prices: PricePoint[],
): ScoreDetail {
  if (dir === "neutral") return { result: "UNKNOWN", changePct: NaN };
  if (Number.isNaN(alertTs)) return { result: "UNKNOWN", changePct: NaN };

  // Find price at or after alert time (baseline)
  const baseline = prices.find((p) => new Date(p.date).getTime() >= alertTs);
  if (!baseline) return { result: "UNKNOWN", changePct: NaN };

  const minTs = alertTs + MIN_LOOKAHEAD_MS;
  const maxTs = alertTs + MAX_LOOKAHEAD_MS;

  // Find first price in the 1–3 day window
  const future = prices.find((p) => {
    const t = new Date(p.date).getTime();
    return t >= minTs && t <= maxTs;
  });

  if (!future) return { result: "UNKNOWN", changePct: NaN };

  const changePct =
    ((future.price - baseline.price) / baseline.price) * 100;

  if (Math.abs(changePct) < NOISE_THRESHOLD_PCT) {
    return { result: "UNKNOWN", changePct };
  }

  if (dir === "down" && changePct < 0) return { result: "HIT", changePct };
  if (dir === "up" && changePct > 0) return { result: "HIT", changePct };
  return { result: "MISS", changePct };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute performance attribution grouped by signal type.
 *
 * @param alerts       - Array of alert input records
 * @param priceHistory - Map from stock code → sorted price history
 * @returns Array of SignalPerformance records, sorted by totalAlerts descending
 *
 * @example
 * const result = computeAttribution(alerts, priceHistory);
 * // result[0].signalType === "news_mention" (most alerts)
 */
export function computeAttribution(
  alerts: AlertInput[],
  priceHistory: Map<string, PricePoint[]>,
): SignalPerformance[] {
  if (alerts.length === 0) return [];

  // Accumulate per-signal-type buckets
  const buckets = new Map<
    string,
    {
      totalAlerts: number;
      hitCount: number;
      missCount: number;
      returnSum: number;
      scoreableCount: number;
    }
  >();

  for (const alert of alerts) {
    const { signalType, actionCode, triggeredAt } = alert;

    if (!buckets.has(signalType)) {
      buckets.set(signalType, {
        totalAlerts: 0,
        hitCount: 0,
        missCount: 0,
        returnSum: 0,
        scoreableCount: 0,
      });
    }

    const bucket = buckets.get(signalType)!;
    bucket.totalAlerts++;

    const dir = expectedDirection(signalType);
    const prices = priceHistory.get(actionCode) ?? [];
    const alertTs = new Date(triggeredAt).getTime();
    const { result, changePct } = scoreOne(dir, alertTs, prices);

    if (result === "HIT") {
      bucket.hitCount++;
      bucket.returnSum += changePct;
      bucket.scoreableCount++;
    } else if (result === "MISS") {
      bucket.missCount++;
      bucket.returnSum += changePct;
      bucket.scoreableCount++;
    }
    // UNKNOWN: don't count toward scoreable
  }

  // Convert buckets to SignalPerformance array
  const results: SignalPerformance[] = [];

  for (const [signalType, b] of buckets.entries()) {
    const scoreable = b.hitCount + b.missCount;
    const winRate = scoreable > 0
      ? Math.round((b.hitCount / scoreable) * 100)
      : 0;
    const avgReturnPct = b.scoreableCount > 0
      ? b.returnSum / b.scoreableCount
      : 0;

    results.push({
      signalType,
      totalAlerts: b.totalAlerts,
      hitCount: b.hitCount,
      missCount: b.missCount,
      avgReturnPct,
      winRate,
    });
  }

  // Sort by totalAlerts descending (most active signals first)
  results.sort((a, b) => b.totalAlerts - a.totalAlerts);

  return results;
}
