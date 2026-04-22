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
  // current: 26364, mean: 26333, stdDev: 12
  // zScore: +2.58 → high, above
  // expected_label: "cao bất thường"
  it("TC-3: high above → summary contains 'cao bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26364,
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cao bất thường");
  });

  // TC-4: High Below (FAILS without fix)
  // current: 26302, mean: 26333, stdDev: 12
  // zScore: -2.58 → high, below
  // expected_label: "thấp bất thường"
  // actual_label (BUG): "cao bất thường"
  it("TC-4: high below → summary contains 'thấp bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26302,
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("thấp bất thường");
  });

  // TC-5: Extreme Above
  // current: 26375, mean: 26333, stdDev: 12
  // zScore: +3.5 → extreme, above
  // expected_label: "cực cao"
  it("TC-5: extreme above → summary contains 'cực cao'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26375,
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cực cao");
  });

  // TC-6: Extreme Below (FAILS without fix)
  // current: 26291, mean: 26333, stdDev: 12
  // zScore: -3.5 → extreme, below
  // expected_label: "cực thấp"
  // actual_label (BUG): "cực cao"
  it("TC-6: extreme below → summary contains 'cực thấp'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26291,
      mean: 26333,
      stdDev: 12,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("cực thấp");
  });
});
