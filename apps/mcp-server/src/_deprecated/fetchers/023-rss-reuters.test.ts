// @ts-nocheck — deprecated test file; relative imports no longer resolve from _deprecated/ location.
// Retained for rollback reference only. See _deprecated/fetchers/README.md.
/**
 * Task 023 — International Finance News RSS Fetcher (Google News)
 *
 * Tests for fetchReuters() in src/infrastructure/fetchers/reuters.ts
 *
 * Implementation now uses Google News RSS feeds:
 *   Primary:   https://news.google.com/rss/search?q=vietnam+economy+OR+stock+market&hl=en
 *   Secondary: https://news.google.com/rss/search?q=asia+finance+OR+emerging+markets&hl=en
 *
 * Source tags preserved for backward compatibility:
 *   Primary   → source = 'reuters'
 *   Secondary → source = 'ap_news'
 *
 * All HTTP calls are mocked — no real network traffic.
 */

import { describe, it, expect } from "bun:test";
import { fetchReuters } from "../infrastructure/fetchers/reuters.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal valid RSS 2.0 XML document with a given source label
 * embedded in the feed title (for identification in tests only).
 */
function buildMockRss(
  items: Array<{ title: string; link: string; pubDate: string; description: string }>,
  channelTitle = "Mock Feed",
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
    <title>${channelTitle}</title>
    <link>https://example.com</link>
    <description>Mock RSS feed</description>
${itemXml}
  </channel>
</rss>`;
}

/** Sample Reuters-style items. */
const REUTERS_ITEMS = [
  {
    title: "Fed holds rates steady amid inflation concerns",
    link: "https://www.reuters.com/markets/us/fed-holds-rates-steady-2026-03-26/",
    pubDate: "Thu, 26 Mar 2026 14:00:00 +0000",
    description: "The Federal Reserve kept interest rates unchanged at its March meeting.",
  },
  {
    title: "Oil prices rise on supply cuts",
    link: "https://www.reuters.com/markets/commodities/oil-rises-2026-03-25/",
    pubDate: "Wed, 25 Mar 2026 09:30:00 +0000",
    description: "Brent crude climbed 1.2% following OPEC+ supply reduction announcement.",
  },
  {
    title: "Asia stocks mixed as US futures dip",
    link: "https://www.reuters.com/markets/asia/asian-stocks-2026-03-24/",
    pubDate: "Tue, 24 Mar 2026 06:00:00 +0000",
    description: "Asian equity markets traded mixed amid cautious sentiment.",
  },
];

/** Sample AP News-style items. */
const AP_ITEMS = [
  {
    title: "Global markets cautious ahead of G7 summit",
    link: "https://apnews.com/article/g7-summit-markets-2026",
    pubDate: "Thu, 26 Mar 2026 12:00:00 +0000",
    description: "Investors are holding back ahead of the upcoming G7 summit.",
  },
  {
    title: "US tech stocks rally on AI earnings beat",
    link: "https://apnews.com/article/tech-stocks-ai-2026",
    pubDate: "Wed, 25 Mar 2026 18:00:00 +0000",
    description: "Major tech firms beat earnings estimates driven by AI revenue growth.",
  },
];

/**
 * Creates an HttpClient whose responses depend on the requested URL.
 * primaryResponse / secondaryResponse may be a string body or an Error to throw.
 *
 * Routes:
 *   - URLs containing "vietnam" or "stock+market" → primary feed (tagged 'reuters')
 *   - All other URLs → secondary feed fallback (tagged 'ap_news')
 */
function urlAwareClient(
  primaryResponse: string | Error,
  secondaryResponse: string | Error,
): HttpClient {
  return {
    async get(url: string): Promise<string> {
      if (url.includes("vietnam") || url.includes("stock+market") || url.includes("stock%2Bmarket")) {
        if (primaryResponse instanceof Error) throw primaryResponse;
        return primaryResponse;
      }
      // Secondary / fallback feed (asia finance, emerging markets)
      if (secondaryResponse instanceof Error) throw secondaryResponse;
      return secondaryResponse;
    },
  };
}

/** Client that always throws regardless of URL. */
function alwaysThrowingClient(message = "Network error"): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error(message);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 023 — fetchReuters (Reuters/AP News RSS fetcher)", () => {
  // ── Reuters succeeds ──────────────────────────────────────────────────────

  it("returns items when Reuters feed succeeds", async () => {
    const xml = buildMockRss(REUTERS_ITEMS, "Reuters Business Finance");
    const client = urlAwareClient(xml, new Error("AP should not be called"));
    const items = await fetchReuters(client);
    expect(items.length).toBe(REUTERS_ITEMS.length);
  });

  it("tags all items with source = 'reuters' when Reuters succeeds", async () => {
    const xml = buildMockRss(REUTERS_ITEMS, "Reuters Business Finance");
    const client = urlAwareClient(xml, new Error("AP should not be called"));
    const items = await fetchReuters(client);
    for (const item of items) {
      expect(item.source).toBe("reuters");
    }
  });

  it("each Reuters item has a non-empty title", async () => {
    const xml = buildMockRss(REUTERS_ITEMS);
    const client = urlAwareClient(xml, new Error("should not reach AP"));
    const items = await fetchReuters(client);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("each Reuters item has a non-empty url", async () => {
    const xml = buildMockRss(REUTERS_ITEMS);
    const client = urlAwareClient(xml, new Error("should not reach AP"));
    const items = await fetchReuters(client);
    for (const item of items) {
      expect(item.url.length).toBeGreaterThan(0);
    }
  });

  it("each Reuters item has publishedAt and content fields", async () => {
    const xml = buildMockRss(REUTERS_ITEMS);
    const client = urlAwareClient(xml, new Error("should not reach AP"));
    const items = await fetchReuters(client);
    for (const item of items) {
      expect(typeof item.publishedAt).toBe("string");
      expect(typeof item.content).toBe("string");
    }
  });

  // ── Reuters fails, AP succeeds ────────────────────────────────────────────

  it("falls back to AP News when Reuters throws a network error", async () => {
    const apXml = buildMockRss(AP_ITEMS, "AP News Business");
    const client = urlAwareClient(new Error("Reuters connection refused"), apXml);
    const items = await fetchReuters(client);
    expect(items.length).toBe(AP_ITEMS.length);
  });

  it("tags all fallback items with source = 'ap_news'", async () => {
    const apXml = buildMockRss(AP_ITEMS, "AP News Business");
    const client = urlAwareClient(new Error("Reuters connection refused"), apXml);
    const items = await fetchReuters(client);
    for (const item of items) {
      expect(item.source).toBe("ap_news");
    }
  });

  it("falls back to AP News when Reuters returns an empty feed", async () => {
    const emptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel><title>Empty</title></channel>
</rss>`;
    const apXml = buildMockRss(AP_ITEMS);
    const client = urlAwareClient(emptyRss, apXml);
    const items = await fetchReuters(client);
    // Should have used AP fallback
    expect(items.length).toBe(AP_ITEMS.length);
    for (const item of items) {
      expect(item.source).toBe("ap_news");
    }
  });

  it("falls back to AP News when Reuters returns empty string", async () => {
    const apXml = buildMockRss(AP_ITEMS);
    const client = urlAwareClient("", apXml);
    const items = await fetchReuters(client);
    expect(items.length).toBe(AP_ITEMS.length);
    expect(items[0]!.source).toBe("ap_news");
  });

  it("AP fallback items have non-empty title and url", async () => {
    const apXml = buildMockRss(AP_ITEMS);
    const client = urlAwareClient(new Error("Reuters down"), apXml);
    const items = await fetchReuters(client);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url.length).toBeGreaterThan(0);
    }
  });

  // ── Both fail ─────────────────────────────────────────────────────────────

  it("returns empty array when both Reuters and AP News throw (no crash)", async () => {
    const items = await fetchReuters(alwaysThrowingClient("All sources down"));
    expect(items).toEqual([]);
  });

  it("returns empty array when both return empty feeds (no crash)", async () => {
    const emptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel><title>Empty</title></channel>
</rss>`;
    const client = urlAwareClient(emptyRss, emptyRss);
    const items = await fetchReuters(client);
    expect(items).toEqual([]);
  });

  it("does not throw when Reuters throws and AP throws", async () => {
    const client: HttpClient = {
      async get(_url: string): Promise<string> {
        throw new Error("All networks down");
      },
    };
    await expect(fetchReuters(client)).resolves.toEqual([]);
  });

  // ── Export contract ────────────────────────────────────────────────────────

  it("is exported from the fetchers barrel", async () => {
    const barrel = await import("../infrastructure/fetchers/index.js");
    expect(typeof barrel.fetchReuters).toBe("function");
  });
});
