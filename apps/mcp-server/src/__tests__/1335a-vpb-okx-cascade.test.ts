/**
 * Task 1335a — VPBankS/OKX crypto partnership cascade rules (RED phase)
 *
 * Three gaps in SECTOR_RULES (REQ-1315):
 *   FR-1: VPBankS→VPB+TCB BULLISH via affected_actions (domain: banking)
 *   FR-2: crypto/lưu ký tài sản số → SSI/VCI/VIX/VND BULLISH (domain: securities)
 *   FR-3: banking domain NEUTRAL for crypto headlines (fires before generic banking BULLISH)
 *
 * These tests FAIL before 1335b inserts the three rules.
 *
 * NOTE: The cascade engine has a "market-wide cascade" fallback that produces BULLISH
 * action entries for every watchlist ticker. Tests must discriminate rule-based entries
 * (reasoning contains "[RuleAffected: <CODE>]") from market-wide cascade entries
 * (reasoning contains "market-wide cascade:"). FR-1 and FR-2 tests check for the
 * rule-based path specifically.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(
  summary: string,
  opts: { impactScore?: number; sentiment?: "bullish" | "bearish" | "neutral" } = {}
): AnalysisEntry {
  return {
    id: `test-1335-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceTitle: summary,
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-25T09:00:00Z",
    summary,
    level: "country",
    sentiment: opts.sentiment ?? "bullish",
    impactScore: opts.impactScore ?? 9,
    impactDirection: "up",
    confidence: 0.85,
    timeHorizon: "short",
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-25T09:00:00Z",
  };
}

/** Returns true if an action entry was produced by an affected_actions rule (not market-wide cascade) */
function isRuleAffectedEntry(entry: { reasoning?: string }): boolean {
  return typeof entry.reasoning === "string" && entry.reasoning.includes("[RuleAffected:");
}

