/**
 * Signal Detector — Task 063 (updated Task 133: adaptive thresholds)
 *
 * Pure domain function that identifies market signals from a price snapshot
 * and optional context (news, report dates, custom thresholds).
 *
 * All logic is threshold-based and side-effect-free — no I/O, no imports
 * from infrastructure.
 *
 * Default thresholds (configurable via SignalContext.watchlistThresholds):
 *   - price_drop   : price change <= -7 %
 *   - price_surge  : price change >= +5 %
 *   - volume_spike : volume >= 2× avgVolume
 *   - report_new   : latestReportDate within last 24 hours
 *   - news_mention : recentNews array has at least one entry
 *
 * Adaptive thresholds (Task 133):
 *   When SignalContext.volatility is provided, thresholds are derived from
 *   per-stock historical volatility via computeStockVolatility().
 *   Priority order:
 *     1. watchlistThresholds (explicit override — highest priority)
 *     2. volatility.adaptiveDropPct / adaptiveRisePct / adaptiveVolumeMult
 *     3. fixed defaults (fallback)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────────────────

import type { StockVolatility } from "./volatilityCalculator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SignalType =
  | "price_drop"
  | "price_surge"
  | "volume_spike"
  | "report_new"
  | "news_mention"
  | "prediction_market"
  | "supply_chain"
  | "legal_risk"
  | "policy_change"
  | "bond_maturity"
  | "public_contract"
  | "credit_flow"
  | "insider_trading"
  | "climate_event"
  /** Power grid / energy market signal (Task 261) */
  | "energy_grid"
  | "crisis_event"
  | "pharma_event"
  /** TA scan signals — FU-ALERT-COWRITE-SCHEDULER-JOBS */
  | "ta_overbought"
  | "ta_oversold"
  | "ta_bb_breakout_up"
  | "ta_bb_breakout_down"
  /** Foreign flow institutional signal */
  | "foreign_flow";

export type Severity = "low" | "medium" | "high" | "critical" | "warning";

/**
 * A real-time price + volume snapshot for one stock.
 *
 * @property actionCode    - Stock ticker (e.g. "VCB", "HPG")
 * @property price         - Current price in VND
 * @property previousPrice - Previous close price in VND
 * @property volume        - Today's traded volume (shares)
 * @property avgVolume     - 20-day average daily volume (shares)
 */
export interface MarketSnapshot {
  actionCode: string;
  price: number;
  previousPrice: number;
  volume: number;
  avgVolume: number;
}

/**
 * Crisis event context for crisis_event signal injection.
 * Produced by crisisPatternDetector.detectCrisisPatterns().
 */
export interface CrisisEventContext {
  detected: boolean;
  severity: "low" | "medium" | "high" | "critical";
  crisisType: string;
  matchedPatterns: string[];
  velocityRatio: number;
}

/**
 * Optional context that enriches signal detection with news, reports,
 * and per-stock configurable thresholds.
 */
export interface SignalContext {
  /** Recent news articles mentioning this stock */
  recentNews?: { title: string; source: string }[];
  /** ISO 8601 timestamp of the most recently published BCTC report */
  latestReportDate?: string;
  /**
   * Per-watchlist thresholds that override defaults (and adaptive thresholds).
   * Highest priority — if provided, overrides both defaults and volatility.
   */
  watchlistThresholds?: {
    /** Drop threshold in percent, e.g. -5 means -5 % (negative number) */
    dropPct: number;
    /** Rise threshold in percent, e.g. 5 means +5 % */
    risePct: number;
    /** Minimum impact score for news/macro signals (0-10) */
    impactScore: number;
  };
  /**
   * Per-stock historical volatility from computeStockVolatility().
   * When provided, adaptiveDropPct / adaptiveRisePct / adaptiveVolumeMult
   * replace the fixed defaults (unless watchlistThresholds also provided).
   */
  volatility?: StockVolatility;
  /** Crisis event detected by crisisPatternDetector (Task 263) */
  crisisEvent?: CrisisEventContext;
  /** Override current time for testing (avoids ATC window flakes). */
  _now?: Date;
}

/**
 * A detected market signal.
 *
 * @property type              - Category of signal
 * @property severity          - Qualitative urgency: low | medium | high | critical
 * @property actionCode        - Stock ticker this signal applies to
 * @property message           - Human-readable description of the signal
 * @property confidence        - 0..1 estimate of reliability
 * @property detectedAt        - ISO 8601 timestamp when the signal was generated
 * @property confidence_score  - (optional) 0–100 confidence after validation (Task 231)
 * @property validated_at      - (optional) ISO 8601 timestamp of validation (Task 231)
 */
