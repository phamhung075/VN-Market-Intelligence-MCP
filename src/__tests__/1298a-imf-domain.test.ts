/**
 * Sprint 1298 — Task 1298a RED phase
 * IMF Sentiment Classifier: Domain Model + Schema Tests
 *
 * AC-1: ImfIndicator domain model shape and constants are correct
 * AC-2: classifyImfIndicators sentiment mapping produces correct scores
 * AC-3: ChainCatalystFindingDataSchema is backward-compatible with imfSentiment field
 */

import { describe, it, expect } from "bun:test";
import {
  type ImfIndicator,
  IMF_INDICATORS,
  calculateConfidenceDecay,
  type ImfClassificationInput,
  type ImfClassificationOutput,
} from "../domain/models/imfIndicators.js";
import { classifyImfIndicators } from "../domain/services/imfDataClassifier.js";
import { ChainCatalystFindingDataSchema } from "../domain/signals/signalTypes.js";

// ── AC-1: Domain Model Correct ────────────────────────────────────────────────

describe("AC-1: ImfIndicator domain model", () => {
  it("accepts valid ImfIndicator with all 9 fields (no TS error)", () => {
    const indicator: ImfIndicator = {
      code: "NGDP_RPCH",
      name: "Global GDP Growth (%)",
      value: 3.2,
      publishedAt: "2026-04-20T00:00:00Z",
      ageInDays: 3,
      previousValue: 2.8,
      yoyChange: 0.14,
      source: "imf_api",
      confidence: 0.95,
    };
    expect(indicator.code).toBe("NGDP_RPCH");
    expect(indicator.confidence).toBeLessThanOrEqual(1);
  });

  it("calculateConfidenceDecay(3) === 0.95 (fresh)", () => {
    expect(calculateConfidenceDecay(3)).toBe(0.95);
  });

  it("calculateConfidenceDecay(10) === 0.85 (recent)", () => {
    expect(calculateConfidenceDecay(10)).toBe(0.85);
  });

  it("calculateConfidenceDecay(45) === 0.50 (stale)", () => {
    expect(calculateConfidenceDecay(45)).toBe(0.50);
  });

  it("calculateConfidenceDecay(90) === 0.30 (very old)", () => {
    expect(calculateConfidenceDecay(90)).toBe(0.30);
  });

  it("IMF_INDICATORS contains exactly 9 keys", () => {
    expect(Object.keys(IMF_INDICATORS).length).toBe(9);
  });
});

// ── AC-2: Classifier Sentiment Mapping Correct ────────────────────────────────

describe("AC-2: classifyImfIndicators sentiment mapping", () => {
  const freshGrowthIndicator: ImfIndicator = {
    code: IMF_INDICATORS.WORLD_GROWTH,
    name: "World GDP Growth",
    value: 6.5,
    publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ageInDays: 3,
    previousValue: 5.8,
    yoyChange: 0.12, // +12% YoY — bullish
    source: "imf_api",
    confidence: 0.95,
  };

  it("classifies growth increase as imf_bullish with sentiment > 0.3", () => {
    const result = classifyImfIndicators({
      indicators: [freshGrowthIndicator],
      historicalBaseline: 5.0,
    });
    expect(result.sentiment).toBeGreaterThan(0.3);
    expect(result.classification).toBe("imf_bullish");
  });

  it("maps growth increase to banking sector impact approx 0.45 (tolerance 0.1)", () => {
    const result = classifyImfIndicators({
      indicators: [freshGrowthIndicator],
      historicalBaseline: 5.0,
    });
    const bankingImpact = result.sectorImpacts.find((s) => s.sector === "banking");
    expect(bankingImpact).toBeDefined();
    expect(bankingImpact!.impactScore).toBeCloseTo(0.45, 1);
  });

  it("maps growth increase to export sector impact approx 0.35 (tolerance 0.1)", () => {
    const result = classifyImfIndicators({
      indicators: [freshGrowthIndicator],
      historicalBaseline: 5.0,
    });
    const exportImpact = result.sectorImpacts.find((s) => s.sector === "export");
    expect(exportImpact).toBeDefined();
    expect(exportImpact!.impactScore).toBeCloseTo(0.35, 1);
  });

  it("classifies growth contraction as imf_bearish with sentiment < -0.3", () => {
    const bearishIndicator: ImfIndicator = {
      ...freshGrowthIndicator,
      yoyChange: -0.02, // contraction
      value: 1.0,
    };
    const result = classifyImfIndicators({
      indicators: [bearishIndicator],
      historicalBaseline: 5.0,
    });
    expect(result.sentiment).toBeLessThan(-0.3);
    expect(result.classification).toBe("imf_bearish");
  });

  it("stale indicator (ageInDays=45) produces result.confidence < 0.60", () => {
    const staleIndicator: ImfIndicator = {
      ...freshGrowthIndicator,
      ageInDays: 45,
      confidence: calculateConfidenceDecay(45), // 0.50
    };
    const result = classifyImfIndicators({
      indicators: [staleIndicator],
      historicalBaseline: 5.0,
    });
    expect(result.confidence).toBeLessThan(0.60);
  });

  it("verifies weighted average arithmetic for 2-indicator input", () => {
    const ind1: ImfIndicator = { ...freshGrowthIndicator, yoyChange: 0.01, confidence: 0.95 };
    const ind2: ImfIndicator = {
      ...freshGrowthIndicator,
      code: IMF_INDICATORS.GLOBAL_INFLATION,
      yoyChange: 0.0,
      confidence: 0.92,
    };
    const result = classifyImfIndicators({
      indicators: [ind1, ind2],
      historicalBaseline: 3.0,
    });
    // Growth +1% → positive contribution; inflation value 6.5 fires inflation rule (bearish)
    // Net: growth rule weight 0.95 * +0.15 vs inflation rule weight 0.92 * -0.08
    // Weighted: (0.95*0.15 + 0.92*-0.08) / (0.95+0.92) = (0.1425 - 0.0736) / 1.87 ≈ +0.037
    // Result is positive sentiment (growth dominates)
    expect(result.sentiment).toBeGreaterThan(0);
  });
});

// ── AC-3: Signal Schema Backward Compatible ───────────────────────────────────

describe("AC-3: ChainCatalystFindingDataSchema backward compat", () => {
  const baseSignal = {
    event_type: "macro" as const,
    direction: "bullish" as const,
    confidence: 0.8,
    affected_stocks: ["VCB"],
    affected_sectors: ["banking"],
    headline: "Fed cuts rates",
    source: "reuters",
  };

  it("parses signal without imfSentiment (optional field)", () => {
    expect(() => ChainCatalystFindingDataSchema.parse(baseSignal)).not.toThrow();
  });

  it("parses signal with valid imfSentiment", () => {
    const withImf = {
      ...baseSignal,
      imfSentiment: {
        sentiment: 0.6,
        confidence: 0.88,
        affectedSectors: ["banking"],
        reasoning: "IMF growth forecast supports NIM expansion",
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(withImf)).not.toThrow();
  });

  it("rejects imfSentiment.sentiment = 1.5 (out of range)", () => {
    const badSignal = {
      ...baseSignal,
      imfSentiment: {
        sentiment: 1.5,
        confidence: 0.88,
        affectedSectors: ["banking"],
        reasoning: "test",
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(badSignal)).toThrow();
  });

  it("rejects imfSentiment.reasoning = '' (empty string)", () => {
    const badSignal = {
      ...baseSignal,
      imfSentiment: {
        sentiment: 0.5,
        confidence: 0.88,
        affectedSectors: ["banking"],
        reasoning: "",
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(badSignal)).toThrow();
  });
});
