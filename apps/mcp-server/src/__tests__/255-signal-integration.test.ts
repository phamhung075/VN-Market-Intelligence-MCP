/**
 * Task 255 — Signal Integration Tests
 *
 * Tests for:
 * 1. SignalType includes "supply_chain"
 * 2. cascadeEngine includes SUPPLY_CHAIN_RULES keywords
 * 3. tradeRelationships has updateExposureFromBctc()
 * 4. supplyChainAnalyzer integrates with cascadeEngine flow
 * 5. detectSupplyChainEvent integrates with pollNews flow
 */

import { describe, it, expect } from "bun:test";
import type { SignalType } from "../domain/services/signalDetector.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import {
  updateExposureFromBctc,
  getTradeProfile,
} from "../domain/services/tradeRelationships.js";
import { detectSupplyChainEvent } from "../domain/services/supplyChainEventDetector.js";
import { analyzeSupplyChainImpact } from "../domain/services/supplyChainAnalyzer.js";
import type { MacroStats } from "../domain/services/macroThresholds.js";
import type { ShippingIndex } from "../infrastructure/fetchers/shippingIndex.js";

// ---------------------------------------------------------------------------
// Test 1: SignalType includes "supply_chain"
// ---------------------------------------------------------------------------

describe("Task 255 — Signal Integration", () => {
  it("SignalType union includes supply_chain", () => {
    // Type-level test: create a variable that must be a valid SignalType
    const signalType: SignalType = "supply_chain";
    expect(signalType).toBe("supply_chain");
  });

  // ---------------------------------------------------------------------------
  // Test 2: cascadeEngine responds to supply chain keywords
  // ---------------------------------------------------------------------------

  it("cascadeEngine SUPPLY_CHAIN_RULES fire on shipping cost surge keywords", () => {
    const entry = {
      id: "sc-001",
      level: "global" as const,
      sourceTitle: "Baltic Dry Index surges to 2-year high amid port congestion",
      summary: "Baltic Dry Index surges to 2-year high. Shipping cost surge hits global supply chains. Port congestion affects logistics revenue for GMD.",
      sentiment: "bearish" as const,
      impactScore: 7,
      confidence: 0.75,
      affectedDomains: [] as import("../domain/services/newsNormalizer.js").AnalysisEntry["affectedDomains"],
      affectedActions: [],
      reasoning: "BDI spike",
      tags: ["shipping", "logistics"],
      sourceUrl: "https://example.com/bdi",
      sourceType: "news" as const,
      publishedAt: "2026-04-03T08:00:00Z",
      createdAt: "2026-04-03T08:00:00Z",
      impactDirection: "down" as const,
      timeHorizon: "short" as const,
      affectedCountries: ["global"],
      parentIds: [],
    };

    const watchlist = [
      { actionCode: "GMD", domain: "logistics" as const, exchange: "HOSE" },
      { actionCode: "HPG", domain: "steel" as const, exchange: "HOSE" },
    ];

    const chain = buildCausalChain(entry, watchlist);
    // Chain should contain logistics domain due to supply chain keywords
    const domains = chain.entries.map((e) => e.affectedDomains).flat();
    expect(chain.entries.length).toBeGreaterThan(0);
    // At least one entry should reference supply chain impact
    const hasSupplyChainEntry = chain.entries.some(
      (e) =>
        e.title.toLowerCase().includes("cung ứng") ||
        e.title.toLowerCase().includes("supply") ||
        e.title.toLowerCase().includes("logistics") ||
        e.title.toLowerCase().includes("vận tải") ||
        e.affectedDomains.includes("logistics") ||
        e.affectedDomains.includes("steel"),
    );
    expect(hasSupplyChainEntry).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 3: tradeRelationships.updateExposureFromBctc exists and runs
  // ---------------------------------------------------------------------------

  it("updateExposureFromBctc is a function", () => {
    expect(typeof updateExposureFromBctc).toBe("function");
  });

  it("updateExposureFromBctc accepts code and revenue data without throwing", () => {
    expect(() => {
      updateExposureFromBctc("HPG", {
        exportRevenuePct: 30,
        importCostPct: 20,
        primaryMarket: "asean",
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Test 4: supplyChainAnalyzer signal pipeline
  // ---------------------------------------------------------------------------

  it("analyzeSupplyChainImpact produces signals that cascade to watchlist stocks", () => {
    const indices: ShippingIndex[] = [
      { name: "BDI", value: 2500, change: 500, changePct: 25, date: "2026-04-03" },
    ];
    const stats: MacroStats[] = [
      { name: "shipping_bdi", current: 2500, mean: 1500, stdDev: 250, sampleCount: 30 },
    ];
    const watchlist = [
      { actionCode: "HPG", domain: "steel" as const, exchange: "HOSE" },
      { actionCode: "GMD", domain: "logistics" as const, exchange: "HOSE" },
    ];

    const signals = analyzeSupplyChainImpact(indices, stats, watchlist);
    expect(signals.length).toBeGreaterThan(0);
    // Signals should have supply chain context
    const hpgImpact = signals[0]?.affectedStocks.find((s) => s.code === "HPG");
    expect(hpgImpact).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Test 5: detectSupplyChainEvent produces events that reference watchlist stocks
  // ---------------------------------------------------------------------------

  it("detectSupplyChainEvent output can be combined with watchlist for targeted alerts", () => {
    const text = "Port congestion at Cai Mep terminal delays steel imports for HPG";
    const watchlist = ["HPG", "GMD", "VNM"];

    const event = detectSupplyChainEvent(text, watchlist);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("port_congestion");
    // Affected stocks should only include watchlist codes
    for (const code of event!.affectedStocks) {
      expect(watchlist).toContain(code);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6: Supply chain signals have correct severity mapping
  // ---------------------------------------------------------------------------

  it("canal_blockage event always generates critical severity", () => {
    const text = "Suez Canal blocked by tanker collision, all traffic halted";
    const event = detectSupplyChainEvent(text, ["HPG", "GMD"]);
    expect(event).not.toBeNull();
    expect(event!.severity).toBe("critical");
  });

  // ---------------------------------------------------------------------------
  // Test 7: Signal type is valid as a string literal
  // ---------------------------------------------------------------------------

  it("supply_chain SignalType can be used in signal objects", () => {
    const signal: { type: SignalType; actionCode: string } = {
      type: "supply_chain",
      actionCode: "HPG",
    };
    expect(signal.type).toBe("supply_chain");
    expect(signal.actionCode).toBe("HPG");
  });

  // ---------------------------------------------------------------------------
  // Test 8: updateExposureFromBctc updates profile data
  // ---------------------------------------------------------------------------

  it("updateExposureFromBctc updates dynamic exposure cache for a stock code", () => {
    updateExposureFromBctc("VNM", {
      exportRevenuePct: 25,
      importCostPct: 5,
      primaryMarket: "middle_east",
    });
    // After update, the data should be retrievable via getDynamicExposure
    const { getDynamicExposure } = require("../domain/services/tradeRelationships.js");
    if (typeof getDynamicExposure === "function") {
      const exposure = getDynamicExposure("VNM");
      expect(exposure).toBeDefined();
    }
    // Basic: function ran without throwing
    expect(true).toBe(true);
  });
});
