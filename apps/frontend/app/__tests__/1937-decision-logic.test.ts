/**
 * 1937 — computeDecision unit tests (TDD: RED first, now GREEN).
 * Tests: score logic → correct label, colors, reasons.
 */

import { describe, it, expect } from "vitest";
import { computeDecision } from "~/domain/analysis/decision";
import type { TASnapshot, KinhDichReading, PricePoint } from "~/domain/market";

// Minimal fixtures
const baseReading: KinhDichReading = {
  stock: "FPT",
  hexagram: 1,
  name: "Kiền",
  trend: "BULLISH",
  signal: "MUA",
  confidence: 0.75,
  timestamp: "2026-05-17T10:00:00Z",
};

const bullishTA: TASnapshot = {
  code: "FPT",
  rsi: 45,
  macd: { line: 0.1, signal: 0.05, histogram: 0.05 },
  movingAverages: { ma5: 72000, ma20: 70000, ma50: 68000 },
  bollingerBands: null,
  trend: "BULLISH",
  computedAt: "2026-05-17T10:00:00Z",
};

const bearishTA: TASnapshot = {
  ...bullishTA,
  rsi: 75,
  trend: "BEARISH",
};

function makePrices(closes: number[]): PricePoint[] {
  return closes.map((close, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    code: "FPT",
    close,
  }));
}

describe("computeDecision", () => {
  it("returns MUA MẠNH when all signals bullish (score ≥ 4)", () => {
    // TA BULLISH +2, RSI 45 +1, KD MUA +2, price +1 = 6
    const prices = makePrices([70000, 70500, 71000, 71200, 71500, 72000]);
    const result = computeDecision(bullishTA, baseReading, prices);
    expect(result.label).toBe("MUA MẠNH");
    expect(result.textColor).toBe("text-green-400");
    expect(result.bgColor).toBe("bg-green-950");
  });

  it("returns MUA when score is 2–3", () => {
    // TA BULLISH +2, RSI 45 +1, KD THẬN TRỌNG -1, no price data = 2
    const reading = { ...baseReading, signal: "THẬN TRỌNG" };
    const result = computeDecision(bullishTA, reading, []);
    expect(result.label).toBe("MUA");
    expect(result.textColor).toBe("text-green-300");
  });

  it("returns GIỮ when score is -1 to 1", () => {
    // TA NEUTRAL +0, RSI 60 (neutral) +0, KD GIỮ (no keyword) +0 = 0
    const neutralTA: TASnapshot = { ...bullishTA, rsi: 60, trend: "NEUTRAL" };
    const reading = { ...baseReading, signal: "QUAN SÁT" };
    const result = computeDecision(neutralTA, reading, []);
    expect(result.label).toBe("GIỮ");
    expect(result.textColor).toBe("text-yellow-400");
  });

  it("returns BÁN when score is -2 to -3", () => {
    // TA BEARISH -2, RSI 75 -1, KD neutral 0, falling price -1 = -4... use no-price to stay at -3
    const reading = { ...baseReading, signal: "QUAN SÁT" };
    const prices = makePrices([72000, 71500, 71000, 70500, 70000, 69500]);
    const result = computeDecision(bearishTA, reading, prices);
    // bearish TA -2, RSI 75 -1, no KD match 0, falling price -1 = -4 → BÁN MẠNH
    // adjust: use no price to get -3
    const result2 = computeDecision(bearishTA, reading, []);
    expect(result2.label).toBe("BÁN");
    expect(result2.textColor).toBe("text-red-300");
  });

  it("returns BÁN MẠNH when score ≤ -4", () => {
    // TA BEARISH -2, RSI 75 -1, KD BÁN -2, falling price -1 = -6
    const reading = { ...baseReading, signal: "BÁN" };
    const prices = makePrices([72000, 71500, 71000, 70500, 70000, 69500]);
    const result = computeDecision(bearishTA, reading, prices);
    expect(result.label).toBe("BÁN MẠNH");
    expect(result.textColor).toBe("text-red-400");
    expect(result.bgColor).toBe("bg-red-950");
  });

  it("handles null TA gracefully — skips TA scoring", () => {
    // Only KD MUA +2 = 2 → MUA
    const result = computeDecision(null, baseReading, []);
    expect(result.label).toBe("MUA");
  });

  it("collects TA reason string when TA is present", () => {
    const result = computeDecision(bullishTA, baseReading, []);
    expect(result.reasons.some((r) => r.includes("BULLISH"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("RSI"))).toBe(true);
  });

  it("collects KD reason string", () => {
    const result = computeDecision(null, baseReading, []);
    expect(result.reasons.some((r) => r.startsWith("KD:"))).toBe(true);
  });

  it("adds price reason when ≥5 price points", () => {
    const prices = makePrices([70000, 70500, 71000, 71200, 71500, 72000]);
    const result = computeDecision(null, baseReading, prices);
    expect(result.reasons.some((r) => r.includes("phiên"))).toBe(true);
  });

  it("RSI < 30 gives +1 (oversold recovery)", () => {
    const oversoldTA: TASnapshot = { ...bullishTA, rsi: 25, trend: "NEUTRAL" };
    const reading = { ...baseReading, signal: "QUAN SÁT" };
    // NEUTRAL 0, RSI 25 +1, no KD match 0 = 1 → GIỮ
    const result = computeDecision(oversoldTA, reading, []);
    expect(result.label).toBe("GIỮ");
  });
});