export interface Signal {
  type: SignalType;
  severity: Severity;
  actionCode: string;
  message: string;
  confidence: number;
  detectedAt: string;
  confidence_score?: number;  // 0–100, set by validator
  validated_at?: string;      // ISO 8601, set by validator
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DROP_PCT = -7;   // -7 % triggers price_drop (VN circuit breaker significance)
const DEFAULT_RISE_PCT = 5;    // +5 % triggers price_surge
const VOLUME_SPIKE_MULTIPLIER = 2; // 2× avgVolume triggers volume_spike
const REPORT_FRESH_HOURS = 24; // reports within 24 h count as "new"

/**
 * Determine severity for a price change signal.
 *
 * | |change %| | severity  |
 * |------------|-----------|
 * | < 5 %      | low       |
 * | 5 – 6.9 %  | medium    |
 * | 7 – 14.9 % | high      |
 * | ≥ 15 %     | critical  |
 *
 * Note: VN circuit breakers fire at ±7%, so 7%+ moves are market-significant.
 */
function priceSeverity(absPct: number): Severity {
  if (absPct >= 15) return "critical";
  if (absPct >= 7) return "high";
  if (absPct >= 5) return "medium";
  return "low";
}

/**
 * Returns true if `isoDate` is within the last `hours` hours.
 */
function isWithinHours(isoDate: string, hours: number): boolean {
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return false;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return ts >= cutoff;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect market signals for a stock snapshot.
 *
 * Returns an array of Signal objects — may be empty if no thresholds are met.
 * Multiple signals can be returned simultaneously.
 *
 * @param snapshot - Current price / volume data for the stock
 * @param context  - Optional news, report timestamps, and custom thresholds
 * @returns        - All triggered signals (empty array if none)
 */
export function detectSignals(
  snapshot: MarketSnapshot,
  context?: SignalContext,
): Signal[] {
  const signals: Signal[] = [];
  const now = new Date().toISOString();
  const { actionCode, price, previousPrice, volume, avgVolume } = snapshot;

  // ── Threshold resolution (priority: watchlist > adaptive > default) ─────
  const thresholds = context?.watchlistThresholds;
  const volatility = context?.volatility;

  const dropThreshold =
    thresholds?.dropPct ??
    volatility?.adaptiveDropPct ??
    DEFAULT_DROP_PCT;

  const riseThreshold =
    thresholds?.risePct ??
    volatility?.adaptiveRisePct ??
    DEFAULT_RISE_PCT;

  const volumeMultiplier =
    volatility?.adaptiveVolumeMult ?? VOLUME_SPIKE_MULTIPLIER;

  // ── 1. Price change % ────────────────────────────────────────────────────
  const changePct =
    previousPrice !== 0 ? ((price - previousPrice) / previousPrice) * 100 : 0;

  if (changePct <= dropThreshold) {
    const absPct = Math.abs(changePct);
    signals.push({
      type: "price_drop",
      severity: priceSeverity(absPct),
      actionCode,
      message: `${actionCode} dropped ${absPct.toFixed(2)}% (${previousPrice.toLocaleString()} → ${price.toLocaleString()} VND)`,
      confidence: Math.min(0.95, 0.6 + absPct / 100),
      detectedAt: now,
    });
  } else if (changePct >= riseThreshold) {
    const absPct = Math.abs(changePct);
    signals.push({
      type: "price_surge",
      severity: priceSeverity(absPct),
      actionCode,
      message: `${actionCode} surged +${absPct.toFixed(2)}% (${previousPrice.toLocaleString()} → ${price.toLocaleString()} VND)`,
      confidence: Math.min(0.95, 0.6 + absPct / 100),
      detectedAt: now,
    });
  }

  // ── 2. Volume spike ──────────────────────────────────────────────────────
  // Suppress during VN ATC closing auction (14:30-15:00 VN = 07:30-08:00 UTC)
  // AND post-close volume flush (15:00-15:35 VN = 08:00-08:35 UTC).
  // ATC concentrates end-of-day orders; post-close flush drains residual orders —
  // both produce uniform false-positive spikes (report #1083, sprint 142).
  const utcNow = context?._now ?? new Date();
  const utcH = utcNow.getUTCHours();
  const utcM = utcNow.getUTCMinutes();
  const isAtcWindow = (utcH === 7 && utcM >= 30) || (utcH === 8 && utcM <= 35);

  if (!isAtcWindow && avgVolume > 0 && volume >= avgVolume * volumeMultiplier) {
    const multiplier = volume / avgVolume;
    signals.push({
      type: "volume_spike",
      severity: multiplier >= 5 ? "critical" : multiplier >= 3 ? "high" : "medium",
      actionCode,
      message: `${actionCode} volume spike: ${multiplier.toFixed(1)}× average (${volume.toLocaleString()} vs avg ${avgVolume.toLocaleString()})`,
      confidence: 0.85,
      detectedAt: now,
    });
  }

  // ── 3. New report ────────────────────────────────────────────────────────
  if (
    context?.latestReportDate &&
    isWithinHours(context.latestReportDate, REPORT_FRESH_HOURS)
  ) {
    signals.push({
      type: "report_new",
      severity: "medium",
      actionCode,
      message: `${actionCode} published a new BCTC report (${context.latestReportDate})`,
      confidence: 1.0,
      detectedAt: now,
    });
  }

  // ── 4. News mentions ─────────────────────────────────────────────────────
  if (context?.recentNews && context.recentNews.length > 0) {
    const count = context.recentNews.length;
    const sample = context.recentNews[0]!;
    signals.push({
      type: "news_mention",
      severity: count >= 5 ? "high" : count >= 2 ? "medium" : "low",
      actionCode,
      message: `${actionCode} mentioned in ${count} recent article(s) — latest: "${sample.title}" (${sample.source})`,
      confidence: 0.75,
      detectedAt: now,
    });
  }

  // ── 5. Crisis event (Task 266) ───────────────────────────────────────────
  if (context?.crisisEvent?.detected) {
    const crisis = context.crisisEvent;
    const patternsDisplay = crisis.matchedPatterns.length <= 5
      ? crisis.matchedPatterns.join(", ")
      : `${crisis.matchedPatterns.slice(0, 5).join(", ")} +${crisis.matchedPatterns.length - 5} more`;
    signals.push({
      type: "crisis_event",
      severity: crisis.severity,
      actionCode,
      message: `${actionCode} crisis detected: ${crisis.crisisType} — patterns: ${patternsDisplay} (velocity ${crisis.velocityRatio.toFixed(1)}×)`,
      confidence: 0.9,
      detectedAt: now,
    });
  }

  return signals;
}
