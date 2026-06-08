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
  // Task 1270: 50 VND guard raised 10→50. Use stdDev=20, deviation=55 VND
  // so absolute guard passes (55 > 50) and zScore=2.75 → high.
  it("TC-3: above-mean high → summary contains 'cao bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26388,   // 55 VND above mean; zScore = 55/20 = 2.75 → high, above
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cao bất thường");
  });

  // TC-4: below-mean high → label contains "thấp bất thường" (FAILS before fix)
  it("TC-4: below-mean high → summary contains 'thấp bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26278,   // 55 VND below mean; zScore = -55/20 = -2.75 → high, below
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("thấp bất thường");
  });

  // TC-5: above-mean extreme → label contains "cực cao"
  it("TC-5: above-mean extreme → summary contains 'cực cao'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26408,   // 75 VND above mean; zScore = 75/20 = 3.75 → extreme, above
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cực cao");
  });

  // TC-6: below-mean extreme → label contains "cực thấp" (FAILS before fix)
  it("TC-6: below-mean extreme → summary contains 'cực thấp'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26258,   // 75 VND below mean; zScore = -75/20 = -3.75 → extreme, below
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("cực thấp");
  });
});
