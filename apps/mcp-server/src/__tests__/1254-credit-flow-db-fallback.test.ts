// src/__tests__/1254-credit-flow-db-fallback.test.ts
//
// Task 1254 — get_credit_flow_signal DB fallback for SBV rates
//
// Bug report 1257: get_credit_flow_signal requires 4 required numeric params
// that the agent cannot provide autonomously. SBV rates are stored in DB every
// 30min via the VPS sbv service. The tool should make params optional and read
// from DB when not provided.
//
// Acceptance criteria:
//   AC-1: getCreditFlowSignalHandler works with all 4 params provided (existing behavior)
//   AC-2: deriveMortgageRateFromSbv(refinancingRate) returns refinancingRate + 2.5
//   AC-3: Default RE credit trillion values are > 0 (sensible fallback)
//   AC-4: getCreditFlowSignalHandler with only optional params provided still returns a signal

import { describe, it, expect } from "bun:test";
import {
  getCreditFlowSignalHandler,
  deriveMortgageRateFromSbv,
  DEFAULT_RE_CREDIT_TRILLION,
} from "../interface/mcp/tools/sector/creditFlowTools.js";

describe("Task 1254 — get_credit_flow_signal DB fallback", () => {
  it("AC-1: handler works with all params explicitly provided", async () => {
    const result = await getCreditFlowSignalHandler({
      currentReCreditTrillion: 2800,
      previousReCreditTrillion: 2750,
      currentMortgageRatePct: 10.5,
      previousMortgageRatePct: 11.0,
    });
    expect(result.content[0]?.text).toContain("TÍN DỤNG BẤT ĐỘNG SẢN");
  });

  it("AC-2: deriveMortgageRateFromSbv adds 2.5 spread over refinancing rate", () => {
    expect(deriveMortgageRateFromSbv(4.5)).toBe(7.0);
    expect(deriveMortgageRateFromSbv(6.0)).toBe(8.5);
    expect(deriveMortgageRateFromSbv(0)).toBe(2.5);
  });

  it("AC-3: DEFAULT_RE_CREDIT_TRILLION is a positive number", () => {
    expect(DEFAULT_RE_CREDIT_TRILLION).toBeGreaterThan(0);
  });

  it("AC-4: handler with undefined params (DB fallback mode) still returns a signal", async () => {
    // No DB available in test env — falls back to defaults
    const result = await getCreditFlowSignalHandler({
      currentReCreditTrillion: undefined,
      previousReCreditTrillion: undefined,
      currentMortgageRatePct: undefined,
      previousMortgageRatePct: undefined,
    });
    expect(result.content[0]?.text).toContain("TÍN DỤNG BẤT ĐỘNG SẢN");
  });
});
