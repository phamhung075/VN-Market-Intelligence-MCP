/**
 * DSI-S1-FE-TYPE — compile-time + runtime type-shape assertions.
 *
 * AC-FE-1: tsc --noEmit passes with zero errors.
 * AC-FE-2: MacroSnapshot with dataSource:"fixture" + is_estimate:true compiles.
 * AC-FE-3: No existing consumers produce type errors (additive-only change — verified by tsc).
 * AC-FE-4: StockQuote.change = null compiles; StockQuote.changePercent = null compiles.
 *
 * These are compile-time proofs — the test bodies use runtime asserts only to confirm
 * the TypeScript types accepted the assignments (no TS error = the proof).
 */

import { describe, it, expect } from "vitest";
import type { MacroSnapshot, MacroSignalEntry, StockQuote } from "~/domain/market.js";

// ---------------------------------------------------------------------------
// AC-FE-2: MacroSnapshot with provenance fields compiles
// ---------------------------------------------------------------------------
describe("DSI-S1-FE-TYPE: MacroSnapshot provenance fields", () => {
  it("accepts dataSource:'fixture' and is_estimate:true without TS error", () => {
    const snapshot: MacroSnapshot = {
      vnIndex: 1280.5,
      oilUsd: 72.3,
      goldUsd: 2350.0,
      usdVnd: 25100,
      signals: {},
      fetchedAt: "2026-06-04T19:00:00Z",
      dataSource: "fixture",
      is_estimate: true,
      source_tier: 4,
      fedFundsRateIsEstimate: true,
      carrySpread: null,
      carryRegime: "unavailable — est. rate",
    };
    // Runtime assertion — TS accepted the type above (no error = AC-FE-2 proof)
    expect(snapshot.dataSource).toBe("fixture");
    expect(snapshot.is_estimate).toBe(true);
    expect(snapshot.carrySpread).toBeNull();
    expect(snapshot.carryRegime).toBe("unavailable — est. rate");
  });

  it("accepts dataSource:'live' with numeric carrySpread", () => {
    const snapshot: MacroSnapshot = {
      vnIndex: 1280.5,
      oilUsd: 72.3,
      goldUsd: 2350.0,
      usdVnd: 25100,
      signals: {},
      fetchedAt: "2026-06-04T19:00:00Z",
      dataSource: "live",
      is_estimate: false,
      source_tier: 1,
      fedFundsRateIsEstimate: false,
      carrySpread: 1.4,
      carryRegime: "FII_INFLOW_FAVORABLE",
    };
    expect(snapshot.dataSource).toBe("live");
    expect(snapshot.carrySpread).toBe(1.4);
  });

  it("accepts all provenance fields absent (backward-compat — all optional)", () => {
    const snapshot: MacroSnapshot = {
      vnIndex: null,
      oilUsd: null,
      goldUsd: null,
      usdVnd: null,
      signals: {},
      fetchedAt: "2026-06-04T19:00:00Z",
    };
    // All new fields absent — no TS error
    expect(snapshot.dataSource).toBeUndefined();
    expect(snapshot.is_estimate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MacroSignalEntry provenance fields
// ---------------------------------------------------------------------------
describe("DSI-S1-FE-TYPE: MacroSignalEntry provenance fields", () => {
  it("accepts is_estimate, source_tier, fetched_at", () => {
    const entry: MacroSignalEntry = {
      regime: null,
      carrySpread: null,
      is_estimate: true,
      source_tier: 4,
      fetched_at: "2026-06-01T00:00:00Z",
    };
    expect(entry.is_estimate).toBe(true);
    expect(entry.source_tier).toBe(4);
    expect(entry.regime).toBeNull();
  });

  it("accepts entry with no provenance fields (backward-compat)", () => {
    const entry: MacroSignalEntry = {
      tier: "growth",
      score: 0.7,
      phase: "expansion",
    };
    expect(entry.tier).toBe("growth");
    expect(entry.is_estimate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC-FE-4: StockQuote.change and .changePercent = null compile
// ---------------------------------------------------------------------------
describe("DSI-S1-FE-TYPE: StockQuote null fields (AC-FE-4)", () => {
  it("accepts change:null — Tier-3 cache / unavailable (DSI-S2-PRICE)", () => {
    const quote: StockQuote = {
      ticker: "VNM",
      exchange: "HOSE",
      price: 60000,
      priceRef: 59500,
      change: null,           // AC-FE-4: null accepted
      changePct: 0.84,
      changePercent: null,    // null = unavailable (Tier-3 cache)
      direction: "up",
      colour: "up",
      volume: 500000,
      timestamp: "2026-06-04T09:00:00Z",
      staleness: "STALE",
      isEstimate: true,
      fetchedAt: "2026-06-03T15:00:00Z",
    };
    expect(quote.change).toBeNull();
    expect(quote.changePercent).toBeNull();
    expect(quote.staleness).toBe("STALE");
  });

  it("accepts change:0 — genuine flat day (real zero preserved)", () => {
    const quote: StockQuote = {
      ticker: "FPT",
      exchange: "HOSE",
      price: 120000,
      priceRef: 120000,
      change: 0,              // genuine flat day: 0 != null
      changePct: 0.0,
      changePercent: 0,       // genuine flat day: 0 != null
      direction: "flat",
      colour: "ref",
      volume: 100000,
      timestamp: "2026-06-04T09:00:00Z",
      staleness: "FRESH",
    };
    expect(quote.change).toBe(0);
    expect(quote.changePercent).toBe(0);
    expect(quote.staleness).toBe("FRESH");
  });

  it("accepts optional staleness fields absent (backward-compat)", () => {
    const quote: StockQuote = {
      ticker: "VCB",
      exchange: "HOSE",
      price: 80000,
      priceRef: 79500,
      change: 500,
      changePct: 0.63,
      changePercent: 0.63,
      direction: "up",
      colour: "up",
      volume: 200000,
      timestamp: "2026-06-04T09:00:00Z",
    };
    expect(quote.staleness).toBeUndefined();
    expect(quote.isEstimate).toBeUndefined();
  });
});
