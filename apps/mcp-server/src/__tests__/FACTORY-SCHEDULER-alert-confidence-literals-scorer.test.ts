/**
 * FACTORY-SCHEDULER-alert-confidence-literals — pure domain scorer tests
 *
 * Covers the three new pure domain/services functions added to derive alert
 * and evidence confidence from a real in-scope strength signal instead of a
 * frozen literal:
 *   - deriveConfidenceFromStrength  (domain/services/alertConfidenceScorer.ts)
 *   - computeBbBreakoutStrength     (domain/services/bbBreakoutStrength.ts)
 *   - computeRsiExtremityStrength   (domain/services/rsiExtremityStrength.ts)
 *
 * Per-job wiring (end-to-end, via the scheduler jobs) is covered separately in
 * 1133-foreign-flow-alert-job.test.ts, 1143-insider-check-job.test.ts,
 * 1309-bb-alert-scan-job.test.ts, and 1307-ta-alert-scan-job.test.ts.
 */

import { describe, it, expect } from "bun:test";
import { deriveConfidenceFromStrength } from "../domain/services/alertConfidenceScorer.js";
import { computeBbBreakoutStrength } from "../domain/services/bbBreakoutStrength.js";
import { computeRsiExtremityStrength } from "../domain/services/rsiExtremityStrength.js";

describe("FACTORY-SCHEDULER-alert-confidence-literals — deriveConfidenceFromStrength", () => {
  it("returns base at strength=0", () => {
    expect(deriveConfidenceFromStrength({ strength: 0, base: 0.55, ceiling: 0.95 })).toBe(0.55);
  });

  it("returns ceiling at strength=1", () => {
    expect(deriveConfidenceFromStrength({ strength: 1, base: 0.55, ceiling: 0.95 })).toBe(0.95);
  });

  it("interpolates linearly at strength=0.5", () => {
    expect(deriveConfidenceFromStrength({ strength: 0.5, base: 0.5, ceiling: 0.9 })).toBeCloseTo(0.7, 10);
  });

  it("two different strengths produce two different confidence values", () => {
    const weak = deriveConfidenceFromStrength({ strength: 0.2, base: 0.55, ceiling: 0.95 });
    const strong = deriveConfidenceFromStrength({ strength: 0.9, base: 0.55, ceiling: 0.95 });
    expect(weak).not.toBe(strong);
    expect(strong).toBeGreaterThan(weak);
  });

  it("clamps strength > 1 to ceiling (does not overshoot)", () => {
    expect(deriveConfidenceFromStrength({ strength: 5, base: 0.55, ceiling: 0.95 })).toBe(0.95);
  });

  it("clamps strength < 0 to base (does not undershoot)", () => {
    expect(deriveConfidenceFromStrength({ strength: -3, base: 0.55, ceiling: 0.95 })).toBe(0.55);
  });
});

describe("FACTORY-SCHEDULER-alert-confidence-literals — computeBbBreakoutStrength", () => {
  it("returns 0 strength when close is just past the upper band", () => {
    const s = computeBbBreakoutStrength({ close: 86_500.001, upper: 86_500, lower: 82_000 });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeCloseTo(0, 3);
  });

  it("returns proportional strength for a breakout-up", () => {
    // 1500 above upper on a 4500-wide band = 1/3
    const s = computeBbBreakoutStrength({ close: 88_000, upper: 86_500, lower: 82_000 });
    expect(s).toBeCloseTo(1 / 3, 10);
  });

  it("returns proportional strength for a breakout-down", () => {
    const s = computeBbBreakoutStrength({ close: 22_000, upper: 24_000, lower: 23_100 });
    // 1100 below lower on a 900-wide band → clamps to 1
    expect(s).toBe(1);
  });

  it("returns 0 when close is inside the band", () => {
    expect(computeBbBreakoutStrength({ close: 84_000, upper: 86_000, lower: 82_000 })).toBe(0);
  });

  it("two different penetration depths produce two different strengths", () => {
    const shallow = computeBbBreakoutStrength({ close: 86_600, upper: 86_500, lower: 82_000 });
    const deep = computeBbBreakoutStrength({ close: 90_000, upper: 86_500, lower: 82_000 });
    expect(shallow).not.toBe(deep);
    expect(deep).toBeGreaterThan(shallow);
  });

  it("degenerate inverted band (upper < lower) fails safe: always max strength, never silently 0", () => {
    // width < 0 — every close value satisfies (close > upper) or (close < lower)
    // simultaneously in a malformed inverted band; the function never returns a
    // false "inside the band, no breakout" 0 for this data-quality failure mode.
    expect(computeBbBreakoutStrength({ close: 100, upper: 50, lower: 60 })).toBe(1);
    expect(computeBbBreakoutStrength({ close: 55, upper: 50, lower: 60 })).toBe(1);
  });

  it("zero-width band (upper === lower): close exactly on the point is 0, any other close is 1", () => {
    expect(computeBbBreakoutStrength({ close: 50, upper: 50, lower: 50 })).toBe(0);
    expect(computeBbBreakoutStrength({ close: 51, upper: 50, lower: 50 })).toBe(1);
  });
});

describe("FACTORY-SCHEDULER-alert-confidence-literals — computeRsiExtremityStrength", () => {
  it("returns 0 strength exactly at the overbought threshold (RSI=70)", () => {
    expect(computeRsiExtremityStrength({ rsi: 70, direction: "overbought" })).toBe(0);
  });

  it("returns 1 strength when RSI saturates at 100 (overbought)", () => {
    expect(computeRsiExtremityStrength({ rsi: 100, direction: "overbought" })).toBe(1);
  });

  it("returns 0 strength exactly at the oversold threshold (RSI=30)", () => {
    expect(computeRsiExtremityStrength({ rsi: 30, direction: "oversold" })).toBe(0);
  });

  it("returns 1 strength when RSI saturates at 0 (oversold)", () => {
    expect(computeRsiExtremityStrength({ rsi: 0, direction: "oversold" })).toBe(1);
  });

  it("two different RSI extremities produce two different strengths", () => {
    const barely = computeRsiExtremityStrength({ rsi: 71, direction: "overbought" });
    const deeply = computeRsiExtremityStrength({ rsi: 95, direction: "overbought" });
    expect(barely).not.toBe(deeply);
    expect(deeply).toBeGreaterThan(barely);
  });

  it("clamps beyond-saturation RSI to strength=1 (never throws, never overshoots)", () => {
    expect(computeRsiExtremityStrength({ rsi: 999, direction: "overbought" })).toBe(1);
  });
});
