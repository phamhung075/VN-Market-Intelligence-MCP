/**
 * Conviction Scorer — Domain Service
 *
 * Core philosophy: "Tin tức có thể giả nhưng giá phản ánh tất cả"
 *
 * Cross-validates 5 independent signal dimensions to produce a conviction
 * score [0, 1]. When multiple independent signals agree, conviction is high.
 * When they disagree, conviction is low — suggesting manipulation or noise.
 *
 * Dimensions:
 *   1. Price action  — is the stock actually moving? (changePct)
 *   2. Volume        — is the move backed by volume? (vs avgVolume)
 *   3. Sentiment     — what does the news say? (bullish/bearish/neutral)
 *   4. Cascade       — does the macro cascade support this direction?
 *   5. Sector        — is the whole sector moving or just this stock?
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
  };
  /** Vietnamese summary */
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension weights (must sum to 1.0)
// ─────────────────────────────────────────────────────────────────────────────

/** Price is the most important — "giá phản ánh tất cả" */
const WEIGHTS = {
  priceAction: 0.30,
  volumeConfirmation: 0.25,
  sentiment: 0.15,
  cascade: 0.15,
  sectorAlignment: 0.15,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Vietnamese labels
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_VI: Record<ConvictionLevel, string> = {
  conviction: "XÁC TÍN CAO",
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
  // Larger moves = stronger signal (capped at 1.0 for ±10%)
  const magnitude = Math.min(Math.abs(changePct) / 10, 1.0);
  const direction = changePct > 0 ? "bullish" as const : "bearish" as const;
  return { score: 0.5 + magnitude * 0.5, direction };
}

function scoreVolume(volume: number | undefined, avgVolume: number | undefined): number {
  if (!volume || !avgVolume || avgVolume <= 0) return 0.5; // no data = neutral
  const ratio = volume / avgVolume;
  if (ratio < 0.5) return 0.3; // very low volume = suspicious, weakens conviction
  if (ratio < 1.0) return 0.5; // normal
  // Higher volume = stronger confirmation (capped at 1.0 for 5× avg)
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
  if (priceDirection === "neutral") return 0.5;
  return 0.5 - confidence * 0.4; // disagrees — lower score
}

function scoreCascade(
  cascadeDir: "up" | "down" | "neutral" | undefined,
  cascadeConf: number | undefined,
  priceDirection: "bullish" | "bearish" | "neutral",
): number {
  if (!cascadeDir || cascadeDir === "neutral" || !cascadeConf) return 0.5;
  const cascadeSentiment = cascadeDir === "up" ? "bullish" : "bearish";
  if (cascadeSentiment === priceDirection) return 0.5 + cascadeConf * 0.5;
  if (priceDirection === "neutral") return 0.5;
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
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a conviction score from 5 independent signal dimensions.
 *
 * @param input - Signal dimensions (all optional — missing = neutral)
 * @returns ConvictionResult with score, level, direction, per-dimension breakdown
 */
export function computeConviction(input: ConvictionInput): ConvictionResult {
  // Dimension 1: Price action
  const price = scorePriceAction(input.changePct);
  const priceDirection = price.direction;

  // Dimension 2: Volume
  const vol = scoreVolume(input.volume, input.avgVolume);

  // Dimension 3: Sentiment
  const sent = scoreSentiment(
    input.sentimentDirection,
    input.sentimentConfidence,
    priceDirection,
  );

  // Dimension 4: Cascade
  const casc = scoreCascade(
    input.cascadeDirection,
    input.cascadeConfidence,
    priceDirection,
  );

  // Dimension 5: Sector alignment
  const sect = scoreSectorAlignment(input.changePct, input.sectorAvgPct);

  // Weighted average
  const score = Math.round((
    price.score * WEIGHTS.priceAction +
    vol * WEIGHTS.volumeConfirmation +
    sent * WEIGHTS.sentiment +
    casc * WEIGHTS.cascade +
    sect * WEIGHTS.sectorAlignment
  ) * 100) / 100;

  // Classification
  const level: ConvictionLevel =
    score >= 0.8 ? "conviction" :
    score >= 0.6 ? "strong" :
    score >= 0.4 ? "moderate" :
    "weak";

  // Overall direction (from price — "giá phản ánh tất cả")
  const direction = priceDirection;

  // Vietnamese summary
  const levelVi = LEVEL_VI[level];
  const dirVi = direction === "bullish" ? "TĂNG" : direction === "bearish" ? "GIẢM" : "TRUNG TÍNH";
  const dims = [];
  if (price.score > 0.6) dims.push("giá");
  if (vol > 0.6) dims.push("KL");
  if (sent > 0.6) dims.push("tin");
  if (casc > 0.6) dims.push("vĩ mô");
  if (sect > 0.6) dims.push("ngành");

  const agreeing = dims.length;
  const summary = agreeing >= 4
    ? `💎 ${input.code} ${dirVi}: ${levelVi} — ${agreeing}/5 tín hiệu đồng thuận (${dims.join(", ")})`
    : agreeing >= 2
      ? `📊 ${input.code} ${dirVi}: ${levelVi} — ${dims.join(", ")} xác nhận`
      : `⚠️ ${input.code}: ${levelVi} — tín hiệu mâu thuẫn, thận trọng`;

  return {
    code: input.code,
    score,
    level,
    direction,
    dimensions: {
      priceAction: Math.round(price.score * 100) / 100,
      volumeConfirmation: Math.round(vol * 100) / 100,
      sentiment: Math.round(sent * 100) / 100,
      cascade: Math.round(casc * 100) / 100,
      sectorAlignment: Math.round(sect * 100) / 100,
    },
    summary,
  };
}
