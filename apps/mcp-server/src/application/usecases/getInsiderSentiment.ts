/**
 * Application Use Case — Get Insider Sentiment (P0-5-INSIDER-SENTIMENT)
 *
 * Orchestrates: store queries → domain computations → structured response.
 *
 * Implements FR-1 through FR-4 of the P0-5 spec:
 *   FR-1: Net buy-sell value per window (30d / 90d / 180d) in billion VND.
 *   FR-2: Free-float-normalized score [-1, +1] using market_cap_bn proxy.
 *   FR-3: ACCUMULATION / DISTRIBUTION / MIXED / NEUTRAL classification label.
 *   FR-4: Large-deal flags (>10B VND threshold by default).
 *
 * Gauge-Readiness (P1 Fear & Greed): `net_sentiment_score` is the insider leg.
 * MANDATORY QA hard gate: `normalization_basis: 'market_cap_proxy'` always present.
 *
 * Scope:
 *   - code supplied  → per-ticker signal
 *   - code omitted   → market-wide aggregate across watchlist (sums all buy/sell)
 *
 * DDD layer: application/usecases — orchestrates domain + infrastructure.
 *
 * @module application/usecases/getInsiderSentiment
 */

import type { Database } from "bun:sqlite";
import {
  computeWindowNetBuySell,
  computeNormalizedScore,
  computeInsiderLabel,
  computeLargeDeals,
  type InsiderTxRow,
  type InsiderLabel,
} from "../../domain/services/market-data/insiderSentimentCalculator.js";
import {
  getInsiderTxForSentiment,
  getLatestMarketCapBn,
  getMarketCapBnBulk,
  getWatchlistCodes,
} from "../../infrastructure/db/insiderSentimentStore.js";
import { logger } from "../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Response type — Gauge-Readiness 6-field contract on net_sentiment_score
// ---------------------------------------------------------------------------

export interface InsiderSentimentResponse {
  /** Scope: 'ticker' when code supplied; 'market_wide' when omitted. */
  scope: 'ticker' | 'market_wide';

  /** Ticker code (only present when scope='ticker'). */
  code?: string;

  // ── FR-1: Net buy-sell by window (billion VND) ──────────────────────────

  /** Net buy-sell for last 30 days (billion VND); null when no valid transactions. */
  net_buy_sell_30d_bn_vnd: number | null;

  /** Net buy-sell for last 90 days (billion VND); null when no valid transactions. */
  net_buy_sell_90d_bn_vnd: number | null;

  /** Net buy-sell for last 180 days (billion VND); null when no valid transactions. */
  net_buy_sell_180d_bn_vnd: number | null;

  /**
   * Count of distinct from_date values with valid (price>0, vol>0) buy/sell rows
   * per window. Allows QA to verify actual data availability.
   */
  data_window_days: {
    d30: number;
    d90: number;
    d180: number;
  };

  // ── FR-2: Normalized score (gauge-ready scalar) ──────────────────────────

  /**
   * Net insider sentiment score: net_buy_sell_90d / market_cap_bn, clamped [-1, +1].
   * null when market_cap_bn IS NULL for the ticker (cannot normalize without denominator).
   */
  net_sentiment_score: number | null;

  /**
   * MANDATORY QA hard gate (NFR-P05-5): always 'market_cap_proxy'.
   * Signals that market_cap_bn is used as a free-float proxy, NOT true free-float.
   */
  normalization_basis: 'market_cap_proxy';

  // ── FR-3: Label ──────────────────────────────────────────────────────────

  /** Insider activity classification (ACCUMULATION / DISTRIBUTION / MIXED / NEUTRAL). */
  insider_label: InsiderLabel;

  // ── FR-4: Large deal flags ───────────────────────────────────────────────

  /** True when any single 30d deal exceeded the threshold (default 10B VND). */
  large_deals_30d: boolean;

  /** Count of large deals in 30d window. */
  large_deal_count_30d: number;

  /** Value of the largest single deal in 30d window (billion VND); null when none. */
  largest_deal_value_30d_bn_vnd: number | null;

  // ── Gauge-Readiness 6-field contract ────────────────────────────────────

  /** Gauge-ready primary scalar (= net_sentiment_score). P1 Fear & Greed insider leg. */
  value: number | null;

  /** Unit descriptor for the gauge scalar. */
  unit: 'score';

  /** ISO date this response represents (today's date, UTC). */
  asof: string;

  /**
   * Source tier: 1 (Tier 1 — SSC official portal congbothongtin.ssc.gov.vn).
   * Insider disclosures are regulatory filings.
   */
  source_tier: 1;

  /**
   * Confidence in net_sentiment_score.
   * 0.8 — score is non-null (90d data + market_cap available).
   * 0.4 — 90d data present but score null (market_cap unavailable).
   * null — no valid buy/sell transactions in 90d window.
   */
  confidence: number | null;

