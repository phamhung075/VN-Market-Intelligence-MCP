/**
 * Conviction Scorer — Domain Service
 *
 * Core philosophy: "Tin tức có thể giả nhưng giá phản ánh tất cả"
 *
 * Cross-validates 7 independent signal dimensions to produce a conviction
 * score [0, 1]. When multiple independent signals agree, conviction is high.
 * When they disagree, conviction is low — suggesting manipulation or noise.
 *
 * Dimensions:
 *   1. Price action  — is the stock actually moving? (changePct)
 *   2. Volume        — is the move backed by volume? (vs avgVolume)
 *   3. Sentiment     — what does the news say? (bullish/bearish/neutral)
 *   4. Cascade       — does the macro cascade support this direction?
 *   5. Sector        — is the whole sector moving or just this stock?
 *   6. Kinh Dich     — what does the hexagram reading indicate? (Task 304)
 *   7. IMF macro     — what do IMF economic indicators say? (imfMacroScore)
 *
 * Conviction levels:
 *   >= 0.8  CONVICTION  — all signals align, very high confidence
 *   >= 0.6  STRONG      — most signals align
 *   >= 0.4  MODERATE    — mixed signals
 *   <  0.4  WEAK        — signals conflict, likely noise or manipulation
 *
 * Layer: domain/services — pure, no I/O.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConvictionLevel = "conviction" | "strong" | "moderate" | "weak";

/** Input signals for conviction scoring. All fields optional — missing = neutral (0.5). */
export interface ConvictionInput {
  code: string;

  // Dimension 1: Price action
  /** Current price change % (e.g. -3.5 or +2.1) */
  changePct?: number;

  // Dimension 2: Volume confirmation
  /** Current volume */
  volume?: number;
  /** 20-day average volume */
  avgVolume?: number;

  // Dimension 3: News sentiment
  /** Sentiment direction from news */
  sentimentDirection?: "bullish" | "bearish" | "neutral";
  /** Sentiment confidence 0-1 */
  sentimentConfidence?: number;

  // Dimension 4: Cascade direction
  /** Impact direction from cascade engine */
  cascadeDirection?: "up" | "down" | "neutral";
  /** Cascade confidence 0-1 */
  cascadeConfidence?: number;

  // Dimension 5: Sector context
  /** Sector average change % */
  sectorAvgPct?: number;

  // Dimension 6: Kinh Dich hexagram signal (Task 304)
  /**
   * Derived Kinh Dich score in [-1, +1].
   * Computed by the caller from `hexagramStore.getLatestReading()` via
   * `deriveKinhDichScore(tradingSignal, confidence)` in portfolioTools.ts.
   * undefined -> neutral (no reading available, maps to 0.5).
   */
  kinhDichScore?: number;

  // ── New signal fields (Task 1328d) ─────────────────────────────────────────
  /** From ChainCatalystFindingData.newsSentiment [-1.0, 1.0]. Overrides sentimentDirection when present and sentimentDirection is absent. */
  newsSentimentScore?: number;
  /** From ChainCatalystFindingData.kinhDichConfidence [0, 100]. Overrides kinhDichScore when present and kinhDichScore is absent. */
  kinhDichConfidenceRaw?: number;
  /** From ChainCatalystFindingData.agentSignalsMajority. Used as secondary cascade signal when cascadeDirection is absent. */
  agentSignalsMajority?: "BUY" | "SELL" | "NEUTRAL";

  // Dimension 7: IMF macro economic signal (Task 1329)
  /**
   * IMF macro sentiment score in [-1, +1].
   * Injected by the caller via imfConvictionBridge.getImfMacroScoreForConviction().
   * undefined -> neutral (no fresh IMF data, maps to 0.5).
   */
  imfMacroScore?: number;
}

