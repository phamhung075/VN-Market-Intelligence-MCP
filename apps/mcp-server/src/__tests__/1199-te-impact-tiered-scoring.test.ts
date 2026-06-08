// src/__tests__/1199-te-impact-tiered-scoring.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { scoreMacroIndicator, MacroIndicatorTier } from "../domain/services/macroIndicatorScorer.js";

describe("Task 1199 — Trading Economics tiered impact scoring", () => {
  // ── Tier 1: VN-direct indicators → 8-10 ───────────────────────────────────
  it("scores Vietnam GDP as tier VN_DIRECT (8-10)", () => {
    const score = scoreMacroIndicator("vietnam gdp growth rate");
    expect(score).toBeGreaterThanOrEqual(8);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("scores Vietnam CPI as tier VN_DIRECT", () => {
    const score = scoreMacroIndicator("vietnam cpi inflation");
    expect(score).toBeGreaterThanOrEqual(8);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("scores Vietnam interest rate as tier VN_DIRECT", () => {
    const score = scoreMacroIndicator("vietnam interest rate");
    expect(score).toBeGreaterThanOrEqual(8);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("scores SBV refinancing rate as tier VN_DIRECT", () => {
    const score = scoreMacroIndicator("sbv refinancing rate");
    expect(score).toBeGreaterThanOrEqual(8);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("scores VND exchange rate as tier VN_DIRECT", () => {
    const score = scoreMacroIndicator("usd vnd exchange rate");
    expect(score).toBeGreaterThanOrEqual(8);
    expect(score).toBeLessThanOrEqual(10);
  });

  // ── Tier 2: Regional indicators → 5-7 ────────────────────────────────────
  it("scores China PMI as tier REGIONAL (5-7)", () => {
    const score = scoreMacroIndicator("china pmi manufacturing");
    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(7);
  });

  it("scores Fed rate as tier REGIONAL", () => {
    const score = scoreMacroIndicator("federal reserve interest rate");
    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(7);
  });

  it("scores oil price as tier REGIONAL", () => {
    const score = scoreMacroIndicator("crude oil price brent");
    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(7);
  });

  it("scores ASEAN GDP as tier REGIONAL", () => {
    const score = scoreMacroIndicator("asean gdp growth");
    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(7);
  });

  // ── Tier 3: US-domestic indicators → 2-4 ─────────────────────────────────
  it("scores US housing starts as tier US_DOMESTIC (2-4)", () => {
    const score = scoreMacroIndicator("us housing starts");
    expect(score).toBeGreaterThanOrEqual(2);
    expect(score).toBeLessThanOrEqual(4);
  });

  it("scores US retail sales as tier US_DOMESTIC", () => {
    const score = scoreMacroIndicator("us retail sales");
    expect(score).toBeGreaterThanOrEqual(2);
    expect(score).toBeLessThanOrEqual(4);
  });

  it("scores US consumer confidence as tier US_DOMESTIC", () => {
    const score = scoreMacroIndicator("us consumer confidence index");
    expect(score).toBeGreaterThanOrEqual(2);
    expect(score).toBeLessThanOrEqual(4);
  });

  it("scores UK GDP as tier US_DOMESTIC (non-relevant market)", () => {
    const score = scoreMacroIndicator("united kingdom gdp growth");
    expect(score).toBeGreaterThanOrEqual(2);
    expect(score).toBeLessThanOrEqual(4);
  });

  // ── Tier resolution is case-insensitive ───────────────────────────────────
  it("matches VN GDP uppercase", () => {
    const score = scoreMacroIndicator("VIETNAM GDP");
    expect(score).toBeGreaterThanOrEqual(8);
  });

  // ── MacroIndicatorTier enum exported ─────────────────────────────────────
  it("exports MacroIndicatorTier values", () => {
    expect(MacroIndicatorTier.VN_DIRECT).toBeDefined();
    expect(MacroIndicatorTier.REGIONAL).toBeDefined();
    expect(MacroIndicatorTier.US_DOMESTIC).toBeDefined();
  });

  // ── Unknown indicator defaults to REGIONAL ────────────────────────────────
  it("defaults unknown indicator to REGIONAL tier (5-7)", () => {
    const score = scoreMacroIndicator("some unknown market indicator xyz");
    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(7);
  });
});
