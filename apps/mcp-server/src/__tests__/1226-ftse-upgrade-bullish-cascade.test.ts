/**
 * Task 1226 — FTSE/index upgrade capital inflow → BULLISH cascade rule
 *
 * Vietnam FTSE upgrade from Frontier to Emerging Market status triggers
 * massive passive fund inflows, especially into banking and large-cap stocks.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(summary: string): AnalysisEntry {
  return {
    id: `test-1226-${Date.now()}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-14T00:00:00Z",
    summary,
    level: "country",
    sentiment: "bullish",
    impactScore: 9,
    impactDirection: "up",
    confidence: 0.9,
    timeHorizon: "medium",
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-14T00:00:00Z",
  };
}

const watchlist: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
];

describe("Task 1226 — FTSE upgrade → BULLISH cascade", () => {
  test("AC-1: 'FTSE nâng hạng' triggers banking domain BULLISH entry with confidence >= 0.82", () => {
    const seed = makeSeed(
      "FTSE nâng hạng Việt Nam từ Frontier lên Emerging Market, vốn ngoại sẽ đổ vào thị trường"
    );
    const chain = buildCausalChain(seed, watchlist);
    const bankingEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking")
    );
    expect(bankingEntry).toBeDefined();
    expect(bankingEntry!.sentiment).toBe("bullish");
    expect(bankingEntry!.confidence).toBeGreaterThanOrEqual(0.82);
  });

  test("AC-2: 'nâng hạng thị trường mới nổi' triggers securities domain BULLISH entry", () => {
    const seed = makeSeed(
      "Việt Nam được nâng hạng thị trường mới nổi, hàng tỷ USD vốn thụ động sẽ vào VN"
    );
    const chain = buildCausalChain(seed, watchlist);
    const securitiesEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(securitiesEntry).toBeDefined();
    expect(securitiesEntry!.sentiment).toBe("bullish");
  });

  test("AC-3: 'emerging market' triggers banking BULLISH entry", () => {
    const seed = makeSeed(
      "Vietnam emerging market upgrade by FTSE Russell to attract billions from passive funds"
    );
    const chain = buildCausalChain(seed, watchlist);
    const bankingEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking")
    );
    expect(bankingEntry).toBeDefined();
    expect(bankingEntry!.sentiment).toBe("bullish");
  });

  test("AC-4: 'FTSE Russell' triggers BULLISH entry", () => {
    const seed = makeSeed(
      "FTSE Russell announces Vietnam upgrade decision, capital inflows expected Q3 2026"
    );
    const chain = buildCausalChain(seed, watchlist);
    const bankingEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking")
    );
    expect(bankingEntry).toBeDefined();
    expect(bankingEntry!.sentiment).toBe("bullish");
  });

  test("AC-5: 'MSCI nâng hạng' triggers BULLISH banking entry", () => {
    const seed = makeSeed(
      "MSCI nâng hạng Việt Nam lên emerging market, dự kiến hút 3 tỷ USD"
    );
    const chain = buildCausalChain(seed, watchlist);
    const bankingEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking")
    );
    expect(bankingEntry).toBeDefined();
    expect(bankingEntry!.sentiment).toBe("bullish");
  });
});
