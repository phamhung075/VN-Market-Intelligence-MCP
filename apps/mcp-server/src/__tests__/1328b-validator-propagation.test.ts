// apps/mcp-server/src/__tests__/1328b-validator-propagation.test.ts
// Task 1328b — Verify new ChainCatalystFindingData fields propagate through
//              validateSignalPayload (interface/mcp layer) with no code changes.
import { describe, it, expect } from "bun:test";
import { validateSignalPayload } from "../interface/mcp/tools/news-analysis/agentSignalTools.js";

const validBase = {
  event_type: "macro" as const,
  direction: "bullish" as const,
  confidence: 0.8,
  affected_stocks: ["VCB"],
  affected_sectors: ["banking"],
  headline: "Fed cuts rate",
  source: "reuters",
};

describe("Task 1328b — validateSignalPayload propagates 1328a new fields", () => {
  // Acceptance criterion 1: valid in-range new fields pass
  it("new fields in valid range → { valid: true }", () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      newsSentiment: 0.7,
      kinhDichConfidence: 80,
      agentSignalsMajority: "BUY",
    });
    expect(result.valid).toBe(true);
  });

  // Acceptance criterion 2: out-of-range newsSentiment rejected
  it("newsSentiment: 1.5 (over max +1.0) → { valid: false }", () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      newsSentiment: 1.5,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("newsSentiment"))).toBe(true);
    }
  });

  // Edge: out-of-range kinhDichConfidence rejected
  it("kinhDichConfidence: 101 (over max 100) → { valid: false }", () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      kinhDichConfidence: 101,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("kinhDichConfidence"))).toBe(true);
    }
  });

  // Edge: invalid agentSignalsMajority enum value rejected
  it('agentSignalsMajority: "MAYBE" → { valid: false }', () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      agentSignalsMajority: "MAYBE",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("agentSignalsMajority"))).toBe(true);
    }
  });

  // Boundary: newsSentiment at lower boundary -1.0 passes
  it("newsSentiment: -1.0 (lower boundary) → { valid: true }", () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      newsSentiment: -1.0,
    });
    expect(result.valid).toBe(true);
  });

  // Boundary: kinhDichConfidence at 0 passes
  it("kinhDichConfidence: 0 (lower boundary) → { valid: true }", () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      kinhDichConfidence: 0,
    });
    expect(result.valid).toBe(true);
  });

  // Boundary: all 3 fields at lower boundaries pass
  it('agentSignalsMajority: "SELL" → { valid: true }', () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      agentSignalsMajority: "SELL",
    });
    expect(result.valid).toBe(true);
  });

  it('agentSignalsMajority: "NEUTRAL" → { valid: true }', () => {
    const result = validateSignalPayload("chain_catalyst", {
      ...validBase,
      agentSignalsMajority: "NEUTRAL",
    });
    expect(result.valid).toBe(true);
  });

  // Verify PayloadSchema changes NOT needed: base payload still valid (no regressions)
  it("base payload without new fields → { valid: true } (backward compat)", () => {
    const result = validateSignalPayload("chain_catalyst", validBase);
    expect(result.valid).toBe(true);
  });
});
