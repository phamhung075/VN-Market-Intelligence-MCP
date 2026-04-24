/**
 * Task 022 — VnExpress Finance RSS Fetcher
 *
 * Tests for:
 *   - fetchVnExpress() in src/infrastructure/fetchers/vnexpress.ts
 *
 * All HTTP calls are mocked — no real network traffic.
 */

import { describe, it, expect } from "bun:test";
import { fetchVnExpress } from "../infrastructure/fetchers/vnexpress.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// Mock RSS XML helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal valid RSS 2.0 XML document for VnExpress.
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
    <title>VnExpress - Kinh doanh</title>
    <link>https://vnexpress.net/kinh-doanh</link>
    <description>Tin tức kinh doanh - tài chính</description>
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
// Sample data — VnExpress Finance articles
// ---------------------------------------------------------------------------

const SAMPLE_ITEMS = [
  {
    title: "VN-Index vượt mốc 1.300 điểm trong phiên sáng",
    link: "https://vnexpress.net/vn-index-vuot-moc-1300-diem-4876543.html",
    pubDate: "Thu, 26 Mar 2026 09:00:00 +0700",
    description: "Chỉ số VN-Index tăng 15 điểm và vượt ngưỡng tâm lý 1.300 điểm.",
  },
  {
    title: "Techcombank báo lãi kỷ lục 12.000 tỷ đồng",
    link: "https://vnexpress.net/techcombank-bao-lai-ky-luc-4876544.html",
    pubDate: "Wed, 25 Mar 2026 10:30:00 +0700",
    description: "Techcombank công bố lợi nhuận trước thuế đạt mức kỷ lục 12.000 tỷ đồng.",
  },
  {
    title: "Giá vàng SJC tăng 500.000 đồng mỗi lượng",
    link: "https://vnexpress.net/gia-vang-sjc-tang-500-nghin-4876545.html",
    pubDate: "Tue, 24 Mar 2026 14:00:00 +0700",
    description: "Vàng SJC tăng lên 87,5 triệu đồng một lượng trong phiên chiều.",
  },
  {
    title: "Xuất khẩu thủy sản tháng 3 đạt 800 triệu USD",
    link: "https://vnexpress.net/xuat-khau-thuy-san-thang-3-4876546.html",
    pubDate: "Mon, 23 Mar 2026 11:15:00 +0700",
    description: "Hiệp hội Chế biến và Xuất khẩu thủy sản Việt Nam công bố số liệu tháng 3.",
  },
  {
    title: "Lãi suất tiết kiệm ngân hàng tiếp tục giảm",
    link: "https://vnexpress.net/lai-suat-tiet-kiem-tiep-tuc-giam-4876547.html",
    pubDate: "Sun, 22 Mar 2026 16:00:00 +0700",
    description: "Nhiều ngân hàng thương mại điều chỉnh giảm lãi suất huy động 0,1-0,2%.",
  },
  {
    title: "FPT ký hợp đồng AI trị giá 50 triệu USD với đối tác Nhật",
    link: "https://vnexpress.net/fpt-ky-hop-dong-ai-50-trieu-usd-4876548.html",
    pubDate: "Sat, 21 Mar 2026 12:00:00 +0700",
    description: "Tập đoàn FPT ký kết hợp đồng cung cấp giải pháp AI cho tập đoàn Nhật Bản.",
  },
];

// ---------------------------------------------------------------------------
// Tests: fetchVnExpress()
// ---------------------------------------------------------------------------

describe("Task 022 — fetchVnExpress (VnExpress Finance RSS fetcher)", () => {
  it("returns ≥5 items from a well-formed RSS feed", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    expect(items.length).toBeGreaterThanOrEqual(5);
  });

  it("each item has source = 'vnexpress'", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    for (const item of items) {
      expect(item.source).toBe("vnexpress");
    }
  });

  it("each item has a non-empty title", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("each item has a non-empty url", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    for (const item of items) {
      expect(item.url.length).toBeGreaterThan(0);
    }
  });

  it("each item has publishedAt and content fields", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    for (const item of items) {
      expect(typeof item.publishedAt).toBe("string");
      expect(typeof item.content).toBe("string");
    }
  });

  it("returns empty array on network error (no crash)", async () => {
    const items = await fetchVnExpress(throwingHttpClient("Connection refused"));
    expect(items).toEqual([]);
  });

  it("returns empty array when RSS is malformed (no crash)", async () => {
    const items = await fetchVnExpress(mockHttpClient("BROKEN XML <<< !!!"));
    expect(Array.isArray(items)).toBe(true);
  });

  it("fetches correct title from Vietnamese content", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    expect(items[0]!.title).toBe("VN-Index vượt mốc 1.300 điểm trong phiên sáng");
  });

  it("fetches correct url from link element", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    expect(items[0]!.url).toContain("vnexpress.net");
  });

  it("returns correct total item count", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    expect(items.length).toBe(SAMPLE_ITEMS.length);
  });

  it("maps publishedAt from <pubDate>", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    expect(items[0]!.publishedAt).toBe(SAMPLE_ITEMS[0]!.pubDate);
  });

  it("maps content from <description>", async () => {
    const xml = buildMockRss(SAMPLE_ITEMS);
    const items = await fetchVnExpress(mockHttpClient(xml));
    expect(items[0]!.content).toBe(SAMPLE_ITEMS[0]!.description);
  });

  it("returns empty array on empty RSS feed (no items)", async () => {
    const emptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>VnExpress - Kinh doanh</title>
  </channel>
</rss>`;
    const items = await fetchVnExpress(mockHttpClient(emptyRss));
    expect(items).toEqual([]);
  });
});
