// apps/mcp-server/src/__tests__/SIGNAL-PAYLOAD-MISSING-FIELDS.test.ts
// Fix: Add setNewsSentiment / setKinhDichConfidence / setAgentSignalsMajority
//      to ChainCatalystBuilder so News Scout and Market Watcher can populate
//      the optional conviction fields required by Alert Commander 4-AND validation.
import { describe, it, expect } from "bun:test";
import { createChainCatalystBuilder } from "../domain/signals/signalBuilders.js";

const requiredBase = () =>
  createChainCatalystBuilder()
    .setEventType("macro")
    .setDirection("bullish")
    .setConfidence(0.75)
    .addStock("VCB")
    .addSector("banking")
    .setHeadline("Fed cuts rate 50bps")
    .setSource("reuters");

describe("SIGNAL-PAYLOAD-MISSING-FIELDS — ChainCatalystBuilder optional conviction fields", () => {
  // ── newsSentiment ──────────────────────────────────────────────────────────

  it("setNewsSentiment(0.8) → finding_data.newsSentiment === 0.8", () => {
    const data = requiredBase().setNewsSentiment(0.8).build();
    expect(data.newsSentiment).toBe(0.8);
  });

  it("setNewsSentiment(-1.0) lower boundary → finding_data.newsSentiment === -1.0", () => {
    const data = requiredBase().setNewsSentiment(-1.0).build();
    expect(data.newsSentiment).toBe(-1.0);
  });

  it("setNewsSentiment(1.0) upper boundary → finding_data.newsSentiment === 1.0", () => {
    const data = requiredBase().setNewsSentiment(1.0).build();
    expect(data.newsSentiment).toBe(1.0);
  });

  it("no setNewsSentiment call → finding_data.newsSentiment === undefined", () => {
    const data = requiredBase().build();
    expect(data.newsSentiment).toBeUndefined();
  });

  // ── kinhDichConfidence ─────────────────────────────────────────────────────

  it("setKinhDichConfidence(72) → finding_data.kinhDichConfidence === 72", () => {
    const data = requiredBase().setKinhDichConfidence(72).build();
    expect(data.kinhDichConfidence).toBe(72);
  });

  it("setKinhDichConfidence(0) lower boundary → finding_data.kinhDichConfidence === 0", () => {
    const data = requiredBase().setKinhDichConfidence(0).build();
    expect(data.kinhDichConfidence).toBe(0);
  });

  it("setKinhDichConfidence(100) upper boundary → finding_data.kinhDichConfidence === 100", () => {
    const data = requiredBase().setKinhDichConfidence(100).build();
    expect(data.kinhDichConfidence).toBe(100);
  });

  it("no setKinhDichConfidence call → finding_data.kinhDichConfidence === undefined", () => {
    const data = requiredBase().build();
    expect(data.kinhDichConfidence).toBeUndefined();
  });

  // ── agentSignalsMajority ───────────────────────────────────────────────────

  it('setAgentSignalsMajority("BUY") → finding_data.agentSignalsMajority === "BUY"', () => {
    const data = requiredBase().setAgentSignalsMajority("BUY").build();
    expect(data.agentSignalsMajority).toBe("BUY");
  });

  it('setAgentSignalsMajority("SELL") → finding_data.agentSignalsMajority === "SELL"', () => {
    const data = requiredBase().setAgentSignalsMajority("SELL").build();
    expect(data.agentSignalsMajority).toBe("SELL");
  });

  it('setAgentSignalsMajority("NEUTRAL") → finding_data.agentSignalsMajority === "NEUTRAL"', () => {
    const data = requiredBase().setAgentSignalsMajority("NEUTRAL").build();
    expect(data.agentSignalsMajority).toBe("NEUTRAL");
  });

  it("no setAgentSignalsMajority call → finding_data.agentSignalsMajority === undefined", () => {
    const data = requiredBase().build();
    expect(data.agentSignalsMajority).toBeUndefined();
  });

  // ── all three together ─────────────────────────────────────────────────────

  it("all three fields set together → all present in built payload", () => {
    const data = requiredBase()
      .setNewsSentiment(0.6)
      .setKinhDichConfidence(85)
      .setAgentSignalsMajority("BUY")
      .build();
    expect(data.newsSentiment).toBe(0.6);
    expect(data.kinhDichConfidence).toBe(85);
    expect(data.agentSignalsMajority).toBe("BUY");
  });

  // ── builder still validates via Zod (schema rejection) ────────────────────

  it("setNewsSentiment(2.0) exceeds schema max → build() throws ZodError", () => {
    expect(() =>
      requiredBase().setNewsSentiment(2.0).build()
    ).toThrow();
  });

  it("setKinhDichConfidence(101) exceeds schema max → build() throws ZodError", () => {
    expect(() =>
      requiredBase().setKinhDichConfidence(101).build()
    ).toThrow();
  });

  // ── fluent chaining returns same builder instance ──────────────────────────

  it("setter methods return the same builder (fluent chaining works)", () => {
    const builder = createChainCatalystBuilder();
    const b1 = builder.setEventType("macro");
    const b2 = b1.setNewsSentiment(0.5);
    const b3 = b2.setKinhDichConfidence(60);
    const b4 = b3.setAgentSignalsMajority("NEUTRAL");
    // All setters return same instance (this-typed fluent API)
    expect(b1).toBe(b2);
    expect(b2).toBe(b3);
    expect(b3).toBe(b4);
  });
});
