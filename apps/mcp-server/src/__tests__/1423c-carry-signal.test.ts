// apps/mcp-server/src/__tests__/1423c-carry-signal.test.ts
// Task 1423c — Carry Trade Signal domain service
import { describe, it, expect } from "bun:test";
import {
  computeCarryTradeSignal,
  type CarryTradeSignal,
} from "../domain/services/macro/carryTradeSignal.js";

describe("Task 1423c — CarryTradeSignal", () => {
  // ── HOT_MONEY_INFLOW: spread > 2.5% ──────────────────────────────────────

  it("HOT_MONEY_INFLOW when spread > 2.5%", () => {
    const result = computeCarryTradeSignal(7.0, 4.33);
    const spread = parseFloat((7.0 - 4.33).toFixed(2));
    expect(result.vndDepositRate).toBe(7.0);
    expect(result.fedFundsRate).toBe(4.33);
    expect(result.carrySpread).toBeCloseTo(spread, 2);
    expect(result.regime).toBe("HOT_MONEY_INFLOW");
    expect(result.reasoning).toMatch(/inflow|attractive|VND/i);
  });

  it("HOT_MONEY_INFLOW at exact boundary (spread = 2.51%)", () => {
    const result = computeCarryTradeSignal(7.01, 4.5);
    expect(result.regime).toBe("HOT_MONEY_INFLOW");
  });

  // ── NEUTRAL: 0.5% <= spread <= 2.5% ──────────────────────────────────────

  it("NEUTRAL when spread between 0.5% and 2.5%", () => {
    const result = computeCarryTradeSignal(5.5, 4.33);
    expect(result.vndDepositRate).toBe(5.5);
    expect(result.fedFundsRate).toBe(4.33);
    expect(result.carrySpread).toBeCloseTo(1.17, 2);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toMatch(/neutral|moderate|balanced/i);
  });

  it("NEUTRAL at lower boundary (spread = 0.5%)", () => {
    const result = computeCarryTradeSignal(5.0, 4.5);
    expect(result.carrySpread).toBeCloseTo(0.5, 2);
    expect(result.regime).toBe("NEUTRAL");
  });

  it("NEUTRAL at upper boundary (spread = 2.5%)", () => {
    const result = computeCarryTradeSignal(7.0, 4.5);
    expect(result.carrySpread).toBeCloseTo(2.5, 2);
    expect(result.regime).toBe("NEUTRAL");
  });

  // ── FII_OUTFLOW_RISK: spread < 0.5% ──────────────────────────────────────

  it("FII_OUTFLOW_RISK when spread < 0.5%", () => {
    const result = computeCarryTradeSignal(4.0, 5.33);
    expect(result.vndDepositRate).toBe(4.0);
    expect(result.fedFundsRate).toBe(5.33);
    expect(result.carrySpread).toBeCloseTo(-1.33, 2);
    expect(result.regime).toBe("FII_OUTFLOW_RISK");
    expect(result.reasoning).toMatch(/outflow|risk|USD/i);
  });

  it("FII_OUTFLOW_RISK when spread is exactly 0%", () => {
    const result = computeCarryTradeSignal(5.0, 5.0);
    expect(result.carrySpread).toBeCloseTo(0, 2);
    expect(result.regime).toBe("FII_OUTFLOW_RISK");
  });

  it("FII_OUTFLOW_RISK when spread is between 0% and 0.5% (exclusive)", () => {
    const result = computeCarryTradeSignal(5.3, 5.0);
    expect(result.carrySpread).toBeCloseTo(0.3, 2);
    expect(result.regime).toBe("FII_OUTFLOW_RISK");
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("graceful zero-data handling — vndRate is 0", () => {
    const result = computeCarryTradeSignal(0, 5.33);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toMatch(/unavailable/i);
  });

  it("graceful zero-data handling — fedRate is 0", () => {
    const result = computeCarryTradeSignal(5.5, 0);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toMatch(/unavailable/i);
  });

  it("graceful zero-data handling — both rates are 0", () => {
    const result = computeCarryTradeSignal(0, 0);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning).toMatch(/unavailable/i);
  });

  // ── Output shape ──────────────────────────────────────────────────────────

  it("returns a valid ISO timestamp in computedAt", () => {
    const result = computeCarryTradeSignal(5.5, 4.33);
    const parsed = new Date(result.computedAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns all required fields", () => {
    const result: CarryTradeSignal = computeCarryTradeSignal(5.5, 4.33);
    expect(typeof result.vndDepositRate).toBe("number");
    expect(typeof result.fedFundsRate).toBe("number");
    expect(typeof result.carrySpread).toBe("number");
    expect(typeof result.regime).toBe("string");
    expect(typeof result.reasoning).toBe("string");
    expect(typeof result.computedAt).toBe("string");
  });

  // ── Acceptance criteria from handoff ─────────────────────────────────────

  it("AC1: computeCarryTradeSignal(5.5, 4.33) → spread ≈ 1.17, regime = NEUTRAL", () => {
    const result = computeCarryTradeSignal(5.5, 4.33);
    expect(result.carrySpread).toBeCloseTo(1.17, 2);
    expect(result.regime).toBe("NEUTRAL");
  });

  it("AC2: computeCarryTradeSignal(7.0, 4.33) → spread ≈ 2.67, regime = HOT_MONEY_INFLOW", () => {
    const result = computeCarryTradeSignal(7.0, 4.33);
    expect(result.carrySpread).toBeCloseTo(2.67, 2);
    expect(result.regime).toBe("HOT_MONEY_INFLOW");
  });

  it("AC3: computeCarryTradeSignal(4.0, 5.33) → spread ≈ -1.33, regime = FII_OUTFLOW_RISK", () => {
    const result = computeCarryTradeSignal(4.0, 5.33);
    expect(result.carrySpread).toBeCloseTo(-1.33, 2);
    expect(result.regime).toBe("FII_OUTFLOW_RISK");
  });

  it("AC4: computeCarryTradeSignal(0, 5.33) → regime = NEUTRAL, reasoning contains 'unavailable'", () => {
    const result = computeCarryTradeSignal(0, 5.33);
    expect(result.regime).toBe("NEUTRAL");
    expect(result.reasoning.toLowerCase()).toContain("unavailable");
  });
});
