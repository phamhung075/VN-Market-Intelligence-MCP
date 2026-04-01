/**
 * Task 162 — Market-wide pattern cascade to all watchlist stocks
 *
 * Tests for the broadcast pass in buildCausalChain:
 *   - AC-9: VN-Index / market-wide article cascades to ALL watchlist stocks
 *   - AC-10: Articles below broadcastMinImpact threshold do NOT broadcast
 *   - AC-11: Stocks already covered by SECTOR_RULES are NOT duplicated
 *
 * Also tests:
 *   - isMarketWide criteria (b): "thi truong chung khoan giam" variant
 *   - Empty watchlist: no crash
 *   - Default broadcastMinImpact of 6 when parameter omitted
 */

import { describe, it, expect } from "bun:test";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal AnalysisEntry for test use. */
function makeEntry(
  overrides: {
    title?: string;
    summary?: string;
    level?: AnalysisEntry["level"];
    sentiment?: AnalysisEntry["sentiment"];
    impactScore?: number;
    affectedDomains?: AnalysisEntry["affectedDomains"];
    affectedActions?: string[];
  } = {},
): AnalysisEntry {
  return {
    id: "test-entry",
    sourceTitle: overrides.title ?? "Test event",
    summary: overrides.summary ?? "Test summary",
    level: overrides.level ?? "country",
    sentiment: overrides.sentiment ?? "bearish",
    impactScore: overrides.impactScore ?? 8,
    impactDirection: "down",
    confidence: 0.8,
    timeHorizon: "short",
    reasoning: "test reasoning",
    sourceUrl: "https://example.com",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    affectedCountries: ["VN"],
    affectedDomains: overrides.affectedDomains ?? [],
    affectedActions: overrides.affectedActions ?? [],
    parentIds: [],
    tags: [],
  };
}

/** Four-stock watchlist covering different sectors. */
const WATCHLIST_4: WatchlistEntry[] = [
  { actionCode: "VNM", domain: "retail", exchange: "HOSE" },
  { actionCode: "FPT", domain: "tech", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "VEA", domain: "automotive", exchange: "HOSE" },
];

