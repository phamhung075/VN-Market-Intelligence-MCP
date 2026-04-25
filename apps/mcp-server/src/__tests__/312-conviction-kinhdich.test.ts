/**
 * Task 304 — Conviction scorer 6th dimension: kinhDichScore at 15%
 *
 * AC-304:
 * - Given kinhDichReadings row for VNM with confidence=0.72 and
 *   trading_signal='MUA (tich cuc)', dimensions.kinhDich ≈ 0.86
 * - dimensions contains exactly 7 keys (6 original + imfMacro from Task 1329d)
 * - sum of WEIGHTS equals exactly 1.00
 * - When no kinhdich_readings row exists, dimensions.kinhDich equals 0.5
 * - computeConviction without kinhDichScore = same as kinhDichScore: undefined
 */

import { describe, it, expect } from "bun:test";
import {
  computeConviction,
  scoreKinhDich,
  deriveKinhDichScore,
  WEIGHTS,
} from "../domain/services/convictionScorer.js";

describe("Task 304 — Conviction scorer 6th dimension (kinhDich at 15%)", () => {
  // ─── Weight invariant ───────────────────────────────────────────────────────

  // Updated for Task 1329e: 7th dimension (imfMacro) added, all 6 weights rescaled × 0.90
  it("WEIGHTS sums to exactly 1.0 across all 7 dimensions", () => {
    const sum = Object.values(WEIGHTS).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("WEIGHTS has exactly 7 keys", () => {
    expect(Object.keys(WEIGHTS).length).toBe(7);
  });

  it("WEIGHTS.kinhDich is 0.1350 (was 0.15, rescaled × 0.90 for Task 1329e)", () => {
    expect(WEIGHTS.kinhDich).toBeCloseTo(0.1350, 10);
  });

  it("WEIGHTS.priceAction is 0.2293 (was 0.2550, rescaled × 0.90, adjusted for exact sum)", () => {
    expect(WEIGHTS.priceAction).toBeCloseTo(0.2293, 10);
  });

  it("WEIGHTS.volumeConfirmation is 0.1913 (was 0.2125, rescaled × 0.90)", () => {
    expect(WEIGHTS.volumeConfirmation).toBeCloseTo(0.1913, 10);
  });

  it("WEIGHTS.sentiment is 0.1148 (was 0.1275, rescaled × 0.90)", () => {
    expect(WEIGHTS.sentiment).toBeCloseTo(0.1148, 10);
  });

  it("WEIGHTS.cascade is 0.1148 (was 0.1275, rescaled × 0.90)", () => {
    expect(WEIGHTS.cascade).toBeCloseTo(0.1148, 10);
  });

  it("WEIGHTS.sectorAlignment is 0.1148 (was 0.1275, rescaled × 0.90)", () => {
    expect(WEIGHTS.sectorAlignment).toBeCloseTo(0.1148, 10);
  });

  // ─── scoreKinhDich helper ───────────────────────────────────────────────────

  it("scoreKinhDich(undefined) returns 0.5 (neutral)", () => {
    expect(scoreKinhDich(undefined)).toBe(0.5);
  });

  it("scoreKinhDich(0) returns 0.5", () => {
    expect(scoreKinhDich(0)).toBe(0.5);
  });

  it("scoreKinhDich(+1) returns 1.0", () => {
    expect(scoreKinhDich(1)).toBe(1.0);
  });

  it("scoreKinhDich(-1) returns 0.0", () => {
    expect(scoreKinhDich(-1)).toBe(0.0);
  });

  it("scoreKinhDich(+0.72) returns 0.86", () => {
    // 0.5 + 0.72 * 0.5 = 0.86
    expect(scoreKinhDich(0.72)).toBeCloseTo(0.86, 5);
  });

  it("scoreKinhDich clamps values above 1 to 1.0", () => {
    expect(scoreKinhDich(2)).toBe(1.0);
  });

  it("scoreKinhDich clamps values below -1 to 0.0", () => {
    expect(scoreKinhDich(-2)).toBe(0.0);
  });

  // ─── deriveKinhDichScore helper ─────────────────────────────────────────────

  it("deriveKinhDichScore returns 0 when tradingSignal is null", () => {
    expect(deriveKinhDichScore(null, 0.72)).toBe(0);
  });

  it("deriveKinhDichScore returns 0 when confidence is null", () => {
    expect(deriveKinhDichScore("MUA (tich cuc)", null)).toBe(0);
  });

  it("MUA (tich cuc) confidence=0.72 → +0.72", () => {
    // verb=MUA → +1; suffix tich cuc → multiplier 1.0; score = +1 * 0.72 * 1.0 = +0.72
    expect(deriveKinhDichScore("MUA (tich cuc)", 0.72)).toBeCloseTo(0.72, 5);
  });

  it("BAN (tieu cuc) confidence=0.80 → -0.56", () => {
    // verb=BAN → -1; suffix tieu cuc → multiplier 0.7; score = -1 * 0.80 * 0.7 = -0.56
    expect(deriveKinhDichScore("BAN (tieu cuc)", 0.80)).toBeCloseTo(-0.56, 5);
  });

  it("GIU (tich cuc) confidence=0.60 → 0", () => {
    // verb=GIU → 0; any multiplier; score = 0
    expect(deriveKinhDichScore("GIU (tich cuc)", 0.60)).toBe(0);
  });

  it("CHO (tich cuc) confidence=0.50 → +0.50", () => {
    // verb=CHO → +1; suffix tich cuc → multiplier 1.0; score = +1 * 0.50 * 1.0 = +0.50
    expect(deriveKinhDichScore("CHO (tich cuc)", 0.50)).toBeCloseTo(0.50, 5);
  });

  it("THAN TRONG (tieu cuc) confidence=0.40 → -0.28", () => {
    // verb=THAN TRONG → -1; suffix tieu cuc → multiplier 0.7; score = -1 * 0.40 * 0.7 = -0.28
    expect(deriveKinhDichScore("THAN TRONG (tieu cuc)", 0.40)).toBeCloseTo(-0.28, 5);
  });

  it("BAN (tich cuc) confidence=0.60 → -0.60 (verb-primary rule)", () => {
    // verb=BAN → -1; suffix tich cuc → multiplier 1.0; score = -1 * 0.60 * 1.0 = -0.60
    // This validates the verb-primary rule: BAN stays bearish regardless of tich cuc suffix
    expect(deriveKinhDichScore("BAN (tich cuc)", 0.60)).toBeCloseTo(-0.60, 5);
  });

  // ─── AC-304: computeConviction with 6th dimension ───────────────────────────

  it("AC-304: VNM MUA(tich cuc) confidence=0.72 → dimensions.kinhDich ≈ 0.86", () => {
    const result = computeConviction({
      code: "VNM",
      kinhDichScore: 0.72, // derived from MUA(tich cuc) conf=0.72
    });
    expect(result.dimensions.kinhDich).toBeCloseTo(0.86, 2);
  });

  it("AC-304: dimensions contains exactly 7 keys (6 original + imfMacro from Task 1329d)", () => {
    const result = computeConviction({ code: "VNM" });
    expect(Object.keys(result.dimensions).sort()).toEqual([
      "cascade",
      "imfMacro",
      "kinhDich",
      "priceAction",
      "sectorAlignment",
      "sentiment",
      "volumeConfirmation",
    ]);
  });

  it("AC-304: when no kinhDichScore provided, dimensions.kinhDich equals 0.5", () => {
    const result = computeConviction({ code: "VNM" });
    expect(result.dimensions.kinhDich).toBe(0.5);
  });

  it("AC-304: computeConviction without kinhDichScore matches omitting kinhDichScore entirely", () => {
    const without = computeConviction({ code: "VNM", changePct: 2.0 });
    // Build input without kinhDichScore field at all (not even as undefined)
    const inputNoKd: Parameters<typeof computeConviction>[0] = { code: "VNM", changePct: 2.0 };
    const withoutField = computeConviction(inputNoKd);
    expect(without.score).toBe(withoutField.score);
    expect(without.dimensions.kinhDich).toBe(withoutField.dimensions.kinhDich);
    // Both should produce neutral 0.5 for kinhDich
    expect(without.dimensions.kinhDich).toBe(0.5);
  });

  it("AC-304: kinhDichScore=-0.56 (bearish BAN) lowers overall conviction vs neutral", () => {
    const neutral = computeConviction({ code: "VCB", changePct: 3.0, kinhDichScore: 0 });
    const bearish = computeConviction({ code: "VCB", changePct: 3.0, kinhDichScore: -0.56 });
    // Bearish kinhDich should yield a lower kinhDich dimension score → lower overall score
    expect(bearish.dimensions.kinhDich).toBeLessThan(neutral.dimensions.kinhDich);
    expect(bearish.score).toBeLessThan(neutral.score);
  });

  it("composite score is between 0 and 1 for all-default inputs", () => {
    const result = computeConviction({ code: "VCB" });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("AC-304: kinhDichScore: +1 (max bull) boosts conviction on bullish price", () => {
    const withMax = computeConviction({ code: "FPT", changePct: 5.0, kinhDichScore: 1 });
    const withNeutral = computeConviction({ code: "FPT", changePct: 5.0, kinhDichScore: 0 });
    expect(withMax.dimensions.kinhDich).toBe(1.0);
    expect(withMax.score).toBeGreaterThan(withNeutral.score);
  });
});
