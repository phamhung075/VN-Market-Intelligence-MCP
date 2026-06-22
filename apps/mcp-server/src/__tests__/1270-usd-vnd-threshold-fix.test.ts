Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { classifyDeviation } from "../domain/services/macroThresholds";

describe("Task 1270 — USD/VND minimum absolute deviation guard", () => {
  /**
   * AC-1: 2.8 VND deviation (0.011% move) should return MEDIUM or NORMAL,
   * not CRITICAL, even if z-score is extreme (> 3σ).
   *
   * Real-world scenario: SBV official rate oscillates ±2-3 VND daily.
   * Mean=26334, current=26331.2 (2.8 VND lower), stdDev=0.76
   * → zScore = -3.68σ → EXTREME before fix
   * But 2.8 VND is economically meaningless (0.011% of 26334)
   */
  it("AC-1: 2.8 VND deviation should NOT trigger CRITICAL alert", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26331.2,  // 2.8 VND below mean
      mean: 26334,
      stdDev: 0.76,      // Very tight band (micro-fluctuations)
      sampleCount: 30,
    });

    // Should be downgraded to "normal" or "elevated" due to absolute deviation guard
    expect(result.level).not.toBe("extreme");
    expect(result.level).not.toBe("high");
  });

  /**
   * AC-2: Task 1270 raised the minimum from 10 → 50 VND.
   * 10 VND (0.038% of 26,334) is a micro-oscillation — must NOT trigger HIGH.
   */
  it("AC-2: 10 VND deviation should NOT trigger HIGH or EXTREME (below 50 VND minimum)", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26324,    // 10 VND below mean
      mean: 26334,
      stdDev: 0.76,
      sampleCount: 30,
    });

    // 10 VND < 50 VND minimum → capped at elevated
    expect(result.level).not.toBe("high");
    expect(result.level).not.toBe("extreme");
  });

  /**
   * AC-3: Verify that genuinely large moves (≥ 0.5% of rate level) still trigger EXTREME.
   *
   * FX-SIGMA-PHANTOM-EXTREME contract (dfb4e268): Guard-2 requires %-move ≥ 0.5% before
   * escalating FX slow-movers to high/extreme. On a USD/VND base of ~26334, 0.5% = ~132 VND.
   *
   * 50 VND = 0.19% — this is below the 0.5% floor, so Guard-2 caps it at "elevated" even
   * with a tight stdDev=0.76 (phantom-σ scenario). The original AC-3 comment ("50 VND should
   * trigger EXTREME regardless of stdDev") was written before Guard-2 was introduced;
   * under the current contract 50 VND / 0.19% is micro-noise → "elevated".
   *
   * Genuine extreme: use 150 VND (0.57% > 0.5% floor, stdDev=0.76 → 197σ-extreme).
   * This verifies the floor passes and extreme fires for a real macro shock-sized move.
   */
  it("AC-3: 150 VND deviation (0.57% > 0.5% floor) should trigger EXTREME alert", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26184,    // 150 VND below mean; 150/26334 = 0.57% > 0.5% floor
      mean: 26334,
      stdDev: 0.76,
      sampleCount: 30,
    });

    // 150 VND / 0.57% clears the %-floor → Guard-2 does not cap → extreme fires
    expect(result.level).toBe("extreme");
  });

  /**
   * AC-4: Verify that < 10 VND deviation returns "normal" or "elevated"
   * (5 VND deviation should be filtered out)
   */
  it("AC-4: 5 VND deviation should return normal or elevated, not high/extreme", () => {
    const result = classifyDeviation({
      name: "usdVndRate",
      current: 26329,    // 5 VND below mean
      mean: 26334,
      stdDev: 2,
      sampleCount: 30,
    });

    // 5 VND is below the 10 VND minimum threshold
    expect(["normal", "elevated"]).toContain(result.level);
  });

  /**
   * AC-5: Ensure the guard applies only to USD/VND and similar micro-fluctuation
   * indicators. Other indicators (oil, gold) should NOT be affected.
   * (This test verifies the guard doesn't break other macro indicators)
   */
  it("AC-5: Oil (brentCrudeUSD) still detects extreme moves correctly", () => {
    const result = classifyDeviation({
      name: "brentCrudeUSD",
      current: 98,       // $8 above mean
      mean: 90,
      stdDev: 8,         // Higher stdDev for oil
      sampleCount: 30,
    });

    // zScore = 8/8 = 1.0 → elevated (no VND guard applies)
    expect(result.level).toBe("elevated");
  });

  /**
   * AC-6: Gold indicator should still work
   */
  it("AC-6: Gold (goldUSDPerOz) still detects extreme moves correctly", () => {
    const result = classifyDeviation({
      name: "goldUSDPerOz",
      current: 2000,     // $60 above mean
      mean: 1940,
      stdDev: 30,
      sampleCount: 30,
    });

    // zScore = 60/30 = 2.0 → high
    expect(result.level).toBe("high");
  });
});
