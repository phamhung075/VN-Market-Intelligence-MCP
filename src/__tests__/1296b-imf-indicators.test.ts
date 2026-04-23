/**
 * Task 1296b — RED Phase: IMF Indicator Types + Classifier
 *
 * Tests for:
 *   - ImfIndicator type validation
 *   - IMF_INDICATORS constants
 *   - calculateConfidenceDecay() function
 *   - classifyImfIndicators() classifier logic
 *   - ChainCatalystFindingData imfSentiment schema extension
 *
 * All tests should FAIL before implementation is added.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import {
  calculateConfidenceDecay,
  IMF_INDICATORS,
  type ImfIndicator,
  type ImfClassificationInput,
  type ImfClassificationOutput,
} from "../domain/models/imfIndicators.js";
import {
  classifyImfIndicators,
} from "../domain/services/imfDataClassifier.js";
import {
  ChainCatalystFindingDataSchema,
} from "../domain/signals/signalTypes.js";

// ── Helper: build a minimal valid ImfIndicator ────────────────────────────────
function makeIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH",
    name: "World GDP Growth (%)",
    value: 3.2,
    publishedAt: "2026-04-20T00:00:00Z",
    ageInDays: 3,
    previousValue: 2.8,
    yoyChange: 0.14,
    source: "imf_api",
    confidence: 0.92,
    ...overrides,
  };
}

// ── IMF Indicator Types ───────────────────────────────────────────────────────

describe("Task 1296b — IMF Indicator Types", () => {
  it("IMF_INDICATORS has at least 9 keys", () => {
    expect(Object.keys(IMF_INDICATORS).length).toBeGreaterThanOrEqual(9);
  });

  it("IMF_INDICATORS.WORLD_GROWTH is 'NGDP_RPCH'", () => {
    expect(IMF_INDICATORS.WORLD_GROWTH).toBe("NGDP_RPCH");
  });

  it("ImfIndicator has all required fields (type check via construction)", () => {
    const ind: ImfIndicator = makeIndicator();
    expect(ind.code).toBe("NGDP_RPCH");
    expect(ind.source).toBe("imf_api");
    expect(ind.confidence).toBeLessThanOrEqual(1);
    expect(ind.confidence).toBeGreaterThanOrEqual(0);
  });

  it("ImfIndicator allows null for previousValue and yoyChange", () => {
    const ind: ImfIndicator = makeIndicator({ previousValue: null, yoyChange: null });
    expect(ind.previousValue).toBeNull();
    expect(ind.yoyChange).toBeNull();
  });
});

// ── Confidence Decay ──────────────────────────────────────────────────────────

describe("Task 1296b — calculateConfidenceDecay", () => {
  it("returns 0.95 for age <= 7 days (fresh)", () => {
    expect(calculateConfidenceDecay(3)).toBe(0.95);
    expect(calculateConfidenceDecay(7)).toBe(0.95);
  });

  it("returns 0.85 for age 8–14 days (recent)", () => {
    expect(calculateConfidenceDecay(10)).toBe(0.85);
    expect(calculateConfidenceDecay(14)).toBe(0.85);
  });

  it("returns 0.70 for age 15–30 days (moderate)", () => {
    expect(calculateConfidenceDecay(20)).toBe(0.70);
    expect(calculateConfidenceDecay(30)).toBe(0.70);
  });

  it("returns 0.50 for age 31–60 days (stale)", () => {
    expect(calculateConfidenceDecay(45)).toBe(0.50);
    expect(calculateConfidenceDecay(60)).toBe(0.50);
  });

  it("returns 0.30 for age > 60 days (very old)", () => {
    expect(calculateConfidenceDecay(90)).toBe(0.30);
    expect(calculateConfidenceDecay(365)).toBe(0.30);
  });
});

// ── IMF Data Classifier ───────────────────────────────────────────────────────

describe("Task 1296b — classifyImfIndicators", () => {
  it("classifies growth forecast ↑ as imf_bullish", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({
          code: "NGDP_RPCH",
          value: 6.5,
          yoyChange: 0.12,
          ageInDays: 3,
          confidence: 0.95,
        }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.sentiment).toBeGreaterThan(0.3);
    expect(result.classification).toBe("imf_bullish");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("classifies growth forecast ↓ as imf_bearish", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({
          code: "NGDP_RPCH",
          value: 1.0,
          yoyChange: -0.04,
          ageInDays: 5,
          confidence: 0.92,
        }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.sentiment).toBeLessThan(0);
    expect(result.classification).toBe("imf_bearish");
  });

  it("maps growth bullish → banking sector impact +0.45", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({
          code: "NGDP_RPCH",
          value: 6.5,
          yoyChange: 0.12,
          ageInDays: 3,
          confidence: 0.95,
        }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    const bankingImpact = result.sectorImpacts.find(s => s.sector === "banking");
    expect(bankingImpact).toBeDefined();
    expect(bankingImpact!.impactScore).toBeGreaterThan(0);
    expect(bankingImpact!.direction).toBe("bullish");
  });

  it("penalizes confidence for stale data (ageInDays=45)", () => {
    const freshInput: ImfClassificationInput = {
      indicators: [makeIndicator({ ageInDays: 3, confidence: 0.95, yoyChange: 0.10 })],
      historicalBaseline: 3.0,
    };
    const staleInput: ImfClassificationInput = {
      indicators: [makeIndicator({ ageInDays: 45, confidence: 0.50, yoyChange: 0.10 })],
      historicalBaseline: 3.0,
    };
    const freshResult = classifyImfIndicators(freshInput);
    const staleResult = classifyImfIndicators(staleInput);
    expect(staleResult.confidence).toBeLessThan(freshResult.confidence);
  });

  it("returns imf_neutral for minimal yoyChange near zero", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ yoyChange: 0.001, ageInDays: 5, confidence: 0.90 }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.classification).toBe("imf_neutral");
    expect(Math.abs(result.sentiment)).toBeLessThan(0.3);
  });

  it("returns sectorImpacts array (non-empty for bullish signal)", () => {
    const input: ImfClassificationInput = {
      indicators: [makeIndicator({ yoyChange: 0.15, ageInDays: 3, confidence: 0.95 })],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(Array.isArray(result.sectorImpacts)).toBe(true);
    expect(result.sectorImpacts.length).toBeGreaterThan(0);
  });

  it("handles empty indicators array gracefully", () => {
    const input: ImfClassificationInput = {
      indicators: [],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.classification).toBe("imf_neutral");
    expect(result.sentiment).toBe(0);
  });
});

// ── Signal Type imfSentiment Extension ───────────────────────────────────────

describe("Task 1296b — ChainCatalystFindingData imfSentiment field", () => {
  const baseSignal = {
    event_type: "macro" as const,
    direction: "bullish" as const,
    confidence: 0.8,
    affected_stocks: ["VCB"],
    affected_sectors: ["banking"],
    headline: "Fed cuts rates",
    source: "reuters",
  };

  it("allows ChainCatalyst signal without imfSentiment (backwards compat)", () => {
    expect(() => ChainCatalystFindingDataSchema.parse(baseSignal)).not.toThrow();
  });

  it("allows ChainCatalyst signal with valid imfSentiment", () => {
    const withImf = {
      ...baseSignal,
      imfSentiment: {
        sentiment: 0.6,
        confidence: 0.88,
        affectedSectors: ["banking"],
        reasoning: "IMF growth forecast ↑ supports NIM expansion",
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(withImf)).not.toThrow();
    const parsed = ChainCatalystFindingDataSchema.parse(withImf);
    expect(parsed.imfSentiment?.sentiment).toBe(0.6);
    expect(parsed.imfSentiment?.confidence).toBe(0.88);
  });

  it("rejects imfSentiment with sentiment > 1.0 (out of range)", () => {
    const badSignal = {
      ...baseSignal,
      imfSentiment: {
        sentiment: 1.5, // Invalid: > 1.0
        confidence: 0.88,
        affectedSectors: ["banking"],
        reasoning: "...",
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(badSignal)).toThrow();
  });

  it("rejects imfSentiment with sentiment < -1.0 (out of range)", () => {
    const badSignal = {
      ...baseSignal,
      imfSentiment: {
        sentiment: -1.5, // Invalid: < -1.0
        confidence: 0.88,
        affectedSectors: ["banking"],
        reasoning: "...",
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(badSignal)).toThrow();
  });

  it("rejects imfSentiment with confidence > 1.0", () => {
    const badSignal = {
      ...baseSignal,
      imfSentiment: {
        sentiment: 0.5,
        confidence: 1.5, // Invalid
        affectedSectors: ["banking"],
        reasoning: "...",
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(badSignal)).toThrow();
  });

  it("rejects imfSentiment with empty reasoning", () => {
    const badSignal = {
      ...baseSignal,
      imfSentiment: {
        sentiment: 0.5,
        confidence: 0.8,
        affectedSectors: ["banking"],
        reasoning: "", // Invalid: empty
      },
    };
    expect(() => ChainCatalystFindingDataSchema.parse(badSignal)).toThrow();
  });
});