/** Result of conviction scoring. */
export interface ConvictionResult {
  code: string;
  /** Overall conviction score [0, 1] */
  score: number;
  /** Classification */
  level: ConvictionLevel;
  /** Detected direction: which way do the signals point? */
  direction: "bullish" | "bearish" | "neutral";
  /** Per-dimension scores for transparency */
  dimensions: {
    priceAction: number;
    volumeConfirmation: number;
    sentiment: number;
    cascade: number;
    sectorAlignment: number;
    /** Kinh Dich hexagram dimension score [0, 1]. 0.5 = neutral/no reading. */
    kinhDich: number;
    /** IMF macro dimension score [0, 1]. 0.5 = neutral/no fresh data. */
    imfMacro: number;
  };
  /** Vietnamese summary */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension weights (must sum to 1.0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dimension weights (must sum to 1.0).
 *
 * Task 304: 6th dimension (kinhDich) added at 0.15.
 * Original 5 weights each scaled by 0.85 proportionally:
 *   priceAction:        0.30 x 0.85 = 0.2550
 *   volumeConfirmation: 0.25 x 0.85 = 0.2125
 *   sentiment:          0.15 x 0.85 = 0.1275
 *   cascade:            0.15 x 0.85 = 0.1275
 *   sectorAlignment:    0.15 x 0.85 = 0.1275
 *   kinhDich:           0.15 (fixed)
 *   Sum:                              1.0000
 *
 * Task 1329: 7th dimension (imfMacro) added at 0.10.
 * Previous 6 weights each scaled by 0.90 proportionally:
 *   priceAction:        0.2550 x 0.90 = 0.2295 → 0.2293 (adjusted for exact sum)
 *   volumeConfirmation: 0.2125 x 0.90 = 0.19125 → 0.1913
 *   sentiment:          0.1275 x 0.90 = 0.11475 → 0.1148
 *   cascade:            0.1275 x 0.90 = 0.11475 → 0.1148
 *   sectorAlignment:    0.1275 x 0.90 = 0.11475 → 0.1148
 *   kinhDich:           0.1500 x 0.90 = 0.1350
 *   imfMacro:           0.1000 (new)
 *   Sum: 0.2293+0.1913+0.1148+0.1148+0.1148+0.1350+0.1000 = 1.0000
 */
export const WEIGHTS = {
  priceAction:        0.2293,
  volumeConfirmation: 0.1913,
  sentiment:          0.1148,
  cascade:            0.1148,
  sectorAlignment:    0.1148,
  kinhDich:           0.1350,
  imfMacro:           0.1000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Vietnamese labels
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_VI: Record<ConvictionLevel, string> = {
  conviction: "Xác tín cao",
  strong: "Khá chắc chắn",
  moderate: "Hỗn hợp",
  weak: "Tín hiệu yếu/mâu thuẫn",
};

// ─────────────────────────────────────────────────────────────────────────────
// Dimension scorers (each returns 0-1, where 1 = strongly agrees with direction)
// ─────────────────────────────────────────────────────────────────────────────

function scorePriceAction(changePct: number | undefined): { score: number; direction: "bullish" | "bearish" | "neutral" } {
  if (changePct == null || Math.abs(changePct) < 0.5) {
    return { score: 0.5, direction: "neutral" }; // flat = neutral
  }
  // Larger moves = stronger signal (capped at 1.0 for +/-10%)
  const magnitude = Math.min(Math.abs(changePct) / 10, 1.0);
  const direction = changePct > 0 ? "bullish" as const : "bearish" as const;
  return { score: 0.5 + magnitude * 0.5, direction };
}

function scoreVolume(volume: number | undefined, avgVolume: number | undefined): number {
  if (!volume || !avgVolume || avgVolume <= 0) return 0.5; // no data = neutral
  const ratio = volume / avgVolume;
  if (ratio < 0.5) return 0.3; // very low volume = suspicious, weakens conviction
  if (ratio < 1.0) return 0.5; // normal
  // Higher volume = stronger confirmation (capped at 1.0 for 5x avg)
  return Math.min(0.5 + (ratio - 1) / 8, 1.0);
}

function scoreSentiment(
  direction: "bullish" | "bearish" | "neutral" | undefined,
  confidence: number | undefined,
  priceDirection: "bullish" | "bearish" | "neutral",
): number {
  if (!direction || direction === "neutral" || !confidence) return 0.5;
  // Does sentiment agree with price direction?
  if (direction === priceDirection) return 0.5 + confidence * 0.5; // agrees
  if (priceDirection === "neutral") {
    // No price direction yet — sentiment stands on its own
    return direction === "bullish"
      ? 0.5 + confidence * 0.5
      : 0.5 - confidence * 0.4;
  }
  return 0.5 - confidence * 0.4; // disagrees - lower score
}

function scoreCascade(
  cascadeDir: "up" | "down" | "neutral" | undefined,
  cascadeConf: number | undefined,
  priceDirection: "bullish" | "bearish" | "neutral",
): number {
  if (!cascadeDir || cascadeDir === "neutral" || !cascadeConf) return 0.5;
  const cascadeSentiment = cascadeDir === "up" ? "bullish" : "bearish";
  if (cascadeSentiment === priceDirection) return 0.5 + cascadeConf * 0.5;
  if (priceDirection === "neutral") {
    // No price direction yet — cascade stands on its own
    return cascadeDir === "up"
      ? 0.5 + cascadeConf * 0.5
      : 0.5 - cascadeConf * 0.4;
  }
  return 0.5 - cascadeConf * 0.4;
}

function scoreSectorAlignment(
  changePct: number | undefined,
  sectorAvgPct: number | undefined,
): number {
  if (changePct == null || sectorAvgPct == null) return 0.5;
  // Same direction = confirms the move is real
  const sameDirection =
    (changePct >= 0 && sectorAvgPct >= 0) ||
    (changePct < 0 && sectorAvgPct < 0);

  if (sameDirection) {
    // Stock-specific (much bigger than sector) = slightly weaker sector signal
    const ratio = Math.abs(sectorAvgPct) > 0.01
      ? Math.abs(changePct) / Math.abs(sectorAvgPct)
      : 5;
    return ratio <= 2.5 ? 0.8 : 0.6; // sector-wide vs stock-specific
  }
  // Opposing direction: stock going against sector = weaker conviction
  return 0.3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kinh Dich helpers (Task 304)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a kinhDichScore [-1, +1] to a dimension score [0, 1].
 * undefined/null -> 0.5 (neutral, no reading available).
 * Formula: 0.5 + score * 0.5, clamped to [0, 1].
 */
export function scoreKinhDich(score: number | undefined): number {
  if (score == null) return 0.5;
  return Math.max(0, Math.min(1, 0.5 + score * 0.5));
}

/**
 * Maps an imfMacroScore [-1, +1] to a dimension score [0, 1].
 * undefined/null -> 0.5 (neutral — no fresh IMF data available).
 * Formula: 0.5 + score * 0.5, clamped to [0, 1].
 * Same formula as scoreKinhDich (Task 304) — consistent scoring convention.
 */
export function scoreImfMacro(score: number | undefined): number {
  if (score == null) return 0.5;
  return Math.max(0, Math.min(1, 0.5 + score * 0.5));
}

/**
 * Derives a kinhDichScore in [-1, +1] from raw `trading_signal` text and
 * `confidence` stored in `kinhdich_readings`.
 *
 * Formula (B3 resolution - verb-primary with suffix magnitude gate):
 *   - MUA | CHO           -> verbPolarity = +1
 *   - BAN | THAN TRONG    -> verbPolarity = -1
 *   - GIU                 -> verbPolarity =  0
 *   - suffix "tieu cuc"   -> suffixMultiplier = 0.7
 *   - otherwise           -> suffixMultiplier = 1.0
 *   - result = verbPolarity x confidence x suffixMultiplier
 *
 * Returns 0 when either argument is null/undefined.
 *
 * Examples:
 *   MUA (tich cuc)  conf=0.72  -> +1 * 0.72 * 1.0 = +0.72 -> scoreKinhDich = 0.86
 *   BAN (tieu cuc)  conf=0.80  -> -1 * 0.80 * 0.7 = -0.56
 *   GIU (tich cuc)  conf=0.60  ->  0 * 0.60 * 1.0 =  0.00 -> neutral
 *   BAN (tich cuc)  conf=0.60  -> -1 * 0.60 * 1.0 = -0.60 (verb-primary: BAN stays bearish)
 *
 * This function lives in the domain layer so it can be tested independently
 * of any DB access. The caller (portfolioTools.ts) provides the raw strings
 * from `getLatestReading()`.
 */
export function deriveKinhDichScore(
  tradingSignal: string | null | undefined,
  confidence: number | null | undefined,
): number {
  if (!tradingSignal || confidence == null) return 0;
  const sig = tradingSignal.toUpperCase();
  const conf = Math.max(0, Math.min(1, confidence));

  let verbPolarity: number;
  if (sig.includes("MUA") || sig.includes("CHO")) {
    verbPolarity = 1;
  } else if (sig.includes("BAN") || sig.includes("THAN TRONG")) {
    verbPolarity = -1;
  } else {
    verbPolarity = 0; // GIU
  }

  const suffixMultiplier = sig.includes("TIEU CUC") ? 0.7 : 1.0;

  return verbPolarity * conf * suffixMultiplier;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrichment helper (Task 1328d)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enriches a ConvictionInput with the three new signal fields.
 * Pure function — returns new ConvictionInput, does not mutate input.
 *
 * Rules:
 *   newsSentimentScore [-1,1] → sentimentDirection + sentimentConfidence
 *     (only when sentimentDirection is not already set)
 *   kinhDichConfidenceRaw [0,100] → kinhDichScore [-1,+1]
 *     (only when kinhDichScore is not already set; direction from agentSignalsMajority)
 *   agentSignalsMajority → cascadeDirection
 *     (only when cascadeDirection is not already set)
 */
export function enrichDimensionScores(input: ConvictionInput): ConvictionInput {
  const enriched = { ...input };

  if (input.newsSentimentScore != null && enriched.sentimentDirection == null) {
    enriched.sentimentDirection =
      input.newsSentimentScore > 0.1 ? "bullish" :
      input.newsSentimentScore < -0.1 ? "bearish" : "neutral";
    enriched.sentimentConfidence = Math.abs(input.newsSentimentScore);
  }

  if (input.kinhDichConfidenceRaw != null && enriched.kinhDichScore == null) {
    const sign =
      input.agentSignalsMajority === "BUY" ? 1 :
      input.agentSignalsMajority === "SELL" ? -1 : 0;
    enriched.kinhDichScore = sign * (input.kinhDichConfidenceRaw / 100);
  }

  if (input.agentSignalsMajority != null && enriched.cascadeDirection == null) {
    enriched.cascadeDirection =
      input.agentSignalsMajority === "BUY" ? "up" :
      input.agentSignalsMajority === "SELL" ? "down" : "neutral";
    enriched.cascadeConfidence = 0.6;
  }

  return enriched;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a conviction score from 7 independent signal dimensions.
 *
 * @param input - Signal dimensions (all optional - missing = neutral)
 * @returns ConvictionResult with score, level, direction, per-dimension breakdown
 *
 * Backward compatible: callers that do not pass `kinhDichScore` or `imfMacroScore`
 * receive the same result as passing them as undefined (maps to neutral 0.5).
 */
export function computeConviction(input: ConvictionInput): ConvictionResult {
  // Enrich with new signal fields (Task 1328d) — pure, no mutation
  const enriched = enrichDimensionScores(input);

  // Dimension 1: Price action
  const price = scorePriceAction(enriched.changePct);
  const priceDirection = price.direction;

  // Dimension 2: Volume
  const vol = scoreVolume(enriched.volume, enriched.avgVolume);

  // Dimension 3: Sentiment
  const sent = scoreSentiment(
    enriched.sentimentDirection,
    enriched.sentimentConfidence,
    priceDirection,
  );

  // Dimension 4: Cascade
  const casc = scoreCascade(
    enriched.cascadeDirection,
    enriched.cascadeConfidence,
    priceDirection,
  );

  // Dimension 5: Sector alignment
  const sect = scoreSectorAlignment(enriched.changePct, enriched.sectorAvgPct);

  // Dimension 6: Kinh Dich hexagram (Task 304)
  const kd = scoreKinhDich(enriched.kinhDichScore);

  // Dimension 7: IMF macro (Task 1329)
  const imf = scoreImfMacro(enriched.imfMacroScore);

  // Weighted average (7 dimensions summing to 1.0)
  const score = Math.round((
    price.score * WEIGHTS.priceAction +
    vol        * WEIGHTS.volumeConfirmation +
    sent       * WEIGHTS.sentiment +
    casc       * WEIGHTS.cascade +
    sect       * WEIGHTS.sectorAlignment +
    kd         * WEIGHTS.kinhDich +
    imf        * WEIGHTS.imfMacro
  ) * 100) / 100;

  // Classification
  const level: ConvictionLevel =
    score >= 0.8 ? "conviction" :
    score >= 0.6 ? "strong" :
    score >= 0.4 ? "moderate" :
    "weak";

  // Overall direction (from price — "gia phan anh tat ca")
  const direction = priceDirection;

  // Vietnamese summary - count signals > 0.6 across all 7 dimensions
  const levelVi = LEVEL_VI[level];
  const dirVi = direction === "bullish" ? "Tăng" : direction === "bearish" ? "Giảm" : "Trung tính";
  const dims = [];
  if (price.score > 0.6) dims.push("giá");
  if (vol > 0.6) dims.push("KL");
  if (sent > 0.6) dims.push("tin");
  if (casc > 0.6) dims.push("vĩ mô");
  if (sect > 0.6) dims.push("ngành");
  if (kd > 0.6) dims.push("kinh dịch");
  if (imf > 0.6) dims.push("imf vĩ mô");

  const agreeing = dims.length;
  const summary = agreeing >= 5
    ? `${enriched.code} ${dirVi}: ${levelVi} - ${agreeing}/7 tín hiệu đồng thuận (${dims.join(", ")})`
    : agreeing >= 2
      ? `${enriched.code} ${dirVi}: ${levelVi} - ${dims.join(", ")} xác nhận`
      : `${enriched.code}: ${levelVi} - tín hiệu mâu thuẫn, thận trọng`;

  return {
    code: enriched.code,
    score,
    level,
    direction,
    dimensions: {
      priceAction: Math.round(price.score * 100) / 100,
      volumeConfirmation: Math.round(vol * 100) / 100,
      sentiment: Math.round(sent * 100) / 100,
      cascade: Math.round(casc * 100) / 100,
      sectorAlignment: Math.round(sect * 100) / 100,
      kinhDich: Math.round(kd * 100) / 100,
      imfMacro: Math.round(imf * 100) / 100,
    },
    summary,
  };
}
