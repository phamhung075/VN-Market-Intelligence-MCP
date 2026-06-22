Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { classifyDeviation } from "../domain/services/macroThresholds";

describe("1269: Macro Direction Label — above/below mean distinction", () => {
  // TC-1: Elevated Above
  // current: 26351, mean: 26333, stdDev: 12
  // zScore: +1.5 → elevated, above
  // expected_label: "cao hơn TB"
  it("TC-1: elevated above → summary contains 'cao hơn TB'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26351,
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("elevated");
    expect(result.direction).toBe("above");
    expect(result.zScore).toBeCloseTo(1.5, 1);
    expect(result.summary).toContain("cao hơn TB");
  });

  // TC-2: Elevated Below (FAILS without fix)
  // current: 26315, mean: 26333, stdDev: 12
  // zScore: -1.5 → elevated, below
  // expected_label: "thấp hơn TB"
  // actual_label (BUG): "cao hơn TB"
  it("TC-2: elevated below → summary contains 'thấp hơn TB'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26315,
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("elevated");
    expect(result.direction).toBe("below");
    expect(result.zScore).toBeCloseTo(-1.5, 1);
    expect(result.summary).toContain("thấp hơn TB");
  });

  // TC-3: High Above
  // FX-SIGMA-PHANTOM-EXTREME contract (dfb4e268): Guard-2 requires %-move ≥ 0.5%
  // before escalating FX slow-movers to high/extreme. 55 VND on a 26333 base = 0.21%
  // — below the 0.5% floor — so high/extreme is suppressed to "elevated" regardless of σ.
  // To produce a genuine "high" label on USD/VND we must use a deviation ≥ 0.5% of mean
  // (≥131 VND) AND ≥ 2σ. Use mean=26269, stdDev=60, deviation=168 VND:
  //   0.64% > 0.5% floor → Guard-2 passes; 168/60 = 2.80σ → "high"
  // NOTE: old TC-3 used stdDev=20/deviation=55 (0.21%) — pre-floor, now "elevated".
  it("TC-3: high above → summary contains 'cao bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26437,  // 168 VND above mean; 168/26269 = 0.64% > 0.5% floor
      mean: 26269,
      stdDev: 60,      // 168/60 = 2.80σ → "high"
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cao bất thường");
  });

  // TC-4: High Below (FAILS without direction-label fix)
  // Same %-floor logic as TC-3: use deviation=168 VND (0.64%), stdDev=60 → 2.80σ, "high".
  // NOTE: old TC-4 used stdDev=20/deviation=55 (0.21%) — pre-floor, now "elevated".
  it("TC-4: high below → summary contains 'thấp bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26101,  // 168 VND below mean; 168/26269 = 0.64% > 0.5% floor
      mean: 26269,
      stdDev: 60,      // 168/60 = 2.80σ → "high"
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("thấp bất thường");
  });

  // TC-5: Extreme Above
  // FX-SIGMA-PHANTOM-EXTREME contract: deviation must be ≥ 0.5% of mean to reach "extreme".
  // Use mean=26269, stdDev=60, deviation=200 VND: 0.76% > 0.5% floor; 200/60 = 3.33σ → "extreme"
  // NOTE: old TC-5 used stdDev=20/deviation=75 (0.28%) — pre-floor, now "elevated".
  it("TC-5: extreme above → summary contains 'cực cao'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26469,  // 200 VND above mean; 200/26269 = 0.76% > 0.5% floor
      mean: 26269,
      stdDev: 60,      // 200/60 = 3.33σ → "extreme"
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cực cao");
  });

  // TC-6: Extreme Below
  // Same %-floor logic as TC-5: deviation=200 VND (0.76%), stdDev=60 → 3.33σ, "extreme".
  // NOTE: old TC-6 used stdDev=20/deviation=75 (0.28%) — pre-floor, now "elevated".
  it("TC-6: extreme below → summary contains 'cực thấp'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26069,  // 200 VND below mean; 200/26269 = 0.76% > 0.5% floor
      mean: 26269,
      stdDev: 60,      // 200/60 = 3.33σ → "extreme"
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("cực thấp");
  });
});
