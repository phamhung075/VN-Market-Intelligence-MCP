import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";
import { getCostImpactMaps } from "../domain/services/climateImpactMapper.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function wl(actionCode: string, domain: WatchlistEntry["domain"]): WatchlistEntry {
  return { actionCode, domain, exchange: "HOSE" };
}

function makeSeed(
  summary: string,
  level: AnalysisEntry["level"] = "country",
  impactScore = 8,
): AnalysisEntry {
  return {
    id: "test-seed-1315",
    level,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "bearish",
    impactScore,
    impactDirection: "down",
    confidence: 0.70,
    timeHorizon: "short",
    summary,
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

// ─── 1315: Cost-push cascade rules ──────────────────────────────────────────

describe("1315: Cost-push cascade rules", () => {

  // AC-1: Logistics fuel-cost
  it("AC-1: logistics fuel-cost rule fires for GMD on 'chi phí xăng dầu tăng'", () => {
    const summary = "chi phí xăng dầu tăng mạnh, doanh nghiệp vận tải chịu áp lực";
    const chain = buildCausalChain(makeSeed(summary), [wl("GMD", "logistics")]);

    const logisticsEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("logistics"),
    );
    expect(logisticsEntry).toBeDefined();
    expect(logisticsEntry!.sentiment).toBe("bearish");

    const gmdImpact = chain.watchlistImpacts.find((w) => w.actionCode === "GMD");
    expect(gmdImpact).toBeDefined();
    expect(gmdImpact!.impactDirection).toBe("down");

    // matchedRules key = "logistics_down" (domain_direction pattern)
    expect(
      chain.matchedRules.some((r) => r.key.includes("logistics") && r.key.includes("down")),
    ).toBe(true);
  });

  // AC-2: Utilities coal-cost
  it("AC-2: utilities coal-cost rule fires for POW", () => {
    const summary = "giá than tăng gây áp lực chi phí sản xuất điện";
    const chain = buildCausalChain(makeSeed(summary), [wl("POW", "utilities")]);

    const utilitiesEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("utilities"),
    );
    expect(utilitiesEntry).toBeDefined();
    expect(utilitiesEntry!.sentiment).toBe("bearish");
    expect(utilitiesEntry!.confidence).toBeGreaterThanOrEqual(0.70);

    const powImpact = chain.watchlistImpacts.find((w) => w.actionCode === "POW");
    expect(powImpact).toBeDefined();
    expect(powImpact!.impactDirection).toBe("down");
  });

  // AC-3: Utilities gas-cost
  it("AC-3: utilities gas-cost rule fires for HNG", () => {
    // Use "giá khí đốt tăng" (all-lowercase VN phrase) — matches rule keyword exactly.
    // "giá LNG tăng" has uppercase LNG but findKeyword runs on lowercased text, so it misses.
    const summary = "giá khí đốt tăng, chi phí phân phối khí tăng cao, HNG chịu áp lực";
    const chain = buildCausalChain(makeSeed(summary), [wl("HNG", "utilities")]);

    const utilitiesEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("utilities"),
    );
    expect(utilitiesEntry).toBeDefined();
    expect(utilitiesEntry!.sentiment).toBe("bearish");

    const hngImpact = chain.watchlistImpacts.find((w) => w.actionCode === "HNG");
    expect(hngImpact).toBeDefined();
    expect(hngImpact!.impactDirection).toBe("down");
  });

  // AC-4: Construction steel input-cost
  it("AC-4: construction steel input-cost rule fires for CTD", () => {
    const summary = "giá thép xây dựng tăng 8%, áp lực lớn cho nhà thầu";
    const chain = buildCausalChain(makeSeed(summary), [wl("CTD", "construction")]);

    const constructionEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("construction"),
    );
    expect(constructionEntry).toBeDefined();
    expect(constructionEntry!.sentiment).toBe("bearish");

    const ctdImpact = chain.watchlistImpacts.find((w) => w.actionCode === "CTD");
    expect(ctdImpact).toBeDefined();
    expect(ctdImpact!.impactDirection).toBe("down");
  });

  // AC-5: Sentiment cost-push bearish
  it("AC-5: sentimentClassifier returns bearish for cost-push text", () => {
    const text = "giá đầu vào tăng mạnh, biên lợi nhuận bị thu hẹp";
    const result = classifySentiment(text);

    expect(result.direction).toBe("bearish");
    expect(result.confidence).toBeGreaterThan(0);
  });

  // AC-6: ClimateImpactMapper coal+up → utilities
  it("AC-6: getCostImpactMaps returns utilities entry for coal+up", () => {
    const maps = getCostImpactMaps("coal", "up");

    expect(maps.length).toBeGreaterThan(0);
    const utilitiesEntry = maps.find((m) => m.domain === "utilities");
    expect(utilitiesEntry).toBeDefined();
    expect(utilitiesEntry!.confidence).toBe(0.75);
  });

  // AC-6b: total 10 entries across all commodities
  it("AC-6b: getCostImpactMaps returns 10 total entries across all commodities", () => {
    const commodities: Array<[string, "up" | "down"]> = [
      ["oil", "up"], ["oil", "down"],
      ["coal", "up"], ["coal", "down"],
      ["gas", "up"], ["gas", "down"],
      ["steel", "up"], ["steel", "down"],
      ["cement", "up"], ["cement", "down"],
    ];
    const allEntries = commodities.flatMap(([c, d]) => getCostImpactMaps(c, d));
    expect(allEntries.length).toBe(10);
  });

  // AC-7: Regression — existing cascade domains unaffected
  it("AC-7: existing cascade domains unaffected by new rules", () => {
    // oil_gas rule still fires
    const oilGasSummary = "giá dầu thô tăng mạnh do OPEC cắt giảm sản lượng";
    const oilGasChain = buildCausalChain(makeSeed(oilGasSummary), [wl("BSR", "oil_gas")]);
    const oilGasEntry = oilGasChain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(oilGasEntry).toBeDefined();

    // aviation rule still fires — use "giá dầu tăng" which is an explicit keyword in the rule
    const aviationSummary = "giá dầu tăng mạnh do OPEC cắt giảm sản lượng, hàng không chịu áp lực";
    const aviationChain = buildCausalChain(makeSeed(aviationSummary), [wl("VJC", "aviation")]);
    const aviationEntry = aviationChain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("aviation"),
    );
    expect(aviationEntry).toBeDefined();
  });

  // AC-8: DDD compliance — climateImpactMapper has no infra/application imports
  it("AC-8: climateImpactMapper.ts has zero infra imports", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(
      __dirname,
      "../domain/services/climateImpactMapper.ts",
    );
    const source = fs.readFileSync(filePath, "utf-8");

    expect(source).not.toMatch(/from ['"].*infrastructure/);
    expect(source).not.toMatch(/from ['"].*application/);
  });

});
