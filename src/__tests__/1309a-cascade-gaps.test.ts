/**
 * 1309a — Cascade Rule Gaps: Hormuz / Govt-Support / Agriculture-Broadcast / Taiwan
 *
 * TDD RED phase — all 4 gaps must fail before implementation.
 * GREEN when SECTOR_RULES covers all 4 cases.
 *
 * Gap 1 (report 1264): Hormuz blockade → oil_gas BULLISH (BSR) + aviation BEARISH (VJC)
 *   These rules ALREADY exist in Task 1246 block. This test validates they fire correctly
 *   and that BSR appears in affected_actions.
 *
 * Gap 2 (report 1268): "Government stock market support measures" → securities BULLISH
 *   (SSI/VCI/VIX) + banking BULLISH (BID/VCB).
 *   Rule block exists for "stabilization fund" / "quỹ bình ổn" but "hỗ trợ thị trường"
 *   phrase variant may miss. Verify + add "government stock market support" keyword.
 *
 * Gap 3 (report 1286): Agriculture/coffee/rice export decline → must NOT broadcast
 *   to real_estate (HUT) via market-wide path. Commodity-source exclusion must cover
 *   agriculture the same way it covers gold_mining + oil_gas.
 *
 * Gap 4 (Taiwan): Taiwan de-escalation → tech BULLISH + securities BULLISH.
 *   Rules from 1303i exist; this is a regression guard.
 */

import { describe, it, expect } from "bun:test";
import { runImpactChain } from "../application/usecases/runImpactChain.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

function wl(actionCode: string, domain: WatchlistEntry["domain"]): WatchlistEntry {
  return { actionCode, domain, exchange: "HOSE" };
}

