/**
 * Task 1348a — Cascade engine: 2 gap fixes (RED phase)
 *
 * Bug 1315 (Edit 1):
 *   FR-3 banking-NEUTRAL rule for crypto headlines is missing affected_actions.
 *   VCB, BID, EIB, HDB must get direction:"down" (bearish) — banks without
 *   digital-asset strategy lose to VPBankS/OKX competition.
 *
 * Bug 1314 (Edits 2+3):
 *   Brokerage-outlook / CEO-warning patterns missing from:
 *     - SECTOR_RULES (new entry before line ~2381)
 *     - ANALYST_WARNING_PATTERNS (isMarketWide helper, ~line 2469)
 *     - ANALYST_WARNING_PATTERNS_BROADCAST (~line 3228)
 *   NFD normalization required: Vietnamese diacritics decomposed before matching.
 *   Scenario: "Tổng Giám đốc DSC" type article triggers market-wide bearish broadcast.
 *
 * All tests in this file FAIL before 1348b applies the fixes.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry, AnalysisLevel } from "../domain/services/newsNormalizer.js";
import type { DomainType } from "../../bctc-schema.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSeed(
  summary: string,
  opts: {
    impactScore?: number;
    sentiment?: "bullish" | "bearish" | "neutral";
    impactDirection?: "up" | "down" | "neutral";
    level?: AnalysisLevel;
    affectedDomains?: DomainType[];
  } = {}
): AnalysisEntry {
  return {
    id: `test-1348-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news" as const,
    publishedAt: "2026-04-27T09:00:00Z",
    summary,
    level: opts.level ?? "country",
    sentiment: opts.sentiment ?? "bearish",
    impactScore: opts.impactScore ?? 4,
    impactDirection: opts.impactDirection ?? "down",
    confidence: 0.75,
    timeHorizon: "short" as const,
    reasoning: "test seed 1348a",
    affectedCountries: ["VN"],
    affectedDomains: opts.affectedDomains ?? ["securities"],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-27T09:00:00Z",
  };
}

// ─── Watchlists ───────────────────────────────────────────────────────────────

/** Bug 1315 watchlist: traditional banks without digital-asset strategy */
const WATCHLIST_BANKS: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
  { actionCode: "EIB", domain: "banking", exchange: "HOSE" },
  { actionCode: "HDB", domain: "banking", exchange: "HOSE" },
];

/** Bug 1314 watchlist: cross-sector for broadcast test */
const WATCHLIST_BROAD: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "VNM", domain: "retail", exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "HPG", domain: "steel", exchange: "HOSE" },
];

