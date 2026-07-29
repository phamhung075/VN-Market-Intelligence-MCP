/**
 * Domain — Market Sentiment Calculator (P0-4-MARKET-SENTIMENT-INDEX)
 *
 * Pure computation layer — no I/O. Implements FR-1 through FR-5:
 *   FR-1: Confidence-weighted daily sentiment score (bullish=+1, bearish=-1, neutral=0)
 *   FR-2: Z-score vs 60/90-day baseline (null when <21 actual days — HARD CONSTRAINT)
 *   FR-3: 5-day EMA of sentiment (alpha = 2/6 = 0.333)
 *   FR-4: Bull/bear/neutral dispersion from last 5 days
 *   FR-5: Article-volume spike flag (today > 2× 30d average)
 *
 * HARD CONSTRAINT (no-fake-data): z-scores null + history_quality='INSUFFICIENT'
 * when total available days < MIN_DAYS_FOR_Z (21). Never back-fill or extrapolate.
 *
 * Layer: domain/services/news-analysis (pure — no database or network access)
 *
 * @module domain/services/news-analysis/marketSentimentCalculator
 */

// ---------------------------------------------------------------------------
// Input types (data rows from infrastructure layer)
// ---------------------------------------------------------------------------

/** One row from rag_analyses — columns used for sentiment computation. */
export interface RagAnalysisRow {
  sentiment: string | null;
  confidence: number | null;
  impact_score: number | null;
  created_at: string; // ISO-8601 (YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DD)
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** FR-1: One daily sentiment score entry. */
export interface DailyScore {
  date: string;           // YYYY-MM-DD
  score: number | null;   // null when confidence sum = 0 (divide-by-zero guard)
  article_count: number;  // articles with valid sentiment, confidence > 0, and non-null impact_score
}

/** FR-2: Z-score results + history quality metadata. */
export type HistoryQuality = 'EMPTY' | 'INSUFFICIENT' | 'SUFFICIENT';

export interface ZScoreResult {
  z_60d: number | null;
  z_90d: number | null;
  history_quality: HistoryQuality;
  days_available: number;
  null_reason: string | null;
}

/** FR-3: EMA(5) result. */
export interface EMA5dResult {
  ema_5d: number | null;
  null_reason: string | null;
}

/** FR-4: Bull/bear/neutral dispersion from last 5 days. */
export interface Dispersion5dResult {
  bull_ratio_5d: number | null;
  bear_ratio_5d: number | null;
  neutral_ratio_5d: number | null;
  total_articles_5d: number;
}

/** FR-5: Article volume spike result. */
export interface ArticleSpikeResult {
  article_spike: boolean;
  today_article_count: number;
  article_volume_30d_avg: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sentiment weight mapping: bullish=+1, bearish=-1, neutral=0. */
const SENTIMENT_VALUES: Record<string, number> = {
  bullish: 1,
  bearish: -1,
  neutral: 0,
};

/** Minimum days of real data required for z-score computation. */
const MIN_DAYS_FOR_Z = 21;

/** EMA smoothing factor: alpha = 2 / (5 + 1) = 0.333... */
const EMA_ALPHA = 2 / (5 + 1);

// ---------------------------------------------------------------------------
// Internal math helpers
// ---------------------------------------------------------------------------

/** Population mean of a non-empty array. */
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation. */
function popStd(values: number[], avg: number): number {
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute z-score of the last element in `series` vs the whole series.
 * Returns null if the series is too short (<MIN_DAYS_FOR_Z) or std = 0.
 */
function computeZForWindow(series: number[]): number | null {
  if (series.length < MIN_DAYS_FOR_Z) return null;
  const avg = mean(series);
  const std = popStd(series, avg);
  if (std === 0) return null; // all values equal → no spread → z undefined
  const latest = series[series.length - 1]!;
  return (latest - avg) / std;
}

// ---------------------------------------------------------------------------
// FR-1: Confidence-Weighted Daily Sentiment Score
// ---------------------------------------------------------------------------

/**
 * Group rag_analyses rows by calendar date and compute confidence-weighted score.
 *
 * Per day:
 *   daily_score = sum(sentiment_value × confidence × impact_score) / sum(confidence)
 *
 * Guards:
 *   - Rows with confidence = null or confidence ≤ 0: excluded.
 *   - Rows with impact_score = null: excluded (FACTORY-GUARD-CI-METRICMASK-IMPL —
 *     an unassessed impact must not be silently fabricated into a plausible 1.0
 *     "neutral" weight; honestly dropping the row from the weighted average is
 *     the correct absence-propagation, matching the existing confidence-null guard).
 *   - Unexpected sentiment values (not bullish/bearish/neutral): excluded + WARN logged.
 *   - divide-by-zero (sum(confidence) = 0): score = null for that day.
 *
 * @param rows   - Raw rag_analyses rows (any time window).
 * @param logger - Optional logger for WARN on unexpected sentiment values.
 * @returns      - Daily scores sorted by date ascending.
 */
export function computeDailyScores(
  rows: RagAnalysisRow[],
  logger?: { warn: (msg: string) => void },
): DailyScore[] {
  // Group valid rows by DATE(created_at)
  const byDate: Record<string, RagAnalysisRow[]> = {};

  for (const row of rows) {
    // Guard: skip rows with missing/invalid confidence or null sentiment
    if (row.confidence === null || row.confidence <= 0) continue;
    if (!row.sentiment) continue;
    // FACTORY-GUARD-CI-METRICMASK-IMPL: skip rows with unknown impact_score —
    // no honest weight can be assigned, so the row is excluded rather than
    // guessing its contribution (see docstring above).
    if (row.impact_score === null) continue;

    // Guard: skip unexpected sentiment values (log WARN, do not crash)
    if (!(row.sentiment in SENTIMENT_VALUES)) {
      logger?.warn(
        `[marketSentimentCalculator] Unexpected sentiment value excluded: '${row.sentiment}'`,
      );
      continue;
    }

    const date = row.created_at.slice(0, 10); // DATE(created_at) — first 10 chars
    if (!byDate[date]) byDate[date] = [];
    byDate[date]!.push(row);
  }

  // Compute score per day
  const scores: DailyScore[] = [];

  for (const [date, dayRows] of Object.entries(byDate)) {
    let weightedSum = 0;
    let confidenceSum = 0;

    for (const row of dayRows) {
      const sentVal = SENTIMENT_VALUES[row.sentiment!]!;
      const conf = row.confidence!;
      // Non-null by construction — rows with impact_score === null were
      // already excluded during grouping above (FACTORY-GUARD-CI-METRICMASK-IMPL).
      const impact = row.impact_score!;

      weightedSum += sentVal * conf * impact;
      confidenceSum += conf;
    }

    scores.push({
      date,
      // Divide-by-zero guard: confidenceSum > 0 is always true here (we filtered above),
      // but double-guard in case floating-point edge cases occur.
      score: confidenceSum > 0 ? weightedSum / confidenceSum : null,
      article_count: dayRows.length,
    });
  }

  // Sort ascending by date
  scores.sort((a, b) => a.date.localeCompare(b.date));
  return scores;
}

// ---------------------------------------------------------------------------
// FR-2: Z-Score vs 60/90-Day Baseline
// ---------------------------------------------------------------------------

/**
 * Compute z-scores for 60d and 90d baselines from the daily_score series.
 *
 * HARD CONSTRAINT (no-fake-data): both z-scores null when total days < MIN_DAYS_FOR_Z.
 * The z-score IS the fabricated distribution when history is thin — do not ship.
 *
 * @param dailyScores - Time series from computeDailyScores (any window, ascending).
 * @returns           - Z-scores, history_quality, and null_reason.
 */
export function computeZScores(dailyScores: DailyScore[]): ZScoreResult {
  // Only days with a valid (non-null) score contribute to the baseline
  const validScores = dailyScores.filter((d) => d.score !== null);
  const daysAvailable = validScores.length;

  // ── EMPTY: no data at all ────────────────────────────────────────────────
  if (daysAvailable === 0) {
    return {
      z_60d: null,
      z_90d: null,
      history_quality: 'EMPTY',
      days_available: 0,
      null_reason: 'No rag_analyses data (rag_analyses table is empty or has no valid sentiment rows)',
    };
  }

  // ── INSUFFICIENT: not enough history for z-score ─────────────────────────
  if (daysAvailable < MIN_DAYS_FOR_Z) {
    return {
      z_60d: null,
      z_90d: null,
      history_quality: 'INSUFFICIENT',
      days_available: daysAvailable,
      null_reason:
        `Only ${daysAvailable} day(s) of valid sentiment data (minimum ${MIN_DAYS_FOR_Z} required for z-score baseline)`,
    };
  }

  // ── SUFFICIENT: compute z-scores ─────────────────────────────────────────
  const scores90d = validScores.map((d) => d.score!);

  // z_90d: use the full 90d series (guaranteed ≥ MIN_DAYS_FOR_Z)
  const z_90d = computeZForWindow(scores90d);

  // z_60d: use the last 60 entries of the 90d series
  // (could be fewer than 60 entries if total days is 21-59)
  const scores60d = scores90d.slice(-60);
  const z_60d = scores60d.length >= MIN_DAYS_FOR_Z ? computeZForWindow(scores60d) : null;

  return {
    z_60d,
    z_90d,
    history_quality: 'SUFFICIENT',
    days_available: daysAvailable,
    null_reason: null,
  };
}

// ---------------------------------------------------------------------------
// FR-3: 5-Day EMA of Sentiment
// ---------------------------------------------------------------------------

/**
 * Compute EMA(5) over the daily_score series.
 * alpha = 2 / (5 + 1) = 0.333.
 * Seed: first valid score initializes the EMA.
 * Returns null when fewer than 5 valid scores are available.
 *
 * @param dailyScores - Time series from computeDailyScores (ascending).
 */
export function computeEMA5d(dailyScores: DailyScore[]): EMA5dResult {
  const validScores = dailyScores
    .filter((d) => d.score !== null)
    .map((d) => d.score!);

  if (validScores.length < 5) {
    return {
      ema_5d: null,
      null_reason: `Only ${validScores.length} valid day(s) — minimum 5 required for EMA(5)`,
    };
  }

  // Seed with first value; iterate with EMA formula
  let ema = validScores[0]!;
  for (let i = 1; i < validScores.length; i++) {
    ema = EMA_ALPHA * validScores[i]! + (1 - EMA_ALPHA) * ema;
  }

  return { ema_5d: ema, null_reason: null };
}

// ---------------------------------------------------------------------------
// FR-4: Bull/Bear Dispersion
// ---------------------------------------------------------------------------

/**
 * Compute bull/bear/neutral ratios from rows in the last 5 calendar days.
 *
 * @param rows          - All rag_analyses rows in the 90d window.
 * @param cutoffDate5d  - YYYY-MM-DD: earliest date to include (today − 4 days).
 * @returns             - Ratios (0–1) and total article count.
 */
export function computeDispersion5d(
  rows: RagAnalysisRow[],
  cutoffDate5d: string,
): Dispersion5dResult {
  const recent = rows.filter((r) => {
    const d = r.created_at.slice(0, 10);
    return (
      d >= cutoffDate5d &&
      r.sentiment !== null &&
      r.sentiment in SENTIMENT_VALUES
    );
  });

  const total = recent.length;

  if (total === 0) {
    return {
      bull_ratio_5d: null,
      bear_ratio_5d: null,
      neutral_ratio_5d: null,
      total_articles_5d: 0,
    };
  }

  let bull = 0;
  let bear = 0;
  let neutral = 0;

  for (const r of recent) {
    if (r.sentiment === 'bullish') bull++;
    else if (r.sentiment === 'bearish') bear++;
    else if (r.sentiment === 'neutral') neutral++;
  }

  return {
    bull_ratio_5d: bull / total,
    bear_ratio_5d: bear / total,
    neutral_ratio_5d: neutral / total,
    total_articles_5d: total,
  };
}

// ---------------------------------------------------------------------------
// FR-5: Article-Volume Spike Flag
// ---------------------------------------------------------------------------

/**
 * Detect whether today's article count exceeds 2× the 30-day average.
 *
 * @param rows     - All rag_analyses rows in the 30d window (any sentiment/confidence).
 * @param todayStr - YYYY-MM-DD string for "today".
 * @returns        - Spike flag, today count, and 30d average.
 */
export function computeArticleSpike(
  rows: RagAnalysisRow[],
  todayStr: string,
): ArticleSpikeResult {
  // Count ALL rows (not filtered by sentiment) per calendar day
  const byDate: Record<string, number> = {};

  for (const r of rows) {
    const d = r.created_at.slice(0, 10);
    byDate[d] = (byDate[d] ?? 0) + 1;
  }

  const todayCount = byDate[todayStr] ?? 0;
  const allDates = Object.keys(byDate);

  if (allDates.length === 0) {
    return {
      article_spike: false,
      today_article_count: 0,
      article_volume_30d_avg: null,
    };
  }

  const total30d = Object.values(byDate).reduce((a, b) => a + b, 0);
  const avg30d = total30d / allDates.length;

  return {
    article_spike: avg30d > 0 && todayCount > 2.0 * avg30d,
    today_article_count: todayCount,
    article_volume_30d_avg: avg30d,
  };
}
