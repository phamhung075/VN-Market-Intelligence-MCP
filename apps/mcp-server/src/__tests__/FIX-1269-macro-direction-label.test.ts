/**
 * FIX-1269 — Macro Direction Label: cao hơn / thấp hơn TB based on zScore sign
 *
 * Bug: Morning briefing showed "Dầu Brent: 94.46 — cao hơn TB (-1.65σ dưới TB 97.46)"
 * The label "cao hơn TB" (above average) was hardcoded regardless of zScore sign.
 *
 * Fix: classifyDeviation selects LEVEL_VI_BELOW when direction === "below",
 * so negative zScore → "thấp hơn TB", and positive zScore → "cao hơn TB".
 */

import { describe, it, expect } from "bun:test";
import { classifyDeviation } from "../domain/services/macroThresholds.js";

describe("FIX-1269 — macro direction label based on zScore sign", () => {
  // TC-1 (from bug report): brentCrudeUSD, zScore = -1.65 → "thấp hơn TB"
  it("TC-1: zScore -1.65, brentCrudeUSD → label contains 'thấp hơn TB'", () => {
    // mean=97.46, stdDev=2.098 → zScore = (94.46 - 97.46) / 2.098 ≈ -1.43
    // Use stdDev that yields exactly ≈ -1.65σ
    const stdDev = (97.46 - 94.46) / 1.65; // ≈ 1.818
    const result = classifyDeviation({
      name: "brentCrudeUSD",
      current: 94.46,
      mean: 97.46,
      stdDev,
      sampleCount: 30,
    });
    expect(result.direction).toBe("below");
    expect(result.zScore).toBeCloseTo(-1.65, 1);
    expect(result.summary).toContain("thấp hơn TB");
    expect(result.summary).not.toContain("cao hơn TB");
  });

  // TC-2: same indicator, positive zScore → "cao hơn TB"
  it("TC-2: zScore +1.65, brentCrudeUSD → label contains 'cao hơn TB'", () => {
    const stdDev = (100.5 - 97.46) / 1.65; // ≈ 1.842
    const result = classifyDeviation({
      name: "brentCrudeUSD",
      current: 100.5,
      mean: 97.46,
      stdDev,
      sampleCount: 30,
    });
    expect(result.direction).toBe("above");
    expect(result.zScore).toBeCloseTo(1.65, 1);
    expect(result.summary).toContain("cao hơn TB");
    expect(result.summary).not.toContain("thấp hơn TB");
  });

  // TC-3: zScore exactly 0 → "bình thường" (at_mean)
  it("TC-3: zScore ≈ 0 → direction 'at_mean', summary contains 'bình thường'", () => {
    const result = classifyDeviation({
      name: "brentCrudeUSD",
      current: 97.46,
      mean: 97.46,
      stdDev: 2.0,
      sampleCount: 30,
    });
    expect(result.direction).toBe("at_mean");
    expect(result.summary).toContain("bình thường");
  });
});