/** Bug 1314 VPBankS scenario watchlist */
const WATCHLIST_VPBANKS: WatchlistEntry[] = [
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VIX", domain: "securities", exchange: "HOSE" },
  { actionCode: "VND", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
];

// ─── Bug 1315 Tests (Edit 1 — FR-3 affected_actions) ─────────────────────────

/**
 * FR-3 fires when article has crypto/OKX keywords but NO vpbanks keyword.
 * Current state: FR-3 has no affected_actions — VCB/BID/EIB/HDB entries come only
 * from market-wide cascade fallback (reasoning: "market-wide cascade:").
 * Required state: FR-3 must carry affected_actions — entries must come from
 * [RuleAffected:] path with direction:"down" (competitive threat from VPBankS/OKX).
 */

/** Returns true when entry came from affected_actions rule path (not market-wide cascade). */
function isRuleAffectedEntry(entry: { reasoning?: string }): boolean {
  return typeof entry.reasoning === "string" && entry.reasoning.includes("[RuleAffected:");
}

describe("Bug 1315 — FR-3: banking NEUTRAL rule must include affected_actions for non-digital banks", () => {

  // Generic crypto/OKX article — no vpbanks keyword → hits FR-3 (not FR-1).
  // Seed is BULLISH to ensure market-wide cascade fallback also fires bullish —
  // only the [RuleAffected:] path with direction:"down" proves FR-3 affected_actions.
  const CRYPTO_ONLY_ARTICLE = makeSeed(
    "okx mở rộng dịch vụ lưu ký tài sản số tại thị trường việt nam, cạnh tranh tăng mạnh",
    { sentiment: "bullish", impactDirection: "up", impactScore: 8 }
  );

  test("TC-1a: VCB gets a [RuleAffected] direction:down entry from generic OKX/crypto article via FR-3 affected_actions", () => {
    const chain = buildCausalChain(CRYPTO_ONLY_ARTICLE, WATCHLIST_BANKS);

    // Must find an action entry for VCB that came from affected_actions (not market-wide cascade)
    const vcbRuleEntry = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("VCB") &&
        isRuleAffectedEntry(e)
    );
    // RED: currently FR-3 has no affected_actions → no [RuleAffected:VCB] entry
    expect(vcbRuleEntry).toBeDefined();
    expect(vcbRuleEntry!.sentiment).toBe("bearish");
  });

  test("TC-1b: BID gets a [RuleAffected] direction:down entry from generic OKX/crypto article via FR-3 affected_actions", () => {
    const chain = buildCausalChain(CRYPTO_ONLY_ARTICLE, WATCHLIST_BANKS);

    const bidRuleEntry = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("BID") &&
        isRuleAffectedEntry(e)
    );
    expect(bidRuleEntry).toBeDefined();
    expect(bidRuleEntry!.sentiment).toBe("bearish");
  });

  test("TC-1c: EIB gets a [RuleAffected] direction:down entry from generic OKX/crypto article via FR-3 affected_actions", () => {
    const chain = buildCausalChain(CRYPTO_ONLY_ARTICLE, WATCHLIST_BANKS);

    const eibRuleEntry = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("EIB") &&
        isRuleAffectedEntry(e)
    );
    expect(eibRuleEntry).toBeDefined();
    expect(eibRuleEntry!.sentiment).toBe("bearish");
  });

  test("TC-1d: HDB gets a [RuleAffected] direction:down entry from generic OKX/crypto article via FR-3 affected_actions", () => {
    const chain = buildCausalChain(CRYPTO_ONLY_ARTICLE, WATCHLIST_BANKS);

    const hdbRuleEntry = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("HDB") &&
        isRuleAffectedEntry(e)
    );
    expect(hdbRuleEntry).toBeDefined();
    expect(hdbRuleEntry!.sentiment).toBe("bearish");
  });

  test("TC-1e: FR-3 [RuleAffected] entry for VCB has sentiment bearish → watchlistImpact impactDirection:down", () => {
    const chain = buildCausalChain(CRYPTO_ONLY_ARTICLE, WATCHLIST_BANKS);

    // CausalChainEntry has no impactDirection field — check sentiment on the rule entry,
    // then confirm watchlistImpacts carries "down" (derived from sentiment in Step 5).
    const vcbRuleEntry = chain.entries.find(
      (e) =>
        e.level === "action" &&
        e.affectedActions.includes("VCB") &&
        isRuleAffectedEntry(e)
    );
    expect(vcbRuleEntry).toBeDefined();
    expect(vcbRuleEntry!.sentiment).toBe("bearish");

    // watchlistImpacts must contain a "down" entry for VCB derived from the bearish rule entry
    const vcbDownImpact = chain.watchlistImpacts.find(
      (w) => w.actionCode === "VCB" && w.impactDirection === "down"
    );
    expect(vcbDownImpact).toBeDefined();
  });
});

// ─── Bug 1314 Tests — Brokerage outlook / DSC CEO scenario ───────────────────

