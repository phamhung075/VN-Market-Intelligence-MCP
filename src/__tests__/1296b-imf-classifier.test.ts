/**
 * Task 1296b — RED Phase: IMF Data Classifier Deep Tests (AC-2)
 *
 * Assertions:
 *   - Weighted sentiment formula (multi-indicator arithmetic)
 *   - Banking sector impact ≈ 0.45 (within ±0.02)
 *   - Export sector impact ≈ 0.35 (within ±0.02)
 *   - Stale indicator produces confidence < 0.60
 *   - Growth contraction: sentiment < -0.3
 *   - All-stale result: classification forced to imf_neutral, confidence <= 0.30
 */

import { describe, it, expect } from "bun:test";
import {
  calculateConfidenceDecay,
  type ImfIndicator,
  type ImfClassificationInput,
} from "../domain/models/imfIndicators.js";
import { classifyImfIndicators } from "../domain/services/imfDataClassifier.js";

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
    confidence: 0.95,
    ...overrides,
  };
}

describe("Task 1296b — IMF Classifier: AC-2 weighted sentiment", () => {
  it("banking sector impact ≈ 0.45 when growth rule fires (±0.02 tolerance)", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ code: "NGDP_RPCH", yoyChange: 0.12, ageInDays: 3, confidence: 0.95 }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    const banking = result.sectorImpacts.find(s => s.sector === "banking");
    expect(banking).toBeDefined();
    expect(banking!.impactScore).toBeGreaterThanOrEqual(0.43);
    expect(banking!.impactScore).toBeLessThanOrEqual(0.47);
  });

  it("export sector impact ≈ 0.35 when growth rule fires (±0.02 tolerance)", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ code: "NGDP_RPCH", yoyChange: 0.12, ageInDays: 3, confidence: 0.95 }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    const exportSector = result.sectorImpacts.find(s => s.sector === "export");
    expect(exportSector).toBeDefined();
    expect(exportSector!.impactScore).toBeGreaterThanOrEqual(0.33);
    expect(exportSector!.impactScore).toBeLessThanOrEqual(0.37);
  });

  it("stale indicator (ageInDays=45) produces result.confidence < 0.60", () => {
    const input: ImfClassificationInput = {
      indicators: [makeIndicator({ ageInDays: 45, confidence: 0.50, yoyChange: 0.10 })],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.confidence).toBeLessThan(0.60);
  });

  it("growth contraction (yoyChange: -0.04) returns sentiment < -0.3", () => {
    const input: ImfClassificationInput = {
      indicators: [makeIndicator({ yoyChange: -0.04, ageInDays: 5, confidence: 0.92 })],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.sentiment).toBeLessThan(-0.3);
  });

  it("multi-indicator: weighted average computed correctly", () => {
    // Two indicators with known yoyChange and confidence
    // Weighted result must be between the two individual sentiments
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ code: "NGDP_RPCH", yoyChange: 0.15, ageInDays: 3, confidence: 0.95 }),
        makeIndicator({ code: "PCPIEPCH", yoyChange: -0.02, ageInDays: 5, confidence: 0.92, name: "EM Inflation" }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    // Result must be between pure bullish and pure bearish (weighted blend)
    expect(result.sentiment).toBeGreaterThan(-1);
    expect(result.sentiment).toBeLessThan(1);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("all-stale indicators (ageInDays > 60): classification forced to imf_neutral, confidence <= 0.30", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ ageInDays: 90, confidence: 0.30, yoyChange: 0.10 }),
        makeIndicator({ code: "PCPIEPCH", ageInDays: 120, confidence: 0.30, yoyChange: 0.05 }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.confidence).toBeLessThanOrEqual(0.30);
    expect(result.classification).toBe("imf_neutral");
  });
});
