/**
 * Task 021 — RSS Base Fetcher + CafeF News
 *
 * Tests for:
 *   - parseRssFeed() in src/infrastructure/fetchers/rss.ts
 *   - fetchCafeF()   in src/infrastructure/fetchers/cafef.ts
 *
 * All HTTP calls are mocked — no real network traffic.
 */

import { describe, it, expect } from "bun:test";
import { parseRssFeed, type RssItem } from "../infrastructure/fetchers/rss.js";
import { fetchCafeF } from "../infrastructure/fetchers/cafef.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// Mock RSS XML helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal valid RSS 2.0 XML document.
 */
function buildMockRss(
  items: Array<{ title: string; link: string; pubDate: string; description: string }>,
): string {
  const itemXml = items
    .map(
      (i) => `
    <item>
      <title><![CDATA[${i.title}]]></title>
      <link>${i.link}</link>
      <pubDate>${i.pubDate}</pubDate>
      <description><![CDATA[${i.description}]]></description>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CafeF - Kênh thông tin tài chính</title>
    <link>https://cafef.vn</link>
    <description>Tin tức tài chính</description>
${itemXml}
  </channel>
</rss>`;
}

/** Builds a mock HttpClient that returns the given body. */
function mockHttpClient(body: string): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return body;
    },
  };
}

/** A mock HttpClient that always throws a network error. */
function throwingHttpClient(message = "Network error"): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error(message);
    },
  };
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_ITEMS = [
  {
    title: "VN-Index tăng mạnh phiên cuối tuần",
    link: "https://cafef.vn/vn-index-tang-manh-20260326.html",
    pubDate: "Thu, 26 Mar 2026 08:00:00 +0700",
    description: "VN-Index tăng 12 điểm lên 1.280 điểm trong phiên giao dịch cuối tuần.",
  },
  {
    title: "Lợi nhuận VCB tăng 25% trong quý I/2026",
    link: "https://cafef.vn/loi-nhuan-vcb-tang-25-20260325.html",
    pubDate: "Wed, 25 Mar 2026 09:30:00 +0700",
    description: "Vietcombank công bố lợi nhuận trước thuế đạt 8.500 tỷ đồng.",
  },
  {
    title: "Fed giữ nguyên lãi suất, USD/VND ổn định",
    link: "https://cafef.vn/fed-giu-nguyen-lai-suat-20260324.html",
    pubDate: "Tue, 24 Mar 2026 14:00:00 +0700",
    description: "Cục Dự trữ Liên bang Mỹ quyết định giữ nguyên lãi suất tham chiếu.",
  },
  {
    title: "HPG hưởng lợi từ đầu tư công tăng tốc",
    link: "https://cafef.vn/hpg-huong-loi-dau-tu-cong-20260323.html",
    pubDate: "Mon, 23 Mar 2026 10:15:00 +0700",
    description: "Hòa Phát được dự báo sẽ hưởng lợi lớn từ chương trình đầu tư công.",
  },
  {
    title: "Chứng khoán tuần tới: Nhà đầu tư thận trọng",
    link: "https://cafef.vn/chung-khoan-tuan-toi-20260322.html",
    pubDate: "Sun, 22 Mar 2026 16:00:00 +0700",
    description: "Các chuyên gia khuyến nghị nhà đầu tư thận trọng trong tuần tới.",
  },
  {
    title: "MBBank tăng trưởng tín dụng 18% năm 2026",
    link: "https://cafef.vn/mbbank-tang-truong-tin-dung-20260321.html",
    pubDate: "Sat, 21 Mar 2026 11:00:00 +0700",
    description: "MBBank đặt mục tiêu tăng trưởng tín dụng 18% trong năm 2026.",
  },
];

// ---------------------------------------------------------------------------
// Tests: parseRssFeed()
// ---------------------------------------------------------------------------

