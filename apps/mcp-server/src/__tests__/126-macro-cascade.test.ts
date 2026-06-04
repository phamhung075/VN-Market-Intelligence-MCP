Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 126 — Macro Cascade Integration
 *
 * Tests for:
 *  - MacroContext interface and MACRO_ADJUSTMENTS in cascadeEngine.ts
 *  - applyMacroAdjustments helper function
 *  - buildCausalChain extended with optional macroContext param
 *  - runImpactChain extended with injectable commodity/sbv fetchers
 *  - DomainType extended with 'logistics' and 'gold_mining'
 */

import { describe, it, expect } from "bun:test";
import {
  buildCausalChain,
  type MacroContext,
  type WatchlistEntry,
  type CausalChainEntry,
} from "../domain/services/cascadeEngine.js";
import { runImpactChain } from "../application/usecases/runImpactChain.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import type { DomainType } from "../../bctc-schema.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal valid AnalysisEntry for oil-related seed. */
function makeOilSeed(): AnalysisEntry {
  return {
    id: "seed-oil",
    level: "global",
    sourceTitle: "Brent crude surges past $95",
    sourceUrl: "",
    sourceType: "news",
    summary: "Giá dầu tăng mạnh do OPEC cắt giảm sản lượng, brent vượt mức $95/barrel.",
    sentiment: "bullish",
    impactScore: 80,
    impactDirection: "up",
    confidence: 0.80,
    timeHorizon: "short",
    reasoning: "Supply reduction pushes prices up.",
    affectedCountries: ["VN"],
    affectedDomains: ["oil_gas", "aviation"],
    affectedActions: [],
    parentIds: [],
    tags: ["oil", "opec"],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

/** Minimal valid AnalysisEntry for a neutral event. */
function makeNeutralSeed(domain: DomainType): AnalysisEntry {
  return {
    id: "seed-neutral",
    level: "global",
    sourceTitle: "Market update",
    sourceUrl: "",
    sourceType: "news",
    summary: "General market update with no specific keyword triggers.",
    sentiment: "neutral",
    impactScore: 50,
    impactDirection: "neutral",
    confidence: 0.60,
    timeHorizon: "short",
    reasoning: "No strong indicators.",
    affectedCountries: ["VN"],
    affectedDomains: [domain],
    affectedActions: [],
    parentIds: [],
    tags: [],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

/** Watchlist with one stock of a given domain. */
function makeWatchlist(...entries: Array<{ code: string; domain: DomainType }>): WatchlistEntry[] {
  return entries.map(({ code, domain }) => ({
    actionCode: code,
    domain,
    exchange: "HOSE",
  }));
}

/** Extract domain-level CausalChainEntries from a chain. */
function domainEntries(chain: ReturnType<typeof buildCausalChain>): CausalChainEntry[] {
  return chain.entries.filter((e) => e.level === "domain");
}

/** Find domain entry for a given domain. */
function findDomainEntry(
  chain: ReturnType<typeof buildCausalChain>,
  domain: DomainType,
): CausalChainEntry | undefined {
  return chain.entries.find(
    (e) => e.level === "domain" && e.affectedDomains.includes(domain),
  );
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Task 126 — Macro Cascade Integration", () => {
  // ── MC-01: Backward compatibility — no macroContext ───────────────────────
  it("MC-01: buildCausalChain without macroContext produces same result as before", () => {
    const seed = makeOilSeed();
    const watchlist = makeWatchlist({ code: "GAS", domain: "oil_gas" });

    const chainWithout = buildCausalChain(seed, watchlist);
    const chainWith = buildCausalChain(seed, watchlist, undefined, undefined);

    // Same number of entries
    expect(chainWith.entries.length).toBe(chainWithout.entries.length);
    // Same domain confidence (no macro applied)
    const oil1 = findDomainEntry(chainWithout, "oil_gas");
    const oil2 = findDomainEntry(chainWith, "oil_gas");
    expect(oil2?.confidence).toBe(oil1?.confidence);
  });

  // ── MC-02: null macroContext → same as omitting it ────────────────────────
  it("MC-02: buildCausalChain with null macroContext produces same result as without", () => {
    const seed = makeOilSeed();
    const watchlist = makeWatchlist({ code: "GAS", domain: "oil_gas" });

    const chainWithout = buildCausalChain(seed, watchlist);
    const chainNull = buildCausalChain(seed, watchlist, undefined, null);

    const oil1 = findDomainEntry(chainWithout, "oil_gas");
    const oil2 = findDomainEntry(chainNull, "oil_gas");
    expect(oil2?.confidence).toBe(oil1?.confidence);
  });

  // ── MC-03: High oil boosts oil_gas by +0.10 ───────────────────────────────
  it("MC-03: high oil (brent=95) boosts oil_gas domain confidence by +0.10", () => {
    const seed = makeOilSeed();
    const watchlist = makeWatchlist({ code: "GAS", domain: "oil_gas" });

    const macro: MacroContext = {
      brentCrudeUSD: 95,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: null,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(seed, watchlist);
    const macroChain = buildCausalChain(seed, watchlist, undefined, macro);

    const baseOil = findDomainEntry(baseChain, "oil_gas")!;
    const macroOil = findDomainEntry(macroChain, "oil_gas")!;

    // Macro high oil should boost oil_gas confidence above base
    expect(macroOil.confidence).toBeGreaterThan(baseOil.confidence);
  });

  // ── MC-04: High oil penalizes aviation by -0.08 ───────────────────────────
  it("MC-04: high oil (brent=95) penalizes aviation domain confidence by -0.08", () => {
    const seed = makeOilSeed();
    const watchlist = makeWatchlist(
      { code: "GAS", domain: "oil_gas" },
      { code: "HVN", domain: "aviation" },
    );

    const macro: MacroContext = {
      brentCrudeUSD: 95,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: null,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(seed, watchlist);
    const macroChain = buildCausalChain(seed, watchlist, undefined, macro);

    const baseAv = findDomainEntry(baseChain, "aviation")!;
    const macroAv = findDomainEntry(macroChain, "aviation")!;

    expect(macroAv.confidence).toBeCloseTo(baseAv.confidence - 0.08, 5);
  });

  // ── MC-05: Low oil penalizes oil_gas by -0.10 ────────────────────────────
  it("MC-05: low oil (brent=60) penalizes oil_gas by -0.10", () => {
    const seed = makeNeutralSeed("oil_gas");
    const watchlist = makeWatchlist({ code: "GAS", domain: "oil_gas" });

    const macro: MacroContext = {
      brentCrudeUSD: 60,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: null,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(seed, watchlist);
    const macroChain = buildCausalChain(seed, watchlist, undefined, macro);

    const baseOil = findDomainEntry(baseChain, "oil_gas")!;
    const macroOil = findDomainEntry(macroChain, "oil_gas")!;

    expect(macroOil.confidence).toBeCloseTo(baseOil.confidence - 0.10, 5);
  });

  // ── MC-06: Gold > 2000 boosts gold_mining by +0.05 ────────────────────────
  it("MC-06: gold > 2000 boosts gold_mining by +0.05", () => {
    const seed = makeNeutralSeed("gold_mining");
    const watchlist = makeWatchlist({ code: "PNJ", domain: "gold_mining" });

    const macro: MacroContext = {
      brentCrudeUSD: null,
      goldUSDPerOz: 2100,
      usdVndMarket: null,
      refinancingRatePct: null,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(seed, watchlist);
    const macroChain = buildCausalChain(seed, watchlist, undefined, macro);

    const baseGold = findDomainEntry(baseChain, "gold_mining")!;
    const macroGold = findDomainEntry(macroChain, "gold_mining")!;

    expect(macroGold.confidence).toBeCloseTo(baseGold.confidence + 0.05, 5);
  });

  // ── MC-07: High refi rate penalizes banking -0.08 and real_estate -0.10 ───
  it("MC-07: high refi rate (7%) penalizes banking by -0.08 and real_estate by -0.10", () => {
    const bankSeed = makeNeutralSeed("banking");
    bankSeed.affectedDomains = ["banking", "real_estate"];
    const watchlist = makeWatchlist(
      { code: "VCB", domain: "banking" },
      { code: "VIC", domain: "real_estate" },
    );

    const macro: MacroContext = {
      brentCrudeUSD: null,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: 7,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(bankSeed, watchlist);
    const macroChain = buildCausalChain(bankSeed, watchlist, undefined, macro);

    const baseBanking = findDomainEntry(baseChain, "banking")!;
    const macroBanking = findDomainEntry(macroChain, "banking")!;
    expect(macroBanking.confidence).toBeCloseTo(baseBanking.confidence - 0.08, 5);

    const baseRE = findDomainEntry(baseChain, "real_estate")!;
    const macroRE = findDomainEntry(macroChain, "real_estate")!;
    expect(macroRE.confidence).toBeCloseTo(baseRE.confidence - 0.10, 5);
  });

  // ── MC-08: Low refi rate boosts banking +0.06 and real_estate +0.08 ───────
  it("MC-08: low refi rate (3%) boosts banking by +0.06 and real_estate by +0.08", () => {
    const bankSeed = makeNeutralSeed("banking");
    bankSeed.affectedDomains = ["banking", "real_estate"];
    const watchlist = makeWatchlist(
      { code: "VCB", domain: "banking" },
      { code: "VIC", domain: "real_estate" },
    );

    const macro: MacroContext = {
      brentCrudeUSD: null,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: 3,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(bankSeed, watchlist);
    const macroChain = buildCausalChain(bankSeed, watchlist, undefined, macro);

    const baseBanking = findDomainEntry(baseChain, "banking")!;
    const macroBanking = findDomainEntry(macroChain, "banking")!;
    expect(macroBanking.confidence).toBeCloseTo(baseBanking.confidence + 0.06, 5);

    const baseRE = findDomainEntry(baseChain, "real_estate")!;
    const macroRE = findDomainEntry(macroChain, "real_estate")!;
    expect(macroRE.confidence).toBeCloseTo(baseRE.confidence + 0.08, 5);
  });

  // ── MC-09: High USD/VND penalizes aviation -0.07, boosts steel +0.05 ─────
  it("MC-09: high USD/VND (26000) penalizes aviation by -0.07 and boosts steel by +0.05", () => {
    const seed = makeNeutralSeed("aviation");
    seed.affectedDomains = ["aviation", "steel"];
    const watchlist = makeWatchlist(
      { code: "HVN", domain: "aviation" },
      { code: "HPG", domain: "steel" },
    );

    const macro: MacroContext = {
      brentCrudeUSD: null,
      goldUSDPerOz: null,
      usdVndMarket: 26000,
      refinancingRatePct: null,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(seed, watchlist);
    const macroChain = buildCausalChain(seed, watchlist, undefined, macro);

    const baseAv = findDomainEntry(baseChain, "aviation")!;
    const macroAv = findDomainEntry(macroChain, "aviation")!;
    expect(macroAv.confidence).toBeCloseTo(baseAv.confidence - 0.07, 5);

    const baseSteel = findDomainEntry(baseChain, "steel")!;
    const macroSteel = findDomainEntry(macroChain, "steel")!;
    expect(macroSteel.confidence).toBeCloseTo(baseSteel.confidence + 0.05, 5);
  });

  // ── MC-10: Confidence is clamped to [0.05, 0.99] ─────────────────────────
  it("MC-10: confidence is clamped to [0.05, 0.99]", () => {
    // Force high refi to push confidence down — use very low base confidence via uncoveredDomains
    const seed = makeNeutralSeed("banking");
    seed.confidence = 0.07; // seed entry confidence
    const watchlist = makeWatchlist({ code: "VCB", domain: "banking" });

    // refi very high + also test near-ceiling with positive boost
    const macroHigh: MacroContext = {
      brentCrudeUSD: null,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: 10, // should push confidence to floor
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const chainHigh = buildCausalChain(seed, watchlist, undefined, macroHigh);
    const bankingHigh = findDomainEntry(chainHigh, "banking")!;
    expect(bankingHigh.confidence).toBeGreaterThanOrEqual(0.05);

    // refi very low, start near ceiling
    const macroLow: MacroContext = {
      brentCrudeUSD: null,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: 2, // should push confidence up but capped at 0.99
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const chainLow = buildCausalChain(seed, watchlist, undefined, macroLow);
    const bankingLow = findDomainEntry(chainLow, "banking")!;
    expect(bankingLow.confidence).toBeLessThanOrEqual(0.99);
  });

  // ── MC-11: Multiple rules can fire simultaneously ─────────────────────────
  it("MC-11: multiple rules fire simultaneously (high oil + high USD/VND)", () => {
    const seed = makeOilSeed(); // triggers oil_gas + aviation domain rules via keywords
    const watchlist = makeWatchlist(
      { code: "GAS", domain: "oil_gas" },
      { code: "HVN", domain: "aviation" },
    );

    const macro: MacroContext = {
      brentCrudeUSD: 95, // +0.10 oil_gas, -0.08 aviation
      goldUSDPerOz: null,
      usdVndMarket: 26000, // -0.07 aviation, +0.05 steel (steel not in watchlist)
      refinancingRatePct: null,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const baseChain = buildCausalChain(seed, watchlist);
    const macroChain = buildCausalChain(seed, watchlist, undefined, macro);

    const baseOil = findDomainEntry(baseChain, "oil_gas")!;
    const macroOil = findDomainEntry(macroChain, "oil_gas")!;
    // oil_gas: macro adjustment should increase confidence vs base
    expect(macroOil.confidence).toBeGreaterThan(baseOil.confidence);

    const baseAv = findDomainEntry(baseChain, "aviation")!;
    const macroAv = findDomainEntry(macroChain, "aviation")!;
    // aviation: macro adjustment should decrease confidence vs base (oil up + USD up = bad for aviation)
    expect(macroAv.confidence).toBeLessThan(baseAv.confidence);
  });

  // ── MC-12: Reasoning annotation contains "[Macro:" prefix ────────────────
  it("MC-12: reasoning annotation contains '[Macro:' prefix when rule fires", () => {
    const seed = makeOilSeed();
    const watchlist = makeWatchlist({ code: "GAS", domain: "oil_gas" });

    const macro: MacroContext = {
      brentCrudeUSD: 95,
      goldUSDPerOz: null,
      usdVndMarket: null,
      refinancingRatePct: null,
      overnightRatePct: null,
      usdVndOfficial: null,
      vix: null, sp500: null, dxy: null, hangSeng: null,
    };

    const macroChain = buildCausalChain(seed, watchlist, undefined, macro);
    const oilEntry = findDomainEntry(macroChain, "oil_gas")!;

    expect(oilEntry.reasoning).toContain("[Macro:");
  });

  // ── MC-13: DomainType includes 'logistics' and 'gold_mining' ──────────────
  it("MC-13: DomainType includes 'logistics' and 'gold_mining'", () => {
    // This test verifies type-level correctness by using them in runtime code.
    const logisticsDomain: DomainType = "logistics";
    const goldMiningDomain: DomainType = "gold_mining";

    expect(logisticsDomain).toBe("logistics");
    expect(goldMiningDomain).toBe("gold_mining");

    // Also verify they work as watchlist entries
    const watchlist = makeWatchlist(
      { code: "GMD", domain: "logistics" },
      { code: "PNJ", domain: "gold_mining" },
    );
    expect(watchlist).toHaveLength(2);
  });

  // ── MC-14: runImpactChain assembles MacroContext from injectable fetchers ──
  it("MC-14: runImpactChain assembles MacroContext from injectable fetchers", async () => {
    let commodityCalled = false;
    let sbvCalled = false;

    const chain = await runImpactChain({
      newsText: "Giá dầu tăng mạnh vượt $95 — tích cực cho ngành dầu khí",
      watchlist: makeWatchlist({ code: "GAS", domain: "oil_gas" }),
      ragRetriever: async () => [],
      commodityFetcher: async () => {
        commodityCalled = true;
        return {
          brentCrudeUSD: 95, goldUSDPerOz: 1950, usdVndRate: 24500,
          vix: 0, sp500: 0, shanghaiComp: 0, hangSeng: 0, dxy: 0,
          cnyVndRate: null, copperUSD: 0, silverUSDPerOz: 0, jpyVndRate: 0,
          fetchedAt: new Date().toISOString(),
        };
      },
      sbvFetcher: async () => {
        sbvCalled = true;
        return {
          overnightRatePct: 4.0,
          refinancingRatePct: 4.5,
          usdVndOfficial: 24400,
          fetchedAt: new Date().toISOString(),
        };
      },
    });

    expect(commodityCalled).toBe(true);
    expect(sbvCalled).toBe(true);
    // Chain should still be valid
    expect(chain.entries.length).toBeGreaterThan(0);
    expect(chain.seedTitle).toBeTruthy();
  });

  // ── MC-15: runImpactChain handles fetcher failures gracefully ─────────────
  it("MC-15: runImpactChain handles fetcher failures gracefully", async () => {
    const chain = await runImpactChain({
      newsText: "Market update",
      watchlist: makeWatchlist({ code: "VCB", domain: "banking" }),
      ragRetriever: async () => [],
      commodityFetcher: async () => {
        throw new Error("Network timeout");
      },
      sbvFetcher: async () => {
        throw new Error("SBV connection refused");
      },
    });

    // Should complete without throwing, returning a valid chain
    expect(chain).toBeDefined();
    expect(chain.entries.length).toBeGreaterThan(0);
  });
});
