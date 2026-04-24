/**
 * Task 161 — Alias wiring in cascadeEngine + pollNews Gate 3
 *
 * Tests:
 *  - AC-7: buildCausalChain resolves alias → VNM gets watchlistImpact with "AliasResolved" in reasoning
 *  - AC-8: alias-resolved entry uses confidence 0.55 when no SECTOR_RULE matches
 *  - AC-8 variant: when a SECTOR_RULE fires, domain-rule confidence is used (not 0.55)
 *  - AC-12: Gate 3 directMention passes when detectStocksInText finds an alias
 *  - Regression: no domain rule + no alias → stock still excluded
 *  - Regression: ticker in text (existing path) still works after alias fallback addition
 *  - broadcastMinImpact parameter accepted without error (stub for Task 162 readiness)
 */

import { describe, it, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
  type CausalChain,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import { detectStocksInText } from "../domain/services/stockAliases.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AnalysisEntry> = {}): AnalysisEntry {
  return {
    id: "test-entry-001",
    level: "action",
    sourceTitle: overrides.sourceTitle ?? "Test article",
    sourceUrl: "https://cafef.vn/test",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    summary: overrides.summary ?? "",
    affectedCountries: ["VN"],
    affectedDomains: overrides.affectedDomains ?? [],
    affectedActions: overrides.affectedActions ?? [],
    sentiment: overrides.sentiment ?? "bullish",
    impactScore: overrides.impactScore ?? 7,
    impactDirection: "up",
    confidence: overrides.confidence ?? 0.6,
    timeHorizon: "short",
    reasoning: overrides.reasoning ?? "test",
    parentIds: [],
    createdAt: new Date().toISOString(),
    tags: [],
    ...overrides,
  };
}

const vnmWatchlistEntry: WatchlistEntry = {
  actionCode: "VNM",
  domain: "retail",
  exchange: "HOSE",
};

const hpgWatchlistEntry: WatchlistEntry = {
  actionCode: "HPG",
  domain: "steel",
  exchange: "HOSE",
};

