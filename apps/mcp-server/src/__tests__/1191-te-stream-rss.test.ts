/**
 * Task 1191 — Replace TE stream.ashx with public RSS feeds
 *
 * Tests the sequential fallback logic in tradingEconomicsStream.ts.
 * All tests inject a mock HttpClient — no real network calls.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";
import { fetchTradingEconomicsStream } from "../infrastructure/fetchers/tradingEconomicsStream.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Fed holds rates steady</title>
      <link>https://example.com/fed</link>
      <pubDate>Mon, 14 Apr 2026 10:00:00 GMT</pubDate>
      <description>Federal Reserve keeps benchmark rate unchanged.</description>
    </item>
  </channel>
</rss>`;

const EMPTY_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel></channel></rss>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchTradingEconomicsStream — RSS fallback", () => {
  it("Test 1: Feed 1 (MarketWatch) wins — feeds 2 and 3 not called", async () => {
    let callCount = 0;
    const mockClient: HttpClient = {
      async get(url: string): Promise<string> {
        callCount++;
        if (url.includes("marketwatch")) return VALID_RSS;
        throw new Error("should not be called");
      },
    };

    const result = await fetchTradingEconomicsStream(mockClient);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.source === "tradingeconomics")).toBe(true);
    expect(callCount).toBe(1);
  });

  it("Test 2: Feed 1 empty, Feed 2 (GNEWS_MACRO) wins", async () => {
    const mockClient: HttpClient = {
      async get(url: string): Promise<string> {
        if (url.includes("marketwatch")) return EMPTY_RSS;
        if (url.includes("global+economy")) return VALID_RSS;
        throw new Error("should not reach Feed 3");
      },
    };

    const result = await fetchTradingEconomicsStream(mockClient);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.source === "tradingeconomics")).toBe(true);
  });

  it("Test 3: Feeds 1 and 2 empty, Feed 3 (GNEWS_MARKETS) wins", async () => {
    const mockClient: HttpClient = {
      async get(url: string): Promise<string> {
        if (url.includes("marketwatch")) return EMPTY_RSS;
        if (url.includes("global+economy")) return EMPTY_RSS;
        if (url.includes("financial+markets")) return VALID_RSS;
        throw new Error("unexpected URL: " + url);
      },
    };

    const result = await fetchTradingEconomicsStream(mockClient);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.source === "tradingeconomics")).toBe(true);
  });

  it("Test 4: All three feeds empty — returns []", async () => {
    const mockClient: HttpClient = {
      async get(_url: string): Promise<string> {
        return EMPTY_RSS;
      },
    };

    const result = await fetchTradingEconomicsStream(mockClient);

    expect(result).toEqual([]);
  });

  it("Test 5: HTTP error on Feed 1 falls through to Feed 2", async () => {
    const mockClient: HttpClient = {
      async get(url: string): Promise<string> {
        if (url.includes("marketwatch")) throw new Error("network timeout");
        if (url.includes("global+economy")) return VALID_RSS;
        throw new Error("should not reach Feed 3");
      },
    };

    const result = await fetchTradingEconomicsStream(mockClient);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.source === "tradingeconomics")).toBe(true);
  });
});
