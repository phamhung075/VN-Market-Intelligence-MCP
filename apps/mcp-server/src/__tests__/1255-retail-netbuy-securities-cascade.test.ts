/**
 * Task 1255 — "mua ròng" + retail investor → securities sector BULLISH cascade
 *
 * Bug report 1261 (unified-agent, 2026-04-14): article
 * "Nhà đầu tư cá nhân mua ròng gần 1.300 tỷ đồng" classified bullish
 * impact 9 but no alert generated for securities sector (SSI/VCI/VIX/VND).
 *
 * Retail net-buying at scale (>1,000 tỷ VND) is a direct revenue signal for
 * brokerages — higher retail activity = higher commission income.
 *
 * Acceptance criteria:
 *   AC-1  "nhà đầu tư cá nhân mua ròng" → securities BULLISH domain entry
 *   AC-2  "cá nhân mua ròng" alone is sufficient to trigger the cascade
 *   AC-3  "thanh khoản thị trường tăng" also triggers securities BULLISH
 *   AC-4  The article text that triggered bug-1261 produces a securities entry
 *   AC-5  Securities entries reference known broker tickers (SSI/VCI/VIX/VND)
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(summary: string, impactScore = 8): AnalysisEntry {
  return {
    id: `test-1255-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-14T19:09:00Z",
    summary,
    level: "country",
    sentiment: "bullish",
    impactScore,
    impactDirection: "up",
    confidence: 0.8,
    timeHorizon: "short",
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-14T19:09:00Z",
  };
}

const watchlist: WatchlistEntry[] = [
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VIX", domain: "securities", exchange: "HOSE" },
  { actionCode: "VND", domain: "securities", exchange: "HOSE" },
  { actionCode: "HCM", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
];

describe("Task 1255 — retail net-buy → securities BULLISH cascade", () => {
  test("AC-1: 'nhà đầu tư cá nhân mua ròng' triggers securities BULLISH domain entry", () => {
    const seed = makeSeed(
      "Nhà đầu tư cá nhân mua ròng gần 1.300 tỷ đồng trong phiên hôm nay"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  test("AC-2: 'cá nhân mua ròng' alone triggers securities BULLISH entry", () => {
    const seed = makeSeed(
      "Khối cá nhân mua ròng mạnh nhất trong 3 tháng qua với giá trị hơn 800 tỷ đồng"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  test("AC-3: 'thanh khoản thị trường tăng' triggers securities BULLISH entry", () => {
    const seed = makeSeed(
      "Thanh khoản thị trường tăng vọt lên 25.000 tỷ đồng trong phiên — kỷ lục năm 2026"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  test("AC-4: exact bug-1261 article text produces securities domain entry", () => {
    // Simulates the article that triggered bug 1261 (19:09 UTC 2026-04-14)
    const seed = makeSeed(
      "Nhà đầu tư cá nhân mua ròng gần 1.300 tỷ đồng, dẫn dắt đà tăng VN-Index phiên chiều",
      9
    );
    const chain = buildCausalChain(seed, watchlist);
    const securitiesEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(securitiesEntry).toBeDefined();
    expect(securitiesEntry!.sentiment).toBe("bullish");
    // Confidence should be meaningful (>0.5)
    expect(securitiesEntry!.confidence).toBeGreaterThan(0.5);
  });

  test("AC-5: securities cascade includes broker tickers from watchlist (SSI/VCI/VND)", () => {
    const seed = makeSeed(
      "Nhà đầu tư cá nhân mua ròng gần 1.300 tỷ đồng phiên hôm nay, SSI và VCI tăng mạnh"
    );
    const chain = buildCausalChain(seed, watchlist);
    // Action-level entries for securities should include at least one broker ticker
    const actionEntries = chain.entries.filter(
      (e) => e.level === "action" && (
        e.affectedActions.includes("SSI") ||
        e.affectedActions.includes("VCI") ||
        e.affectedActions.includes("VIX") ||
        e.affectedActions.includes("VND")
      )
    );
    expect(actionEntries.length).toBeGreaterThan(0);
  });
});