describe("Task 021 — parseRssFeed (base RSS parser)", () => {
  it("parses a well-formed RSS feed and returns correct item count", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(SAMPLE_ITEMS.length);
  });

  it("returns ≥5 items from a feed with ≥5 entries", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it("each item has a non-empty title", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("each item has a non-empty url", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    for (const item of items) {
      expect(item.url.length).toBeGreaterThan(0);
    }
  });

  it("each item has a publishedAt field (non-empty)", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    for (const item of items) {
      expect(item.publishedAt.length).toBeGreaterThan(0);
    }
  });

  it("each item has a content field", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    for (const item of items) {
      expect(typeof item.content).toBe("string");
    }
  });

  it("maps title correctly from CDATA section", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    const first = items[0]!;
    expect(first.title).toBe(SAMPLE_ITEMS[0]!.title);
  });

  it("maps url correctly from <link> element", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    const first = items[0]!;
    expect(first.url).toBe(SAMPLE_ITEMS[0]!.link);
  });

  it("maps publishedAt from <pubDate>", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    const first = items[0]!;
    expect(first.publishedAt).toBe(SAMPLE_ITEMS[0]!.pubDate);
  });

  it("maps content from <description>", () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = parseRssFeed(xml);
    const first = items[0]!;
    expect(first.content).toBe(SAMPLE_ITEMS[0]!.description);
  });

  it("returns empty array on completely empty string", () => {
    const items = parseRssFeed("");
    expect(items).toEqual([]);
  });

  it("returns empty array on malformed XML (no crash)", () => {
    const items = parseRssFeed("not xml at all <<<");
    expect(Array.isArray(items)).toBe(true);
  });

  it("returns empty array on RSS with empty channel (no items)", () => {
    const emptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty</title>
  </channel>
</rss>`;
    const items = parseRssFeed(emptyRss);
    expect(items).toEqual([]);
  });

  it("skips items with empty title and url gracefully", () => {
    const rssWithBadItem = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item><title></title><link></link></item>
    <item>
      <title><![CDATA[Valid item]]></title>
      <link>https://cafef.vn/valid.html</link>
      <pubDate>Thu, 26 Mar 2026 08:00:00 +0700</pubDate>
      <description>Content here</description>
    </item>
  </channel>
</rss>`;
    const items = parseRssFeed(rssWithBadItem);
    // Should only contain the valid item (empty title/url items are filtered)
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("Valid item");
  });

  it("items with no source field default to empty string", () => {
    const xml = buildMockRss(SAMPLE_ITEMS.slice(0, 1));
    const items = parseRssFeed(xml);
    // source is set by the caller (e.g., fetchCafeF sets it to 'cafef')
    // parseRssFeed itself sets source to empty string
    expect(items[0]!.source).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchCafeF()
// ---------------------------------------------------------------------------

describe("Task 021 — fetchCafeF (CafeF RSS fetcher)", () => {
  it("returns ≥5 items from a well-formed RSS feed", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchCafeF(mockHttpClient(xml));
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it("each item has source = 'cafef'", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchCafeF(mockHttpClient(xml));
    for (const item of items) {
      expect(item.source).toBe("cafef");
    }
  });

  it("each item has a non-empty title", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchCafeF(mockHttpClient(xml));
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("each item has a non-empty url", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchCafeF(mockHttpClient(xml));
    for (const item of items) {
      expect(item.url.length).toBeGreaterThan(0);
    }
  });

  it("each item has publishedAt and content fields", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchCafeF(mockHttpClient(xml));
    for (const item of items) {
      expect(typeof item.publishedAt).toBe("string");
      expect(typeof item.content).toBe("string");
    }
  });

  it("returns empty array on network error (no crash)", async () => {
    const items = await fetchCafeF(throwingHttpClient("Connection refused"));
    expect(items).toEqual([]);
  });

  it("returns empty array when RSS is malformed (no crash)", async () => {
    const items = await fetchCafeF(mockHttpClient("BROKEN XML <<< !!!"));
    expect(Array.isArray(items)).toBe(true);
  });

  it("fetches correct title from Vietnamese content", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchCafeF(mockHttpClient(xml));
    expect(items[0]!.title).toBe("VN-Index tăng mạnh phiên cuối tuần");
  });

  it("fetches correct url from link element", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchCafeF(mockHttpClient(xml));
    expect(items[0]!.url).toContain("cafef.vn");
  });
});
