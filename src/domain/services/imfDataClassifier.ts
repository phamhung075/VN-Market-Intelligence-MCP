/**
 * Domain Service — IMF Data Classifier (Task 1296b)
 *
 * Pure classification logic for structured IMF indicator data.
 * Extends the existing keyword-based imfSentimentClassifier.ts with
 * indicator-value mapping (growth delta → sentiment score).
 *
 * Rules from research 1296a:
 *   - Growth ↑ 1%+ → +0.15 per 1% delta → banking +0.45, export +0.35
 *   - Growth ↓ 1%+ → -0.20 per 1% delta → real_estate -0.35
 *   - Inflation ↑ 4%+ → -0.08 → banking NIM pressure
 *   - USD strength ↑ → agriculture export +0.10, tech -0.10
 *
 * No I/O, no async, no infrastructure imports.
 *
 * @module domain/services/imfDataClassifier
 */

import {
  calculateConfidenceDecay,
  IMF_INDICATORS,
  type ImfIndicator,
  type ImfClassificationInput,
  type ImfClassificationOutput,
  type SectorImpact,
} from "../models/imfIndicators.js";

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Minimum yoyChange magnitude to trigger a non-neutral rule (1% = 0.01) */
const GROWTH_POSITIVE_THRESHOLD = 0.01;
const GROWTH_NEGATIVE_THRESHOLD = -0.01;
const INFLATION_HIGH_THRESHOLD = 4.0;

/** Sentiment contribution per 1% GDP growth delta */
const SENTIMENT_PER_PCT_GROWTH = 0.15;
const SENTIMENT_PER_PCT_CONTRACTION = 0.20;

/** Classification boundaries */
const BULLISH_THRESHOLD = 0.10;
const BEARISH_THRESHOLD = -0.10;

// ── Rule evaluation functions ─────────────────────────────────────────────────

interface RuleResult {
  sentimentDelta: number;
  impacts: SectorImpact[];
  reasoning: string;
  weight: number; // confidence weight for this rule
}

/**
 * Rule 1+2: GDP growth forecast above/below baseline.
 * +0.15 per 1% positive delta → banking, export bullish
 * -0.20 per 1% negative delta → real_estate bearish
 */
function evaluateGrowthRule(indicator: ImfIndicator): RuleResult | null {
  const delta = indicator.yoyChange;
  if (delta === null) return null;

  if (delta >= GROWTH_POSITIVE_THRESHOLD) {
    // Bullish: scale sentiment with growth magnitude, capped at +1
    const sentimentDelta = Math.min(1.0, delta / 0.01 * SENTIMENT_PER_PCT_GROWTH);
    return {
      sentimentDelta,
      impacts: [
        { sector: "banking", direction: "bullish", impactScore: 0.45 },
        { sector: "export", direction: "bullish", impactScore: 0.35 },
        { sector: "manufacturing", direction: "bullish", impactScore: 0.25 },
      ],
      reasoning: `GDP growth ↑ ${(delta * 100).toFixed(1)}% YoY → credit demand ↑, NIM expansion (banking), export volume ↑`,
      weight: indicator.confidence,
    };
  }

  if (delta <= GROWTH_NEGATIVE_THRESHOLD) {
    // Bearish: scale sentiment with contraction magnitude
    // delta is negative (e.g. -0.04), magnitude = abs(delta) / 0.01 * penalty
    const sentimentDelta = Math.max(-1.0, -(Math.abs(delta) / 0.01) * SENTIMENT_PER_PCT_CONTRACTION);
    return {
      sentimentDelta,
      impacts: [
        { sector: "real_estate", direction: "bearish", impactScore: -0.35 },
        { sector: "banking", direction: "bearish", impactScore: -0.20 },
        { sector: "retail", direction: "bearish", impactScore: -0.15 },
      ],
      reasoning: `GDP growth ↓ ${(Math.abs(delta) * 100).toFixed(1)}% YoY → investment appetite ↓, financing stress, real_estate 2Q lag`,
      weight: indicator.confidence,
    };
  }

  return null; // near-zero delta → neutral for this indicator
}

/**
 * Rule 4+5: Inflation signal.
 * High inflation (>4%) → banking NIM compression, hedge assets ↑
 */
function evaluateInflationRule(indicator: ImfIndicator): RuleResult | null {
  if (indicator.value >= INFLATION_HIGH_THRESHOLD) {
    return {
      sentimentDelta: -0.08,
      impacts: [
        { sector: "banking", direction: "bearish", impactScore: -0.08 },
        { sector: "gold_mining", direction: "bullish", impactScore: 0.10 },
      ],
      reasoning: `Inflation ${indicator.value.toFixed(1)}% ≥ 4% → real lending rates ↓, NIM pressure; hedge demand ↑`,
      weight: indicator.confidence,
    };
  }
  return null;
}

/**
 * Rule 3: USD strength → export agriculture +, tech -
 */
function evaluateUsdStrengthRule(indicator: ImfIndicator): RuleResult | null {
  if (indicator.yoyChange !== null && indicator.yoyChange > 0.05) {
    // USD strength > 5% YoY
    return {
      sentimentDelta: 0.05,
      impacts: [
        { sector: "agriculture", direction: "bullish", impactScore: 0.10 },
        { sector: "tech", direction: "bearish", impactScore: -0.10 },
      ],
      reasoning: `USD strength ↑ ${(indicator.yoyChange * 100).toFixed(1)}% → VND weakness → export revenue ↑ (agriculture), import cost ↑ (tech)`,
      weight: indicator.confidence,
    };
  }
  return null;
}

/**
 * Route an indicator to the appropriate rule evaluator by code.
 */