const fptWatchlistEntry: WatchlistEntry = {
  actionCode: "FPT",
  domain: "tech",
  exchange: "HOSE",
};

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: alias → "AliasResolved" in reasoning
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 161 — cascadeEngine alias wiring", () => {
  it("AC-7: VNM alias 'Vinamilk' in title resolves to watchlistImpact with AliasResolved in reasoning", () => {
    const entry = makeEntry({
      sourceTitle: "Vinamilk lên kế hoạch mở rộng thị trường xuất khẩu",
      summary: "Vinamilk công bố kế hoạch kinh doanh năm 2025.",
      affectedDomains: [],
      affectedActions: [],
      sentiment: "bullish",
    });

    const chain: CausalChain = buildCausalChain(entry, [vnmWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    expect(vnmImpact).toBeDefined();
    expect(vnmImpact!.reasoning).toContain("AliasResolved");
  });

  it("AC-7: VNM alias 'công ty cổ phần sữa việt nam' in summary resolves to watchlistImpact", () => {
    const entry = makeEntry({
      sourceTitle: "Kết quả kinh doanh quý 1",
      summary: "Công ty cổ phần sữa Việt Nam ghi nhận doanh thu tăng 15%.",
      affectedDomains: [],
      affectedActions: [],
    });

    const chain = buildCausalChain(entry, [vnmWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    expect(vnmImpact).toBeDefined();
    expect(vnmImpact!.reasoning).toContain("AliasResolved");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-8: alias path uses confidence 0.55 when no SECTOR_RULE fires
  // ─────────────────────────────────────────────────────────────────────────

  it("AC-8: alias-resolved entry has confidence 0.55 when no SECTOR_RULE keyword matches", () => {
    // Title and summary mention Vinamilk brand name but contain NO keywords
    // from SECTOR_RULES (no words like "oil", "thép", "lãi suất", etc.)
    const entry = makeEntry({
      sourceTitle: "Vinamilk ký hợp đồng mới với đối tác nước ngoài",
      summary: "Vinamilk vừa ký kết thỏa thuận hợp tác với đối tác quốc tế.",
      affectedDomains: [],
      affectedActions: [],
      sentiment: "bullish",
    });

    const chain = buildCausalChain(entry, [vnmWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    expect(vnmImpact).toBeDefined();
    expect(vnmImpact!.confidence).toBe(0.55);
  });

  it("AC-8 variant: when SECTOR_RULE fires for steel domain, HPG uses domain-rule confidence (> 0.55)", () => {
    // "giá thép tăng" is a SECTOR_RULE keyword for the steel domain (confidence 0.80)
    // The cascade engine searches summaryLower for keywords
    const entry = makeEntry({
      sourceTitle: "Cập nhật thị trường thép",
      summary: "Giá thép tăng mạnh trong quý 4, Hòa Phát hưởng lợi tích cực.",
      affectedDomains: [],
      affectedActions: [],
      sentiment: "bullish",
    });

    const chain = buildCausalChain(entry, [hpgWatchlistEntry]);

    const hpgImpact = chain.watchlistImpacts.find((w) => w.actionCode === "HPG");
    expect(hpgImpact).toBeDefined();
    // Domain rule confidence is > 0.55 (typically 0.7-0.9), not the alias fallback 0.55
    expect(hpgImpact!.confidence).toBeGreaterThan(0.55);
    // Should NOT have AliasResolved since it went through the domain rule path
    expect(hpgImpact!.reasoning).not.toContain("AliasResolved");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Regression: no alias, no domain rule → stock excluded
  // ─────────────────────────────────────────────────────────────────────────

  it("Regression: stock with no alias match and no domain rule is NOT included in watchlistImpacts", () => {
    const entry = makeEntry({
      sourceTitle: "Thị trường bất động sản có nhiều biến động",
      summary: "Phân khúc nhà ở có dấu hiệu phục hồi trong Q4.",
      affectedDomains: [],
      affectedActions: [],
    });

    // VNM (retail) should not be triggered by a real estate article
    // with no mention of Vinamilk or any VNM alias
    const chain = buildCausalChain(entry, [vnmWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    expect(vnmImpact).toBeUndefined();
  });

  it("Regression: article with no sector keyword and no alias → empty watchlistImpacts for unrelated stock", () => {
    const entry = makeEntry({
      sourceTitle: "Tin tức tổng hợp thị trường",
      summary: "Thị trường hôm nay giao dịch ổn định.",
      affectedDomains: [],
      affectedActions: [],
    });

    const chain = buildCausalChain(entry, [hpgWatchlistEntry]);

    const hpgImpact = chain.watchlistImpacts.find((w) => w.actionCode === "HPG");
    expect(hpgImpact).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Regression: existing ticker-in-text path still works
  // ─────────────────────────────────────────────────────────────────────────

  it("Regression: ticker code in text still produces watchlistImpact (existing path intact)", () => {
    // When the article explicitly mentions "VNM" as ticker AND has a domain rule keyword
    const entry = makeEntry({
      sourceTitle: "Cổ phiếu VNM bứt phá trong phiên sáng",
      summary: "VNM ghi nhận khối lượng giao dịch tăng 30%.",
      affectedDomains: ["retail"],
      affectedActions: ["VNM"],
      sentiment: "bullish",
    });

    // Provide sector rule by injecting affectedDomains
    const chain = buildCausalChain(entry, [vnmWatchlistEntry]);

    // Should still have VNM (via domain rule from affectedDomains or via alias)
    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    expect(vnmImpact).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Alias detection: sentiment propagation
  // ─────────────────────────────────────────────────────────────────────────

  it("Alias-resolved entry carries seed entry sentiment", () => {
    const entry = makeEntry({
      sourceTitle: "Vinamilk báo cáo lợi nhuận giảm mạnh",
      summary: "Vinamilk ghi nhận lợi nhuận giảm 20% so với cùng kỳ.",
      affectedDomains: [],
      affectedActions: [],
      sentiment: "bearish",
    });

    const chain = buildCausalChain(entry, [vnmWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    expect(vnmImpact).toBeDefined();
    expect(vnmImpact!.impactDirection).toBe("down"); // bearish → down
  });

  it("Alias-resolved entry carries bullish seed sentiment → impactDirection up", () => {
    const entry = makeEntry({
      sourceTitle: "Vinamilk mở rộng xuất khẩu sang châu Á",
      summary: "Sữa Vinamilk tăng trưởng tốt tại thị trường châu Á.",
      affectedDomains: [],
      affectedActions: [],
      sentiment: "bullish",
    });

    const chain = buildCausalChain(entry, [vnmWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    expect(vnmImpact).toBeDefined();
    expect(vnmImpact!.impactDirection).toBe("up"); // bullish → up
  });

  // ─────────────────────────────────────────────────────────────────────────
  // broadcastMinImpact parameter (Task 162 readiness) — 6th param accepted
  // ─────────────────────────────────────────────────────────────────────────

  it("broadcastMinImpact optional parameter is accepted without error", () => {
    const entry = makeEntry({
      sourceTitle: "Vinamilk công bố kết quả kinh doanh",
      summary: "Vinamilk đạt mục tiêu doanh thu năm 2025.",
    });

    // Should not throw with the 6th parameter
    expect(() => {
      buildCausalChain(entry, [vnmWatchlistEntry], undefined, undefined, undefined, 6);
    }).not.toThrow();
  });

  it("broadcastMinImpact defaults to 6 when omitted (no error)", () => {
    const entry = makeEntry({
      sourceTitle: "Test article without broadcast param",
      summary: "Test summary.",
    });

    expect(() => {
      buildCausalChain(entry, [vnmWatchlistEntry]);
    }).not.toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Multiple stocks — alias detection on multiple watchlist entries
  // ─────────────────────────────────────────────────────────────────────────

  it("Article mentioning both Vinamilk and Hòa Phát resolves both stocks via aliases", () => {
    const entry = makeEntry({
      sourceTitle: "Vinamilk và Hòa Phát đều tăng trong phiên hôm nay",
      summary: "Cổ phiếu Vinamilk và thép Hòa Phát có diễn biến tích cực.",
      affectedDomains: [],
      affectedActions: [],
      sentiment: "bullish",
    });

    const chain = buildCausalChain(entry, [vnmWatchlistEntry, hpgWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    const hpgImpact = chain.watchlistImpacts.find((w) => w.actionCode === "HPG");

    expect(vnmImpact).toBeDefined();
    expect(hpgImpact).toBeDefined();
  });

  it("Only the stock mentioned via alias appears, not unrelated watchlist stocks", () => {
    const entry = makeEntry({
      sourceTitle: "Vinamilk báo cáo doanh thu quý 3",
      summary: "Sữa Vinamilk tăng trưởng tốt.",
      affectedDomains: [],
      affectedActions: [],
    });

    // FPT is not mentioned — should not appear
    const chain = buildCausalChain(entry, [vnmWatchlistEntry, fptWatchlistEntry]);

    const vnmImpact = chain.watchlistImpacts.find((w) => w.actionCode === "VNM");
    const fptImpact = chain.watchlistImpacts.find((w) => w.actionCode === "FPT");

    expect(vnmImpact).toBeDefined();
    expect(fptImpact).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-12: pollNews Gate 3 alias extension (unit test of detectStocksInText logic)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 161 — pollNews Gate 3 alias extension (unit test of detection logic)", () => {
  it("AC-12: directMention via alias — 'Vinamilk' in title+summary matches VNM", () => {
    const titleAndSummary = "Vinamilk công bố kết quả kinh doanh quý 1".toLowerCase();
    const tickerMatch = titleAndSummary.includes("vnm");
    const aliasMatch = tickerMatch
      ? false
      : detectStocksInText(titleAndSummary, ["VNM"]).length > 0;
    const directMention = tickerMatch || aliasMatch;
    expect(directMention).toBe(true);
  });

  it("AC-12: ticker in text triggers tickerMatch (short-circuit), not aliasMatch", () => {
    const titleAndSummary = "cổ phiếu vnm tăng mạnh".toLowerCase();
    const tickerMatch = titleAndSummary.includes("vnm");
    const aliasMatch = tickerMatch
      ? false
      : detectStocksInText(titleAndSummary, ["VNM"]).length > 0;
    const directMention = tickerMatch || aliasMatch;
    expect(directMention).toBe(true);
    expect(tickerMatch).toBe(true);
    // aliasMatch should be false due to short-circuit
    expect(aliasMatch).toBe(false);
  });

  it("AC-12: no ticker, no alias → directMention is false", () => {
    const titleAndSummary = "thị trường chứng khoán tăng nhẹ".toLowerCase();
    const tickerMatch = titleAndSummary.includes("vnm");
    const aliasMatch = tickerMatch
      ? false
      : detectStocksInText(titleAndSummary, ["VNM"]).length > 0;
    const directMention = tickerMatch || aliasMatch;
    expect(directMention).toBe(false);
  });

  it("AC-12: 'Vietcombank' in text matches VCB via alias", () => {
    const titleAndSummary = "Vietcombank công bố lãi suất mới cho năm 2025";
    const tickerMatch = titleAndSummary.toLowerCase().includes("vcb");
    const aliasMatch = tickerMatch
      ? false
      : detectStocksInText(titleAndSummary, ["VCB"]).length > 0;
    const directMention = tickerMatch || aliasMatch;
    expect(directMention).toBe(true);
  });

  it("AC-12: 'FPT Software' in text matches FPT via alias", () => {
    const titleAndSummary = "FPT Software ký hợp đồng lớn với đối tác Nhật Bản";
    const tickerMatch = titleAndSummary.toLowerCase().includes("fpt");
    // Note: FPT ticker IS in text as "fpt software" contains "fpt"
    const aliasMatch = tickerMatch
      ? false
      : detectStocksInText(titleAndSummary, ["FPT"]).length > 0;
    const directMention = tickerMatch || aliasMatch;
    expect(directMention).toBe(true);
  });

  it("AC-12: watchlist only contains FPT but text mentions Vinamilk → directMention false for FPT", () => {
    const titleAndSummary = "Vinamilk tăng trưởng xuất khẩu";
    const tickerMatch = titleAndSummary.toLowerCase().includes("fpt");
    const aliasMatch = tickerMatch
      ? false
      : detectStocksInText(titleAndSummary, ["FPT"]).length > 0;
    const directMention = tickerMatch || aliasMatch;
    expect(directMention).toBe(false);
  });
});
