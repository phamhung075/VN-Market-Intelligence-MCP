// apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect } from "bun:test";
import {
  computeConviction,
  scoreImfMacro,
  WEIGHTS,
} from "../domain/services/convictionScorer.js";

describe("Task 1329d — ConvictionInput/Result types: imfMacro dimension", () => {
  it("ConvictionInput accepts imfMacroScore field", () => {
    // TypeScript compile check — if this compiles, the field exists on the interface
    const result = computeConviction({ code: "VCB", imfMacroScore: 0.5 });
    expect(result).toBeDefined();
  });

  it("ConvictionResult.dimensions includes imfMacro field", () => {
    const result = computeConviction({ code: "VCB" });
    expect(typeof result.dimensions.imfMacro).toBe("number");
  });

  it("imfMacroScore undefined produces dimensions.imfMacro = 0.5 (neutral)", () => {
    const result = computeConviction({ code: "VCB" });
    expect(result.dimensions.imfMacro).toBe(0.5);
  });
});

describe("Task 1329e — scoreImfMacro() + WEIGHTS", () => {
  it("scoreImfMacro(0.6) === 0.80", () => {
    expect(scoreImfMacro(0.6)).toBe(0.80);
  });

  it("scoreImfMacro(undefined) === 0.5", () => {
    expect(scoreImfMacro(undefined)).toBe(0.5);
  });

  it("scoreImfMacro(-0.8) === 0.10", () => {
    // 0.5 + (-0.8 * 0.5) = 0.10; use toBeCloseTo for IEEE 754 safety
    expect(scoreImfMacro(-0.8)).toBeCloseTo(0.10, 10);
  });

  it("WEIGHTS sum to 1.0000 (tolerance 0.0001)", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.0001);
  });

  it("WEIGHTS has exactly 7 keys", () => {
    expect(Object.keys(WEIGHTS).length).toBe(7);
  });

  it("WEIGHTS.imfMacro === 0.10", () => {
    expect(WEIGHTS.imfMacro).toBe(0.10);
  });

  it("computeConviction with imfMacroScore:0.7 has dimensions.imfMacro === 0.85", () => {
    const result = computeConviction({ code: "VCB", imfMacroScore: 0.7, changePct: 2.0 });
    expect(result.dimensions.imfMacro).toBe(0.85);
  });

  it("computeConviction without imfMacroScore has valid score in [0,1]", () => {
    const withoutImf = computeConviction({ code: "VNM", changePct: 2.0 });
    expect(withoutImf.score).toBeGreaterThanOrEqual(0);
    expect(withoutImf.score).toBeLessThanOrEqual(1);
    expect(typeof withoutImf.dimensions.imfMacro).toBe("number");
  });

  it("Vietnamese summary includes 'imf vĩ mô' when imfMacro > 0.6", () => {
    const result = computeConviction({
      code: "VCB",
      imfMacroScore: 0.8,
      changePct: 4.0,
      sentimentDirection: "bullish",
      sentimentConfidence: 0.9,
    });
    expect(result.summary).toContain("imf vĩ mô");
  });

  it("ConvictionResult.dimensions has exactly 7 keys", () => {
    const result = computeConviction({ code: "VNM" });
    expect(Object.keys(result.dimensions).length).toBe(7);
  });
});

describe("Task 1329g — IMF wire-up: computeConviction receives imfMacroScore at call sites", () => {
  it("computeConviction with imfMacroScore from bridge returns valid result", () => {
    // Bridge returns 0 on empty DB — simulate that here as a unit test
    const result = computeConviction({ code: "VNM", changePct: 2.0, imfMacroScore: 0 });
    // scoreImfMacro(0) = 0.5 + 0 * 0.5 = 0.5
    expect(result.dimensions.imfMacro).toBe(0.5);
    expect(typeof result.score).toBe("number");
  });

  it("positive imfMacroScore lifts dimensions.imfMacro above 0.5", () => {
    const result = computeConviction({ code: "VNM", changePct: 2.0, imfMacroScore: 0.4 });
    expect(result.dimensions.imfMacro).toBeGreaterThan(0.5);
  });

  it("negative imfMacroScore pulls dimensions.imfMacro below 0.5", () => {
    const result = computeConviction({ code: "VNM", changePct: 2.0, imfMacroScore: -0.4 });
    expect(result.dimensions.imfMacro).toBeLessThan(0.5);
  });

  it("imfMacroScore undefined (not passed) gives neutral 0.5 — matches call sites that skip bridge", () => {
    const result = computeConviction({ code: "VNM", changePct: 2.0 });
    expect(result.dimensions.imfMacro).toBe(0.5);
  });
});