/** Build a minimal AnalysisEntry for buildCausalChain tests (no I/O). */
function makeSeed(
  title: string,
  summary: string,
  level: AnalysisEntry["level"] = "country",
  impactScore = 8,
): AnalysisEntry {
  return {
    id: "test-seed",
    level,
    sourceTitle: title,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "bearish",
    impactScore,
    impactDirection: "down",
    confidence: 0.70,
    timeHorizon: "short",
    summary: `${title}. ${summary}`,
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap 1: Hormuz blockade → oil_gas BULLISH + aviation BEARISH
// Rules exist since Task 1246. This verifies BSR is in affected_actions.
// ─────────────────────────────────────────────────────────────────────────────

describe("1309a — Gap 1: Hormuz blockade cascade fires correctly", () => {
  it("hormuz strait blockade → oil_gas domain entry is bullish", async () => {
    const text = "Hormuz strait blockade — Iran closes strait, oil supply shock expected";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("BSR", "oil_gas"), wl("VJC", "aviation")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const oilEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(oilEntry).toBeDefined();
    expect(oilEntry!.sentiment).toBe("bullish");
  });

  it("hormuz strait blockade → aviation domain entry is bearish", async () => {
    const text = "Hormuz strait blockade — Iran closes strait, oil supply shock expected";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("BSR", "oil_gas"), wl("VJC", "aviation")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const aviationEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("aviation"),
    );
    expect(aviationEntry).toBeDefined();
    expect(aviationEntry!.sentiment).toBe("bearish");
  });

  it("hormuz strait blockade → BSR appears in matched watchlist impacts (oil_gas BULLISH)", async () => {
    const text = "Hormuz strait blockade — Iran closes strait, oil supply shock expected";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("BSR", "oil_gas"), wl("VJC", "aviation")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const bsrImpact = chain.watchlistImpacts.find(
      (i) => i.actionCode === "BSR" && i.impactDirection === "up",
    );
    expect(bsrImpact).toBeDefined();
  });

  it("hormuz strait blockade → VJC appears in matched watchlist impacts (aviation BEARISH)", async () => {
    const text = "Hormuz strait blockade — Iran closes strait, oil supply shock expected";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("BSR", "oil_gas"), wl("VJC", "aviation")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const vjcImpact = chain.watchlistImpacts.find(
      (i) => i.actionCode === "VJC" && i.impactDirection === "down",
    );
    expect(vjcImpact).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 2: Govt market support → securities + banking BULLISH
// New keyword "government stock market support" must trigger the rule.
// ─────────────────────────────────────────────────────────────────────────────

describe("1309a — Gap 2: Government market support → securities + banking BULLISH", () => {
  it("'government stock market support measures' → securities domain BULLISH", async () => {
    const text =
      "Government stock market support measures announced — ministry pledges stabilization fund for VN-market";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("SSI", "securities"), wl("VCI", "securities"), wl("BID", "banking")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const secEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities"),
    );
    expect(secEntry).toBeDefined();
    expect(secEntry!.sentiment).toBe("bullish");
  });

  it("'government stock market support measures' → banking domain BULLISH", async () => {
    const text =
      "Government stock market support measures announced — ministry pledges stabilization fund for VN-market";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("SSI", "securities"), wl("VCI", "securities"), wl("BID", "banking")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const bankEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking"),
    );
    expect(bankEntry).toBeDefined();
    expect(bankEntry!.sentiment).toBe("bullish");
  });

  it("'hỗ trợ thị trường chứng khoán' → securities domain BULLISH (VI keyword)", async () => {
    const text =
      "Bộ Tài chính công bố gói hỗ trợ thị trường chứng khoán — các biện pháp kích cầu mạnh mẽ";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("SSI", "securities"), wl("VCB", "banking")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const secEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities"),
    );
    expect(secEntry).toBeDefined();
    expect(secEntry!.sentiment).toBe("bullish");
  });

  it("SSI gets bullish watchlist impact from govt support", async () => {
    const text =
      "Government stock market support measures — stabilization fund activated for securities sector";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("SSI", "securities"), wl("VCI", "securities"), wl("VND", "securities")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const ssiImpact = chain.watchlistImpacts.find(
      (i) => i.actionCode === "SSI" && i.impactDirection === "up",
    );
    expect(ssiImpact).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 3: Agriculture commodity article → must NOT broadcast to real_estate
// Coffee/rice export decline is a commodity-sector article.
// Market-wide broadcast should be suppressed for unrelated sectors (HUT / real_estate).
// ─────────────────────────────────────────────────────────────────────────────

describe("1309a — Gap 3: Agriculture broadcast exclusion (no spill to real_estate)", () => {
  it("coffee export decline → agriculture domain fires", () => {
    const seed = makeSeed(
      "Coffee and rice export decline",
      "Coffee export revenues decline sharply — Vietnam agriculture exports drop 15% in Q1 as global commodity prices fall.",
    );

    const watchlist: WatchlistEntry[] = [
      wl("GVR", "agriculture"),
      wl("HUT", "real_estate"),
    ];

    const chain = buildCausalChain(seed, watchlist);

    const agriEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("agriculture"),
    );
    expect(agriEntry).toBeDefined();
  });

  it("coffee export decline → real_estate (HUT) must NOT appear as broadcast action entry", () => {
    const seed = makeSeed(
      "Coffee and rice export decline",
      "Coffee export revenues decline sharply — Vietnam agriculture exports drop 15% in Q1 as global commodity prices fall.",
    );

    const watchlist: WatchlistEntry[] = [
      wl("GVR", "agriculture"),
      wl("HUT", "real_estate"),
    ];

    const chain = buildCausalChain(seed, watchlist);

    // HUT must NOT appear via broadcast — agriculture is commodity-source, no real_estate spill
    const hutBroadcast = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("HUT") &&
        e.reasoning.includes("toàn thị trường"),
    );
    expect(hutBroadcast).toBeUndefined();
  });

  it("rice export decline article → no real_estate watchlist impact", () => {
    const seed = makeSeed(
      "Rice export revenues decline",
      "Xuất khẩu gạo giảm 12% trong quý đầu năm. Ngành nông nghiệp chịu áp lực từ cạnh tranh giá quốc tế.",
    );

    const watchlist: WatchlistEntry[] = [
      wl("VNM", "agriculture"),
      wl("HUT", "real_estate"),
      wl("NVL", "real_estate"),
    ];

    const chain = buildCausalChain(seed, watchlist);

    // real_estate watchlist impacts must be empty (agriculture ≠ systemic → no broadcast to RE)
    const realEstateImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "HUT" || i.actionCode === "NVL",
    );
    expect(realEstateImpacts.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 4: Taiwan — regression guard (rules from 1303i must still fire)
// ─────────────────────────────────────────────────────────────────────────────

describe("1309a — Gap 4: Taiwan rules regression guard", () => {
  it("taiwan strait escalation → tech domain bearish (regression)", async () => {
    const text =
      "Taiwan strait military exercises escalate — china taiwan blockade fears, TSMC warns supply disruption";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("FPT", "tech")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const techEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("tech") && e.sentiment === "bearish",
    );
    expect(techEntry).toBeDefined();
  });

  it("taiwan de-escalation → tech domain bullish (regression)", async () => {
    const text =
      "Cross-strait dialogue resumes — taiwan peace talks bring relief, hạ nhiệt eo biển đài loan";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("FPT", "tech")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const techEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("tech") && e.sentiment === "bullish",
    );
    expect(techEntry).toBeDefined();
  });

  it("taiwan de-escalation → securities domain bullish (regression)", async () => {
    const text =
      "Taiwan peace talks — cross-strait dialogue resumes, semiconductor supply chain relief";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("SSI", "securities")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const secEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities") && e.sentiment === "bullish",
    );
    expect(secEntry).toBeDefined();
  });

  it("taiwan escalation matchedRules contains tech sector (regression)", async () => {
    const text =
      "Taiwan strait blockade escalation — tsmc disruption, semiconductor crisis deepens";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("FPT", "tech")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const techRule = chain.matchedRules.find((r) => r.sector === "tech");
    expect(techRule).toBeDefined();
  });
});
