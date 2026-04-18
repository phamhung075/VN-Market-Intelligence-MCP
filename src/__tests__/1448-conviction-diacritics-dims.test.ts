/**
 * TASK 1448 — TDD: conviction scorer accented Vietnamese labels
 * RED: assert accented dirVi + dims strings
 */

import { describe, it, expect } from "bun:test";
import { computeConviction } from "../domain/services/convictionScorer";
import type { ConvictionInput } from "../domain/services/convictionScorer";

// High-score bullish input: all 6 dims > 0.6
const bullishInput: ConvictionInput = {
  code: "VNM",
  changePct: 4.5,           // price bullish, high score
  volume: 2_000_000,
  avgVolume: 1_000_000,     // vol ratio 2x > 0.6
  sentimentDirection: "bullish",
  sentimentConfidence: 0.9, // sent > 0.6
  cascadeDirection: "up",
  cascadeConfidence: 0.9,   // casc > 0.6
  sectorAvgPct: 2.5,        // sect: sector same direction as stock
  kinhDichScore: 0.6,       // kd maps to > 0.6 in scorer
};

// Bearish input
const bearishInput: ConvictionInput = {
  code: "VNM",
  changePct: -4.5,
  sentimentDirection: "bearish",
  sentimentConfidence: 0.9,
  cascadeDirection: "down",
  cascadeConfidence: 0.9,
};

// Neutral direction input with enough agreeing dims to appear in summary
// changePct flat → direction=neutral; high vol + high kinhDich → agreeing >= 2
const neutralInput: ConvictionInput = {
  code: "VNM",
  changePct: 0.1,        // < 0.5 threshold → price direction = neutral
  volume: 3_000_000,
  avgVolume: 1_000_000,  // vol ratio 3x → scoreVolume > 0.6
  kinhDichScore: 0.6,    // scoreKinhDich(0.6) = 0.8 > 0.6
};

describe("1448 — conviction scorer: accented Vietnamese labels", () => {
  it("dirVi is 'Tăng' (not 'TANG') for bullish direction", () => {
    const result = computeConviction(bullishInput);
    expect(result.summary).toContain("Tăng");
    expect(result.summary).not.toContain("TANG");
  });

  it("dirVi is 'Giảm' (not 'GIAM') for bearish direction", () => {
    const result = computeConviction(bearishInput);
    expect(result.summary).toContain("Giảm");
    expect(result.summary).not.toContain("GIAM");
  });

  it("dirVi is 'Trung tính' (not 'TRUNG TINH') for neutral direction", () => {
    const result = computeConviction(neutralInput);
    expect(result.summary).toContain("Trung tính");
    expect(result.summary).not.toContain("TRUNG TINH");
  });

  it("dims contains 'giá' (not 'gia') when price score > 0.6", () => {
    const result = computeConviction(bullishInput);
    expect(result.summary).toContain("giá");
    expect(result.summary).not.toMatch(/\bgia\b/);
  });

  it("dims contains 'vĩ mô' (not 'vi mo') when cascade score > 0.6", () => {
    const result = computeConviction(bullishInput);
    expect(result.summary).toContain("vĩ mô");
    expect(result.summary).not.toContain("vi mo");
  });

  it("dims contains 'ngành' (not 'nganh') when sector score > 0.6", () => {
    const result = computeConviction(bullishInput);
    expect(result.summary).toContain("ngành");
    expect(result.summary).not.toContain("nganh");
  });

  it("dims contains 'kinh dịch' (not 'kinh dich') when kinhDich score > 0.6", () => {
    const result = computeConviction(bullishInput);
    expect(result.summary).toContain("kinh dịch");
    expect(result.summary).not.toContain("kinh dich");
  });
});
