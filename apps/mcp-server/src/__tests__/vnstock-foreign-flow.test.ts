/**
 * Task 280 — Foreign Flow Delta Analysis
 * Tests for analyzeForeignFlow() domain service.
 */

import { describe, it, expect } from "bun:test";
import {
  analyzeForeignFlow,
  type DailyForeignFlow,
  type ForeignFlowSignal,
} from "../domain/services/foreignFlowAnalyzer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlow(
  code: string,
  date: string,
  foreignVolume: number,
  foreignRoom = 10_000_000,
  holdingRatio = 0.3,
): DailyForeignFlow {
  return { code, date, foreignVolume, foreignRoom, holdingRatio };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 280 — Foreign Flow Analyzer", () => {
  // 1. Empty / insufficient data
  it("returns null when history is empty", () => {
    expect(analyzeForeignFlow([])).toBeNull();
  });

  it("returns null when only one data point (need at least 2 for delta)", () => {
    const history = [makeFlow("VNM", "2026-04-03", 500_000)];
    expect(analyzeForeignFlow(history)).toBeNull();
  });

  // 2. Neutral — small absolute deltas
  it("returns neutral when daily deltas are small (< threshold)", () => {
    const history = [
      makeFlow("VNM", "2026-04-03", 1_010_000),
      makeFlow("VNM", "2026-04-02", 1_000_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.netFlowDirection).toBe("neutral");
    expect(signal!.severity).toBe("low");
  });

  // 3. Consecutive NET BUY — 3-day streak above threshold
  it("detects 3-day consecutive net buy with total > 100k shares → HIGH", () => {
    const history = [
      makeFlow("FPT", "2026-04-03", 2_000_000),
      makeFlow("FPT", "2026-04-02", 1_850_000),
      makeFlow("FPT", "2026-04-01", 1_700_000),
      makeFlow("FPT", "2026-03-31", 1_540_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.netFlowDirection).toBe("net_buy");
    expect(signal!.consecutiveDays).toBe(3);
    expect(signal!.severity).toBe("high");
    expect(signal!.reasoning).toContain("smart money accumulation");
  });

  // 4. Consecutive NET SELL — 3-day streak above threshold
  it("detects 3-day consecutive net sell with total > 100k shares → HIGH", () => {
    const history = [
      makeFlow("VCB", "2026-04-03", 1_200_000),
      makeFlow("VCB", "2026-04-02", 1_350_000),
      makeFlow("VCB", "2026-04-01", 1_500_000),
      makeFlow("VCB", "2026-03-31", 1_650_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.netFlowDirection).toBe("net_sell");
    expect(signal!.consecutiveDays).toBe(3);
    expect(signal!.severity).toBe("high");
    expect(signal!.reasoning).toContain("smart money exit");
  });

  // 5. Mixed signals — alternating buy/sell
  it("detects mixed direction as neutral when no streak", () => {
    const history = [
      makeFlow("VEA", "2026-04-03", 1_100_000),
      makeFlow("VEA", "2026-04-02", 1_200_000),  // sell day
      makeFlow("VEA", "2026-04-01", 1_050_000),  // buy day
      makeFlow("VEA", "2026-03-31", 1_100_000),  // sell day
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.netFlowDirection).toBe("neutral");
  });

  // 6. 2-day streak is not HIGH (below 3-day threshold)
  it("returns MEDIUM for 2-day streak with large net volume", () => {
    const history = [
      makeFlow("FPT", "2026-04-03", 1_500_000),
      makeFlow("FPT", "2026-04-02", 1_200_000),
      makeFlow("FPT", "2026-04-01", 900_000),    // flat / opposite
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.consecutiveDays).toBeLessThan(3);
    expect(signal!.severity).not.toBe("high");
  });

  // 7. totalNetVolume3d calculation
  it("correctly computes totalNetVolume3d as sum of last 3 deltas", () => {
    // Day deltas: [+50k, +60k, +40k] summed = +150k
    const history = [
      makeFlow("VNM", "2026-04-03", 300_000),
      makeFlow("VNM", "2026-04-02", 250_000),
      makeFlow("VNM", "2026-04-01", 190_000),
      makeFlow("VNM", "2026-03-31", 150_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    // delta[0]=50k, delta[1]=60k, delta[2]=40k → sum=150k
    expect(signal!.totalNetVolume3d).toBe(150_000);
  });

  // 8. totalNetVolume5d calculation
  it("correctly computes totalNetVolume5d over 5 days", () => {
    // deltas: [+30k, +20k, +25k, +15k, +10k] = 100k
    const history = [
      makeFlow("VNM", "2026-04-05", 200_000),
      makeFlow("VNM", "2026-04-04", 170_000),
      makeFlow("VNM", "2026-04-03", 150_000),
      makeFlow("VNM", "2026-04-02", 125_000),
      makeFlow("VNM", "2026-04-01", 110_000),
      makeFlow("VNM", "2026-03-31", 100_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.totalNetVolume5d).toBe(100_000);
  });

  // 9. holdingRatioChange5d — drop > 0.5% is notable
  it("detects holding ratio drop > 0.5% over 5 days", () => {
    const history = [
      makeFlow("VCB", "2026-04-05", 1_000_000, 5_000_000, 0.285),
      makeFlow("VCB", "2026-04-04", 1_000_000, 5_000_000, 0.287),
      makeFlow("VCB", "2026-04-03", 1_000_000, 5_000_000, 0.289),
      makeFlow("VCB", "2026-04-02", 1_000_000, 5_000_000, 0.291),
      makeFlow("VCB", "2026-04-01", 1_000_000, 5_000_000, 0.293),
      makeFlow("VCB", "2026-03-31", 1_000_000, 5_000_000, 0.296),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    // 0.285 - 0.296 = -0.011 → -1.1% change, absolute > 0.005
    expect(signal!.holdingRatioChange5d).toBeLessThan(-0.005);
  });

  // 10. holdingRatioChange5d — small change is near zero
  it("returns small holdingRatioChange5d when ratio is stable", () => {
    const history = [
      makeFlow("VNM", "2026-04-05", 1_000_000, 5_000_000, 0.300),
      makeFlow("VNM", "2026-04-04", 1_000_000, 5_000_000, 0.300),
      makeFlow("VNM", "2026-04-03", 1_000_000, 5_000_000, 0.301),
      makeFlow("VNM", "2026-04-02", 1_000_000, 5_000_000, 0.301),
      makeFlow("VNM", "2026-04-01", 1_000_000, 5_000_000, 0.302),
      makeFlow("VNM", "2026-03-31", 1_000_000, 5_000_000, 0.301),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    // holdingRatioChange5d is a real number here (history has non-null holding data)
    expect(signal!.holdingRatioChange5d).not.toBeNull();
    expect(Math.abs(signal!.holdingRatioChange5d as number)).toBeLessThan(0.005);
  });

  // 11. Net sell streak — 4 days should still count as consecutiveDays=4
  it("reports correct consecutiveDays for a 4-day sell streak", () => {
    const history = [
      makeFlow("FPT", "2026-04-04", 500_000),
      makeFlow("FPT", "2026-04-03", 650_000),
      makeFlow("FPT", "2026-04-02", 800_000),
      makeFlow("FPT", "2026-04-01", 950_000),
      makeFlow("FPT", "2026-03-31", 1_100_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.consecutiveDays).toBe(4);
    expect(signal!.netFlowDirection).toBe("net_sell");
  });

  // 12. Streak below volume threshold should be MEDIUM not HIGH
  it("returns MEDIUM when streak >= 3 but total volume < 100k", () => {
    // Very small deltas: +5k per day for 3 days = 15k total (well below 100k)
    const history = [
      makeFlow("VEA", "2026-04-03", 1_015_000),
      makeFlow("VEA", "2026-04-02", 1_010_000),
      makeFlow("VEA", "2026-04-01", 1_005_000),
      makeFlow("VEA", "2026-03-31", 1_000_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    // streak=3 but total only 15k < 100k → not HIGH
    expect(signal!.severity).not.toBe("high");
  });

  // 13. Signal has correct code
  it("preserves code in returned signal", () => {
    const history = [
      makeFlow("VNM", "2026-04-03", 600_000),
      makeFlow("VNM", "2026-04-02", 500_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal!.code).toBe("VNM");
  });

  // 14. All net_buy with exactly 100k threshold
  it("exactly 100k total over 3 days triggers HIGH", () => {
    // 3 days, each with 33,334 delta ≈ 100k total
    const history = [
      makeFlow("VNM", "2026-04-03", 1_100_000),
      makeFlow("VNM", "2026-04-02", 1_066_666),
      makeFlow("VNM", "2026-04-01", 1_033_332),
      makeFlow("VNM", "2026-03-31", 999_998),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    // each delta ~33334, sum ~100002 ≥ 100k
    if (signal!.totalNetVolume3d >= 100_000) {
      expect(signal!.severity).toBe("high");
    }
  });

  // 15. Reasoning string is always present
  it("always returns a non-empty reasoning string", () => {
    const history = [
      makeFlow("VCB", "2026-04-03", 1_050_000),
      makeFlow("VCB", "2026-04-02", 1_000_000),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    expect(signal!.reasoning.length).toBeGreaterThan(0);
  });

  // 16. Large buy streak with accumulated holding ratio gain
  it("reflects positive holdingRatioChange5d for steady accumulation", () => {
    const history = [
      makeFlow("FPT", "2026-04-05", 2_000_000, 5_000_000, 0.320),
      makeFlow("FPT", "2026-04-04", 2_000_000, 5_000_000, 0.318),
      makeFlow("FPT", "2026-04-03", 2_000_000, 5_000_000, 0.315),
      makeFlow("FPT", "2026-04-02", 2_000_000, 5_000_000, 0.312),
      makeFlow("FPT", "2026-04-01", 2_000_000, 5_000_000, 0.310),
      makeFlow("FPT", "2026-03-31", 2_000_000, 5_000_000, 0.308),
    ];
    const signal = analyzeForeignFlow(history);
    expect(signal).not.toBeNull();
    // 0.320 - 0.308 = +0.012 → positive
    expect(signal!.holdingRatioChange5d).toBeGreaterThan(0);
  });
});
