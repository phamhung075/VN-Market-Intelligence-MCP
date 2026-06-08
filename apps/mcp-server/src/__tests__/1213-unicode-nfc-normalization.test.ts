/**
 * Task 1213 — Unicode NFC normalization in news normalizer
 *
 * Vietnamese text arriving in NFD (combining diacritics) form must be
 * normalized to NFC before keyword matching and storage. Without this,
 * "Việt Nam" in NFD form does not match the NFC keyword "việt nam".
 *
 * TDD: Tests written first (RED), then implementation.
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { normalizeNews, decodeHtmlEntities } from "../domain/services/newsNormalizer.js";
import type { RssItem } from "../infrastructure/fetchers/rss.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<RssItem>): RssItem {
  return {
    title: "",
    url: "https://example.com/article",
    publishedAt: "Mon, 14 Apr 2026 08:00:00 +0700",
    content: "",
    source: "cafef",
    ...overrides,
  };
}

/**
 * Convert a string to NFD (decomposed combining diacritics) form —
 * simulates text arriving from an SSC or RSS source that delivers NFD.
 */
function toNfd(s: string): string {
  return s.normalize("NFD");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1213 — Unicode NFC normalization", () => {
  // ── Core: NFD input matches NFC keyword patterns ────────────────────────────

  it("NFD 'Việt Nam' in title is normalized so country level is detected", () => {
    const nfdTitle = toNfd("Việt Nam tăng trưởng kinh tế");
    const item = makeItem({ source: "reuters", title: nfdTitle, content: "" });
    const entry = normalizeNews(item);
    // "việt nam" is in COUNTRY_KEYWORDS — NFD input must still match
    expect(entry.level).toBe("country");
  });

  it("NFD 'Ngân hàng nhà nước' in content matches country keyword", () => {
    const nfdContent = toNfd("Ngân hàng nhà nước công bố lãi suất mới");
    const item = makeItem({ source: "reuters", title: "Vietnam news", content: nfdContent });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("country");
    expect(entry.affectedCountries).toContain("VN");
  });

  it("NFD 'ngân hàng' matches banking domain keyword", () => {
    const nfdTitle = toNfd("Ngân hàng VCB công bố kết quả");
    const item = makeItem({ source: "cafef", title: nfdTitle, content: "" });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("banking");
  });

  it("NFD 'lợi nhuận tăng' in title gives bullish sentiment", () => {
    const nfdTitle = toNfd("Lợi nhuận tăng mạnh quý 1");
    const item = makeItem({ source: "cafef", title: nfdTitle, content: "Doanh nghiệp đạt mục tiêu." });
    const entry = normalizeNews(item);
    expect(entry.sentiment).toBe("bullish");
  });

  it("NFD 'thua lỗ' in title gives bearish sentiment", () => {
    const nfdTitle = toNfd("Doanh nghiệp thua lỗ trong quý 1");
    const item = makeItem({ source: "cafef", title: nfdTitle, content: "Kết quả kinh doanh giảm mạnh." });
    const entry = normalizeNews(item);
    expect(entry.sentiment).toBe("bearish");
  });

  it("NFD 'bất động sản' matches real_estate domain", () => {
    const nfdContent = toNfd("Thị trường bất động sản gặp khó khăn");
    const item = makeItem({ source: "cafef", title: "Tin tức", content: nfdContent });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("real_estate");
  });

  it("NFD title: sourceTitle stored in NFC form (not NFD)", () => {
    const nfdTitle = toNfd("Việt Nam tăng trưởng GDP");
    const item = makeItem({ source: "cafef", title: nfdTitle, content: "" });
    const entry = normalizeNews(item);
    // The stored title should be in NFC form
    expect(entry.sourceTitle).toBe("Việt Nam tăng trưởng GDP".normalize("NFC"));
    // Verify it's actually NFC (length in NFC vs NFD differs for Vietnamese)
    expect(entry.sourceTitle).toBe(entry.sourceTitle.normalize("NFC"));
  });

  it("NFD content: summary stored in NFC form", () => {
    const nfdContent = toNfd("Kinh tế Việt Nam tăng trưởng mạnh mẽ trong quý đầu năm");
    const item = makeItem({ source: "cafef", title: "Test", content: nfdContent });
    const entry = normalizeNews(item);
    // Summary must be in NFC — no combining characters
    expect(entry.summary).toBe(entry.summary.normalize("NFC"));
  });

  it("already-NFC text is not corrupted by normalization", () => {
    const nfcTitle = "VCB báo cáo lợi nhuận tăng";
    const item = makeItem({ source: "cafef", title: nfcTitle, content: "Kết quả tốt." });
    const entry = normalizeNews(item);
    expect(entry.sourceTitle).toBe(nfcTitle);
    expect(entry.sentiment).toBe("bullish");
  });

  it("ASCII-only text is unaffected by NFC normalization", () => {
    const title = "Oil price rises sharply crude oil OPEC";
    const item = makeItem({ source: "reuters", title, content: "Market update." });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("global");
    expect(entry.sourceTitle).toBe(title);
  });

  it("mixed NFD/NFC text is fully normalized to NFC", () => {
    // Build a string where first part is NFD and second is NFC
    const mixed = toNfd("Việt Nam") + " VCB " + "ngân hàng";
    const item = makeItem({ source: "reuters", title: mixed, content: "" });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("country"); // "việt nam" keyword matched
    expect(entry.sourceTitle).toBe(entry.sourceTitle.normalize("NFC"));
  });

  // ── decodeHtmlEntities: NFC pass-through ─────────────────────────────────

  it("decodeHtmlEntities output is in NFC form when input is NFC", () => {
    const nfc = "Ngân hàng &amp; chứng khoán";
    const result = decodeHtmlEntities(nfc);
    expect(result).toBe(result.normalize("NFC"));
    expect(result).toContain("&");
  });
});
