/**
 * Task 1223 — VNDiamond index exclusion → BEARISH cascade rule (ETF forced selling)
 *
 * When a stock is excluded from VNDiamond index, passive ETFs tracking
 * that index are forced to sell the stock, creating downward price pressure.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(summary: string): AnalysisEntry {
  return {
    id: `test-1223-${Date.now()}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-14T00:00:00Z",
    summary,
    level: "country",
    sentiment: "bearish",
    impactScore: 7,
    impactDirection: "down",
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
  { actionCode: "GAS", domain: "oil_gas", exchange: "HOSE" },
];

describe("Task 1223 — VNDiamond exclusion → BEARISH cascade", () => {
  test("AC-1: 'bị loại khỏi VNDiamond' triggers securities domain BEARISH entry", () => {
    const seed = makeSeed(
      "Cổ phiếu XYZ bị loại khỏi VNDiamond, các quỹ ETF buộc phải bán ra"
    );
    const chain = buildCausalChain(seed, watchlist);
    const securitiesEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(securitiesEntry).toBeDefined();
    expect(securitiesEntry!.sentiment).toBe("bearish");
    expect(securitiesEntry!.confidence).toBeGreaterThanOrEqual(0.75);
  });

  test("AC-2: 'VNDiamond loại' triggers securities domain BEARISH entry", () => {
    const seed = makeSeed(
      "VNDiamond loại VNM ra khỏi rổ chỉ số, quỹ thụ động phải tái cơ cấu danh mục"
    );
    const chain = buildCausalChain(seed, watchlist);
    const securitiesEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(securitiesEntry).toBeDefined();
    expect(securitiesEntry!.sentiment).toBe("bearish");
  });

  test("AC-3: 'rổ VNDiamond' triggers securities domain entry", () => {
    const seed = makeSeed(
      "Thay đổi rổ VNDiamond quý 2/2026, cổ phiếu bị loại sẽ chịu áp lực bán ròng từ ETF"
    );
    const chain = buildCausalChain(seed, watchlist);
    const securitiesEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("securities")
    );
    expect(securitiesEntry).toBeDefined();
  });

  test("AC-4: matchedRules contains a securities_down entry from VNDiamond exclusion", () => {
    const seed = makeSeed(
      "Cổ phiếu bị loại khỏi VNDiamond sẽ chịu áp lực bán mạnh từ các quỹ ETF"
    );
    const chain = buildCausalChain(seed, watchlist);
    // matchedRules keys follow the pattern "${domain}_${direction}"
    const hasSecuritiesDown = chain.matchedRules.some((r) =>
      r.key === "securities_down" && r.sector === "securities"
    );
    expect(hasSecuritiesDown).toBe(true);
  });
});
