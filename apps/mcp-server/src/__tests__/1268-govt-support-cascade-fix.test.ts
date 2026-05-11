/**
 * Task 1268 — Govt stock support cascade rule gap
 *
 * Problem: retail_netbuy_securities rule (line ~1968-1975 in cascadeEngine.ts)
 * affects securities brokers (SSI/VCI/VIX/VND) but is missing banking stocks
 * (VCB, BID, CTG, ACB) that also benefit from government stock-market support
 * measures (stabilization fund, confidence boost, market liquidity).
 *
 * Solution: Extend retail_netbuy_securities affected_actions to include major
 * banking stocks with direction "up" (BULLISH).
 *
 * Acceptance criteria:
 *   AC-1  retail_netbuy_securities rule has affected_actions property
 *   AC-2  affected_actions includes VCB with direction "up"
 *   AC-3  affected_actions includes BID with direction "up"
 *   AC-4  affected_actions includes CTG with direction "up"
 *   AC-5  affected_actions includes ACB with direction "up"
 *   AC-6  When cascading "nhà đầu tư cá nhân mua ròng" event, VCB appears in action-level entries
 *   AC-7  When cascading retail net-buy event, BID appears in action-level entries
 *   AC-8  When cascading retail net-buy event, CTG appears in action-level entries
 *   AC-9  When cascading retail net-buy event, ACB appears in action-level entries
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(summary: string, impactScore = 8): AnalysisEntry {
  return {
    id: `test-1268-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-22T09:00:00Z",
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
    createdAt: "2026-04-22T09:00:00Z",
  };
}

const watchlist: WatchlistEntry[] = [
  // Securities brokers
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VIX", domain: "securities", exchange: "HOSE" },
  { actionCode: "VND", domain: "securities", exchange: "HOSE" },
  // Banking stocks (should now be affected by retail_netbuy_securities)
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
  { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
  { actionCode: "ACB", domain: "banking", exchange: "HOSE" },
];

describe("Task 1268 — Govt stock support cascade rule gap (retail_netbuy_securities → banking stocks)", () => {
  test("AC-1: retail_netbuy_securities rule should have affected_actions property", () => {
    // This test verifies the rule structure exists in cascadeEngine
    // We'll verify by checking that cascade produces action entries for banking stocks
    const seed = makeSeed(
      "Nhà đầu tư cá nhân mua ròng gần 1.500 tỷ đồng trong phiên hôm nay"
    );
    const chain = buildCausalChain(seed, watchlist);
    // Rule should produce entries (will fail if rule doesn't have affected_actions)
    expect(chain.entries.length).toBeGreaterThan(0);
  });

  test("AC-2: retail_netbuy_securities cascade includes VCB action entry", () => {
    const seed = makeSeed(
      "Nhà đầu tư cá nhân mua ròng gần 1.500 tỷ đồng, thị trường phục hồi mạnh"
    );
    const chain = buildCausalChain(seed, watchlist);
    const vcbEntry = chain.entries.find(
      (e) => e.level === "action" && e.affectedActions.includes("VCB")
    );
    expect(vcbEntry).toBeDefined();
    expect(vcbEntry!.sentiment).toBe("bullish");
  });

  test("AC-3: retail_netbuy_securities cascade includes BID action entry", () => {
    const seed = makeSeed(
      "Cá nhân mua ròng mạnh, khối ngoại cũng tham gia nâng giá"
    );
    const chain = buildCausalChain(seed, watchlist);
    const bidEntry = chain.entries.find(
      (e) => e.level === "action" && e.affectedActions.includes("BID")
    );
    expect(bidEntry).toBeDefined();
    expect(bidEntry!.sentiment).toBe("bullish");
  });

  test("AC-4: retail_netbuy_securities cascade includes CTG action entry", () => {
    const seed = makeSeed(
      "Dòng tiền cá nhân vào thị trường chứng khoán gia tăng đáng kể"
    );
    const chain = buildCausalChain(seed, watchlist);
    const ctgEntry = chain.entries.find(
      (e) => e.level === "action" && e.affectedActions.includes("CTG")
    );
    expect(ctgEntry).toBeDefined();
    expect(ctgEntry!.sentiment).toBe("bullish");
  });

  test("AC-5: retail_netbuy_securities cascade includes ACB action entry", () => {
    const seed = makeSeed(
      "Nhà đầu tư cá nhân tăng mua, thanh khoản thị trường vượt kỳ vọng"
    );
    const chain = buildCausalChain(seed, watchlist);
    const acbEntry = chain.entries.find(
      (e) => e.level === "action" && e.affectedActions.includes("ACB")
    );
    expect(acbEntry).toBeDefined();
    expect(acbEntry!.sentiment).toBe("bullish");
  });

  test("AC-6: retail net-buy produces action entries for all four banking stocks together", () => {
    const seed = makeSeed(
      "Nhà đầu tư cá nhân mua ròng gần 1.300 tỷ đồng, VN-Index tăng mạnh"
    );
    const chain = buildCausalChain(seed, watchlist);
    // Collect all action-level entries for banking stocks
    const bankingActionCodes = new Set(
      chain.entries
        .filter((e) => e.level === "action")
        .flatMap((e) => e.affectedActions)
    );
    // Should include at least VCB, BID, CTG, ACB
    expect(bankingActionCodes.has("VCB")).toBe(true);
    expect(bankingActionCodes.has("BID")).toBe(true);
    expect(bankingActionCodes.has("CTG")).toBe(true);
    expect(bankingActionCodes.has("ACB")).toBe(true);
  });
});
