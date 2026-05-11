/**
 * Task 1229 — VNDiamond/VN30/ETF index rebalance → cascade rules (forced passive selling/buying)
 *
 * Broader than 1223: any index rebalance where a stock is removed triggers forced selling.
 * Stocks added to an index trigger forced buying (BULLISH).
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(summary: string, sentiment: "bearish" | "bullish" | "neutral" = "bearish"): AnalysisEntry {
  return {
    id: `test-1229-${Date.now()}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-14T00:00:00Z",
    summary,
    level: "country",
    sentiment,
    impactScore: 7,
    impactDirection: sentiment === "bullish" ? "up" : "down",
    confidence: 0.8,
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

describe("Task 1229 — ETF index rebalance cascade rules", () => {
  // ── BEARISH: removed stocks ──────────────────────────────────────────────

  test("AC-1: 'bị loại khỏi VN30' triggers securities domain BEARISH entry", () => {
    const seed = makeSeed(
      "Cổ phiếu ABC bị loại khỏi VN30, các quỹ chỉ số phải tái cơ cấu"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bearish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.72);
  });

  test("AC-2: 'ETF cơ cấu' triggers securities domain entry", () => {
    const seed = makeSeed(
      "ETF cơ cấu danh mục quý 2, loại bỏ một số cổ phiếu khỏi chỉ số"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
  });

  test("AC-3: 'cơ cấu lại rổ' triggers securities domain entry", () => {
    const seed = makeSeed(
      "Cơ cấu lại rổ chỉ số VN100, nhiều cổ phiếu bị loại bỏ"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
  });

  test("AC-4: 'rebalance' triggers securities domain BEARISH entry", () => {
    const seed = makeSeed(
      "Index rebalance Q2 2026: stocks removed from VN30 face forced selling pressure"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bearish");
  });

  // ── BULLISH: added stocks ──────────────────────────────────────────────

  test("AC-5: 'thêm vào chỉ số' triggers securities domain BULLISH entry", () => {
    const seed = makeSeed(
      "Cổ phiếu XYZ được thêm vào chỉ số VN30, quỹ ETF sẽ mua vào",
      "bullish"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
    expect(entry!.confidence).toBeGreaterThanOrEqual(0.72);
  });

  test("AC-6: 'được thêm vào rổ ETF' triggers BULLISH securities entry", () => {
    const seed = makeSeed(
      "Cổ phiếu HPG được thêm vào rổ ETF Diamond, quỹ ngoại mua ròng mạnh",
      "bullish"
    );
    const chain = buildCausalChain(seed, watchlist);
    const entry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(entry).toBeDefined();
    expect(entry!.sentiment).toBe("bullish");
  });
});
