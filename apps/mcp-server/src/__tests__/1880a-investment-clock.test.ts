// apps/mcp-server/src/__tests__/1880a-investment-clock.test.ts
// Task 1880a — Investment Clock Phase domain service unit tests
//
// All 8 tests use deterministic fixtures injected directly into the domain
// function. No DB access, no I/O side effects.

import { describe, it, expect } from "bun:test";
import {
  classifyInvestmentClockPhase,
  type InvestmentClockPhase,
} from "../domain/services/macro/investmentClock.js";

describe("Task 1880a — classifyInvestmentClockPhase", () => {

  // ── Test 1: Recovery ───────────────────────────────────────────────────────
  it("PMI=52, CPI=2.5 → Recovery (growth UP, inflation LOW)", () => {
    const result = classifyInvestmentClockPhase({ pmi: 52, cpi: 2.5 });
    expect(result.phase).toBe("Recovery" satisfies InvestmentClockPhase);
    expect(result.growthSignal).toBe("UP");
    expect(result.inflationSignal).toBe("LOW");
    expect(result.reason).toBeUndefined();
  });

  // ── Test 2: Overheat ───────────────────────────────────────────────────────
  it("PMI=55, CPI=4.0 → Overheat (growth UP, inflation HIGH)", () => {
    const result = classifyInvestmentClockPhase({ pmi: 55, cpi: 4.0 });
    expect(result.phase).toBe("Overheat" satisfies InvestmentClockPhase);
    expect(result.growthSignal).toBe("UP");
    expect(result.inflationSignal).toBe("HIGH");
    expect(result.reason).toBeUndefined();
  });

  // ── Test 3: Stagflation ────────────────────────────────────────────────────
  it("PMI=48, CPI=4.2 → Stagflation (growth DOWN, inflation HIGH)", () => {
    const result = classifyInvestmentClockPhase({ pmi: 48, cpi: 4.2 });
    expect(result.phase).toBe("Stagflation" satisfies InvestmentClockPhase);
    expect(result.growthSignal).toBe("DOWN");
    expect(result.inflationSignal).toBe("HIGH");
    expect(result.reason).toBeUndefined();
  });

  // ── Test 4: Reflation ──────────────────────────────────────────────────────
  it("PMI=45, CPI=2.0 → Reflation (growth DOWN, inflation LOW)", () => {
    const result = classifyInvestmentClockPhase({ pmi: 45, cpi: 2.0 });
    expect(result.phase).toBe("Reflation" satisfies InvestmentClockPhase);
    expect(result.growthSignal).toBe("DOWN");
    expect(result.inflationSignal).toBe("LOW");
    expect(result.reason).toBeUndefined();
  });

  // ── Test 5: Null PMI — fallback to gdpGrowth ──────────────────────────────
  it("PMI=null, gdpGrowth=3 → Recovery (fallback growth UP, CPI=2.5 LOW)", () => {
    const result = classifyInvestmentClockPhase({
      pmi: null,
      cpi: 2.5,
      gdpGrowth: 3,
    });
    expect(result.phase).toBe("Recovery" satisfies InvestmentClockPhase);
    expect(result.growthSignal).toBe("UP");
    expect(result.inflationSignal).toBe("LOW");
  });

  // ── Test 6: Both null → insufficient_data ─────────────────────────────────
  it("PMI=null, gdpGrowth=null → { phase: null, reason: 'insufficient_data' }", () => {
    const result = classifyInvestmentClockPhase({
      pmi: null,
      cpi: null,
      gdpGrowth: null,
      inflationRate: null,
    });
    expect(result.phase).toBeNull();
    expect(result.reason).toBe("insufficient_data");
  });

  // ── Test 7: PMI=50 boundary (≤50 path) ────────────────────────────────────
  it("PMI=50 exact boundary → DOWN signal (≤50); CPI=3.0 exact → LOW (≤3.0) → Reflation", () => {
    const result = classifyInvestmentClockPhase({ pmi: 50, cpi: 3.0 });
    expect(result.phase).toBe("Reflation" satisfies InvestmentClockPhase);
    expect(result.growthSignal).toBe("DOWN");
    expect(result.inflationSignal).toBe("LOW");
  });

  // ── Test 8: Null CPI — fallback to inflationRate ──────────────────────────
  it("CPI=null, inflationRate=3.2 → Overheat (PMI=51 UP, inflationRate fallback HIGH)", () => {
    const result = classifyInvestmentClockPhase({
      pmi: 51,
      cpi: null,
      inflationRate: 3.2,
    });
    expect(result.phase).toBe("Overheat" satisfies InvestmentClockPhase);
    expect(result.growthSignal).toBe("UP");
    expect(result.inflationSignal).toBe("HIGH");
  });

});
