/**
 * Task 1237 — FTSE inflow article misclassified NEUTRAL — should be BULLISH (passive fund catalyst)
 *
 * Articles about capital inflows from passive funds following index events
 * must trigger BULLISH cascade, not NEUTRAL.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(summary: string, sentiment: "bearish" | "bullish" | "neutral" = "neutral"): AnalysisEntry {
  return {
    id: `test-1237-${Date.now()}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-14T00:00:00Z",
    summary,
    level: "country",
    sentiment,
    impactScore: 7,
    impactDirection: sentiment === "bearish" ? "down" : sentiment === "bullish" ? "up" : "neutral",
    confidence: 0.7,
    timeHorizon: "short",
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
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
];

describe("Task 1237 — ETF/passive fund inflow articles → BULLISH cascade", () => {
  test("AC-1: 'dòng vốn ETF' with neutral seed → securities domain BULLISH entry", () => {
    const seed = makeSeed(
      "Dòng vốn ETF đổ mạnh vào thị trường Việt Nam trong tuần qua, VN-Index tăng"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  test("AC-2: 'quỹ ETF đổ vào' triggers BULLISH securities entry", () => {
    const seed = makeSeed(
      "Các quỹ ETF đổ vào Việt Nam hơn 500 triệu USD sau thông tin nâng hạng",
      "neutral"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  test("AC-3: 'passive fund inflow' triggers BULLISH securities entry", () => {
    const seed = makeSeed(
      "Passive fund inflow into Vietnam accelerates as FTSE upgrade timeline becomes clearer"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  test("AC-4: 'fund flow vào VN' triggers BULLISH securities entry", () => {
    const seed = makeSeed(
      "Fund flow vào VN tăng mạnh, khối ngoại mua ròng liên tiếp 5 phiên"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });

  test("AC-5: confidence >= 0.75 for ETF inflow cascade", () => {
    const seed = makeSeed(
      "Dòng vốn ETF vào Việt Nam đạt kỷ lục, thị trường chứng khoán hưởng lợi"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.72);
  });
});