describe("Bug 1314 — Brokerage outlook: SECTOR_RULES entry + broadcast patterns", () => {

  /**
   * DSC CEO bearish warning about brokerage sector outlook.
   * impactScore=4 is below broadcastMinImpact=6 — must still broadcast via
   * ANALYST_WARNING_PATTERNS_BROADCAST (brokerage-outlook bypass).
   * Vietnamese text includes diacritics → NFD normalization required.
   * Note: article must NOT contain "vpbanks" to avoid FR-1 matching VCB as bullish.
   */
  const DSC_BROKERAGE_ARTICLE = makeSeed(
    "Tổng Giám đốc DSC: triển vọng ngành môi giới chứng khoán sẽ chịu áp lực cạnh tranh từ các công ty fintech nước ngoài",
    {
      sentiment: "bearish",
      impactDirection: "down",
      impactScore: 4,  // below broadcastMinImpact — tests bypass path
      level: "country",
      affectedDomains: ["securities"],
    }
  );

  /**
   * VPBankS competitive disruption article that mentions brokerage outlook.
   * Should trigger brokerage-outlook SECTOR_RULE entry → securities domain cascade.
   */
  const VPBANKS_BROKERAGE_ARTICLE = makeSeed(
    "VPBankS tăng vốn mạnh — triển vọng ngành môi giới chứng khoán và công ty chứng khoán truyền thống bị đe dọa",
    {
      sentiment: "bearish",
      impactDirection: "down",
      impactScore: 7,
      level: "country",
      affectedDomains: ["securities"],
    }
  );

  // ── Sub-group A: SECTOR_RULES brokerage-outlook entry ─────────────────────

  describe("TC-2a: SECTOR_RULES brokerage-outlook entry fires for relevant keywords", () => {

    test("TC-2a-i: brokerage-outlook article produces securities domain entry", () => {
      const chain = buildCausalChain(VPBANKS_BROKERAGE_ARTICLE, WATCHLIST_VPBANKS);

      const securitiesDomainEntry = chain.entries.find(
        (e) => e.level === "domain" && e.affectedDomains.includes("securities")
      );
      // RED: currently no brokerage-outlook SECTOR_RULE → no dedicated securities domain entry
      expect(securitiesDomainEntry).toBeDefined();
    });

    test("TC-2a-ii: VCI gets an action entry from brokerage-outlook article", () => {
      const chain = buildCausalChain(VPBANKS_BROKERAGE_ARTICLE, WATCHLIST_VPBANKS);

      const vciEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VCI")
      );
      expect(vciEntry).toBeDefined();
    });

    test("TC-2a-iii: BID/VCB does not spuriously trigger for brokerage-only article", () => {
      // brokerage-outlook rule should be scoped to securities domain — not banking
      const chain = buildCausalChain(VPBANKS_BROKERAGE_ARTICLE, WATCHLIST_VPBANKS);

      // Banking domain must not be triggered by brokerage keywords alone
      const bankingRuleEntry = chain.entries.find(
        (e) =>
          e.level === "domain" &&
          e.affectedDomains.includes("banking") &&
          typeof e.reasoning === "string" &&
          e.reasoning.includes("brokerage")
      );
      expect(bankingRuleEntry).toBeUndefined();
    });
  });

  // ── Sub-group B: ANALYST_WARNING_PATTERNS (isMarketWide) ──────────────────

  describe("TC-2b: ANALYST_WARNING_PATTERNS includes NFD brokerage-outlook patterns", () => {

    test("TC-2b-i: DSC CEO brokerage article with impactScore=4 still broadcasts (bypass gate)", () => {
      // broadcastMinImpact is typically 6 — score 4 must still broadcast via pattern bypass
      const chain = buildCausalChain(DSC_BROKERAGE_ARTICLE, WATCHLIST_BROAD);

      const broadcastCodes = chain.watchlistImpacts.map((w) => w.actionCode);
      // Must reach VNM and HPG (not just SSI from securities domain)
      // RED: currently broadcast gate blocks impactScore=4
      expect(broadcastCodes).toContain("VNM");
      expect(broadcastCodes).toContain("HPG");
    });

    test("TC-2b-ii: broadcast entries from DSC brokerage warning carry BEARISH sentiment", () => {
      const chain = buildCausalChain(DSC_BROKERAGE_ARTICLE, WATCHLIST_BROAD);

      const vcbImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VCB");
      expect(vcbImpact).toBeDefined();
      expect(vcbImpact!.impactDirection).toBe("down");
    });
  });

  // ── Sub-group C: ANALYST_WARNING_PATTERNS_BROADCAST (broadcast section) ───

  describe("TC-2c: ANALYST_WARNING_PATTERNS_BROADCAST in sync with ANALYST_WARNING_PATTERNS", () => {

    test("TC-2c-i: brokerage-outlook article with impactScore=4 triggers watchlist broadcast", () => {
      const chain = buildCausalChain(DSC_BROKERAGE_ARTICLE, WATCHLIST_BROAD);

      // market-wide broadcast must fire for a below-threshold brokerage warning
      expect(chain.watchlistImpacts.length).toBeGreaterThan(0);
    });

    test("TC-2c-ii: broadcast coverage includes cross-sector tickers (non-securities)", () => {
      const chain = buildCausalChain(DSC_BROKERAGE_ARTICLE, WATCHLIST_BROAD);

      // HPG (steel) is in watchlist but not in securities domain —
      // broadcast must reach it via market-wide cascade
      const hpgImpact = chain.watchlistImpacts.find((w) => w.actionCode === "HPG");
      expect(hpgImpact).toBeDefined();
    });
  });

  // ── Sub-group D: NFD normalization correctness ────────────────────────────

  describe("TC-2d: NFD normalization strips Vietnamese diacritics before pattern matching", () => {

    test("TC-2d-i: article with full diacritics matches brokerage pattern after NFD strip", () => {
      // "triển vọng ngành môi giới" with full diacritics must match after NFD decomposition
      const withDiacritics = makeSeed(
        "triển vọng ngành môi giới chứng khoán sẽ chịu áp lực cạnh tranh",
        { sentiment: "bearish", impactDirection: "down", impactScore: 4, level: "country" }
      );
      const chain = buildCausalChain(withDiacritics, WATCHLIST_BROAD);

      // Pattern must fire and produce at least a watchlistImpact entry
      // RED: without NFD pattern, diacritics prevent match
      expect(chain.watchlistImpacts.length).toBeGreaterThan(0);
    });

    test("TC-2d-ii: article with NFD-decomposed text (pre-stripped) also matches", () => {
      // Simulate source that already strips diacritics — pattern still matches
      const stripped = makeSeed(
        "trien vong nganh moi gioi chung khoan chiu ap luc canh tranh",
        { sentiment: "bearish", impactDirection: "down", impactScore: 4, level: "country" }
      );
      const chain = buildCausalChain(stripped, WATCHLIST_BROAD);

      // Should match — NFD-stripped pattern vs NFD-stripped text
      expect(chain.watchlistImpacts.length).toBeGreaterThan(0);
    });
  });
});
