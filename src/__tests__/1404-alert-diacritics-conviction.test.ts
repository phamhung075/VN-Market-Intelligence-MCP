/**
 * Task 1404 — RED test: assert convictionScorer labels contain correct Vietnamese diacritics.
 *
 * Current code at convictionScorer.ts:127-130 uses unaccented LEVEL_VI strings:
 *   conviction: "XAC TIN CAO"
 *   strong:     "Kha chac chan"
 *   moderate:   "Hon hop"
 *   weak:       "Tin hieu yeu/mau thuan"
 *
 * These tests assert the accented forms — they MUST FAIL (RED) until task 1405 fixes the labels.
 *
 * Note: architect spec uses `scoreConviction` alias; actual export is `computeConviction`.
 * Using the real export name. Function signature unchanged.
 */

import { computeConviction } from "../domain/services/convictionScorer.js";

describe("1404 alert-diacritics convictionScorer", () => {
  // conviction level: score >= 0.8
  // Strong price (9.5% = magnitude 0.95 -> score 0.975), 5× volume, all dims aligned
  it("conviction level summary contains 'Xác tín cao'", () => {
    const result = computeConviction({
      code: "VCB",
      changePct: 9.5,
      volume: 5_000_000,
      avgVolume: 1_000_000,
      sentimentDirection: "bullish",
      sentimentConfidence: 0.9,
      cascadeDirection: "up",
      cascadeConfidence: 0.9,
      sectorAvgPct: 4.0,
    });
    expect(result.level).toBe("conviction");
    expect(result.summary).toContain("Xác tín cao");
  });

  // strong level: score >= 0.6 < 0.8
  // Moderate price (4%), 2× volume, weak neutral cascade -> stay below 0.8
  it("strong level summary contains 'Khá chắc chắn'", () => {
    const result = computeConviction({
      code: "FPT",
      changePct: 4.0,
      volume: 2_000_000,
      avgVolume: 1_000_000,
      sentimentDirection: "bullish",
      sentimentConfidence: 0.7,
      cascadeDirection: "neutral",
      sectorAvgPct: 1.5,
    });
    expect(result.level).toBe("strong");
    expect(result.summary).toContain("Khá chắc chắn");
  });

  // moderate level: score >= 0.4 < 0.6
  // Flat-ish price, barely above avg volume, no other signals
  it("moderate level summary contains 'Hỗn hợp'", () => {
    const result = computeConviction({
      code: "HPG",
      changePct: 1.0,
      volume: 1_100_000,
      avgVolume: 1_000_000,
    });
    expect(result.level).toBe("moderate");
    expect(result.summary).toContain("Hỗn hợp");
  });

  // weak level: score < 0.4 — conflicting signals
  // Bearish price (-1%), low volume (0.5x avg), but bullish sentiment AND bullish cascade
  // both at full confidence -> maximum cross-dimension conflict -> score ~0.37 < 0.4
  it("weak level summary contains 'Tín hiệu yếu/mâu thuẫn'", () => {
    const result = computeConviction({
      code: "MSN",
      changePct: -1.0,
      volume: 400_000,
      avgVolume: 1_000_000,
      sentimentDirection: "bullish",
      sentimentConfidence: 1.0,
      cascadeDirection: "up",
      cascadeConfidence: 1.0,
    });
    expect(result.level).toBe("weak");
    expect(result.summary).toContain("Tín hiệu yếu/mâu thuẫn");
  });
});
