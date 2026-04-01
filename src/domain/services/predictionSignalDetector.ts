/**
 * Prediction Signal Detector — domain types (Task 164 stub)
 *
 * The full implementation belongs to Task 166.  This file exports only the
 * `PredictionMarket` and `PredictionSignal` interfaces so that the
 * infrastructure fetcher (`polymarket.ts`) and other consumers compile without
 * depending on the Task 166 branch being merged first.
 *
 * DDD rules:
 *  - ZERO imports from infrastructure/ or application/
 *  - All types are pure data transfer objects
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
 * @property tags               - Category tags as string array
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
 * Full implementation in Task 166.
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
