/**
 * Task 1799 — TDD: Trading Economics Chromium News Fetcher
 *
 * Covers:
 *   AC-1  extractTeNewsItems parses title from .te-stream-title-div a
 *   AC-2  extractTeNewsItems parses full URL (relative href → absolute)
 *   AC-3  extractTeNewsItems parses summary from span.te-stream-item-description
 *   AC-4  extractTeNewsItems parses category from a.badge.te-stream-category
 *   AC-5  extractTeNewsItems parses raw date from small.te-stream-date
 *   AC-6  extractTeNewsItems limits results to `limit` param
 *   AC-7  fetchTradingEconomicsNews returns cached result when cache age < 30 min
 *   AC-8  fetchTradingEconomicsNews re-scrapes when cache age >= 30 min
 *   AC-9  fetchTradingEconomicsNews returns stale cache (< 2h) on scrape failure
 *   AC-10 fetchTradingEconomicsNews returns [] on scrape failure + no cache
 *   AC-11 parseRelativeDate: "2 hours ago" → approx now - 2h
 *   AC-12 parseRelativeDate: "3 days ago"  → approx now - 3d
 *   AC-13 parseRelativeDate: "1 week ago"  → approx now - 7d
 *   AC-14 parseRelativeDate: "30 minutes ago" → approx now - 30min
 *   AC-15 parseRelativeDate: unknown format → now
 *   AC-16 source field is always 'trading_economics'
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  extractTeNewsItems,
  parseRelativeDate,
  fetchTradingEconomicsNews,
  type TENewsItem,
  type TeNewsDeps,
} from "../infrastructure/fetchers/tradingEconomicsChromium.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSampleHtml(count = 3): string {
  const items = Array.from({ length: count }, (_, i) => `
    <li class="te-stream-item">
      <div class="te-stream-title-div">
        <a href="/vietnam/gdp-growth-rate-news/${i + 1}">Vietnam GDP grows ${i + 1}%</a>
      </div>
      <span class="te-stream-item-description">Summary of article ${i + 1}.</span>
      <small class="te-stream-date">${(i + 1) * 2} hours ago</small>
      <a class="badge te-stream-category" href="/category/gdp">GDP</a>
    </li>
  `).join("\n");
  return `<html><body><ul id="stream">${items}</ul></body></html>`;
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "te-news-test-"));
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: title extraction
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-1: extractTeNewsItems parses title", () => {
  it("extracts title from .te-stream-title-div a", () => {
    const html = makeSampleHtml(1);
    const items = extractTeNewsItems(html, 10);
    expect(items[0]?.title).toBe("Vietnam GDP grows 1%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: full URL construction
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-2: extractTeNewsItems builds full URL", () => {
  it("prepends https://tradingeconomics.com to relative href", () => {
    const html = makeSampleHtml(1);
    const items = extractTeNewsItems(html, 10);
    expect(items[0]?.url).toBe("https://tradingeconomics.com/vietnam/gdp-growth-rate-news/1");
  });

  it("does not double-prefix an already-absolute URL", () => {
    const html = `<html><body><ul id="stream">
      <li class="te-stream-item">
        <div class="te-stream-title-div">
          <a href="https://tradingeconomics.com/vietnam/news/absolute">Absolute</a>
        </div>
        <span class="te-stream-item-description">desc</span>
        <small class="te-stream-date">1 hour ago</small>
        <a class="badge te-stream-category">Inflation</a>
      </li>
    </ul></body></html>`;
    const items = extractTeNewsItems(html, 10);
    expect(items[0]?.url).toBe("https://tradingeconomics.com/vietnam/news/absolute");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: summary extraction
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-3: extractTeNewsItems parses summary", () => {
  it("extracts summary from span.te-stream-item-description", () => {
    const html = makeSampleHtml(1);
    const items = extractTeNewsItems(html, 10);
    expect(items[0]?.summary).toBe("Summary of article 1.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: category extraction
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-4: extractTeNewsItems parses category", () => {
  it("extracts category from a.badge.te-stream-category", () => {
    const html = makeSampleHtml(1);
    const items = extractTeNewsItems(html, 10);
    expect(items[0]?.category).toBe("GDP");
  });

  it("returns empty string when category badge is absent", () => {
    const html = `<html><body><ul id="stream">
      <li class="te-stream-item">
        <div class="te-stream-title-div"><a href="/v">Title</a></div>
        <span class="te-stream-item-description">desc</span>
        <small class="te-stream-date">1 hour ago</small>
      </li>
    </ul></body></html>`;
    const items = extractTeNewsItems(html, 10);
    expect(items[0]?.category).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: date extraction
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-5: extractTeNewsItems parses raw date string", () => {
  it("extracts raw date string from small.te-stream-date", () => {
    const html = makeSampleHtml(1);
    const items = extractTeNewsItems(html, 10);
    expect(items[0]?.date).toBe("2 hours ago");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: limit enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-6: extractTeNewsItems respects limit param", () => {
  it("returns at most limit items from a longer list", () => {
    const html = makeSampleHtml(10);
    const items = extractTeNewsItems(html, 5);
    expect(items.length).toBe(5);
  });

  it("returns all items when count < limit", () => {
    const html = makeSampleHtml(2);
    const items = extractTeNewsItems(html, 20);
    expect(items.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: cache hit (age < 30 min)
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-7: fetchTradingEconomicsNews returns cached result when < 30 min old", () => {
  it("does not call scrape when cache is fresh", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news-cache.json");

    const cached: TENewsItem[] = [{
      title: "Cached title",
      url: "https://tradingeconomics.com/cached",
      summary: "Cached summary",
      date: "1 hour ago",
      category: "GDP",
      source: "trading_economics",
    }];

    fs.writeFileSync(cachePath, JSON.stringify({
      cachedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
      data: cached,
    }));

    let scrapeCalled = false;
    const deps: TeNewsDeps = {
      scrape: async () => { scrapeCalled = true; return makeSampleHtml(1); },
      cachePath,
    };

    const result = await fetchTradingEconomicsNews(20, deps);
    expect(scrapeCalled).toBe(false);
    expect(result[0]?.title).toBe("Cached title");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: cache expired (age >= 30 min) → re-scrape
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-8: fetchTradingEconomicsNews re-scrapes when cache >= 30 min old", () => {
  it("calls scrape and updates cache when cache is stale", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news-cache.json");

    const staleItem: TENewsItem = {
      title: "Stale title",
      url: "https://tradingeconomics.com/stale",
      summary: "Stale summary",
      date: "3 hours ago",
      category: "CPI",
      source: "trading_economics",
    };

    fs.writeFileSync(cachePath, JSON.stringify({
      cachedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 min ago
      data: [staleItem],
    }));

    let scrapeCalled = false;
    const deps: TeNewsDeps = {
      scrape: async () => { scrapeCalled = true; return makeSampleHtml(2); },
      cachePath,
    };

    const result = await fetchTradingEconomicsNews(20, deps);
    expect(scrapeCalled).toBe(true);
    // Result should contain freshly scraped data, not the stale item
    expect(result[0]?.title).toBe("Vietnam GDP grows 1%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9: scrape failure + stale cache < 2h → return stale cache
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-9: fetchTradingEconomicsNews returns stale cache on failure (< 2h)", () => {
  it("serves cache when scrape fails and cache is < 2h old", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news-cache.json");

    const staleItem: TENewsItem = {
      title: "Stale fallback",
      url: "https://tradingeconomics.com/stale",
      summary: "desc",
      date: "45 min ago",
      category: "Trade",
      source: "trading_economics",
    };

    // Cache is 90 min old (expired 30-min TTL, but within 2h stale window)
    fs.writeFileSync(cachePath, JSON.stringify({
      cachedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      data: [staleItem],
    }));

    const deps: TeNewsDeps = {
      scrape: async () => { throw new Error("Network timeout"); },
      cachePath,
    };

    const result = await fetchTradingEconomicsNews(20, deps);
    expect(result[0]?.title).toBe("Stale fallback");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10: scrape failure + no cache → return []
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-10: fetchTradingEconomicsNews returns [] on failure with no cache", () => {
  it("returns empty array when scrape fails and no cache exists", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news-cache.json");
    // No cache file written

    const deps: TeNewsDeps = {
      scrape: async () => { throw new Error("Connection refused"); },
      cachePath,
    };

    const result = await fetchTradingEconomicsNews(20, deps);
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11: parseRelativeDate — "2 hours ago"
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-11: parseRelativeDate '2 hours ago'", () => {
  it("returns ISO string approx 2h before now", () => {
    const before = Date.now();
    const iso = parseRelativeDate("2 hours ago");
    const after = Date.now();
    const ts = new Date(iso).getTime();
    const expected = before - 2 * 3600 * 1000;
    expect(ts).toBeGreaterThanOrEqual(expected - 5000);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-12: parseRelativeDate — "3 days ago"
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-12: parseRelativeDate '3 days ago'", () => {
  it("returns ISO string approx 3 days before now", () => {
    const before = Date.now();
    const iso = parseRelativeDate("3 days ago");
    const ts = new Date(iso).getTime();
    const expected = before - 3 * 24 * 3600 * 1000;
    expect(ts).toBeGreaterThanOrEqual(expected - 5000);
    expect(ts).toBeLessThanOrEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-13: parseRelativeDate — "1 week ago"
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-13: parseRelativeDate '1 week ago'", () => {
  it("returns ISO string approx 7 days before now", () => {
    const before = Date.now();
    const iso = parseRelativeDate("1 week ago");
    const ts = new Date(iso).getTime();
    const expected = before - 7 * 24 * 3600 * 1000;
    expect(ts).toBeGreaterThanOrEqual(expected - 5000);
    expect(ts).toBeLessThanOrEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-14: parseRelativeDate — "30 minutes ago"
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-14: parseRelativeDate '30 minutes ago'", () => {
  it("returns ISO string approx 30 min before now", () => {
    const before = Date.now();
    const iso = parseRelativeDate("30 minutes ago");
    const ts = new Date(iso).getTime();
    const expected = before - 30 * 60 * 1000;
    expect(ts).toBeGreaterThanOrEqual(expected - 5000);
    expect(ts).toBeLessThanOrEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-15: parseRelativeDate — unknown format → returns current time
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-15: parseRelativeDate unknown format returns current time", () => {
  it("returns ISO string close to now for unrecognised input", () => {
    const before = Date.now();
    const iso = parseRelativeDate("yesterday afternoon");
    const ts = new Date(iso).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-16: source field is always 'trading_economics'
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-16: source is always 'trading_economics'", () => {
  it("sets source to 'trading_economics' on every extracted item", () => {
    const html = makeSampleHtml(3);
    const items = extractTeNewsItems(html, 10);
    expect(items.every((i) => i.source === "trading_economics")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-17: "Target closed" → retry succeeds (1815c)
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-17: fetchTradingEconomicsNews retries once on 'Target closed'", () => {
  it("returns fresh data when first scrape throws Target closed and second succeeds", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news-cache-retry.json");
    // No cache — forces a scrape attempt

    let callCount = 0;
    const deps: TeNewsDeps = {
      scrape: async () => {
        callCount++;
        if (callCount === 1) throw new Error("Protocol error (Runtime.callFunctionOn): Target closed");
        return makeSampleHtml(1);
      },
      cachePath,
    };

    const result = await fetchTradingEconomicsNews(20, deps);
    expect(callCount).toBe(2);
    expect(result[0]?.title).toBe("Vietnam GDP grows 1%");
  });

  it("returns [] when both attempts throw Target closed", async () => {
    const tmpDir = makeTmpDir();
    const cachePath = path.join(tmpDir, "te-news-cache-retry2.json");

    const deps: TeNewsDeps = {
      scrape: async () => { throw new Error("Protocol error (Runtime.callFunctionOn): Target closed"); },
      cachePath,
    };

    const result = await fetchTradingEconomicsNews(20, deps);
    expect(result).toEqual([]);
  });
});
