/**
 * Task 165 — Prediction Cascade Mapper
 *
 * Tests for mapPredictionToCascade() — pure domain function that maps
 * prediction market questions to Vietnamese stock sectors and stocks.
 */

import { describe, it, expect } from "bun:test";
import {
  mapPredictionToCascade,
  type CascadeMapping,
  type KeywordRule,
} from "../domain/services/predictionCascadeMapper.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const WATCHLIST = ["VNM", "FPT", "VCB", "VEA"];

function map(question: string, watchlist = WATCHLIST): CascadeMapping {
  return mapPredictionToCascade(question, watchlist);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 165 — Prediction Cascade Mapper", () => {
  // ── No-match fallback ──────────────────────────────────────────────────────

  it("returns matched=false for unrecognised question", () => {
    const result = map("Will it rain in Tokyo next week?");
    expect(result.matched).toBe(false);
    expect(result.domains).toHaveLength(0);
    expect(result.stocks).toHaveLength(0);
    expect(result.direction).toBe("neutral");
    expect(result.reasoning).toBe("");
  });

  // ── R01: Fed rate cut → banking bullish ───────────────────────────────────

  it("R01: 'Will the Fed cut rates in 2026?' → banking bullish", () => {
    const result = map("Will the Fed cut rates in 2026?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("banking");
    expect(result.stocks).toContain("VCB");
    expect(result.stocks).toContain("TCB");
    expect(result.direction).toBe("bullish");
  });

  it("R01: 'Will the Fed announce an interest rate cut?' → banking bullish", () => {
    const result = map("Will the Fed announce an interest rate cut?");
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
    expect(result.domains).toContain("banking");
  });

  it("R01: 'Will the Fed cut rates?' variant with 'cut rates'", () => {
    const result = map("Will the Fed cut rates at the next meeting?");
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
  });

  // ── R02: Fed rate hike → banking bearish ─────────────────────────────────

  it("R02: 'Will the Fed raise rates by 50bps?' → banking bearish", () => {
    const result = map("Will the Fed raise rates by 50bps in 2026?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("banking");
    expect(result.direction).toBe("bearish");
  });

  it("R02: 'Will the Fed tighten policy?' → banking bearish", () => {
    const result = map("Will the Fed tighten monetary policy this quarter?");
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
  });

  // ── R03: China tariff/trade war → steel bearish ──────────────────────────

  it("R03: 'Will China impose new trade barriers?' → steel bearish", () => {
    const result = map("Will China impose new trade barriers on Vietnamese goods?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("steel");
    expect(result.stocks).toContain("HPG");
    expect(result.direction).toBe("bearish");
  });

  // ── R05: Oil/crude/brent → oil_gas neutral ───────────────────────────────

  it("R05: 'Will Brent crude exceed $100?' → oil_gas neutral", () => {
    const result = map("Will Brent crude oil exceed $100 per barrel?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("oil_gas");
    expect(result.stocks).toContain("GAS");
    expect(result.stocks).toContain("PLX");
    expect(result.direction).toBe("neutral");
  });

  it("R05: 'Will OPEC cut production?' → oil_gas neutral", () => {
    const result = map("Will OPEC cut production in Q2 2026?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("oil_gas");
  });

  // ── R06: Vietnam GDP/growth → all watchlist bullish ───────────────────────

  it("R06: 'Will Vietnam GDP grow above 6%?' → bullish with watchlist stocks", () => {
    const result = map("Will Vietnam GDP grow above 6% in 2026?", WATCHLIST);
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
    // All watchlist codes should be included (stocks=[] → expand to watchlist)
    for (const code of WATCHLIST) {
      expect(result.stocks).toContain(code);
    }
  });

  it("R06: 'Will Vietnam economic growth beat expectations?' → bullish", () => {
    const result = map("Will Vietnam economic growth beat expectations this year?");
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
  });

  // ── R08: War/conflict → all watchlist bearish ─────────────────────────────

  it("R08: 'Will the Middle East conflict escalate?' → bearish with watchlist", () => {
    const result = map("Will the Middle East conflict escalate in 2026?", WATCHLIST);
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
    for (const code of WATCHLIST) {
      expect(result.stocks).toContain(code);
    }
  });

  it("R08: 'Will Russia face new sanctions?' → bearish", () => {
    const result = map("Will Russia face new international sanctions this year?");
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
  });

  // ── R09: China GDP/slowdown → steel + tech bearish ───────────────────────

  it("R09: 'Will China economy slow down?' → steel + tech bearish", () => {
    const result = map("Will the China economy slow down in 2026?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("steel");
    expect(result.stocks).toContain("HPG");
    expect(result.direction).toBe("bearish");
  });

  // ── R10: Dollar/DXY → banking + retail bearish ───────────────────────────

  it("R10: 'Will the dollar strengthen?' → banking + retail bearish", () => {
    const result = map("Will the dollar index (DXY) strengthen through 2026?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("banking");
    expect(result.stocks).toContain("VCB");
    expect(result.direction).toBe("bearish");
  });

  // ── R11: Inflation/CPI → banking + retail bearish ────────────────────────

  it("R11: 'Will US CPI exceed 4%?' → banking + retail bearish", () => {
    const result = map("Will US CPI exceed 4% by mid-2026?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("banking");
    expect(result.direction).toBe("bearish");
  });

  // ── R13: Taiwan → tech + manufacturing bearish ───────────────────────────

  it("R13: 'Will tensions over Taiwan strait increase?' → tech bearish", () => {
    const result = map("Will tensions over the Taiwan Strait increase in 2026?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("tech");
    expect(result.stocks).toContain("FPT");
    expect(result.direction).toBe("bearish");
  });

  // ── R14: Federal Reserve standalone ──────────────────────────────────────

  it("R14: 'Will the Federal Reserve change policy?' → banking neutral", () => {
    const result = map("Will the Federal Reserve change its policy stance?");
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("banking");
    // R01 and R02 do NOT match (no rate cut/hike keywords), R14 fires → neutral
    expect(result.direction).toBe("neutral");
  });

  // ── Custom rules injection ─────────────────────────────────────────────────

  it("accepts custom rules injected at runtime", () => {
    const customRule: KeywordRule = {
      keywordGroups: [["coffee"], ["export", "price"]],
      domains: ["agriculture"],
      stocks: ["VNM"],
      direction: "bullish",
      reasoning: "Coffee export price increase → VNM bullish",
    };
    const result = mapPredictionToCascade(
      "Will coffee export prices hit a record high?",
      WATCHLIST,
      [customRule],
    );
    expect(result.matched).toBe(true);
    expect(result.domains).toContain("agriculture");
    expect(result.stocks).toContain("VNM");
    expect(result.direction).toBe("bullish");
    expect(result.reasoning).toContain("Coffee export price");
  });

  // ── Multi-rule union (multiple rules can match) ───────────────────────────

  it("unions sectors and stocks when multiple rules match", () => {
    // "inflation" + "fed" may match both R11 (inflation → banking/retail) and
    // R14 (federal reserve → banking neutral). Direction = first match's direction.
    const result = map("Will inflation force the Federal Reserve to act?");
    expect(result.matched).toBe(true);
    // Both inflation (R11) and Federal Reserve (R14) rules should fire
    expect(result.domains).toContain("banking");
  });

  // ── Stocks=[] rule uses watchlist ─────────────────────────────────────────

  it("expands stocks=[] rules to include all watchlist codes", () => {
    const customRule: KeywordRule = {
      keywordGroups: [["earthquake", "natural disaster"]],
      domains: ["other"],
      stocks: [],
      direction: "bearish",
      reasoning: "Natural disaster → all watchlist bearish",
    };
    const result = mapPredictionToCascade(
      "Will a major earthquake or natural disaster hit Southeast Asia?",
      ["HPG", "FPT", "VCB"],
      [customRule],
    );
    expect(result.matched).toBe(true);
    expect(result.stocks).toContain("HPG");
    expect(result.stocks).toContain("FPT");
    expect(result.stocks).toContain("VCB");
  });

  // ── Case insensitivity ────────────────────────────────────────────────────

  it("matching is case-insensitive", () => {
    const result = map("WILL THE FED CUT RATES?");
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
  });

  // ── reasoning field is populated ─────────────────────────────────────────

  it("reasoning field is non-empty on match", () => {
    const result = map("Will the Fed cut rates in 2026?");
    expect(result.matched).toBe(true);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  // ── Empty watchlist edge case ─────────────────────────────────────────────

  it("handles empty watchlist gracefully for stocks=[] rules", () => {
    const result = mapPredictionToCascade(
      "Will Vietnam GDP grow above 6% in 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
    // stocks=[] rule with empty watchlist → stocks is empty array
    expect(result.stocks).toHaveLength(0);
  });
});
