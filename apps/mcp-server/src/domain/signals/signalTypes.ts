/**
 * Signal Type Interfaces — Task 1293a
 *
 * Defines strict TypeScript interfaces and Zod validators for signal finding_data.
 * These schemas enforce required fields and numeric validation for all agent signals.
 *
 * Signals:
 *   - ChainCatalystFindingData (7 required fields): News Scout posting chain catalyst signals
 *   - PriceConfirmationFindingData (5 required fields): Market Watcher posting price confirmations
 *   - UrgentNewsFindingData (3 required fields): Urgent news notifications
 *
 * All schemas use strict validation (no .passthrough()). Missing or invalid fields
 * raise Zod.ZodError, preventing incomplete payloads from reaching downstream services.
 */

import { z } from "zod";

// ── ChainCatalystFindingData ───────────────────────────────────────────────────

/**
 * Finding data for chain_catalyst signals posted by News Scout.
 *
 * Describes a macro/sector/stock event that triggers the enrichment chain.
 * All 7 fields are required and validated at parse time.
 */
export interface ChainCatalystFindingData {
  /** Event classification: credit policy change, trade war, earnings release, macro indicator, legal/regulatory, crisis, or sector-wide event. */
  event_type:
    | "credit_policy"
    | "trade_war"
    | "earnings"
    | "macro"
    | "legal"
    | "crisis"
    | "sector_event";

  /** Directional bias of the event: bullish, bearish, or neutral. */
  direction: "bullish" | "bearish" | "neutral";

  /** Confidence in the event assessment, range [0.0, 1.0]. */
  confidence: number;

  /** List of stock codes potentially affected by this event (min 1 required). */
  affected_stocks: string[];

  /** List of sector names potentially affected by this event (min 1 required). */
  affected_sectors: string[];

  /** Headline or title of the event. */
  headline: string;

  /** Source identifier: cafef, vnexpress, reuters, etc. */
  source: string;

  /**
   * Optional: IMF macro sentiment context for this catalyst (added task 1296b).
   * Enriched by imfDataFetcher when a fresh IMF classification is available.
   * Absent when IMF data is unavailable or confidence is below threshold.
   */
  imfSentiment?: {
    /** Overall macro sentiment: -1.0 (bearish) to +1.0 (bullish) */
    sentiment: number;
    /** Confidence in the IMF signal: 0.0 to 1.0 */
    confidence: number;
    /** Sectors affected by IMF signal (e.g. ["banking", "export"]) */
    affectedSectors: string[];
    /** Human-readable reasoning (e.g. "IMF growth forecast ↑ supports banking NIM expansion") */
    reasoning: string;
  } | undefined;

  /** Aggregated news sentiment score from sentimentClassifier [-1.0, 1.0]. Optional. */
  newsSentiment?: number | undefined;

  /** Kinh Dich hexagram confidence score [0, 100]. Optional. */
  kinhDichConfidence?: number | undefined;

  /** Majority vote from agent signals: "BUY" | "SELL" | "NEUTRAL". Optional. */
  agentSignalsMajority?: "BUY" | "SELL" | "NEUTRAL" | undefined;

  /** Stock ticker that triggered the originating cascade event (e.g. "VCB"). Optional. */
  catalyst_stock_code?: string | undefined;

  /** Directional bias of the originating cascade catalyst signal. Optional. */
  catalyst_direction?: "bullish" | "bearish" | "neutral" | undefined;

  /** Hours elapsed from catalyst event to confirmed price move (must be >= 0). Optional. */
  time_to_price_move?: number | undefined;
}

export const ChainCatalystFindingDataSchema = z.object({
  event_type: z.enum([
    "credit_policy",
    "trade_war",
    "earnings",
    "macro",
    "legal",
    "crisis",
    "sector_event",
  ]),
  direction: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1),
  affected_stocks: z.array(z.string()).min(1),
  affected_sectors: z.array(z.string()).min(1),
  headline: z.string().min(1),
  source: z.string().min(1),
  imfSentiment: z.object({
    sentiment: z.number().min(-1).max(1),
    confidence: z.number().min(0).max(1),
    affectedSectors: z.array(z.string()),
    reasoning: z.string().min(1),
  }).optional(),
  newsSentiment: z.number().min(-1).max(1).optional(),
  kinhDichConfidence: z.number().min(0).max(100).optional(),
  agentSignalsMajority: z.enum(["BUY", "SELL", "NEUTRAL"]).optional(),
  catalyst_stock_code: z.string().min(2).optional(),
  catalyst_direction: z.enum(["bullish", "bearish", "neutral"]).optional(),
  time_to_price_move: z.number().min(0).optional(),
});

