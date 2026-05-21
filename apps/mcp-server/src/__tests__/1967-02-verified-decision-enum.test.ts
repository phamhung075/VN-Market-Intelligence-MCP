import { describe, it, expect } from "bun:test";
import { SignalTypeSchema } from "../infrastructure/db/agentSignalStore.js";

describe("Task 1967-02 — verified_decision signal_type enum", () => {
  it("AC-1: SignalTypeSchema accepts verified_decision", () => {
    const result = SignalTypeSchema.safeParse("verified_decision");
    expect(result.success).toBe(true);
  });

  it("AC-2: verified_decision round-trips through enum without error", () => {
    const parsed = SignalTypeSchema.parse("verified_decision");
    expect(parsed).toBe("verified_decision");
  });

  it("all existing signal types still accepted (no regression)", () => {
    const existing = [
      "urgent_news",
      "price_anomaly",
      "cross_validate",
      "suppress",
      "chain_catalyst",
      "fundamental_validation",
      "price_confirmation",
      "verified_chain",
      "signal_feedback",
      "legal_risk",
    ] as const;
    for (const t of existing) {
      const result = SignalTypeSchema.safeParse(t);
      expect(result.success).toBe(true);
    }
  });

  it("unknown signal types are still rejected", () => {
    const result = SignalTypeSchema.safeParse("not_a_real_type");
    expect(result.success).toBe(false);
  });
});
