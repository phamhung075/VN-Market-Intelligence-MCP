/**
 * Task 1821a — TDD: pollNews teChromiumNews 0-item cold-start retry
 *
 * Covers:
 *   AC-1  When teChromiumNews returns [] on first call and real data on second,
 *         the final result includes items from the second call (retry succeeded).
 *   AC-2  When teChromiumNews returns [] on both calls, result has 0 fetched items
 *         from that source (no infinite loop, no error thrown).
 *   AC-3  When teChromiumNews returns items on first call, fetcher is called only
 *         once (no unnecessary retry).
 *   AC-4  sleepMs is called with 2000 when the first result is empty.
 *   AC-5  Other fetchers (cafef) are NOT retried even when they return [].
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { pollNews, _resetAllDarkAlert } from "../application/usecases/pollNews.js";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import type { RssItem } from "../infrastructure/fetchers/rss.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_ITEM: RssItem = {
  title:       "Vietnam GDP grows 3%",
  url:         "https://tradingeconomics.com/vietnam/gdp",
  content:     "Vietnam GDP expanded by 3 percent in Q1 2026.",
  publishedAt: new Date().toISOString(),
  source:      "tradingeconomics",
};

/** No-op sleep — keeps tests fast. */
const noopSleep = (_ms: number): Promise<void> => Promise.resolve();

// ─────────────────────────────────────────────────────────────────────────────
// DB lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  closeDb();
  initDatabase();
  _resetAllDarkAlert();
});

afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Retry delivers real data after cold-start []
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-1: teChromiumNews cold-start retry returns data from second call", () => {
  it("fetched count includes items from retry call when first returns []", async () => {
    let callCount = 0;
    const teChromiumNews = async (): Promise<RssItem[]> => {
      callCount++;
      return callCount === 1 ? [] : [SAMPLE_ITEM];
    };

    const result = await pollNews({
      db:             getDb(),
      watchlist:      [],
      fetchers: {
        cafef:        async () => [],
        vnexpress:    async () => [],
        reuters:      async () => [],
        vneconomy:    async () => [],
        tradingeconomics: async () => [],
        teChromiumNews,
      },
      sleepMs:   noopSleep,
      ragRetriever: async () => [],
    });

    expect(callCount).toBe(2);
    expect(result.fetched).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: Both calls empty — no crash, fetched = 0 from that source
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-2: teChromiumNews returns [] on both retry calls — no error", () => {
  it("result.fetched is 0 and no exception is thrown", async () => {
    const teChromiumNews = async (): Promise<RssItem[]> => [];

    let threw = false;
    let result;
    try {
      result = await pollNews({
        db:        getDb(),
        watchlist: [],
        fetchers: {
          cafef:        async () => [],
          vnexpress:    async () => [],
          reuters:      async () => [],
          vneconomy:    async () => [],
          tradingeconomics: async () => [],
          teChromiumNews,
        },
        sleepMs:      noopSleep,
        ragRetriever: async () => [],
        // suppress the all-dark Telegram alert
        onAllSourcesDark: async () => {},
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result?.fetched).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: First call returns data — fetcher called only once
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-3: teChromiumNews called only once when first result is non-empty", () => {
  it("callCount is 1 when first call returns data", async () => {
    let callCount = 0;
    const teChromiumNews = async (): Promise<RssItem[]> => {
      callCount++;
      return [SAMPLE_ITEM];
    };

    await pollNews({
      db:        getDb(),
      watchlist: [],
      fetchers: {
        cafef:        async () => [],
        vnexpress:    async () => [],
        reuters:      async () => [],
        vneconomy:    async () => [],
        tradingeconomics: async () => [],
        teChromiumNews,
      },
      sleepMs:      noopSleep,
      ragRetriever: async () => [],
    });

    expect(callCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: sleepMs is called with 2000 ms on cold-start empty result
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-4: sleepMs is invoked with 2000 when teChromiumNews first returns []", () => {
  it("sleepMs receives exactly 2000 ms argument", async () => {
    let sleepCalledWith: number | undefined;
    const trackingSleep = async (ms: number): Promise<void> => {
      sleepCalledWith = ms;
    };

    let callCount = 0;
    const teChromiumNews = async (): Promise<RssItem[]> => {
      callCount++;
      return callCount === 1 ? [] : [SAMPLE_ITEM];
    };

    await pollNews({
      db:        getDb(),
      watchlist: [],
      fetchers: {
        cafef:        async () => [],
        vnexpress:    async () => [],
        reuters:      async () => [],
        vneconomy:    async () => [],
        tradingeconomics: async () => [],
        teChromiumNews,
      },
      sleepMs:      trackingSleep,
      ragRetriever: async () => [],
    });

    expect(sleepCalledWith).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: cafef returning [] does NOT trigger sleep (only teChromiumNews retries)
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-5: cafef empty result does NOT trigger sleepMs", () => {
  it("sleepMs is not called when only cafef returns []", async () => {
    let sleepCalled = false;
    const trackingSleep = async (_ms: number): Promise<void> => {
      sleepCalled = true;
    };

    await pollNews({
      db:        getDb(),
      watchlist: [],
      fetchers: {
        cafef:        async () => [],
        vnexpress:    async () => [],
        reuters:      async () => [],
        vneconomy:    async () => [],
        tradingeconomics: async () => [],
        // teChromiumNews returns data on first call — no retry triggered
        teChromiumNews: async () => [SAMPLE_ITEM],
      },
      sleepMs:      trackingSleep,
      ragRetriever: async () => [],
      onAllSourcesDark: async () => {},
    });

    expect(sleepCalled).toBe(false);
  });
});