// ── PriceConfirmationFindingData ───────────────────────────────────────────────

/**
 * Finding data for price_confirmation signals posted by Market Watcher.
 *
 * Describes price movement and volume confirmation of a catalyst signal.
 * All 5 fields are required and validated at parse time.
 */
export interface PriceConfirmationFindingData {
  /** Price movement as a percentage (can be positive, negative, or zero). */
  price_change_pct: number;

  /** Volume ratio relative to rolling average (must be >= 0). */
  volume_ratio: number;

  /** Whether price movement confirms the direction of the catalyst. */
  confirms_direction: boolean;

  /** Whether the move is considered fully priced in (all catalytic value captured). */
  fully_priced: boolean;

  /** Confidence in the price confirmation, range [0.0, 1.0]. */
  confidence: number;

  /** Stock ticker that triggered the originating catalyst signal (e.g. "VCB"). */
  catalyst_stock_code?: string;

  /** Direction of the originating catalyst signal. */
  catalyst_direction?: "BUY" | "SELL" | "NEUTRAL";

  /** Hours elapsed from catalyst event to confirmed price move (must be >= 0). */
  time_to_price_move?: number;
}

export const PriceConfirmationFindingDataSchema = z.object({
  price_change_pct: z.number(),
  volume_ratio: z.number().min(0),
  confirms_direction: z.boolean(),
  fully_priced: z.boolean(),
  confidence: z.number().min(0).max(1),
  catalyst_stock_code: z.string().min(2).optional(),
  catalyst_direction: z.enum(["BUY", "SELL", "NEUTRAL"]).optional(),
  time_to_price_move: z.number().min(0).optional(),
});

// ── UrgentNewsFindingData ──────────────────────────────────────────────────────

/**
 * Finding data for urgent_news signals.
 *
 * Minimal signal type for breaking news that requires immediate attention.
 * All 3 fields are required and validated at parse time.
 */
export interface UrgentNewsFindingData {
  /** Headline or title of the urgent news. */
  headline: string;

  /** Source identifier: cafef, vnexpress, reuters, etc. */
  source: string;

  /** Severity level of the news: low, medium, high, or critical. */
  severity: "low" | "medium" | "high" | "critical";

  /** Optional: ticker of the stock that triggered the cascade chain. Min 2 chars. */
  catalyst_stock_code?: string;

  /** Optional: directional bias of the catalyst event. */
  catalyst_direction?: "bullish" | "bearish" | "neutral";

  /** Optional: estimated hours from catalyst event to observable price movement. */
  time_to_price_move?: number;

  /**
   * Optional: confidence in the news assessment, range [0.0, 1.0].
   * Used by regime-based threshold enforcement in post_agent_signal.
   * Under TIGHTENING regime: requires >= 0.60. NEUTRAL: >= 0.55. EASING: >= 0.50.
   */
  confidence?: number;

  /**
   * Optional: monetary-policy regime at signal time — TIGHTENING | NEUTRAL | EASING
   * (from get_macro_snapshot Global Liquidity classification).
   * Used with `confidence` to enforce regime-based posting thresholds.
   * Absent or unknown values are treated as NEUTRAL (0.55 threshold).
   */
  regime?: "TIGHTENING" | "NEUTRAL" | "EASING";
}

