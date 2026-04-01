/**
 * Prediction Signal Detector — Task 166
 *
 * Pure domain service that detects market signals from Polymarket prediction
 * market snapshots. Compares current vs previous snapshot to generate 4 signal
 * types: volume_spike, probability_shift, insider_timing, sentiment_divergence.
 *
 * DDD rules:
 *  - ZERO imports from infrastructure/ or application/
 *  - This file owns the `PredictionMarket` interface (fetcher imports from here)
 *  - All logic is pure / side-effect-free
 *
 * Layer: domain/services
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Prediction-market–specific signal type identifiers. */
export type PredictionSignalType =
  | "volume_spike"
  | "probability_shift"
  | "insider_timing"
  | "sentiment_divergence";

/**
 * Canonical domain model for a Polymarket prediction market.
 * The fetcher (`polymarket.ts`) imports and returns this type.
 *
 * @property id                 - Polymarket condition_id (stable identifier)
 * @property question           - Free-text market question
 * @property endDate            - ISO 8601 market expiration date
 * @property yesPrice           - 0.0–1.0 probability of YES outcome
 * @property noPrice            - 0.0–1.0 probability of NO outcome
 * @property volume24h          - USD traded in the past 24 hours
 * @property volumeTotal        - USD all-time total traded volume
 * @property liquidity          - Current liquidity pool in USD
 * @property lastTradePrice     - Most recent trade price
 * @property uniqueWalletsCount - Distinct wallet addresses that traded
 * @property tags               - Category tags
 * @property fetchedAt          - ISO 8601 timestamp of this fetch
 */
export interface PredictionMarket {
  id: string;
  question: string;
  endDate: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  lastTradePrice: number;
  uniqueWalletsCount: number;
  tags: string[];
  fetchedAt: string;
}

/**
 * A detected prediction market signal.
 *
 * @property marketId           - Polymarket condition_id
 * @property marketQuestion     - The prediction question text
 * @property signalType         - Category of signal
 * @property severity           - Qualitative urgency: low | medium | high | critical
 * @property yesPricePrev       - Previous YES probability (null if no prior snapshot)
 * @property yesPriceCurr       - Current YES probability
 * @property volume24h          - 24-hour USD volume at detection time
 * @property uniqueWalletsCount - Distinct wallets at detection time
 * @property confidence         - [0.1, 0.95] reliability estimate
 * @property reasoning          - Human-readable explanation
 * @property detectedAt         - ISO 8601 timestamp of signal generation
 */
export interface PredictionSignal {
  marketId: string;
  marketQuestion: string;
  signalType: PredictionSignalType;
  severity: "low" | "medium" | "high" | "critical";
  yesPricePrev: number | null;
  yesPriceCurr: number;
  volume24h: number;
  uniqueWalletsCount: number;
  confidence: number;
  reasoning: string;
  detectedAt: string;
}

/**
 * Thresholds that govern signal detection.
 *
 * @property volumeSpikeThresholdUsd  - 24h volume (USD) required to trigger volume_spike (default 50000)
 * @property probabilityShiftPct      - Minimum YES-price movement in percentage points to trigger
 *                                      probability_shift (default 5 → 0.05 as decimal)
 * @property minUniqueWallets         - Wallets below this count → downgrade all signals to "low"
 *                                      as a wash-trading filter (default 10)
 */
export interface PredictionSignalConfig {
  volumeSpikeThresholdUsd: number;
  probabilityShiftPct: number;
  minUniqueWallets: number;
}

/**
 * Latest cascade sentiment entry for one stock code.
 * Injected by the scheduler layer — pre-fetched from the DB.
 */
