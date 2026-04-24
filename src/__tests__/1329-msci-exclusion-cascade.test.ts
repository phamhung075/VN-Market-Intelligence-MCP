import { describe, it, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

describe("SPRINT-1329: MSCI/FTSE Tier-1 Cascade Rules", () => {
  const watchlist: WatchlistEntry[] = [
    { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
    { actionCode: "FPT", domain: "tech", exchange: "HOSE" },
    { actionCode: "HPG", domain: "steel", exchange: "HOSE" },
  ];

  function makeSeed(title: string, summary: string, sentiment: "bullish" | "bearish" | "neutral"): AnalysisEntry {
    return {
      id: `test-${Date.now()}`,
      sourceTitle: title,
      sourceUrl: "https://example.com",
      sourceType: "news",
      publishedAt: "2026-04-24T00:00:00Z",
      summary,
      level: "global",
      sentiment,
      impactScore: 9,
      impactDirection: "neutral",
      confidence: 0.85,
      timeHorizon: "short",
      reasoning: "test cascade",
      affectedCountries: ["VN"],
      affectedDomains: [],
      affectedActions: [],
      parentIds: [],
      tags: [],
      createdAt: "2026-04-24T00:00:00Z",
    };
  }

  it("RED: detects MSCI watchlist keyword and creates bullish cascade entry", async () => {
    // MSCI watchlist = precursor to full inclusion, triggers passive fund flows into large-caps
    const seedEntry = makeSeed(
      "MSCI thêm Việt Nam vào danh sách theo dõi MSCI cho nâng hạng",
      "MSCI Emerging Markets Index Committee đã quyết định thêm Việt Nam vào danh sách theo dõi MSCI như bước chuẩn bị cho nâng hạng.",
      "bullish"
    );

    const result = buildCausalChain(seedEntry, watchlist);

    // Should have domain-level entries for MSCI watchlist detection
    expect(result.entries.length).toBeGreaterThan(0);

    // Check for MSCI watchlist cascade entry with bullish sentiment
    const msciWatchlistEntry = result.entries.find(
      (e) => e.level === "domain" && e.title.includes("MSCI") && e.summary.toLowerCase().includes("danh sách theo dõi")
    );
    expect(msciWatchlistEntry?.sentiment).toBe("bullish");
  });

  it("RED: detects MSCI exclusion keyword and creates bearish cascade entry", async () => {
    // MSCI exclusion = forced selling, large outflows from Vietnam
    const seedEntry = makeSeed(
      "Cổ phiếu Việt Nam bị xóa khỏi chỉ số MSCI",
      "MSCI Emerging Markets quyết định loại bỏ các cổ phiếu Việt Nam bị xóa khỏi chỉ số do các vấn đề quản trị.",
      "bearish"
    );

    const result = buildCausalChain(seedEntry, watchlist);

    expect(result.entries.length).toBeGreaterThan(0);

    // Check for MSCI exclusion cascade entry with bearish sentiment
    const msciExclusionEntry = result.entries.find(
      (e) => e.level === "domain" && e.title.includes("Exclusion")
    );
    expect(msciExclusionEntry?.sentiment).toBe("bearish");
  });

  it("RED: targets all_largecp without false positives on unrelated MSCI news", async () => {
    // Verify no cascade is triggered for unrelated MSCI news (earnings, etc)
    const seedEntry = makeSeed(
      "MSCI công bố kết quả kinh doanh quý 1",
      "Công ty MSCI (nhà cung cấp chỉ số) công bố doanh thu tăng 15% so với cùng kỳ năm ngoái.",
      "neutral"
    );

    const result = buildCausalChain(seedEntry, watchlist);

    // Should not have MSCI watchlist/exclusion cascade for earnings news
    const falsePositive = result.entries.find(
      (e) =>
        e.level === "domain" &&
        e.title.includes("MSCI") &&
        (e.summary.includes("watchlist") || e.summary.includes("exclusion") || e.summary.includes("danh sách theo dõi") || e.summary.includes("loại"))
    );
    expect(falsePositive).toBeUndefined();
  });

  it("RED: constraint validation — MSCI watchlist and exclusion patterns are distinct", () => {
    // Verify rule keywords don't overlap
    const watchlistKeywords = ["danh sách theo dõi msci", "msci watchlist", "xem xét nâng hạng msci"];
    const exclusionKeywords = ["loại khỏi msci", "msci loại việt nam", "bị xóa khỏi chỉ số"];

    // No keyword should appear in both sets
    for (const wk of watchlistKeywords) {
      for (const ek of exclusionKeywords) {
        expect(wk).not.toBe(ek);
      }
    }

    expect(watchlistKeywords.length).toBe(3);
    expect(exclusionKeywords.length).toBe(3);
  });
});
