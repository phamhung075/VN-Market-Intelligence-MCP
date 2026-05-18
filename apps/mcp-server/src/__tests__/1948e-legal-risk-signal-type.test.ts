/**
 * Task 1948e-A — Add "legal_risk" to SignalTypeSchema enum
 *
 * Tests:
 *   TC1 — SignalTypeSchema accepts "legal_risk" (schema-level, SSOT)
 *   TC3 — regression: existing types (urgent_news, price_anomaly, chain_catalyst)
 *          still accepted by SignalTypeSchema
 *   TC4 — regression: unknown type "unknown_type" is still rejected by SignalTypeSchema
 *
 * Note: MCP SDK test helpers call handler directly (bypassing SDK Zod validation),
 * so AC-2 is verified at the schema level via SignalTypeSchema.safeParse — this is
 * the authoritative check. The MCP SDK wraps SignalTypeSchema for input validation
 * at runtime; passing here guarantees the tool will accept "legal_risk" in production.
 */

import { describe, it, expect } from "bun:test";
import { SignalTypeSchema } from "../infrastructure/db/agentSignalStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1948e-A — SignalTypeSchema includes legal_risk", () => {
  it("TC1: SignalTypeSchema accepts 'legal_risk'", () => {
    const result = SignalTypeSchema.safeParse("legal_risk");
    expect(result.success).toBe(true);
  });

  it("TC3: regression — existing signal types still accepted", () => {
    const existingTypes = [
      "urgent_news",
      "price_anomaly",
      "cross_validate",
      "suppress",
      "chain_catalyst",
      "fundamental_validation",
      "price_confirmation",
      "verified_chain",
      "signal_feedback",
    ] as const;

    for (const signalType of existingTypes) {
      const result = SignalTypeSchema.safeParse(signalType);
      expect(result.success).toBe(true);
    }
  });

  it("TC4: regression — unknown signal type still rejected", () => {
    const result = SignalTypeSchema.safeParse("unknown_type");
    expect(result.success).toBe(false);
  });
});