export interface RecentSentimentEntry {
  actionCode: string;
  sentiment: "bullish" | "bearish" | "neutral";
  /** 0–1 confidence of this sentiment classification */
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum wallet increase (current − previous) to qualify for insider_timing.
 * REQ-020: "wallet count increased by >= 3" between snapshots.
 */
const INSIDER_WALLET_INCREASE = 3;

/**
 * Denominator for shiftMagnitude normalisation.
 * A 20pp shift (0.20) maps shiftMagnitude to 1.0 (maximum).
 */
const SHIFT_NORMALISER = 0.20;

/**
 * yesPrice threshold for high-conviction side.
 * A market at >= 0.65 or <= 0.35 is considered a strong directional bet.
 */
const HIGH_CONVICTION_THRESHOLD = 0.65;

/** Sentiment confidence floor for sentiment_divergence to fire. */
const SENTIMENT_CONFIDENCE_FLOOR = 0.6;

/** Confidence threshold that separates severity "medium" from "high" for sentiment_divergence. */
const SENTIMENT_HIGH_SEVERITY_THRESHOLD = 0.7;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamps `value` to the range [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes the confidence score per the REQ-020 formula.
 *
 * ```
 * walletQuality  = min(1.0, uniqueWalletsCount / 100)
 * shiftMagnitude = min(1.0, |yesPriceCurr - yesPricePrev| / 0.20)
 * confidence     = clamp(walletQuality * 0.5 + shiftMagnitude * 0.5, 0.1, 0.95)
 * ```
 *
 * When there is no previous snapshot, shiftMagnitude = 0.
 *
 * @param uniqueWalletsCount - Current market's uniqueWalletsCount
 * @param yesPriceCurr       - Current YES probability
 * @param yesPricePrev       - Previous YES probability (null → 0 shift)
 */
function computeConfidence(
  uniqueWalletsCount: number,
  yesPriceCurr: number,
  yesPricePrev: number | null,
): number {
  const walletQuality = Math.min(1.0, uniqueWalletsCount / 100);
  const shiftMagnitude =
    yesPricePrev !== null
      ? Math.min(1.0, Math.abs(yesPriceCurr - yesPricePrev) / SHIFT_NORMALISER)
      : 0;
  return clamp(walletQuality * 0.5 + shiftMagnitude * 0.5, 0.1, 0.95);
}

/**
 * Applies the wash-trading downgrade filter.
 * When uniqueWalletsCount < minUniqueWallets, all signals for that market are
 * forcibly set to severity "low".
 */
function applyWalletDowngrade(
  signals: PredictionSignal[],
  uniqueWalletsCount: number,
  minUniqueWallets: number,
): PredictionSignal[] {
  if (uniqueWalletsCount < minUniqueWallets) {
    return signals.map((s) => ({ ...s, severity: "low" as const }));
  }
  return signals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-market signal detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects all signals for a single prediction market.
 * Returns raw signals before the wallet downgrade filter is applied.
 */
function detectSignalsForMarket(
  current: PredictionMarket,
  prevMap: Map<string, PredictionMarket>,
  config: PredictionSignalConfig,
  hasRecentNews: Set<string>,
  recentSentiments: RecentSentimentEntry[],
  detectedAt: string,
): PredictionSignal[] {
  const prev = prevMap.get(current.id) ?? null;
  const yesPricePrev = prev !== null ? prev.yesPrice : null;
  const confidence = computeConfidence(
    current.uniqueWalletsCount,
    current.yesPrice,
    yesPricePrev,
  );

  const signals: PredictionSignal[] = [];

  const base: Omit<PredictionSignal, "signalType" | "severity" | "confidence" | "reasoning"> = {
    marketId: current.id,
    marketQuestion: current.question,
    yesPricePrev,
    yesPriceCurr: current.yesPrice,
    volume24h: current.volume24h,
    uniqueWalletsCount: current.uniqueWalletsCount,
    detectedAt,
  };

  // ── 1. volume_spike ──────────────────────────────────────────────────────
  if (current.volume24h >= config.volumeSpikeThresholdUsd) {
    signals.push({
      ...base,
      signalType: "volume_spike",
      severity: "low",
      confidence,
      reasoning: `Volume spike detected: $${current.volume24h.toLocaleString()} in 24h exceeds threshold $${config.volumeSpikeThresholdUsd.toLocaleString()}. Market: "${current.question}"`,
    });
  }

  // ── 2. probability_shift ─────────────────────────────────────────────────
  if (yesPricePrev !== null) {
    const shiftAbs = Math.abs(current.yesPrice - yesPricePrev);
    const shiftPct = shiftAbs * 100; // convert to percentage points
    if (shiftPct >= config.probabilityShiftPct) {
      const direction = current.yesPrice > yesPricePrev ? "up" : "down";
      signals.push({
        ...base,
        signalType: "probability_shift",
        severity: "medium",
        confidence,
        reasoning: `Probability shifted ${direction} by ${shiftPct.toFixed(2)}pp: ${(yesPricePrev * 100).toFixed(1)}% → ${(current.yesPrice * 100).toFixed(1)}%. Market: "${current.question}"`,
      });

      // ── 3. insider_timing (conditional on probability_shift) ───────────────
      const walletIncrease =
        prev !== null
          ? current.uniqueWalletsCount - prev.uniqueWalletsCount
          : 0;
      const notInNews = !hasRecentNews.has(current.id);

      if (walletIncrease >= INSIDER_WALLET_INCREASE && notInNews) {
        signals.push({
          ...base,
          signalType: "insider_timing",
          severity: "high",
          confidence,
          reasoning: `Insider timing pattern: probability shifted ${shiftPct.toFixed(2)}pp AND wallet count increased by ${walletIncrease} (prev: ${prev!.uniqueWalletsCount} → curr: ${current.uniqueWalletsCount}) without corresponding public news. Market: "${current.question}"`,
        });
      }
    }
  }

  // ── 4. sentiment_divergence ──────────────────────────────────────────────
  // Fires when market probability is high (>= 0.65) OR low (<= 0.35, i.e. bearish side)
  // AND recent stock sentiment has confidence >= SENTIMENT_CONFIDENCE_FLOOR.
  const isHighConviction =
    current.yesPrice >= HIGH_CONVICTION_THRESHOLD ||
    current.yesPrice <= (1 - HIGH_CONVICTION_THRESHOLD);

  if (isHighConviction && recentSentiments.length > 0) {
    const relevantSentiment = recentSentiments.find(
      (s) => s.confidence >= SENTIMENT_CONFIDENCE_FLOOR,
    );
    if (relevantSentiment !== undefined) {
      const sentimentConfidence = relevantSentiment.confidence;
      const baseSeverity: "medium" | "high" =
        sentimentConfidence >= SENTIMENT_HIGH_SEVERITY_THRESHOLD ? "high" : "medium";
      signals.push({
        ...base,
        signalType: "sentiment_divergence",
        severity: baseSeverity,
        confidence: computeConfidence(current.uniqueWalletsCount, current.yesPrice, yesPricePrev),
        reasoning: `Sentiment divergence: market at ${(current.yesPrice * 100).toFixed(1)}% YES probability while ${relevantSentiment.actionCode} has ${relevantSentiment.sentiment} sentiment (confidence ${(sentimentConfidence * 100).toFixed(0)}%). Market: "${current.question}"`,
      });
    }
  }

  return signals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects prediction market signals by comparing current vs previous snapshots.
 *
 * Pure function — zero I/O. The `hasRecentNews` and `recentSentiments` parameters
 * are pre-fetched by the application/scheduler layer and injected here.
 *
 * Signal types:
 *  - `volume_spike`         : 24h volume >= volumeSpikeThresholdUsd
 *  - `probability_shift`    : |yesPrice change| >= probabilityShiftPct / 100
 *  - `insider_timing`       : probability_shift AND wallet increase >= 3 AND no recent news
 *  - `sentiment_divergence` : high-conviction market + matching stock sentiment
 *
 * Wash-trading filter: when uniqueWalletsCount < minUniqueWallets, all signals
 * for that market are downgraded to severity "low".
 *
 * Confidence formula:
 * ```
 * walletQuality  = min(1.0, uniqueWalletsCount / 100)
 * shiftMagnitude = min(1.0, |yesPriceCurr - yesPricePrev| / 0.20)   // 0 if no prev
 * confidence     = clamp(walletQuality * 0.5 + shiftMagnitude * 0.5, 0.1, 0.95)
 * ```
 *
 * @param current          - Markets fetched in this poll cycle
 * @param previous         - Markets from the previous stored snapshot (may be empty)
 * @param config           - Signal detection thresholds
 * @param hasRecentNews    - Set of market IDs that have recent news in RAG within 2h
 * @param recentSentiments - Latest cascade sentiment per stock code (from cascade engine)
 * @returns                - All triggered signals across all markets
 */
export function detectPredictionSignals(
  current: PredictionMarket[],
  previous: PredictionMarket[],
  config: PredictionSignalConfig,
  hasRecentNews: Set<string>,
  recentSentiments: RecentSentimentEntry[],
): PredictionSignal[] {
  if (current.length === 0) return [];

  // Build lookup map from previous snapshot
  const prevMap = new Map<string, PredictionMarket>(
    previous.map((m) => [m.id, m]),
  );

  const detectedAt = new Date().toISOString();
  const allSignals: PredictionSignal[] = [];

  for (const market of current) {
    const rawSignals = detectSignalsForMarket(
      market,
      prevMap,
      config,
      hasRecentNews,
      recentSentiments,
      detectedAt,
    );

    // Apply wash-trading downgrade filter per market
    const filtered = applyWalletDowngrade(
      rawSignals,
      market.uniqueWalletsCount,
      config.minUniqueWallets,
    );

    allSignals.push(...filtered);
  }

  return allSignals;
}
