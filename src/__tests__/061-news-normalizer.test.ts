/**
 * Task 061 — News Normalizer tests
 *
 * Tests normalizeNews(item: RssItem): AnalysisEntry
 *
 * TDD: Write failing tests first, then implement.
 */

import { describe, it, expect } from "bun:test";
import { normalizeNews } from "../domain/services/newsNormalizer.js";
import type { RssItem } from "../infrastructure/fetchers/rss.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<RssItem>): RssItem {
  return {
    title: "",
    url: "https://example.com/article",
    publishedAt: "Mon, 27 Mar 2026 08:00:00 +0700",
    content: "",
    source: "cafef",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 061 — News Normalizer", () => {
  // ─── Level classification ─────────────────────────────────────────────────

  it("CafeF news about VCB → level country, domain banking, stocks [VCB]", () => {
    const item = makeItem({
      source: "cafef",
      title: "VCB báo cáo lợi nhuận quý 1 tăng mạnh",
      content: "Ngân hàng Vietcombank (VCB) công bố kết quả kinh doanh quý 1.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("action");
    expect(entry.affectedDomains).toContain("banking");
    expect(entry.affectedActions).toContain("VCB");
  });

  it("Reuters oil price news → level global, domain oil_gas", () => {
    const item = makeItem({
      source: "reuters",
      title: "Oil price rises as OPEC cuts production",
      content: "Crude oil prices rose sharply after OPEC announced production cuts.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("global");
    expect(entry.affectedDomains).toContain("oil_gas");
  });

  it("VnExpress tech news → domain tech", () => {
    const item = makeItem({
      source: "vnexpress",
      title: "FPT mở rộng sang thị trường Nhật Bản",
      content: "Tập đoàn công nghệ FPT ký hợp đồng lớn với đối tác Nhật Bản.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("tech");
    expect(entry.affectedActions).toContain("FPT");
  });

  it("CafeF source defaults to country level when no strong keywords match", () => {
    const item = makeItem({
      source: "cafef",
      title: "Thị trường chứng khoán hôm nay",
      content: "Nhận định thị trường phiên giao dịch ngày 27/03/2026.",
    });
    const entry = normalizeNews(item);
    // CafeF tiebreaker → country
    expect(entry.level).toBe("country");
    expect(entry.affectedCountries).toContain("VN");
  });

  it("Reuters source tiebreaker → global when no strong keywords", () => {
    const item = makeItem({
      source: "reuters",
      title: "Markets steady ahead of central bank meetings",
      content: "Global financial markets are cautious as investors await policy decisions.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("global");
    // Reuters → no VN by default
    expect(entry.affectedCountries).not.toContain("VN");
  });

  it("ap_news source tiebreaker → global", () => {
    const item = makeItem({
      source: "ap_news",
      title: "Federal Reserve signals rate pause",
      content: "The Federal Reserve indicated it may pause rate hikes.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("global");
  });

  it("Vietnam/NHNN keyword forces country level over source tiebreaker", () => {
    const item = makeItem({
      source: "reuters",
      title: "Vietnam NHNN keeps interest rates steady",
      content: "The State Bank of Vietnam (SBV) held rates unchanged at its latest meeting.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("country");
    expect(entry.affectedCountries).toContain("VN");
  });

  // ─── Sentiment ────────────────────────────────────────────────────────────

  it("positive sentiment keywords → bullish", () => {
    const item = makeItem({
      source: "cafef",
      title: "Lợi nhuận VNM tăng trưởng vượt kế hoạch",
      content: "Công ty đạt lợi nhuận tăng mạnh trong quý vừa qua.",
    });
    const entry = normalizeNews(item);
    expect(entry.sentiment).toBe("bullish");
  });

  it("negative sentiment keywords → bearish", () => {
    const item = makeItem({
      source: "cafef",
      title: "Cổ phiếu giảm mạnh do thua lỗ",
      content: "Nhiều doanh nghiệp báo cáo thua lỗ trong quý 1.",
    });
    const entry = normalizeNews(item);
    expect(entry.sentiment).toBe("bearish");
  });

  it("no sentiment keywords → neutral", () => {
    const item = makeItem({
      source: "cafef",
      title: "Phiên giao dịch 27/03/2026",
      content: "Thị trường diễn biến bình thường.",
    });
    const entry = normalizeNews(item);
    expect(entry.sentiment).toBe("neutral");
  });

  // ─── Impact score ─────────────────────────────────────────────────────────

  it("neutral news → impact score 0-5", () => {
    const item = makeItem({
      source: "cafef",
      title: "Thông tin thị trường",
      content: "Các diễn biến trong ngày hôm nay.",
    });
    const entry = normalizeNews(item);
    expect(entry.impactScore).toBeGreaterThanOrEqual(0);
    expect(entry.impactScore).toBeLessThanOrEqual(5);
  });

  it("empty content → impact score reduced (lower than base 5 with title hit)", () => {
    const itemWithContent = makeItem({
      source: "reuters",
      title: "Oil price rises sharply today crude oil jumps",
      content:
        "Global crude oil prices have risen significantly as markets reacted to OPEC supply data.",
    });
    const itemEmpty = makeItem({
      source: "reuters",
      title: "Oil price rises sharply today crude oil jumps",
      content: "",
    });
    const entryWithContent = normalizeNews(itemWithContent);
    const entryEmpty = normalizeNews(itemEmpty);
    // empty content should reduce the score
    expect(entryEmpty.impactScore).toBeLessThan(entryWithContent.impactScore);
  });

  it("impact score is clamped between 0 and 10", () => {
    const item = makeItem({
      source: "reuters",
      title: "Fed FOMC oil crude OPEC USD Federal Reserve interest rate hike",
      content: "Major global market events are converging.",
    });
    const entry = normalizeNews(item);
    expect(entry.impactScore).toBeGreaterThanOrEqual(0);
    expect(entry.impactScore).toBeLessThanOrEqual(10);
  });

  // ─── Multiple stock mentions ──────────────────────────────────────────────

  it("multiple stock mentions → all detected", () => {
    const item = makeItem({
      source: "cafef",
      title: "VCB và BID dẫn đầu nhóm ngân hàng",
      content: "Cổ phiếu VCB, BID và CTG đều tăng mạnh trong phiên hôm nay.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("VCB");
    expect(entry.affectedActions).toContain("BID");
    expect(entry.affectedActions).toContain("CTG");
  });

  // ─── AnalysisEntry structure ──────────────────────────────────────────────

  it("output has all required AnalysisEntry fields", () => {
    const item = makeItem({
      source: "cafef",
      title: "Tin tức thị trường",
      content: "Nội dung bài viết.",
    });
    const entry = normalizeNews(item);

    // Required fields
    expect(typeof entry.id).toBe("string");
    expect(entry.id.startsWith("analysis-")).toBe(true);
    expect(["global", "country", "domain", "action"]).toContain(entry.level);
    expect(typeof entry.sourceTitle).toBe("string");
    expect(typeof entry.sourceUrl).toBe("string");
    expect(entry.sourceType).toBe("news");
    expect(typeof entry.publishedAt).toBe("string");
    expect(["bullish", "bearish", "neutral"]).toContain(entry.sentiment);
    expect(typeof entry.impactScore).toBe("number");
    expect(["up", "down", "neutral"]).toContain(entry.impactDirection);
    expect(typeof entry.confidence).toBe("number");
    expect(entry.confidence).toBeGreaterThanOrEqual(0);
    expect(entry.confidence).toBeLessThanOrEqual(1);
    expect(["short", "medium", "long"]).toContain(entry.timeHorizon);
    expect(typeof entry.summary).toBe("string");
    expect(typeof entry.reasoning).toBe("string");
    expect(Array.isArray(entry.affectedCountries)).toBe(true);
    expect(Array.isArray(entry.affectedDomains)).toBe(true);
    expect(Array.isArray(entry.affectedActions)).toBe(true);
    expect(Array.isArray(entry.parentIds)).toBe(true);
    expect(entry.parentIds).toEqual([]);
    expect(Array.isArray(entry.tags)).toBe(true);
    expect(typeof entry.createdAt).toBe("string");
  });

  it("empty title uses fallback (no title)", () => {
    const item = makeItem({ title: "", source: "cafef" });
    const entry = normalizeNews(item);
    expect(entry.sourceTitle).toBe("(no title)");
  });

  it("summary is (title + '. ' + content) sliced to 1000 chars", () => {
    // Use word-separated content so smartTruncate cuts at a word boundary
    // beyond the title, not before it.
    const longContent = "word ".repeat(240); // 1200 chars with spaces
    const item = makeItem({
      source: "cafef",
      title: "Test title",
      content: longContent,
    });
    const entry = normalizeNews(item);
    expect(entry.summary.length).toBeLessThanOrEqual(1001); // 1000 graphemes + optional "…"
    expect(entry.summary.startsWith("Test title. ")).toBe(true);
  });

  it("tags are deduplicated, lowercase, max 10", () => {
    const item = makeItem({
      source: "reuters",
      title: "Oil crude OPEC Fed interest rate hike VCB BID CTG FPT",
      content: "Oil crude opec fed rate",
    });
    const entry = normalizeNews(item);
    expect(entry.tags.length).toBeLessThanOrEqual(10);
    // Tags should be lowercase
    entry.tags.forEach((tag) => {
      expect(tag).toBe(tag.toLowerCase());
    });
    // No duplicates
    const unique = new Set(entry.tags);
    expect(unique.size).toBe(entry.tags.length);
  });

  it("global level → short time horizon", () => {
    const item = makeItem({
      source: "reuters",
      title: "Federal Reserve FOMC meeting rate decision",
      content: "The Fed announced a significant policy change.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("global");
    expect(entry.timeHorizon).toBe("short");
  });

  it("country level → medium time horizon", () => {
    const item = makeItem({
      source: "cafef",
      title: "VN-Index tăng điểm trong phiên sáng",
      content: "Thị trường chứng khoán Việt Nam khởi sắc.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("country");
    expect(entry.timeHorizon).toBe("medium");
  });

  it("action level → short time horizon", () => {
    const item = makeItem({
      source: "cafef",
      title: "HPG thông báo kết quả kinh doanh",
      content: "Tập đoàn Hòa Phát (HPG) công bố KQKD quý 4.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("action");
    expect(entry.timeHorizon).toBe("short");
  });

  it("Reuters with Vietnam keyword → adds VN to affectedCountries", () => {
    const item = makeItem({
      source: "reuters",
      title: "Vietnam GDP growth exceeds forecast",
      content: "Vietnam economy grew strongly in the first quarter.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedCountries).toContain("VN");
  });

  it("unknown source → reasonable defaults (level country, no crash)", () => {
    const item = makeItem({
      source: "unknown_source",
      title: "Generic market news",
      content: "Some financial news content.",
    });
    const entry = normalizeNews(item);
    // Should not throw and return a valid entry
    expect(entry).toBeDefined();
    expect(["global", "country", "domain", "action"]).toContain(entry.level);
  });
});
