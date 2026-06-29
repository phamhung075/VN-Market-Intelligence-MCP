/**
 * Application Use Case — Get Market Sentiment Index (P0-4-MARKET-SENTIMENT-INDEX)
 *
 * Orchestrates: store queries → domain computations → structured response.
 *
 * Implements FR-1 through FR-5 of the P0-4 spec:
 *   FR-1: Confidence-weighted daily sentiment score (bullish=+1, bearish=-1, neutral=0)
 *   FR-2: Z-score vs 60/90-day baseline (null when <21 real days — no-fake-data gate)
 *   FR-3: 5-day EMA of sentiment (alpha = 2/6)
 *   FR-4: Bull/bear/neutral dispersion from last 5 calendar days
 *   FR-5: Article volume spike (today > 2× 30d average)
 *
 * Gauge-Readiness (P1 Fear & Greed): `news_sentiment_z` = z_60d ?? z_90d.
 * `history_quality` ALWAYS present so consumers self-gate on baseline adequacy.
 *
 * DDD layer: application/usecases — orchestrates domain + infrastructure.
 *
 * @module application/usecases/getMarketSentimentIndex
 */

import type { Database } from "bun:sqlite";
import { getRagRowsForWindow } from "../../infrastructure/db/marketSentimentStore.js";
import {
  computeDailyScores,
  computeZScores,
  computeEMA5d,
  computeDispersion5d,
  computeArticleSpike,
  type HistoryQuality,
} from "../../domain/services/news-analysis/marketSentimentCalculator.js";
import { logger } from "../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Response type — Gauge-Readiness 6-field contract on key scalar
// ---------------------------------------------------------------------------

export interface MarketSentimentResponse {
  /** Gauge-ready scalar (P1 Fear & Greed sentiment leg). z_60d preferred; z_90d fallback. */
  news_sentiment_z: number | null;

  /** Always present. EMPTY | INSUFFICIENT (< 21 days) | SUFFICIENT. */
  history_quality: HistoryQuality;

  /** Count of calendar days with valid sentiment data in the last 90d. */
  days_available: number;

  /** FR-1: most recent day's date (today if data exists, else last available). */
  today_date: string | null;

  /** FR-1: confidence-weighted daily score for today_date. */
  today_daily_score: number | null;

  /** FR-2: z-score vs 60d baseline (null when <21 days in window or std=0). */
  sentiment_z_60d: number | null;

  /** FR-2: z-score vs 90d baseline (null when <21 days or std=0). */
  sentiment_z_90d: number | null;

  /** FR-3: 5-day EMA of daily_score (null when <5 valid days). */
  sentiment_ema_5d: number | null;

  /** FR-4: proportion of bullish articles in last 5 calendar days (0–1). */
  bull_ratio_5d: number | null;

  /** FR-4: proportion of bearish articles in last 5 calendar days (0–1). */
  bear_ratio_5d: number | null;

  /** FR-4: proportion of neutral articles in last 5 calendar days (0–1). */
  neutral_ratio_5d: number | null;

  /** FR-4: total article count used for dispersion (last 5 days). */
  total_articles_5d: number;

  /** FR-5: true when today's article count > 2× 30d daily average. */
  article_spike: boolean;

  /** FR-5: count of rag_analyses rows created today. */
  today_article_count: number;

  /** FR-5: mean articles/day over last 30 calendar days. */
  article_volume_30d_avg: number | null;

  // ── Gauge-Readiness metadata ───────────────────────────────────────────────

  /** Source tier: 3 (derived from rag_analyses — no new fetch). */
  source_tier: 3;

  /** Unit descriptor for news_sentiment_z and daily scores. */
  unit: 'score';

  /** ISO date this response represents (today's date, UTC). */
  asof: string;

  /**
   * Confidence in the z-score signal.
   * 0.8 = SUFFICIENT history; 0.4 = INSUFFICIENT but partial signals available;
   * null = EMPTY (no data).
   */
  confidence: number | null;

  /** Human-readable reason when news_sentiment_z is null. */
  null_reason: string | null;
}

