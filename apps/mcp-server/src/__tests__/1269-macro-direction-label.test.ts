Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { classifyDeviation } from "../domain/services/macroThresholds";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

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
  // Task 1270: 50 VND minimum guard raised from 10→50. Use stdDev=20 so
  // 55 VND deviation (>50 VND guard) still lands in "high" zone (2.75σ).
  // current: 26388, mean: 26333, stdDev: 20
  // deviation: 55 VND (> 50 VND guard), zScore: +2.75 → high, above
  // expected_label: "cao bất thường"
  it("TC-3: high above → summary contains 'cao bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26388,
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cao bất thường");
  });

  // TC-4: High Below (FAILS without direction-label fix)
  // current: 26278, mean: 26333, stdDev: 20
  // deviation: -55 VND (> 50 VND guard), zScore: -2.75 → high, below
  // expected_label: "thấp bất thường"
  it("TC-4: high below → summary contains 'thấp bất thường'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26278,
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("high");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("thấp bất thường");
  });

  // TC-5: Extreme Above
  // current: 26408, mean: 26333, stdDev: 20
  // deviation: 75 VND (> 50 VND guard), zScore: +3.75 → extreme, above
  // expected_label: "cực cao"
  it("TC-5: extreme above → summary contains 'cực cao'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26408,
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cực cao");
  });

  // TC-6: Extreme Below (FAILS without direction-label fix)
  // current: 26258, mean: 26333, stdDev: 20
  // deviation: -75 VND (> 50 VND guard), zScore: -3.75 → extreme, below
  // expected_label: "cực thấp"
  it("TC-6: extreme below → summary contains 'cực thấp'", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26258,
      mean: 26333,
      stdDev: 20,
      sampleCount: 30,
    });
    expect(result.level).toBe("extreme");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("cực thấp");
  });
});
