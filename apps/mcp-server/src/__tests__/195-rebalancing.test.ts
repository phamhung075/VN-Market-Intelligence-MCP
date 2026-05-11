/**
 * Task 195 — Portfolio rebalancing signals
 *
 * Tests for:
 *   - computeRebalancing() domain service (pure calculation)
 *   - formatRebalancingReport() output formatter
 *
 * All financial values in VND (not million VND) since share prices
 * and share counts live at actual-value granularity here.
 */

import { describe, it, expect } from "bun:test";
import {
  computeRebalancing,
  formatRebalancingReport,
  type RebalanceAction,
} from "../domain/services/rebalancingCalculator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const simplePositions = [
  { code: "VCB", shares: 100, currentPrice: 85_000 },  // 8,500,000 VND
  { code: "FPT", shares: 50,  currentPrice: 120_000 }, // 6,000,000 VND
  { code: "HPG", shares: 200, currentPrice: 30_000 },  // 6,000,000 VND
  // Total: 20,500,000 VND
];

const simpleTargets = new Map<string, number>([
  ["VCB", 40],
  ["FPT", 30],
  ["HPG", 30],
]);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 195 — computeRebalancing", () => {
  it("returns one action per position", () => {
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    expect(result).toHaveLength(3);
    const codes = result.map((r) => r.code);
    expect(codes).toContain("VCB");
    expect(codes).toContain("FPT");
    expect(codes).toContain("HPG");
  });

  it("computes currentWeight correctly", () => {
    // VCB = 8,500,000 / 20,500,000 ≈ 41.46%
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    const vcb = result.find((r) => r.code === "VCB")!;
    expect(vcb.currentWeight).toBeCloseTo(41.46, 1);
  });

  it("sets targetWeight from map", () => {
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    const vcb = result.find((r) => r.code === "VCB")!;
    expect(vcb.targetWeight).toBe(40);
  });

  it("drift = currentWeight - targetWeight", () => {
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    const vcb = result.find((r) => r.code === "VCB")!;
    expect(vcb.drift).toBeCloseTo(vcb.currentWeight - vcb.targetWeight, 4);
  });

  it("marks overweight positions as BAN BOT", () => {
    // VCB is ~41.46% vs target 40% → overweight → sell
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    const vcb = result.find((r) => r.code === "VCB")!;
    expect(vcb.action).toBe("BAN BOT");
  });

  it("marks underweight positions as MUA THEM", () => {
    // FPT is 6,000,000/20,500,000 ≈ 29.27% vs target 30% → underweight → buy
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    const fpt = result.find((r) => r.code === "FPT")!;
    expect(fpt.action).toBe("MUA THEM");
  });

  it("sharesNeeded is negative for BAN BOT", () => {
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    const vcb = result.find((r) => r.code === "VCB")!;
    expect(vcb.sharesNeeded).toBeLessThan(0);
  });

  it("sharesNeeded is positive for MUA THEM", () => {
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    const fpt = result.find((r) => r.code === "FPT")!;
    expect(fpt.sharesNeeded).toBeGreaterThan(0);
  });

  it("amountVnd = abs(sharesNeeded) * currentPrice", () => {
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    for (const action of result) {
      const pos = simplePositions.find((p) => p.code === action.code)!;
      expect(action.amountVnd).toBeCloseTo(
        Math.abs(action.sharesNeeded) * pos.currentPrice,
        0,
      );
    }
  });

  it("GIU NGUYEN when drift is within tolerance band (±0.5%)", () => {
    // Build a perfectly balanced portfolio: each stock = exactly 33.33%
    const positions = [
      { code: "A", shares: 100, currentPrice: 10_000 }, // 1,000,000
      { code: "B", shares: 100, currentPrice: 10_000 }, // 1,000,000
      { code: "C", shares: 100, currentPrice: 10_000 }, // 1,000,000
    ];
    const targets = new Map([["A", 33.33], ["B", 33.33], ["C", 33.34]]);
    const result = computeRebalancing(positions, targets, 3_000_000);
    for (const action of result) {
      expect(action.action).toBe("GIU NGUYEN");
      expect(action.sharesNeeded).toBe(0);
    }
  });

  it("handles single stock portfolio", () => {
    const positions = [{ code: "VNM", shares: 500, currentPrice: 50_000 }];
    const targets = new Map([["VNM", 100]]);
    const result = computeRebalancing(positions, targets, 25_000_000);
    expect(result).toHaveLength(1);
    const vnm = result[0]!;
    expect(vnm.action).toBe("GIU NGUYEN");
    expect(vnm.currentWeight).toBeCloseTo(100, 4);
    expect(vnm.drift).toBeCloseTo(0, 4);
  });

  it("returns empty array for empty positions", () => {
    const result = computeRebalancing([], new Map(), 0);
    expect(result).toEqual([]);
  });

  it("sharesNeeded rounded to whole shares (integer)", () => {
    const result = computeRebalancing(simplePositions, simpleTargets, 20_500_000);
    for (const action of result) {
      expect(Number.isInteger(action.sharesNeeded)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. formatRebalancingReport output format
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 195 — formatRebalancingReport", () => {
  it("includes header title", () => {
    const actions: RebalanceAction[] = [
      {
        code: "VCB",
        currentWeight: 41.46,
        targetWeight: 40,
        drift: 1.46,
        action: "BAN BOT",
        sharesNeeded: -14,
        amountVnd: 1_190_000,
      },
    ];
    const output = formatRebalancingReport(actions, 20_500_000);
    expect(output).toContain("Tai can bang danh muc");
  });

  it("includes column headers Ma, Hien tai, Muc tieu, Lech, Hanh dong", () => {
    const actions: RebalanceAction[] = [];
    const output = formatRebalancingReport(actions, 0);
    expect(output).toContain("Ma");
    expect(output).toContain("Hien tai");
    expect(output).toContain("Muc tieu");
    expect(output).toContain("Lech");
    expect(output).toContain("Hanh dong");
  });

  it("includes stock code in output row", () => {
    const actions: RebalanceAction[] = [
      {
        code: "FPT",
        currentWeight: 29.27,
        targetWeight: 30,
        drift: -0.73,
        action: "MUA THEM",
        sharesNeeded: 6,
        amountVnd: 720_000,
      },
    ];
    const output = formatRebalancingReport(actions, 20_500_000);
    expect(output).toContain("FPT");
    expect(output).toContain("MUA THEM");
  });

  it("includes total portfolio value", () => {
    const actions: RebalanceAction[] = [];
    const output = formatRebalancingReport(actions, 85_000_000);
    expect(output).toContain("85,000,000");
  });
});