// ---------------------------------------------------------------------------
// Use case entry point
// ---------------------------------------------------------------------------

/**
 * Execute the market sentiment index computation.
 *
 * @param db      - SQLite database (supports injection for tests)
 * @param nowDate - Optional: override today's date as YYYY-MM-DD (for tests)
 */
export async function getMarketSentimentIndex(
  db: Database,
  nowDate?: string,
): Promise<MarketSentimentResponse> {
  const now = new Date();
  const todayStr = nowDate ?? now.toISOString().slice(0, 10);

  // ── Fetch 90-day window (covers all FR windows) ──────────────────────────
  const rows90d = getRagRowsForWindow(db, 90);

  // Compute 30d cutoff (from today, not from now)
  const cutoff30dDate = new Date(todayStr);
  cutoff30dDate.setDate(cutoff30dDate.getDate() - 29); // -29 = 30 days inclusive
  const cutoff30dStr = cutoff30dDate.toISOString().slice(0, 10);

  // 30d subset (for article spike) — all rows in last 30 calendar days
  const rows30d = rows90d.filter((r) => r.created_at.slice(0, 10) >= cutoff30dStr);

  // 5d cutoff — for dispersion (today and 4 previous calendar days)
  const cutoff5dDate = new Date(todayStr);
  cutoff5dDate.setDate(cutoff5dDate.getDate() - 4); // -4 = 5 days inclusive
  const cutoff5dStr = cutoff5dDate.toISOString().slice(0, 10);

  // ── FR-1: Daily scores ───────────────────────────────────────────────────
  const dailyScores = computeDailyScores(rows90d, {
    warn: (msg) => logger.warn(msg),
  });

  // ── FR-2: Z-scores (hard-constrained to null when <21 days) ─────────────
  const zResult = computeZScores(dailyScores);

  // Gauge-ready field: prefer z_60d, fallback z_90d, null when INSUFFICIENT
  const news_sentiment_z = zResult.z_60d ?? zResult.z_90d;

  // ── FR-3: EMA(5) ─────────────────────────────────────────────────────────
  const emaResult = computeEMA5d(dailyScores);

  // ── FR-4: Dispersion ─────────────────────────────────────────────────────
  const dispersion = computeDispersion5d(rows90d, cutoff5dStr);

  // ── FR-5: Article spike ──────────────────────────────────────────────────
  const spike = computeArticleSpike(rows30d, todayStr);

  // ── Today's score (most recent available) ───────────────────────────────
  // Prefer today's actual score; fallback to latest available date.
  const todayEntry = dailyScores.find((d) => d.date === todayStr);
  const lastEntry = dailyScores.length > 0 ? dailyScores[dailyScores.length - 1] : null;
  const displayEntry = todayEntry ?? lastEntry ?? null;

  // ── Confidence signal based on history quality ───────────────────────────
  const confidence: number | null =
    zResult.history_quality === 'SUFFICIENT'
      ? 0.8
      : zResult.history_quality === 'INSUFFICIENT'
        ? 0.4
        : null; // EMPTY

  return {
    news_sentiment_z,
    history_quality: zResult.history_quality,
    days_available: zResult.days_available,

    today_date: displayEntry?.date ?? null,
    today_daily_score: displayEntry?.score ?? null,

    sentiment_z_60d: zResult.z_60d,
    sentiment_z_90d: zResult.z_90d,

    sentiment_ema_5d: emaResult.ema_5d,

    bull_ratio_5d: dispersion.bull_ratio_5d,
    bear_ratio_5d: dispersion.bear_ratio_5d,
    neutral_ratio_5d: dispersion.neutral_ratio_5d,
    total_articles_5d: dispersion.total_articles_5d,

    article_spike: spike.article_spike,
    today_article_count: spike.today_article_count,
    article_volume_30d_avg: spike.article_volume_30d_avg,

    source_tier: 3,
    unit: 'score',
    asof: todayStr,
    confidence,
    null_reason: zResult.null_reason,
  };
}
