Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { classifyDeviation } from "../domain/services/macroThresholds";

describe("classifyDeviation — direction-aware Vietnamese labels", () => {
  // TC-1: above-mean elevated → label contains "cao hơn TB"
  it("TC-1: above-mean elevated → summary contains 'cao hơn TB'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26351,   // zScore = (26351 - 26333) / 12 = +1.5 → elevated, above
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("elevated");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cao hơn TB");
  });

  // TC-2: below-mean elevated → label contains "thấp hơn TB" (FAILS before fix)
  it("TC-2: below-mean elevated → summary contains 'thấp hơn TB'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26315,   // zScore = (26315 - 26333) / 12 = -1.5 → elevated, below
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("elevated");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("thấp hơn TB");
  });

  // TC-3: above-mean high → label contains "cao bất thường"
  // FX-SIGMA-PHANTOM-EXTREME contract (dfb4e268): Guard-2 requires %-move ≥ 0.5% before
  // escalating FX slow-movers to high/extreme. 55 VND on 26333 base = 0.21% — below the
  // 0.5% floor — so the old stdDev=20/deviation=55 case would now be "elevated".
  // Updated: use mean=26269, stdDev=60, deviation=168 VND (0.64% > 0.5%, 2.80σ → "high")
  // to verify the direction label fires correctly when Guard-2 is cleared.
  it("TC-3: above-mean high → summary contains 'cao bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26437,   // 168 VND above mean; 168/26269 = 0.64% > 0.5% floor; 168/60 = 2.80σ → high
      mean: 26269,
      stdDev: 60,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cao bất thường");
  });

  // TC-4: below-mean high → label contains "thấp bất thường"
  // Same %-floor logic as TC-3: deviation=168 VND (0.64%), stdDev=60 → 2.80σ, "high".
  it("TC-4: below-mean high → summary contains 'thấp bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26101,   // 168 VND below mean; 168/26269 = 0.64% > 0.5% floor; 168/60 = 2.80σ → high
      mean: 26269,
      stdDev: 60,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("thấp bất thường");
  });

  // TC-5: above-mean extreme → label contains "cực cao"
  // FX-SIGMA-PHANTOM-EXTREME contract: deviation ≥ 0.5% of mean to reach "extreme".
  // Use mean=26269, stdDev=60, deviation=200 VND: 0.76% > 0.5% floor; 200/60 = 3.33σ → "extreme"
  it("TC-5: above-mean extreme → summary contains 'cực cao'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26469,   // 200 VND above mean; 200/26269 = 0.76% > 0.5% floor; 200/60 = 3.33σ → extreme
      mean: 26269,
      stdDev: 60,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cực cao");
  });

  // TC-6: below-mean extreme → label contains "cực thấp"
  // Same %-floor logic as TC-5: deviation=200 VND (0.76%), stdDev=60 → 3.33σ, "extreme".
  it("TC-6: below-mean extreme → summary contains 'cực thấp'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26069,   // 200 VND below mean; 200/26269 = 0.76% > 0.5% floor; 200/60 = 3.33σ → extreme
      mean: 26269,
      stdDev: 60,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("cực thấp");
  });
});
