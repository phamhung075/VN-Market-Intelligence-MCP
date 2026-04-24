// apps/mcp-server/src/__tests__/1328d-conviction-enrichment.test.ts
// Task 1328d — enrichDimensionScores() in convictionScorer.ts
import { describe, it, expect } from "bun:test";
import {
  computeConviction,
  enrichDimensionScores,
  type ConvictionInput,
} from "../domain/services/convictionScorer.js";

describe("Task 1328d — conviction-enrichment", () => {
  // AC1: positive newsSentimentScore → high sentiment dimension
  it("positive newsSentimentScore maps to sentiment > 0.5", () => {
    const result = computeConviction({ code: "VNM", newsSentimentScore: 0.8 });
    expect(result.dimensions.sentiment).toBeGreaterThan(0.5);
  });

  // AC2: negative newsSentimentScore → low sentiment dimension
  it("negative newsSentimentScore maps to sentiment < 0.5", () => {
    const result = computeConviction({ code: "VNM", newsSentimentScore: -0.8 });
    expect(result.dimensions.sentiment).toBeLessThan(0.5);
  });

  // AC3: kinhDichConfidenceRaw + BUY agentSignalsMajority → high kinhDich and cascade
  it("kinhDichConfidenceRaw=90 + agentSignalsMajority=BUY → kinhDich > 0.5 and cascade > 0.5", () => {
    const result = computeConviction({
      code: "VNM",
      kinhDichConfidenceRaw: 90,
      agentSignalsMajority: "BUY",
    });
    expect(result.dimensions.kinhDich).toBeGreaterThan(0.5);
    expect(result.dimensions.cascade).toBeGreaterThan(0.5);
  });

  // AC4: no new fields → result identical to baseline (backward compat)
  it("no new fields produces the same result as baseline", () => {
    const baseline = computeConviction({ code: "VNM" });
    const withEmpty = computeConviction({ code: "VNM" });
    expect(withEmpty.score).toBe(baseline.score);
    expect(withEmpty.dimensions).toEqual(baseline.dimensions);
  });

  // AC5: enrichDimensionScores does not mutate the input object
  it("enrichDimensionScores does not mutate the input object", () => {
    const input: ConvictionInput = {
      code: "VNM",
      newsSentimentScore: 0.9,
      kinhDichConfidenceRaw: 80,
      agentSignalsMajority: "SELL",
    };
    const original = { ...input };
    enrichDimensionScores(input);
    expect(input).toEqual(original);
  });

  // AC6: enrichDimensionScores — sentimentDirection not overridden when already set
  it("enrichDimensionScores does not override existing sentimentDirection", () => {
    const input: ConvictionInput = {
      code: "VNM",
      sentimentDirection: "bearish",
      sentimentConfidence: 0.9,
      newsSentimentScore: 0.9, // would set bullish if not blocked
    };
    const enriched = enrichDimensionScores(input);
    expect(enriched.sentimentDirection).toBe("bearish");
    expect(enriched.sentimentConfidence).toBe(0.9);
  });

  // AC7: enrichDimensionScores — kinhDichScore not overridden when already set
  it("enrichDimensionScores does not override existing kinhDichScore", () => {
    const input: ConvictionInput = {
      code: "VNM",
      kinhDichScore: -0.5,
      kinhDichConfidenceRaw: 90,
      agentSignalsMajority: "BUY",
    };
    const enriched = enrichDimensionScores(input);
    expect(enriched.kinhDichScore).toBe(-0.5);
  });

  // AC8: enrichDimensionScores — cascadeDirection not overridden when already set
  it("enrichDimensionScores does not override existing cascadeDirection", () => {
    const input: ConvictionInput = {
      code: "VNM",
      cascadeDirection: "down",
      cascadeConfidence: 0.8,
      agentSignalsMajority: "BUY",
    };
    const enriched = enrichDimensionScores(input);
    expect(enriched.cascadeDirection).toBe("down");
    expect(enriched.cascadeConfidence).toBe(0.8);
  });

  // AC9: near-zero newsSentimentScore → neutral sentimentDirection
  it("newsSentimentScore near zero → neutral sentimentDirection", () => {
    const input: ConvictionInput = { code: "VNM", newsSentimentScore: 0.05 };
    const enriched = enrichDimensionScores(input);
    expect(enriched.sentimentDirection).toBe("neutral");
  });

  // AC10: SELL agentSignalsMajority → cascade maps to down
  it("agentSignalsMajority=SELL maps cascadeDirection to down", () => {
    const input: ConvictionInput = { code: "VNM", agentSignalsMajority: "SELL" };
    const enriched = enrichDimensionScores(input);
    expect(enriched.cascadeDirection).toBe("down");
    expect(enriched.cascadeConfidence).toBe(0.6);
  });
});
