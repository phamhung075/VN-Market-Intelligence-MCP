// apps/mcp-server/src/__tests__/1328a-signal-fields.test.ts
// Task 1328a — Add newsSentiment, kinhDichConfidence, agentSignalsMajority to ChainCatalystFindingData
import { describe, it, expect } from "bun:test";
import { ChainCatalystFindingDataSchema } from "../domain/signals/signalTypes.js";

const basePayload = {
  event_type: "macro" as const,
  direction: "bullish" as const,
  confidence: 0.8,
  affected_stocks: ["VCB"],
  affected_sectors: ["banking"],
  headline: "Fed cuts rate",
  source: "reuters",
};

describe("Task 1328a — ChainCatalystFindingData new optional fields", () => {
  it("valid payload with all 3 fields at boundary values → valid: true", () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      newsSentiment: 1.0,
      kinhDichConfidence: 100,
      agentSignalsMajority: "BUY",
    });
    expect(result.success).toBe(true);
  });

  it("newsSentiment: 1.5 (over max +1.0) → valid: false", () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      newsSentiment: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("kinhDichConfidence: -1 (under min 0) → valid: false", () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      kinhDichConfidence: -1,
    });
    expect(result.success).toBe(false);
  });

  it('agentSignalsMajority: "MAYBE" (invalid enum) → valid: false', () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      agentSignalsMajority: "MAYBE",
    });
    expect(result.success).toBe(false);
  });

  it("existing payload without new fields → valid: true (backward compat)", () => {
    const result = ChainCatalystFindingDataSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
  });

  it("newsSentiment at lower boundary -1.0 → valid: true", () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      newsSentiment: -1.0,
    });
    expect(result.success).toBe(true);
  });

  it("kinhDichConfidence at lower boundary 0 → valid: true", () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      kinhDichConfidence: 0,
    });
    expect(result.success).toBe(true);
  });

  it('agentSignalsMajority: "SELL" → valid: true', () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      agentSignalsMajority: "SELL",
    });
    expect(result.success).toBe(true);
  });

  it('agentSignalsMajority: "NEUTRAL" → valid: true', () => {
    const result = ChainCatalystFindingDataSchema.safeParse({
      ...basePayload,
      agentSignalsMajority: "NEUTRAL",
    });
    expect(result.success).toBe(true);
  });
});
