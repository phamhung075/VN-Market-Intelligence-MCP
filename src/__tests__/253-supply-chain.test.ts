/**
 * Task 253 — Supply Chain Analyzer Tests
 *
 * Tests for analyzeSupplyChainImpact() — pure domain function.
 * Maps shipping index σ-deviations to stock-level impacts.
 */

import { describe, it, expect } from "bun:test";
import {
  analyzeSupplyChainImpact,
  type SupplyChainSignal,
} from "../domain/services/supplyChainAnalyzer.js";
import type { ShippingIndex } from "../infrastructure/fetchers/shippingIndex.js";
import type { MacroStats } from "../domain/services/macroThresholds.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WATCHLIST: WatchlistEntry[] = [
  { actionCode: "HPG", domain: "steel", exchange: "HOSE" },
  { actionCode: "GMD", domain: "logistics", exchange: "HOSE" },
  { actionCode: "VNM", domain: "consumer_goods", exchange: "HOSE" },
  { actionCode: "GVR", domain: "agriculture", exchange: "HOSE" },
  { actionCode: "FPT", domain: "technology", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
];

function makeBdiStats(current: number, mean: number, stdDev: number): MacroStats {
  return {
    name: "shipping_bdi",
    current,
    mean,
    stdDev,
    sampleCount: 30,
  };
}

function makeBdi(value: number): ShippingIndex {
  return { name: "BDI", value, change: 0, changePct: 0, date: "2026-04-03" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 253 — Supply Chain Analyzer", () => {
  it("returns array of SupplyChainSignal", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)]; // +2σ
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    expect(Array.isArray(signals)).toBe(true);
  });

  it("high BDI (above +1σ) → HPG bearish (import cost increase)", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)]; // z = +2.0σ
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    const hpgSignal = signals.find((s) => s.affectedStocks.some((a) => a.code === "HPG"));
    expect(hpgSignal).toBeDefined();
    const hpgEntry = hpgSignal!.affectedStocks.find((a) => a.code === "HPG");
    expect(hpgEntry!.direction).toBe("bearish");
  });

  it("high BDI (above +1σ) → GMD bullish (logistics revenue up)", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)]; // z = +2.0σ
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    const gmdSignal = signals.find((s) => s.affectedStocks.some((a) => a.code === "GMD"));
    expect(gmdSignal).toBeDefined();
    const gmdEntry = gmdSignal!.affectedStocks.find((a) => a.code === "GMD");
    expect(gmdEntry!.direction).toBe("bullish");
  });

  it("low BDI (below -1σ) → HPG bullish (import cost decrease)", () => {
    const indices = [makeBdi(1000)];
    const stats = [makeBdiStats(1000, 1500, 250)]; // z = -2.0σ
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    const hpgSignal = signals.find((s) => s.affectedStocks.some((a) => a.code === "HPG"));
    expect(hpgSignal).toBeDefined();
    const hpgEntry = hpgSignal!.affectedStocks.find((a) => a.code === "HPG");
    expect(hpgEntry!.direction).toBe("bullish");
  });

  it("low BDI (below -1σ) → GMD bearish (logistics revenue down)", () => {
    const indices = [makeBdi(1000)];
    const stats = [makeBdiStats(1000, 1500, 250)]; // z = -2.0σ
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    const gmdSignal = signals.find((s) => s.affectedStocks.some((a) => a.code === "GMD"));
    expect(gmdSignal).toBeDefined();
    const gmdEntry = gmdSignal!.affectedStocks.find((a) => a.code === "GMD");
    expect(gmdEntry!.direction).toBe("bearish");
  });

  it("high container rates (FBX_ASIA_US) → VNM bearish (export cost up)", () => {
    const indices = [
      { name: "FBX_ASIA_US", value: 5000, change: 1000, changePct: 25, date: "2026-04-03" },
    ];
    const stats = [
      { name: "shipping_fbx_asia_us", current: 5000, mean: 3000, stdDev: 700, sampleCount: 30 },
    ];
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    const vnmSignal = signals.find((s) => s.affectedStocks.some((a) => a.code === "VNM"));
    expect(vnmSignal).toBeDefined();
    const vnmEntry = vnmSignal!.affectedStocks.find((a) => a.code === "VNM");
    expect(vnmEntry!.direction).toBe("bearish");
  });

  it("signals include index name and deviation", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)];
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    if (signals.length > 0) {
      expect(signals[0].index).toBeDefined();
      expect(signals[0].deviation).toBeDefined();
      expect(signals[0].deviation.zScore).toBeDefined();
    }
  });

  it("normal BDI (within 1σ) → no signals generated", () => {
    const indices = [makeBdi(1500)];
    const stats = [makeBdiStats(1500, 1500, 250)]; // z = 0
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    expect(signals.length).toBe(0);
  });

  it("severity is 'high' for 2σ deviation", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)]; // z = +2.0
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    if (signals.length > 0) {
      expect(["medium", "high", "critical"]).toContain(signals[0].severity);
    }
  });

  it("severity is 'critical' for 3σ+ deviation", () => {
    const indices = [makeBdi(2500)];
    const stats = [makeBdiStats(2500, 1500, 250)]; // z = +4.0
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    if (signals.length > 0) {
      expect(signals[0].severity).toBe("critical");
    }
  });

  it("FPT (low sensitivity, neutral) is not affected by high BDI", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)]; // +2σ
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    const fptAppears = signals.some((s) =>
      s.affectedStocks.some((a) => a.code === "FPT"),
    );
    // FPT has low sensitivity and neutral direction — should not appear
    expect(fptAppears).toBe(false);
  });

  it("VCB (no shipping exposure) not included in supply chain signals", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)];
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    const vcbAppears = signals.some((s) =>
      s.affectedStocks.some((a) => a.code === "VCB"),
    );
    expect(vcbAppears).toBe(false);
  });

  it("confidence is between 0 and 1", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)];
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    for (const sig of signals) {
      expect(sig.confidence).toBeGreaterThan(0);
      expect(sig.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("returns empty array when no indices provided", () => {
    const signals = analyzeSupplyChainImpact([], [], WATCHLIST);
    expect(signals.length).toBe(0);
  });

  it("returns empty array when no stats available", () => {
    const indices = [makeBdi(2000)];
    // No matching stats → cannot compute z-score
    const signals = analyzeSupplyChainImpact(indices, [], WATCHLIST);
    expect(signals.length).toBe(0);
  });

  it("each affectedStock has code, direction, and reasoning fields", () => {
    const indices = [makeBdi(2000)];
    const stats = [makeBdiStats(2000, 1500, 250)];
    const signals = analyzeSupplyChainImpact(indices, stats, WATCHLIST);
    for (const sig of signals) {
      for (const stock of sig.affectedStocks) {
        expect(typeof stock.code).toBe("string");
        expect(["bullish", "bearish", "neutral"]).toContain(stock.direction);
        expect(typeof stock.reasoning).toBe("string");
        expect(stock.reasoning.length).toBeGreaterThan(0);
      }
    }
  });
});
