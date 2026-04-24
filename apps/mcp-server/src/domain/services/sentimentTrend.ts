/**
 * Sentiment Trend Computation — Task 225
 *
 * Pure domain service: computes per-stock sentiment trend from an array of
 * dated sentiment entries. No I/O, no infrastructure imports.
 *
 * Algorithm:
 *   1. Filter entries to those within `windowDays` of today (UTC date).
 *   2. Group by calendar date (YYYY-MM-DD).
 *   3. For each date compute: total, bullish, bearish, neutral, netScore.
 *   4. Sort dates ascending (oldest first) and assign x indices 0, 1, 2…
 *   5. Run OLS linear regression on (x, netScore) pairs.
 *   6. Classify slope:
 *        |slope| < 0.05 → "stable"
 *        slope  > 0     → "improving"
 *        slope  < 0     → "deteriorating"
 *   7. Build Vietnamese summary.
 *
 * Layer: domain/services — ZERO infrastructure imports.
 */

// ─── Public types ────────────────────────────────────────────────────────────

/** Aggregated sentiment counts for a single calendar day. */
export interface DailySentiment {
  /** Calendar date string in YYYY-MM-DD format (UTC). */
  date: string;
  /** Total number of entries on this day. */
  total: number;
  /** Count of bullish entries. */
  bullish: number;
  /** Count of bearish entries. */
  bearish: number;
  /** Count of neutral entries. */
  neutral: number;
  /** Net directional score: bullish − bearish. */
  netScore: number;
}

/** Full sentiment trend result for a stock over a rolling window. */
export interface SentimentTrend {
  /** Stock code this trend relates to. */
  code: string;
  /** Rolling window in calendar days. */
  windowDays: number;
  /**
   * Per-day breakdown, sorted most-recent-first (descending by date).
   * This order is used for display; regression uses ascending order internally.
   */
  dailyBreakdown: DailySentiment[];
  /** Overall direction of the trend over the window. */
  trendDirection: "improving" | "deteriorating" | "stable";
  /**
   * OLS slope of netScore over time (x = day index 0..n-1 ascending).
   * 0 when fewer than 2 distinct days are present.
   */
  slope: number;
  /** Vietnamese plain-text summary. */
  summary: string;
}

// ─── Core computation ────────────────────────────────────────────────────────

/**
 * Compute the sentiment trend for a stock over a rolling window.
 *
 * @param entries    - Array of `{ sentiment, createdAt }` objects.
 *                     `sentiment` must be "bullish" | "bearish" | "neutral".
 *                     `createdAt` can be a full ISO-8601 timestamp or YYYY-MM-DD.
 * @param code       - Stock code (e.g. "VNM").
 * @param windowDays - Number of calendar days to look back (inclusive of today).
 * @returns          - Full SentimentTrend including regression slope and Vietnamese summary.
 */
export function computeSentimentTrend(
  entries: Array<{ sentiment: string; createdAt: string }>,
  code: string,
  windowDays: number,
): SentimentTrend {
  // ── 1. Determine window boundary ─────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (windowDays - 1));
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  // ── 2. Filter to window and group by date ────────────────────────────────
  const map = new Map<string, DailySentiment>();

  for (const entry of entries) {
    // Normalise: take first 10 chars to get YYYY-MM-DD
    const date = (entry.createdAt ?? "").slice(0, 10);
    if (date < cutoffStr || date > todayStr) continue;

    if (!map.has(date)) {
      map.set(date, { date, total: 0, bullish: 0, bearish: 0, neutral: 0, netScore: 0 });
    }
    const day = map.get(date)!;
    day.total += 1;
    const s = (entry.sentiment ?? "").toLowerCase();
    if (s === "bullish") day.bullish += 1;
    else if (s === "bearish") day.bearish += 1;
    else day.neutral += 1;
    day.netScore = day.bullish - day.bearish;
  }

  // ── 3. Sort ascending for regression, then reverse for display ───────────
  const ascending: DailySentiment[] = Array.from(map.values()).sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  // ── 4. Linear regression on (x, netScore) ───────────────────────────────
  const slope = computeSlope(ascending.map((d) => d.netScore));

  // ── 5. Classify trend direction ──────────────────────────────────────────
  let trendDirection: SentimentTrend["trendDirection"];
  if (Math.abs(slope) < 0.05) {
    trendDirection = "stable";
  } else if (slope > 0) {
    trendDirection = "improving";
  } else {
    trendDirection = "deteriorating";
  }

  // ── 6. Build summary ─────────────────────────────────────────────────────
  const dailyBreakdown = [...ascending].reverse(); // most-recent-first for display
  const summary = buildVietnameseSummary(code, windowDays, ascending, trendDirection, slope);

  return {
    code,
    windowDays,
    dailyBreakdown,
    trendDirection,
    slope: roundSlope(slope),
    summary,
  };
}

// ─── Linear regression helpers ───────────────────────────────────────────────

/**
 * Compute OLS slope for y values where x = 0, 1, 2, …, n-1.
 *
 * Formula:
 *   slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)
 *
 * Returns 0 when n < 2 or denominator is 0 (degenerate case).
 */
function computeSlope(yValues: number[]): number {
  const n = yValues.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += yValues[i]!;
    sumXY += i * yValues[i]!;
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Round slope to 2 decimal places for cleaner display. */
function roundSlope(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Vietnamese summary builder ──────────────────────────────────────────────

/**
 * Builds a concise Vietnamese plain-text summary of the sentiment trend.
 *
 * Examples:
 *   "VNM co xu huong tich cuc trong 7 ngay qua (8/12 tin bullish, 2 bearish)."
 *   "VCB dang xu huong giam trong 5 ngay qua (slope: -0.80)."
 *   "FPT on dinh trong 7 ngay (khong du du lieu)."
 */
function buildVietnameseSummary(
  code: string,
  windowDays: number,
  ascending: DailySentiment[],
  direction: SentimentTrend["trendDirection"],
  slope: number,
): string {
  const totalEntries = ascending.reduce((s, d) => s + d.total, 0);
  const totalBullish = ascending.reduce((s, d) => s + d.bullish, 0);
  const totalBearish = ascending.reduce((s, d) => s + d.bearish, 0);

  if (totalEntries === 0) {
    return `${code} không có dữ liệu cảm tính trong ${windowDays} ngày qua.`;
  }

  const dirLabel =
    direction === "improving"
      ? "có xu hướng TÍCH CỰC"
      : direction === "deteriorating"
        ? "có xu hướng TIÊU CỰC"
        : "ỔN ĐỊNH";

  const slopeStr = `slope: ${slope >= 0 ? "+" : ""}${roundSlope(slope).toFixed(2)}`;

  return (
    `${code} ${dirLabel} trong ${windowDays} ngày qua ` +
    `(${totalBullish}/${totalEntries} tin bullish, ${totalBearish} bearish, ${slopeStr}).`
  );
}