  /** Human-readable reason when net_sentiment_score is null. */
  null_reason: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compute ISO date string for the start of a lookback window. */
function computeSinceDate(daysAgo: number, nowMs: number): string {
  const d = new Date(nowMs - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Filter rows to those with fromDate >= cutoff (string comparison on YYYY-MM-DD is safe). */
function filterToWindow(rows: InsiderTxRow[], cutoff: string): InsiderTxRow[] {
  return rows.filter((r) => r.fromDate >= cutoff);
}

// ---------------------------------------------------------------------------
// Use case entry point
// ---------------------------------------------------------------------------

/**
 * Compute insider transaction net sentiment.
 *
 * @param db    - SQLite database (supports injection for tests).
 * @param code  - Optional ticker; omit for market-wide aggregation across watchlist.
 * @param nowMs - Optional: override now (epoch ms) for deterministic tests.
 */
export async function getInsiderSentiment(
  db: Database,
  code?: string,
  nowMs?: number,
): Promise<InsiderSentimentResponse> {
  const now = nowMs ?? Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);

  // Compute window cutoff date strings (used for both store query and in-memory filter)
  const sinceDate180 = computeSinceDate(180, now);
  const sinceDate90  = computeSinceDate(90, now);
  const sinceDate30  = computeSinceDate(30, now);

  // ── Resolve codes ─────────────────────────────────────────────────────────

  const scope: 'ticker' | 'market_wide' = code ? 'ticker' : 'market_wide';
  let resolvedCode: string | undefined;
  let codes: string[] | undefined;

  if (code) {
    resolvedCode = code.toUpperCase().trim();
    codes = [resolvedCode];
  } else {
    const wl = getWatchlistCodes(db);
    codes = wl.length > 0 ? wl : undefined;
  }

  // ── Fetch all rows in 180d window (widest; sub-windows filtered in memory) ─

  const rows180 = getInsiderTxForSentiment(db, {
    ...(codes !== undefined ? { codes } : {}),
    sinceDate: sinceDate180,
  });

  // Sub-window rows (in-memory filtering — avoids multiple DB round-trips)
  const rows90 = filterToWindow(rows180, sinceDate90);
  const rows30 = filterToWindow(rows180, sinceDate30);

  // ── FR-1: Compute net buy-sell per window ─────────────────────────────────

  // Warn on price=0 once (from the widest set; sub-sets are subsets of the same rows)
  const w180 = computeWindowNetBuySell(rows180, (msg) => logger.warn(msg));
  const w90  = computeWindowNetBuySell(rows90);   // no re-warn (same rows subset)
  const w30  = computeWindowNetBuySell(rows30);

  // ── FR-2: Fetch market_cap_bn + compute normalized score ─────────────────

  let totalMarketCapBn: number | null;

  if (scope === 'ticker') {
    // Per-ticker: latest market_cap_bn for that ticker
    totalMarketCapBn = getLatestMarketCapBn(db, resolvedCode!);
    if (totalMarketCapBn === null) {
      logger.info(
        `[insider-sentiment] market_cap_bn IS NULL for ${resolvedCode}: net_sentiment_score=null`,
      );
    }
  } else {
    // Market-wide: sum of market_cap_bn across all watchlist tickers with non-null value
    const capMap = getMarketCapBnBulk(db, codes ?? []);
    let sum = 0;
    let hasAny = false;
    for (const [, cap] of capMap) {
      if (cap !== null && cap > 0) {
        sum += cap;
        hasAny = true;
      }
    }
    totalMarketCapBn = hasAny ? sum : null;
  }

  const normResult = computeNormalizedScore(w90.netBnVnd, totalMarketCapBn);

  // ── FR-3: Derive label ────────────────────────────────────────────────────

  const insider_label = computeInsiderLabel(w30.netBnVnd, w90.netBnVnd);

  // ── FR-4: Large deal flags (30d window) ──────────────────────────────────

  const largeDeals = computeLargeDeals(rows30);

  // ── Confidence ───────────────────────────────────────────────────────────

  const confidence: number | null =
    normResult.score !== null
      ? 0.8   // score computable: 90d data + market_cap available
      : w90.distinctDates > 0
        ? 0.4 // 90d data present but cannot normalize (market_cap_bn null)
        : null; // no valid buy/sell data in 90d window

  // ── Assemble response ─────────────────────────────────────────────────────

  const response: InsiderSentimentResponse = {
    scope,

    ...(scope === 'ticker' ? { code: resolvedCode as string } : {}),

    net_buy_sell_30d_bn_vnd:  w30.netBnVnd,
    net_buy_sell_90d_bn_vnd:  w90.netBnVnd,
    net_buy_sell_180d_bn_vnd: w180.netBnVnd,

    data_window_days: {
      d30:  w30.distinctDates,
      d90:  w90.distinctDates,
      d180: w180.distinctDates,
    },

    net_sentiment_score: normResult.score,
    normalization_basis: 'market_cap_proxy', // MANDATORY — must never be omitted

    insider_label,

    large_deals_30d:                largeDeals.large_deals_30d,
    large_deal_count_30d:           largeDeals.large_deal_count_30d,
    largest_deal_value_30d_bn_vnd:  largeDeals.largest_deal_value_30d_bn_vnd,

    // Gauge-Readiness 6-field contract
    value:       normResult.score,
    unit:        'score',
    asof:        todayStr,
    source_tier: 1,
    confidence,
    null_reason: normResult.null_reason,
  };

  return response;
}