// ─── TC-1 watchlist: includes VPB, TCB so affected_actions can resolve them ──
const watchlistTC1: WatchlistEntry[] = [
  { actionCode: "VPB", domain: "banking", exchange: "HOSE" },
  { actionCode: "TCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
];

// ─── TC-2 watchlist: banking-only, no securities ───────────────────────────
const watchlistTC2: WatchlistEntry[] = [
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
];

// ─── TC-3 watchlist: all four securities brokers ──────────────────────────
const watchlistTC3: WatchlistEntry[] = [
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VIX", domain: "securities", exchange: "HOSE" },
  { actionCode: "VND", domain: "securities", exchange: "HOSE" },
];

// ─── TC-4 watchlist: VPB only (direct ticker NER path) ───────────────────
const watchlistTC4: WatchlistEntry[] = [
  { actionCode: "VPB", domain: "banking", exchange: "HOSE" },
];

describe("Task 1335a — VPBankS/OKX crypto cascade rules", () => {

  // ── TC-1: FR-1 ────────────────────────────────────────────────────────────
  // FR-1 requires a SECTOR_RULE with keywords ["vpbanks", "vpbank securities", "okx"]
  // and affected_actions: [{ code: "VPB", direction: "up" }, { code: "TCB", direction: "up" }]
  // The entry must come from the [RuleAffected:] path, NOT from market-wide cascade.
  describe("TC-1: FR-1 — VPBankS/OKX article cascades VPB and TCB via rule affected_actions", () => {
    test("TC-1a: VPB gets a [RuleAffected] BULLISH entry from vpbanks+okx article", () => {
      const seed = makeSeed(
        "vpbanks chính thức tăng vốn lên 10.000 tỷ sau cú bắt tay với okx"
      );
      const chain = buildCausalChain(seed, watchlistTC1);

      // Must find an action entry for VPB that came from an affected_actions rule,
      // not from the market-wide cascade fallback
      const vpbRuleEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("VPB") &&
          isRuleAffectedEntry(e)
      );
      expect(vpbRuleEntry).toBeDefined();
      expect(vpbRuleEntry!.sentiment).toBe("bullish");
    });

    test("TC-1b: TCB gets a [RuleAffected] BULLISH entry from vpbanks+okx article", () => {
      const seed = makeSeed(
        "vpbanks chính thức tăng vốn lên 10.000 tỷ sau cú bắt tay với okx"
      );
      const chain = buildCausalChain(seed, watchlistTC1);

      const tcbRuleEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("TCB") &&
          isRuleAffectedEntry(e)
      );
      expect(tcbRuleEntry).toBeDefined();
      expect(tcbRuleEntry!.sentiment).toBe("bullish");
    });

    test("TC-1c: FR-1 fires for vpbank securities keyword variant", () => {
      const seed = makeSeed(
        "vpbank securities hợp tác okx tài sản số — vốn tăng mạnh"
      );
      const chain = buildCausalChain(seed, watchlistTC1);

      const vpbRuleEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("VPB") &&
          isRuleAffectedEntry(e)
      );
      expect(vpbRuleEntry).toBeDefined();
      expect(vpbRuleEntry!.sentiment).toBe("bullish");
    });
  });

  // ── TC-2: FR-3 ────────────────────────────────────────────────────────────
  // FR-3 requires a SECTOR_RULE with keywords ["okx", "lưu ký tài sản số", "crypto"]
  // and domain "banking" with sentiment "neutral" (overrides generic banking BULLISH).
  // The rule must produce a domain-level entry with sentiment "neutral" for banking.
  describe("TC-2: FR-3 — Generic banking domain is NEUTRAL (not BULLISH) for crypto article", () => {
    test("TC-2a: banking domain entry is neutral for okx/lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "okx hợp tác với công ty chứng khoán việt nam lưu ký tài sản số"
      );
      const chain = buildCausalChain(seed, watchlistTC2);

      const bankingDomainEntry = chain.entries.find(
        (e) => e.level === "domain" && e.affectedDomains.includes("banking")
      );
      // FR-3 must fire and produce a NEUTRAL banking domain entry
      expect(bankingDomainEntry).toBeDefined();
      expect(bankingDomainEntry!.sentiment).toBe("neutral");
    });

    test("TC-2b: VCB does not get a BULLISH entry from generic banking match on crypto article", () => {
      const seed = makeSeed(
        "okx hợp tác với công ty chứng khoán việt nam lưu ký tài sản số"
      );
      const chain = buildCausalChain(seed, watchlistTC2);

      const bullishVcbEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("VCB") &&
          e.sentiment === "bullish"
      );
      expect(bullishVcbEntry).toBeUndefined();
    });
  });

  // ── TC-3: FR-2 ────────────────────────────────────────────────────────────
  // FR-2 requires a SECTOR_RULE with keywords ["lưu ký tài sản số", "okx", "crypto custody"]
  // and domain "securities" with affected_actions: SSI, VCI, VIX, VND (direction: "up").
  // Entries must come from [RuleAffected:] path, not market-wide cascade.
  describe("TC-3: FR-2 — Securities brokers get [RuleAffected] BULLISH entries for crypto custody article", () => {
    test("TC-3a: SSI gets a [RuleAffected] BULLISH entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const ssiRuleEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("SSI") &&
          isRuleAffectedEntry(e)
      );
      expect(ssiRuleEntry).toBeDefined();
      expect(ssiRuleEntry!.sentiment).toBe("bullish");
    });

    test("TC-3b: VCI gets a [RuleAffected] BULLISH entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const vciRuleEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("VCI") &&
          isRuleAffectedEntry(e)
      );
      expect(vciRuleEntry).toBeDefined();
      expect(vciRuleEntry!.sentiment).toBe("bullish");
    });

    test("TC-3c: VIX gets a [RuleAffected] BULLISH entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const vixRuleEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("VIX") &&
          isRuleAffectedEntry(e)
      );
      expect(vixRuleEntry).toBeDefined();
      expect(vixRuleEntry!.sentiment).toBe("bullish");
    });

    test("TC-3d: VND gets a [RuleAffected] BULLISH entry from lưu ký tài sản số article", () => {
      const seed = makeSeed(
        "vpbanks hợp tác okx lưu ký tài sản số — cạnh tranh mới cho các công ty chứng khoán môi giới"
      );
      const chain = buildCausalChain(seed, watchlistTC3);

      const vndRuleEntry = chain.entries.find(
        (e) =>
          e.level === "action" &&
          e.affectedActions.includes("VND") &&
          isRuleAffectedEntry(e)
      );
      expect(vndRuleEntry).toBeDefined();
      expect(vndRuleEntry!.sentiment).toBe("bullish");
    });
  });

  // ── TC-4: NER fallback ────────────────────────────────────────────────────
  // This test should already PASS via the existing direct-ticker NER path.
  // "VPB" uppercase in summary triggers isDirectTickerMention regardless of FR-1 rule.
  describe("TC-4: Direct ticker NER — VPB fires without vpbanks keyword", () => {
    test("TC-4: VPB appears in action entries from direct VPB mention in summary", () => {
      const seed = makeSeed(
        "VPB công bố kế hoạch lưu ký tài sản kỹ thuật số cùng đối tác nước ngoài"
      );
      const chain = buildCausalChain(seed, watchlistTC4);

      // Direct ticker NER (isDirectTickerMention) catches "VPB" regardless of FR-1 rule
      const vpbEntry = chain.entries.find(
        (e) => e.level === "action" && e.affectedActions.includes("VPB")
      );
      expect(vpbEntry).toBeDefined();
    });
  });
});
