// src/__tests__/165-prediction-cascade-mapper.test.ts
import { describe, it, expect } from "bun:test";
import {
  mapPredictionToCascade,
  type CascadeMapping,
  type KeywordRule,
} from "../domain/services/predictionCascadeMapper.js";

describe("Task 165 — Prediction Cascade Mapper", () => {
  // ─── No-match fallback ────────────────────────────────────────────────────

  it("returns matched=false with empty sectors/stocks for unrecognised question", () => {
    const result = mapPredictionToCascade("Will a new cryptocurrency top Bitcoin?", []);
    expect(result.matched).toBe(false);
    expect(result.sectors).toEqual([]);
    expect(result.stocks).toEqual([]);
    expect(result.direction).toBe("neutral");
    expect(result.confidence).toBe(0);
  });

  it("returns matched=false for empty question string", () => {
    const result = mapPredictionToCascade("", []);
    expect(result.matched).toBe(false);
  });

  // ─── R01: Fed rate cut → banking bullish ─────────────────────────────────

  it("R01: 'Will the Fed cut rates in June?' → banking bullish", () => {
    const result = mapPredictionToCascade(
      "Will the Fed cut rates in June 2026?",
      ["VCB"],
    );
    expect(result.matched).toBe(true);
    expect(result.sectors).toContain("banking");
    expect(result.stocks).toContain("VCB");
    expect(result.direction).toBe("bullish");
  });

  it("R01: 'Fed interest rate cut' variant triggers banking bullish", () => {
    const result = mapPredictionToCascade(
      "Will the Fed announce an interest rate cut before July?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
    expect(result.sectors).toContain("banking");
  });

  // ─── R02: Fed rate hike → banking bearish ────────────────────────────────

  it("R02: 'Will Fed raise rates in 2026?' → banking bearish", () => {
    const result = mapPredictionToCascade(
      "Will the Fed raise rates by Q3 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
    expect(result.sectors).toContain("banking");
    expect(result.stocks).toContain("VCB");
  });

  it("R02: 'Fed tighten monetary policy' → banking bearish", () => {
    const result = mapPredictionToCascade(
      "Will the Fed tighten monetary policy in 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
  });

  // ─── R03/R04: China tariffs/trade war → steel bearish ────────────────────

  it("R03: 'china trade war' → steel bearish, includes HPG", () => {
    const result = mapPredictionToCascade(
      "Will China escalate the trade war with the US in 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
    expect(result.sectors).toContain("steel");
    expect(result.stocks).toContain("HPG");
  });

  it("R03: 'china tariff barrier' → bearish manufacturing", () => {
    const result = mapPredictionToCascade(
      "Will China impose tariff barriers on Vietnamese goods?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
  });

  // ─── R05: Oil / crude / brent / OPEC ────────────────────────────────────

  it("R05: 'Will OPEC cut oil production?' → oil_gas", () => {
    const result = mapPredictionToCascade(
      "Will OPEC cut oil production before June?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.sectors).toContain("oil_gas");
    expect(result.stocks).toContain("GAS");
  });

  it("R05: 'Brent crude' variant triggers oil_gas", () => {
    const result = mapPredictionToCascade(
      "Will Brent crude exceed $90 in 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.sectors).toContain("oil_gas");
  });

  // ─── R06: Vietnam GDP/growth → all watchlist bullish ────────────────────

  it("R06: 'Vietnam GDP growth' → adds all watchlist stocks", () => {
    const watchlist = ["VNM", "FPT", "VCB"];
    const result = mapPredictionToCascade(
      "Will Vietnam GDP growth exceed 7% in 2026?",
      watchlist,
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
    for (const code of watchlist) {
      expect(result.stocks).toContain(code);
    }
  });

  // ─── R08: War / conflict / sanctions → all watchlist bearish ────────────

  it("R08: 'war' in question → bearish, all watchlist", () => {
    const watchlist = ["VNM", "HPG"];
    const result = mapPredictionToCascade(
      "Will the Russia-Ukraine war end in 2026?",
      watchlist,
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
    for (const code of watchlist) {
      expect(result.stocks).toContain(code);
    }
  });

  it("R08: 'sanctions' triggers bearish watchlist", () => {
    const result = mapPredictionToCascade(
      "Will US impose new sanctions on Iran?",
      ["VCB"],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
  });

  // ─── R10: Dollar / DXY → banking+retail bearish ──────────────────────────

  it("R10: 'dollar strengthen' → banking bearish", () => {
    const result = mapPredictionToCascade(
      "Will the US dollar strengthen against Asian currencies?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
    expect(result.sectors).toContain("banking");
  });

  // ─── R11: Inflation / CPI ────────────────────────────────────────────────

  it("R11: 'US CPI inflation' → banking+retail bearish", () => {
    const result = mapPredictionToCascade(
      "Will US CPI inflation exceed 4% in 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
    expect(result.sectors).toContain("banking");
  });

  // ─── R13: Taiwan strait → tech+manufacturing bearish ────────────────────

  it("R13: 'taiwan strait' → tech bearish", () => {
    const result = mapPredictionToCascade(
      "Will tensions in the Taiwan Strait escalate in 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bearish");
    expect(result.sectors).toContain("tech");
    expect(result.stocks).toContain("FPT");
  });

  // ─── Multiple rules match → union of sectors/stocks ──────────────────────

  it("multiple matching rules produce union of sectors and stocks (no duplicates)", () => {
    // "Will the Fed raise rates, worsening inflation?" triggers R02 + R11
    const result = mapPredictionToCascade(
      "Will the Fed raise rates worsening inflation in the US?",
      [],
    );
    expect(result.matched).toBe(true);
    // Both banking (R02) and retail (R11) should appear
    expect(result.sectors).toContain("banking");
    // stocks should be deduplicated (VCB appears in both R02 and R10)
    const vcbCount = result.stocks.filter((s) => s === "VCB").length;
    expect(vcbCount).toBe(1);
  });

  // ─── Custom rules injection ───────────────────────────────────────────────

  it("custom rules override/augment built-in matching", () => {
    const customRule: KeywordRule = {
      keywordGroups: [["rubber"], ["vietnam"]],
      domains: ["agriculture"],
      stocks: ["PHR", "DPR"],
      direction: "bullish",
      reasoning: "Vietnam rubber export price rise",
    };
    const result = mapPredictionToCascade(
      "Will rubber prices in Vietnam rise in 2026?",
      [],
      [customRule],
    );
    expect(result.matched).toBe(true);
    expect(result.sectors).toContain("agriculture");
    expect(result.stocks).toContain("PHR");
    expect(result.stocks).toContain("DPR");
    expect(result.direction).toBe("bullish");
  });

  // ─── Case-insensitivity ──────────────────────────────────────────────────

  it("matching is case-insensitive", () => {
    const result = mapPredictionToCascade(
      "WILL THE FED CUT RATES IN 2026?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(result.direction).toBe("bullish");
  });

  // ─── Reasoning string ───────────────────────────────────────────────────

  it("reasoning field is non-empty on a match", () => {
    const result = mapPredictionToCascade(
      "Will the Fed cut rates before year end?",
      [],
    );
    expect(result.matched).toBe(true);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("reasoning is empty string on no-match", () => {
    const result = mapPredictionToCascade(
      "Will the next James Bond film be released in 2026?",
      [],
    );
    expect(result.matched).toBe(false);
    expect(result.reasoning).toBe("");
  });

  // ─── Sectors return value is DomainType (spot check) ────────────────────

  it("sectors only contain valid DomainType values", () => {
    const validDomains = [
      "oil_gas","banking","real_estate","steel","aviation","retail",
      "tech","utilities","agriculture","insurance","securities","pharma",
      "logistics","gold_mining","automotive","other",
    ];
    const result = mapPredictionToCascade(
      "Will the Fed cut rates and Vietnam grow GDP?",
      ["VCB"],
    );
    for (const sector of result.sectors) {
      expect(validDomains).toContain(sector);
    }
  });
});
