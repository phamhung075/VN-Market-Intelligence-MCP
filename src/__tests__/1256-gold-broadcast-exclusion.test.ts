/**
 * Task 1256 — Gold price cascade must NOT broadcast to real_estate (PDR)
 *
 * Acceptance criteria:
 *   AC-1: Gold price article at global level with high impactScore does NOT
 *         produce a watchlistImpact for real_estate stocks (PDR) via market-wide
 *         broadcast when only gold_mining domain rules matched.
 *   AC-2: Gold price article still produces a watchlistImpact for gold_mining
 *         stocks (PNJ) via the domain rule path.
 *   AC-3: A genuine market-wide article ("VN-Index giảm mạnh toàn thị trường")
 *         still broadcasts to ALL watchlist stocks (including PDR).
 *   AC-4: Oil price article does NOT broadcast to real_estate via market-wide
 *         broadcast when only oil_gas domain rules matched.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";

// Minimal seed entry factory
function makeSeed(overrides: Partial<{
  title: string;
  summary: string;
  level: "global" | "country" | "action";
  sentiment: "bullish" | "bearish" | "neutral";
  impactScore: number;
}> = {}) {
  return {
    id: "test-seed",
    level: (overrides.level ?? "global") as "global" | "country" | "action",
    source: "reuters" as const,
    sentiment: (overrides.sentiment ?? "bearish") as "bullish" | "bearish" | "neutral",
    confidence: 0.8,
    affectedCountries: ["VN"],
    affectedSectors: [],
    affectedActions: [],
    matchedKeywords: [],
    relevanceScore: 8,
    summary: overrides.summary ?? "",
    title: overrides.title ?? "",
    sourceTitle: overrides.title ?? "",
    sourceUrl: "https://reuters.com/test",
    sourceType: "news" as const,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    impactScore: overrides.impactScore ?? 8,
    impactDirection: "down" as const,
    timeHorizon: "short" as const,
    reasoning: "",
    affectedDomains: [],
    parentIds: [],
    tags: [],
  };
}

const WATCHLIST: WatchlistEntry[] = [
  { actionCode: "PNJ", domain: "gold_mining" as const, exchange: "HOSE" },
  { actionCode: "PDR", domain: "real_estate" as const, exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking" as const, exchange: "HOSE" },
];

describe("Task 1256 — commodity broadcast exclusion", () => {
  // AC-1: Gold price article should NOT broadcast to PDR (real_estate)
  it("AC-1: gold price article does not produce watchlistImpact for PDR via broadcast", () => {
    const seed = makeSeed({
      title: "Giá vàng hồi về vùng 4.750 USD/oz, SPDR Gold Trust bán ròng mạnh",
      summary: "Gold price retraced to 4750 USD/oz. SPDR Gold Trust net sold heavily. giá vàng giảm về vùng hỗ trợ 4750 USD/oz sau tuần tăng mạnh.",
      level: "global",
      sentiment: "bearish",
      impactScore: 8,
    });

    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const pdrImpact = chain.watchlistImpacts.find((i) => i.actionCode === "PDR");

    // PDR should NOT appear in watchlistImpacts (no real_estate rule matched)
    // The market-wide broadcast should be excluded because only gold_mining rules fired
    expect(pdrImpact).toBeUndefined();
  });

  // AC-2: Gold price article still produces watchlistImpact for PNJ (gold_mining)
  it("AC-2: gold price article still impacts PNJ via gold_mining domain rule", () => {
    const seed = makeSeed({
      title: "Giá vàng hồi về vùng 4.750 USD/oz, SPDR Gold Trust bán ròng mạnh",
      summary: "giá vàng giảm. SPDR Gold Trust bán ròng mạnh.",
      level: "global",
      sentiment: "bearish",
      impactScore: 8,
    });

    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const pnjImpact = chain.watchlistImpacts.find((i) => i.actionCode === "PNJ");
    expect(pnjImpact).toBeDefined();
  });

  // AC-3: VN market-wide article still broadcasts to PDR
  it("AC-3: genuine market-wide article still broadcasts to PDR and VCB", () => {
    const seed = makeSeed({
      title: "VN-Index giảm mạnh, toàn thị trường chứng khoán rung lắc",
      summary: "VN-Index giảm 20 điểm xuống 1.250, toàn thị trường chứng khoán giảm mạnh, nhà đầu tư bán tháo.",
      level: "country",
      sentiment: "bearish",
      impactScore: 9,
    });

    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const pdrImpact = chain.watchlistImpacts.find((i) => i.actionCode === "PDR");
    const vcbImpact = chain.watchlistImpacts.find((i) => i.actionCode === "VCB");

    // Both should be impacted by a genuine market-wide event
    expect(pdrImpact).toBeDefined();
    expect(vcbImpact).toBeDefined();
  });

  // AC-4: Oil price article does NOT broadcast to real_estate
  it("AC-4: oil price article does not broadcast to PDR (real_estate) via market-wide", () => {
    const seed = makeSeed({
      title: "Crude oil down on demand concerns",
      summary: "crude oil down significantly. Oil price fall on global demand worries. giá dầu giảm mạnh.",
      level: "global",
      sentiment: "bearish",
      impactScore: 7,
    });

    const chain = buildCausalChain(seed, WATCHLIST, [], null, [], 6);

    const pdrImpact = chain.watchlistImpacts.find((i) => i.actionCode === "PDR");
    // PDR should NOT appear — oil/gas price drop is not relevant to real_estate
    expect(pdrImpact).toBeUndefined();
  });
});
