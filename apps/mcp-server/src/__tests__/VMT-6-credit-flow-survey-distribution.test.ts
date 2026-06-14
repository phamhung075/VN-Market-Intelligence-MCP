// src/__tests__/VMT-6-credit-flow-survey-distribution.test.ts
//
// VMT-6 — EXTEND get_credit_flow_signal with survey_distribution (VIRA/VARA stub)
//
// Acceptance criteria:
//   AC-1: survey_distribution field is present in handler output
//   AC-2: survey_distribution.is_estimate is true (BLOCKER-6 — no source confirmed)
//   AC-3: survey_distribution.note contains expected degraded-mode text
//   AC-4: survey_distribution nulls are correct (no fabricated data)
//   AC-5: existing mortgageIsEstimate / yoyIsEstimate fields are unaffected (regression gate)

import { describe, it, expect } from "bun:test";
import { getCreditFlowSignalHandler } from "../interface/mcp/tools/sector/creditFlowTools.js";

describe("VMT-6 — survey_distribution stub field", () => {
  it("AC-1: survey_distribution is present in handler output", async () => {
    const result = await getCreditFlowSignalHandler({});
    expect(result).toHaveProperty("survey_distribution");
  });

  it("AC-2: survey_distribution.is_estimate is true (DEGRADED — no VIRA/VARA source)", async () => {
    const result = await getCreditFlowSignalHandler({});
    expect(result.survey_distribution.is_estimate).toBe(true);
  });

  it("AC-3: survey_distribution.note mentions VIRA/VARA and manual data required", async () => {
    const result = await getCreditFlowSignalHandler({});
    expect(result.survey_distribution.note).toContain("VIRA/VARA");
    expect(result.survey_distribution.note).toContain("manual data required");
  });

  it("AC-4: survey_distribution nulls — no fabricated source or forecast data", async () => {
    const result = await getCreditFlowSignalHandler({});
    const sd = result.survey_distribution;
    expect(sd.source).toBeNull();
    expect(sd.period).toBeNull();
    expect(sd.mean_pct).toBeNull();
    expect(sd.dispersion_pct).toBeNull();
    expect(sd.survey_topic).toBeNull();
    expect(sd.hawk_outliers).toEqual([]);
    expect(sd.dove_outliers).toEqual([]);
  });

  it("AC-5 regression: existing text output still contains TÍN DỤNG BẤT ĐỘNG SẢN", async () => {
    const result = await getCreditFlowSignalHandler({
      currentReCreditTrillion: 2800,
      previousReCreditTrillion: 2750,
      currentMortgageRatePct: 10.5,
      previousMortgageRatePct: 11.0,
    });
    expect(result.content[0]?.text).toContain("TÍN DỤNG BẤT ĐỘNG SẢN");
  });

  it("AC-5 regression: existing is_estimate flags in text output are unaffected", async () => {
    // Force estimation mode: omit mortgage and yoy params → mortgageIsEstimate + yoyIsEstimate
    const result = await getCreditFlowSignalHandler({});
    const text = result.content[0]?.text ?? "";
    // Text should still carry the existing estimate warnings
    expect(text).toContain("is_estimate=true");
    expect(text).toContain("static_seed");
  });
});
