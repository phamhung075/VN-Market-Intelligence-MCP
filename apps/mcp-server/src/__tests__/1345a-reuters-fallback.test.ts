/**
 * Task 1345a — Reuters + TE Fallback Sources
 *
 * Tests:
 *   1. readLatestReutersTimestamp returns null when no reuters rows
 *   2. readLatestReutersTimestamp returns correct max timestamp from reuters rows
 *   3. watchdog emits alert-sent when reuters stale but VN news fresh
 *   4. watchdog does NOT alert when reuters is fresh
 *   5. pollNews fallback: newsapi called when reuters push absent >90min
 *   6. pollNews fallback: newsapi items through same normalize pipeline
 *   7. pollNews: all-sources-dark sends single Telegram bug alert, not repeated
 *   8. circuit breakers for newsapi and marketwatch independent of reuters CB
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
// readLatestReutersTimestamp / readLatestTeTimestamp removed — Reuters and
// TradingEconomics are bundled inside vn-news-fetch.service (not standalone VPS units).
import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
import { fetchNewsApi } from "../infrastructure/fetchers/newsapi.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests 5 & 6 — pollNews fallback chain (isolated DB via option injection)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1345a — pollNews newsapi fallback", () => {
  let db: Database;

  beforeEach(() => {
    // Use an isolated :memory: DB for each pollNews test — passed as `db` option
    // so pollNews does NOT call getDb() at all.
    const { Database: BunDatabase } = require("bun:sqlite");
    db = new BunDatabase(":memory:");
    const { initDatabase } = require("../infrastructure/db/schema.js");
    initDatabase(db);
  });

  it("calls newsapi fetcher when reuters push absent >90min", async () => {
    let newsapiFetcherCalled = false;

    await pollNews({
      db,
      fetchers: {
        reuters: async () => [],
        cafef: async () => [],
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        newsapi: async () => {
          newsapiFetcherCalled = true;
          return [
            {
              title: "Vietnam GDP growth beats expectations",
              url: "https://newsapi.example.com/vn-gdp",
              source: "newsapi",
              publishedAt: new Date().toISOString(),
              content: "Vietnam's economy expanded faster than forecast.",
            },
          ];
        },
      },
      reutersLastPushTs: new Date(Date.now() - 120 * 60 * 1000),
    });

    expect(newsapiFetcherCalled).toBe(true);
  });

  it("newsapi items pass through same normalize pipeline as other sources", async () => {
    const newsapiUrl = "https://newsapi.example.com/vn-inflation-unique-1345a";

    const result = await pollNews({
      db,
      fetchers: {
        reuters: async () => [],
        cafef: async () => [],
        vnexpress: async () => [],
        vneconomy: async () => [],
        tradingeconomics: async () => [],
        newsapi: async () => [
          {
            title: "Vietnam inflation falls to 3.2%",
            url: newsapiUrl,
            source: "newsapi",
            publishedAt: new Date().toISOString(),
            content: "Consumer prices declined amid cooling demand.",
          },
        ],
      },
      reutersLastPushTs: new Date(Date.now() - 120 * 60 * 1000),
    });

    // Item was fetched through the pipeline
    expect(result.fetched).toBeGreaterThanOrEqual(1);

    // Confirm the rag_analyses row was inserted, identified by source_url
    // sourceType is always "news" from normalizer (by design, not a bug)
    const row = db
      .prepare("SELECT source_url, source_type FROM rag_analyses WHERE source_url = ? LIMIT 1")
      .get(newsapiUrl) as { source_url: string; source_type: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.source_url).toBe(newsapiUrl);
    expect(row!.source_type).toBe("news");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7 — all-sources-dark: single Telegram bug alert, not repeated
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1345a — all-sources-dark dedup", () => {
  let db: Database;

  beforeEach(() => {
    const { Database: BunDatabase } = require("bun:sqlite");
    db = new BunDatabase(":memory:");
    const { initDatabase } = require("../infrastructure/db/schema.js");
    initDatabase(db);
    _resetAllDarkAlert();
  });

  it("sends single Telegram bug alert when all sources dark, does not repeat within 4h window", async () => {
    const bugAlerts: string[] = [];

    const allEmptyFetchers = {
      reuters: async () => [],
      cafef: async () => [],
      vnexpress: async () => [],
      vneconomy: async () => [],
      tradingeconomics: async () => [],
    };

    const opts = {
      db,
      fetchers: allEmptyFetchers,
      reutersLastPushTs: new Date(Date.now() - 120 * 60 * 1000),
      onAllSourcesDark: async (msg: string) => {
        bugAlerts.push(msg);
      },
    };

    // First call — should trigger alert
    await pollNews(opts);
    const firstCount = bugAlerts.length;

    // Second call immediately — must NOT send another alert (4h cooldown active)
    await pollNews(opts);
    const secondCount = bugAlerts.length;

    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8 — circuit breakers for newsapi and marketwatch are independent
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1345a — circuit breaker independence", () => {
  it("newsapi and marketwatch breakers are independent of reuters CB", () => {
    expect(breakers.newsapi).toBeDefined();
    expect(breakers.marketwatch).toBeDefined();
    expect(breakers.reuters).toBeDefined();

    // Must be distinct objects
    expect(breakers.newsapi).not.toBe(breakers.reuters);
    expect(breakers.marketwatch).not.toBe(breakers.reuters);
    expect(breakers.newsapi).not.toBe(breakers.marketwatch);

    // Resetting reuters must not affect newsapi or marketwatch states
    const initialNewsapiState = breakers.newsapi.stats.state;
    const initialMwState = breakers.marketwatch.stats.state;
    breakers.reuters.reset();

    expect(breakers.newsapi.stats.state).toBe(initialNewsapiState);
    expect(breakers.marketwatch.stats.state).toBe(initialMwState);
  });
});


// fetchNewsApi stub — pure function, no DB needed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1345a — fetchNewsApi stub", () => {
  it("returns empty array when apiKey is empty (safe no-key path)", async () => {
    const result = await fetchNewsApi({ apiKey: "", enabled: true });
    expect(result).toEqual([]);
  });

  it("returns empty array when enabled is false", async () => {
    const result = await fetchNewsApi({ apiKey: "some-key", enabled: false });
    expect(result).toEqual([]);
  });
});