function evaluateIndicator(indicator: ImfIndicator): RuleResult | null {
  const { code } = indicator;

  // Growth indicators
  if (
    code === IMF_INDICATORS.WORLD_GROWTH ||
    code === IMF_INDICATORS.EM_GROWTH ||
    code === IMF_INDICATORS.ASEAN_GROWTH ||
    code === IMF_INDICATORS.VN_GROWTH_FORECAST
  ) {
    return evaluateGrowthRule(indicator);
  }

  // Inflation indicators
  if (code === IMF_INDICATORS.GLOBAL_INFLATION || code === IMF_INDICATORS.EM_INFLATION) {
    return evaluateInflationRule(indicator);
  }

  // USD strength
  if (code === IMF_INDICATORS.USD_STRENGTH) {
    return evaluateUsdStrengthRule(indicator);
  }

  // Oil forecast: treat as positive growth signal for energy if high
  if (code === IMF_INDICATORS.OIL_FORECAST) {
    if (indicator.value > 80) {
      return {
        sentimentDelta: 0.08,
        impacts: [
          { sector: "energy", direction: "bullish", impactScore: 0.14 },
          { sector: "aviation", direction: "bearish", impactScore: -0.08 },
        ],
        reasoning: `Oil forecast $${indicator.value.toFixed(0)}/bbl > $80 → energy revenue ↑, aviation cost ↑`,
        weight: indicator.confidence,
      };
    }
    return null;
  }

  // FDI outlook: positive if high score
  if (code === IMF_INDICATORS.FDI_OUTLOOK) {
    if (indicator.value > 60) {
      return {
        sentimentDelta: 0.06,
        impacts: [
          { sector: "tech", direction: "bullish", impactScore: 0.11 },
          { sector: "manufacturing", direction: "bullish", impactScore: 0.08 },
        ],
        reasoning: `FDI outlook score ${indicator.value.toFixed(0)} > 60 → foreign investment inflows ↑, supply chain relocation to VN`,
        weight: indicator.confidence,
      };
    }
    return null;
  }

  return null; // unknown indicator code → skip
}

// ── Main classifier ───────────────────────────────────────────────────────────

/**
 * Classify IMF economic indicators as bullish/bearish/neutral for VN market.
 *
 * Pure domain logic: no I/O, no async, no infrastructure imports.
 * Applies age-based confidence decay before aggregating sentiment.
 *
 * @param input - { indicators[], historicalBaseline }
 * @returns ImfClassificationOutput with sentiment + sector impacts
 */
export function classifyImfIndicators(
  input: ImfClassificationInput,
): ImfClassificationOutput {
  const { indicators } = input;

  // Empty indicators → neutral
  if (indicators.length === 0) {
    return {
      sentiment: 0,
      confidence: 0,
      classification: "imf_neutral",
      reasoning: "No IMF indicators available",
      sectorImpacts: [],
    };
  }

  // Evaluate each indicator, applying confidence decay
  const ruleResults: RuleResult[] = [];
  for (const indicator of indicators) {
    // Apply age-based decay to indicator confidence
    const decayedConfidence = calculateConfidenceDecay(indicator.ageInDays);
    const effectiveIndicator: ImfIndicator = {
      ...indicator,
      confidence: Math.min(indicator.confidence, decayedConfidence),
    };
    const result = evaluateIndicator(effectiveIndicator);
    if (result !== null) {
      ruleResults.push({ ...result, weight: effectiveIndicator.confidence });
    }
  }

  // No rules fired → neutral
  if (ruleResults.length === 0) {
    return {
      sentiment: 0,
      confidence: 0.30,
      classification: "imf_neutral",
      reasoning: "IMF indicators show no significant directional signal",
      sectorImpacts: [],
    };
  }

  // Weighted average sentiment
  const totalWeight = ruleResults.reduce((sum, r) => sum + r.weight, 0);
  const weightedSentiment = ruleResults.reduce(
    (sum, r) => sum + r.sentimentDelta * r.weight,
    0,
  ) / totalWeight;

  // Aggregate confidence: average of rule weights
  const avgConfidence = totalWeight / ruleResults.length;
  const clampedConfidence = Math.min(1, Math.max(0, avgConfidence));

  // Clamp sentiment to [-1, +1]
  const sentiment = Math.min(1, Math.max(-1, weightedSentiment));

  // Classification
  let classification: "imf_bullish" | "imf_bearish" | "imf_neutral";
  if (sentiment >= BULLISH_THRESHOLD) {
    classification = "imf_bullish";
  } else if (sentiment <= BEARISH_THRESHOLD) {
    classification = "imf_bearish";
  } else {
    classification = "imf_neutral";
  }

  // Aggregate sector impacts (merge same sectors)
  const sectorMap = new Map<string, SectorImpact>();
  for (const result of ruleResults) {
    for (const impact of result.impacts) {
      const existing = sectorMap.get(impact.sector);
      if (existing) {
        // Average impact scores for same sector
        existing.impactScore = (existing.impactScore + impact.impactScore) / 2;
        // Direction follows dominant score
        if (existing.impactScore > 0.05) existing.direction = "bullish";
        else if (existing.impactScore < -0.05) existing.direction = "bearish";
        else existing.direction = "neutral";
      } else {
        sectorMap.set(impact.sector, { ...impact });
      }
    }
  }

  // Build reasoning string
  const reasonings = ruleResults.map(r => r.reasoning);
  const reasoning = reasonings.join("; ");

  return {
    sentiment,
    confidence: clampedConfidence,
    classification,
    reasoning,
    sectorImpacts: Array.from(sectorMap.values()),
  };
}