// ─────────────────────────────────────────────────────────────────────────────
// AC-9: VN-Index bearish article → all 4 watchlist stocks get broadcast entries
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 162 — Market-wide broadcast", () => {
  describe("AC-9: VN-Index article cascades to all watchlist stocks", () => {
    it("AC-9a: bearish vn-index article with impactScore 8 broadcasts to all 4 stocks", () => {
      const entry = makeEntry({
        title: "VN-Index giảm mạnh 5% trong phiên giao dịch",
        summary: "VN-Index lao dốc 5% sau thông tin Fed tăng lãi suất mạnh tay.",
        level: "country",
        sentiment: "bearish",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);
      const codes = chain.watchlistImpacts.map((w) => w.actionCode);

      // All 4 watchlist stocks must appear
      expect(codes).toContain("VNM");
      expect(codes).toContain("FPT");
      expect(codes).toContain("VCB");
      expect(codes).toContain("VEA");
    });

    it("AC-9a cont: all broadcast entries have impactDirection === 'down' for bearish", () => {
      const entry = makeEntry({
        title: "VN-Index giảm mạnh 5% trong phiên giao dịch",
        summary: "VN-Index lao dốc 5% sau thông tin Fed tăng lãi suất mạnh tay.",
        level: "country",
        sentiment: "bearish",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      // Find broadcast-only entries (those with reasoning starting with "market-wide cascade:")
      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );

      for (const impact of broadcastImpacts) {
        expect(impact.impactDirection).toBe("down");
      }
    });

    it("AC-9a cont: all broadcast entries have confidence <= 0.7", () => {
      const entry = makeEntry({
        title: "VN-Index giảm mạnh 5% trong phiên giao dịch",
        summary: "VN-Index lao dốc 5% sau thông tin Fed tăng lãi suất mạnh tay.",
        level: "country",
        sentiment: "bearish",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      expect(broadcastImpacts.length).toBeGreaterThan(0);

      for (const impact of broadcastImpacts) {
        expect(impact.confidence).toBeLessThanOrEqual(0.7);
      }
    });

    it("AC-9a cont: all broadcast entries reasoning starts with 'market-wide cascade:'", () => {
      const entry = makeEntry({
        title: "VN-Index giảm mạnh 5% trong phiên giao dịch",
        summary: "VN-Index lao dốc 5% sau thông tin Fed tăng lãi suất mạnh tay.",
        level: "country",
        sentiment: "bearish",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      // Stocks NOT covered by SECTOR_RULES for this article: VNM, VEA
      // (VCB and FPT may be covered by banking/tech rules if keywords match)
      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      expect(broadcastImpacts.length).toBeGreaterThan(0);

      for (const impact of broadcastImpacts) {
        expect(impact.reasoning).toMatch(/^market-wide cascade:/);
      }
    });

    it("AC-9b: bullish vn-index article → broadcast entries have impactDirection === 'up'", () => {
      const entry = makeEntry({
        title: "VN-Index tăng mạnh lên đỉnh lịch sử",
        summary: "VN-Index phục hồi mạnh, toàn thị trường chứng khoán tăng điểm rộng rãi.",
        level: "country",
        sentiment: "bullish",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      expect(broadcastImpacts.length).toBeGreaterThan(0);

      for (const impact of broadcastImpacts) {
        expect(impact.impactDirection).toBe("up");
      }
    });

    it("AC-9c: neutral vn-index article → broadcast entries have impactDirection === 'neutral'", () => {
      const entry = makeEntry({
        title: "VN-Index đứng giá trong phiên giao dịch ổn định",
        summary: "VN-Index giao dịch ổn định, thị trường chứng khoán ít biến động.",
        level: "country",
        sentiment: "neutral",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      expect(broadcastImpacts.length).toBeGreaterThan(0);

      for (const impact of broadcastImpacts) {
        expect(impact.impactDirection).toBe("neutral");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-10: Threshold enforcement
  // ─────────────────────────────────────────────────────────────────────────────

  describe("AC-10: Threshold — below broadcastMinImpact does NOT broadcast", () => {
    it("AC-10a: impactScore 5 with broadcastMinImpact 6 → zero broadcast entries", () => {
      const entry = makeEntry({
        title: "VN-Index điều chỉnh nhẹ",
        summary: "VN-Index giảm nhẹ trong phiên hôm nay.",
        level: "country",
        sentiment: "bearish",
        impactScore: 5,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      expect(broadcastImpacts.length).toBe(0);
    });

    it("AC-10b: impactScore exactly 6 with broadcastMinImpact 6 → broadcast fires", () => {
      const entry = makeEntry({
        title: "VN-Index giảm sâu hôm nay",
        summary: "VN-Index mất điểm trong phiên giao dịch, thị trường chứng khoán suy yếu.",
        level: "country",
        sentiment: "bearish",
        impactScore: 6,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      // At boundary (exactly 6), broadcast should fire
      expect(broadcastImpacts.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-11: No duplication — stocks already covered by SECTOR_RULES get ONE entry
  // ─────────────────────────────────────────────────────────────────────────────

  describe("AC-11: No duplication for stocks covered by SECTOR_RULES", () => {
    it("AC-11a: HPG with 'thép' keyword → HPG has exactly ONE watchlistImpact entry", () => {
      // "thep" triggers steel SECTOR_RULE for HPG
      const steelWatchlist: WatchlistEntry[] = [
        { actionCode: "HPG", domain: "steel", exchange: "HOSE" },
        { actionCode: "VNM", domain: "retail", exchange: "HOSE" },
      ];

      const entry = makeEntry({
        title: "Giá thép tăng mạnh nhờ nhu cầu xây dựng phục hồi, VN-Index tăng điểm",
        summary: "Giá thép tăng mạnh trong tháng này. VN-Index tăng điểm theo đà phục hồi của thị trường chứng khoán.",
        level: "country",
        sentiment: "bullish",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, steelWatchlist, [], null, [], 6);

      const hpgImpacts = chain.watchlistImpacts.filter((w) => w.actionCode === "HPG");
      expect(hpgImpacts.length).toBe(1);
    });

    it("AC-11b: all 4 stocks covered by SECTOR_RULES → zero broadcast entries added", () => {
      // Build a watchlist where all stocks would be covered by SECTOR_RULES:
      // Interest rate hike hits banking + real_estate
      const coveredWatchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "TCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "VHM", domain: "real_estate", exchange: "HOSE" },
        { actionCode: "VIC", domain: "real_estate", exchange: "HOSE" },
      ];

      const entry = makeEntry({
        title: "Fed tăng lãi suất mạnh, ảnh hưởng thị trường chứng khoán toàn cầu",
        summary:
          "Lãi suất tăng mạnh tay, thị trường chứng khoán toàn thị trường giảm điểm. VN-Index sụt giảm theo tâm lý chung.",
        level: "global",
        sentiment: "bearish",
        impactScore: 9,
      });

      const chain = buildCausalChain(entry, coveredWatchlist, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      // All stocks are covered by SECTOR_RULES — broadcast should add nothing
      expect(broadcastImpacts.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("Empty watchlist: broadcast with 0 stocks → no crash, zero entries", () => {
      const entry = makeEntry({
        title: "VN-Index sụt giảm mạnh",
        summary: "VN-Index giảm mạnh, thị trường chứng khoán rung lắc.",
        level: "country",
        sentiment: "bearish",
        impactScore: 8,
      });

      expect(() => {
        const chain = buildCausalChain(entry, [], [], null, [], 6);
        expect(chain.watchlistImpacts.length).toBe(0);
      }).not.toThrow();
    });

    it("Non-market-wide article (level 'domain', no vn-index) → no broadcast", () => {
      const entry = makeEntry({
        title: "Doanh nghiệp ngành dệt may gặp khó khăn",
        summary: "Ngành dệt may đối mặt với chi phí nguyên vật liệu tăng cao.",
        level: "domain",
        sentiment: "bearish",
        impactScore: 8,
        affectedDomains: ["other"],
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      expect(broadcastImpacts.length).toBe(0);
    });

    it("broadcastMinImpact omitted → defaults to 6, broadcast fires for impactScore 8", () => {
      const entry = makeEntry({
        title: "VN-Index giảm mạnh 5%",
        summary: "VN-Index lao dốc, toàn thị trường chứng khoán giảm điểm rộng rãi.",
        level: "country",
        sentiment: "bearish",
        impactScore: 8,
      });

      // Call WITHOUT the broadcastMinImpact parameter — should default to 6
      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, []);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      // With default threshold of 6 and impactScore 8, broadcast should fire
      expect(broadcastImpacts.length).toBeGreaterThan(0);
    });

    it("isMarketWide criteria (b): 'thi truong chung khoan giam' triggers broadcast", () => {
      // Level is "action" (NOT country/global) — but contains market-wide keywords
      const entry = makeEntry({
        title: "Thị trường chứng khoán giảm điểm phiên chiều",
        summary: "Thị trường chứng khoán giảm điểm trong phiên giao dịch chiều nay.",
        level: "action",
        sentiment: "bearish",
        impactScore: 8,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      // Contains "thi truong chung khoan" + "giam" → should be market-wide
      expect(broadcastImpacts.length).toBeGreaterThan(0);
    });

    it("isMarketWide criteria (b) with toàn thị trường keyword", () => {
      const entry = makeEntry({
        title: "Toàn thị trường đỏ lửa hôm nay",
        summary: "Toàn thị trường giảm sâu, áp lực bán tháo gia tăng.",
        level: "action",
        sentiment: "bearish",
        impactScore: 7,
      });

      const chain = buildCausalChain(entry, WATCHLIST_4, [], null, [], 6);

      const broadcastImpacts = chain.watchlistImpacts.filter((w) =>
        w.reasoning.startsWith("market-wide cascade:"),
      );
      // "toan thi truong" + "giam" → should be market-wide
      expect(broadcastImpacts.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // runImpactChain integration: mcp.config.json key
  // ─────────────────────────────────────────────────────────────────────────────

  describe("mcp.config.json: marketWideCascadeMinImpact key exists", () => {
    it("mcp.config.json contains alerts.marketWideCascadeMinImpact key", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const configPath = path.resolve(
        import.meta.dir,
        "../../mcp.config.json",
      );
      const raw = fs.readFileSync(configPath, "utf-8");
      const cfg = JSON.parse(raw);
      expect(cfg.alerts).toBeDefined();
      expect(typeof cfg.alerts.marketWideCascadeMinImpact).toBe("number");
      expect(cfg.alerts.marketWideCascadeMinImpact).toBe(6);
    });
  });
});