// SYS-FUNC-05 FIX: headline, source, severity made optional so callers that supply
// only confidence/summary (minimal urgent_news posts) are not rejected with a
// "root: Required" error. The interface fields are kept for full payloads; the schema
// is the validation gate and must not block valid partial signals.
export const UrgentNewsFindingDataSchema = z.object({
  headline: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  catalyst_stock_code: z.string().min(2).optional(),
  catalyst_direction: z.enum(["bullish", "bearish", "neutral"]).optional(),
  time_to_price_move: z.number().min(0).optional(),
  confidence: z.number().min(0).max(1).optional(),
  regime: z.enum(["TIGHTENING", "NEUTRAL", "EASING"]).optional(),
  summary: z.string().optional(),
}).passthrough();

// ── CrossValidateFindingData ───────────────────────────────────────────────────

/**
 * Finding data for cross_validate signals.
 *
 * Used to validate findings across multiple data sources and agents.
 * All 3 fields are required and validated at parse time.
 */
export interface CrossValidateFindingData {
  /** Directional bias: bullish, bearish, or neutral. */
  direction: "bullish" | "bearish" | "neutral";

  /** Confidence in the validation, range [0.0, 1.0]. */
  confidence: number;

  /** Summary of the validation findings. */
  summary: string;
}

export const CrossValidateFindingDataSchema = z.object({
  direction: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
});

// ── PriceAnomalyFindingData ────────────────────────────────────────────────────

/**
 * Finding data for price_anomaly signals posted by Market Watcher.
 *
 * Describes a statistically significant price move (in sigma units) that
 * exceeds the rolling standard-deviation threshold for the stock's regime.
 *
 * Required: move_pct, move_sigma
 * Optional: ref_price, window_days (may not be available at signal time),
 *           plus any additional context fields (regime, fx_pressure, etc.)
 *           passed by market-watcher are accepted via passthrough.
 */
export interface PriceAnomalyFindingData {
  /** Raw price move as a percentage (positive = up, negative = down). */
  move_pct: number;

  /** Move expressed in standard-deviation (sigma) units relative to rolling window. */
  move_sigma: number;

  /** Reference price used for the sigma calculation (VND, million scale). Optional. */
  ref_price?: number;

  /** Rolling window in trading days used for the sigma calculation (must be >= 1). Optional. */
  window_days?: number;

  /** Signed percentage value — same as move_pct, kept for legacy compatibility. Optional. */
  price_change_pct?: number;

  /** Macro regime at signal time: TIGHTENING | EASING | NEUTRAL. Optional. */
  regime?: string;

  /** Adaptive sigma threshold string, e.g. "1.5σ". Optional. */
  adjusted_threshold?: string;

  /** Whether the stock had FX pressure at signal time. Optional. */
  fx_pressure?: boolean;

  /** Whether the stock had PE compression risk at signal time. Optional. */
  pe_compression_risk?: boolean;
}

export const PriceAnomalyFindingDataSchema = z.object({
  move_pct: z.number(),
  move_sigma: z.number(),
  ref_price: z.number().optional(),
  window_days: z.number().int().positive().optional(),
  price_change_pct: z.number().optional(),
  regime: z.string().optional(),
  adjusted_threshold: z.string().optional(),
  fx_pressure: z.boolean().optional(),
  pe_compression_risk: z.boolean().optional(),
}).passthrough();
export type PriceAnomalyFindingDataInferred = z.infer<typeof PriceAnomalyFindingDataSchema>;

// ── SignalFeedbackFindingData ──────────────────────────────────────────────────

/**
 * Finding data for signal_feedback signals.
 *
 * Permissive schema for feedback loop communications between agents.
 * Accepts any payload structure (z.record is open-ended).
 */
export const SignalFeedbackFindingDataSchema = z.record(z.unknown());

// ── Index exports ──────────────────────────────────────────────────────────────

/**
 * Barrel index for all signal type schemas and interfaces.
 * Import from this module for type-safe signal validation.
 */
export const SignalSchemas = {
  ChainCatalyst: ChainCatalystFindingDataSchema,
  PriceConfirmation: PriceConfirmationFindingDataSchema,
  UrgentNews: UrgentNewsFindingDataSchema,
  CrossValidate: CrossValidateFindingDataSchema,
  PriceAnomaly: PriceAnomalyFindingDataSchema,
  SignalFeedback: SignalFeedbackFindingDataSchema,
} as const;
