Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1798 — Trading Economics Puppeteer/Chromium Scraper
 *
 * Tests for:
 *   - Puppeteer browser is NOT launched in tests (fully mocked)
 *   - Structured MacroIndicators[] returned from mocked page content
 *   - 6-hour cache: second call within 6h returns cached data (no browser launch)
 *   - Cache miss after 6h: triggers re-scrape
 *   - On scrape failure: returns cached data if < 12h old
 *   - On scrape failure + cache > 12h old: returns []
 *   - On scrape failure + no cache: returns []
 *   - Cache stored at injected path (not hard-coded /app/data)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  fetchTradingEconomicsChromium,
  type TeChromiumDeps,
  type TeCacheEntry,
} from "../infrastructure/fetchers/tradingEconomicsChromium.js";
import type { MacroIndicators } from "../infrastructure/fetchers/tradingEconomics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "te-chromium-test-"));
const CACHE_FILE = path.join(TMP_DIR, "te-cache.json");

function writeCacheEntry(entry: TeCacheEntry): void {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(entry), "utf-8");
}

function readCache(): TeCacheEntry {
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as TeCacheEntry;
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

/** Mock scraper that returns good data */
function makeSuccessfulScraper(indicators: MacroIndicators): TeChromiumDeps["scrape"] {
  return async (_url: string) => indicators;
}

/** Mock scraper that always throws */
function makeFailingScraper(msg = "browser error"): TeChromiumDeps["scrape"] {
  return async (_url: string) => { throw new Error(msg); };
}

const GOOD_DATA: MacroIndicators = {
  country: "vietnam",
  cpi: 3.1,
  gdpGrowth: 7.4,
  interestRate: 4.5,
  fetchedAt: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
});

afterEach(() => {
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
});

describe("Task 1798 — TradingEconomics Chromium scraper", () => {

  // ── TEC-01: Fresh scrape — no cache ──────────────────────────────────────
  describe("TEC-01: no cache → scrape → return data + write cache", () => {
    it("returns MacroIndicators from scraper when no cache exists", async () => {
      const deps: TeChromiumDeps = {
        scrape: makeSuccessfulScraper(GOOD_DATA),
        cachePath: CACHE_FILE,
      };
      const result = await fetchTradingEconomicsChromium(deps);
      expect(result).not.toBeNull();
      expect(result!.country).toBe("vietnam");
      expect(result!.cpi).toBeCloseTo(3.1, 1);
      expect(result!.gdpGrowth).toBeCloseTo(7.4, 1);
    });

    it("writes cache file after successful scrape", async () => {
      const deps: TeChromiumDeps = {
        scrape: makeSuccessfulScraper(GOOD_DATA),
        cachePath: CACHE_FILE,
      };
      await fetchTradingEconomicsChromium(deps);
      expect(fs.existsSync(CACHE_FILE)).toBe(true);
      const cached = readCache();
      expect(cached.data.cpi).toBeCloseTo(3.1, 1);
    });
  });

  // ── TEC-02: Cache hit within 6h → no scrape ──────────────────────────────
  describe("TEC-02: cache < 6h old → return cached, do NOT invoke scraper", () => {
    it("returns cached data without calling scraper", async () => {
      writeCacheEntry({ cachedAt: hoursAgo(2), data: GOOD_DATA });

      let scraperCalled = false;
      const deps: TeChromiumDeps = {
        scrape: async (_url: string) => {
          scraperCalled = true;
          return GOOD_DATA;
        },
        cachePath: CACHE_FILE,
      };

      const result = await fetchTradingEconomicsChromium(deps);
      expect(scraperCalled).toBe(false);
      expect(result!.cpi).toBeCloseTo(3.1, 1);
    });

    it("returns cached data when cache is 5h 59m old", async () => {
      writeCacheEntry({ cachedAt: hoursAgo(5.98), data: GOOD_DATA });
      const deps: TeChromiumDeps = {
        scrape: makeFailingScraper("should not be called"),
        cachePath: CACHE_FILE,
      };
      const result = await fetchTradingEconomicsChromium(deps);
      expect(result).not.toBeNull();
    });
  });

  // ── TEC-03: Cache expired (> 6h) → re-scrape ─────────────────────────────
  describe("TEC-03: cache > 6h old → scrape fresh data", () => {
    it("calls scraper when cache is 7h old", async () => {
      const staleData: MacroIndicators = { ...GOOD_DATA, cpi: 1.0 };
      writeCacheEntry({ cachedAt: hoursAgo(7), data: staleData });

      const deps: TeChromiumDeps = {
        scrape: makeSuccessfulScraper(GOOD_DATA),
        cachePath: CACHE_FILE,
      };

      const result = await fetchTradingEconomicsChromium(deps);
      // Should return fresh scrape, not stale cache
      expect(result!.cpi).toBeCloseTo(3.1, 1);
    });
  });

  // ── TEC-04: Scrape failure + cache < 12h → return stale cache ────────────
  describe("TEC-04: scrape fails + cache < 12h → return stale cache", () => {
    it("returns stale cached data (8h old) when scraper throws", async () => {
      writeCacheEntry({ cachedAt: hoursAgo(8), data: GOOD_DATA });
      const deps: TeChromiumDeps = {
        scrape: makeFailingScraper("chromium crashed"),
        cachePath: CACHE_FILE,
      };
      const result = await fetchTradingEconomicsChromium(deps);
      expect(result).not.toBeNull();
      expect(result!.cpi).toBeCloseTo(3.1, 1);
    });
  });

  // ── TEC-05: Scrape failure + cache > 12h → return null ────────────────────
  describe("TEC-05: scrape fails + cache > 12h → return null", () => {
    it("returns null when scraper throws and cache is 13h old", async () => {
      writeCacheEntry({ cachedAt: hoursAgo(13), data: GOOD_DATA });
      const deps: TeChromiumDeps = {
        scrape: makeFailingScraper("network down"),
        cachePath: CACHE_FILE,
      };
      const result = await fetchTradingEconomicsChromium(deps);
      expect(result).toBeNull();
    });
  });

  // ── TEC-06: Scrape failure + no cache → return null ───────────────────────
  describe("TEC-06: scrape fails + no cache → return null", () => {
    it("returns null when scraper throws and no cache file exists", async () => {
      const deps: TeChromiumDeps = {
        scrape: makeFailingScraper("no internet"),
        cachePath: CACHE_FILE,
      };
      const result = await fetchTradingEconomicsChromium(deps);
      expect(result).toBeNull();
    });
  });

  // ── TEC-07: Cache boundary — exactly 6h ───────────────────────────────────
  describe("TEC-07: cache exactly at 6h boundary", () => {
    it("treats exactly 6h as expired and scrapes fresh", async () => {
      const staleData: MacroIndicators = { ...GOOD_DATA, cpi: 0.5 };
      writeCacheEntry({ cachedAt: hoursAgo(6), data: staleData });
      const deps: TeChromiumDeps = {
        scrape: makeSuccessfulScraper(GOOD_DATA),
        cachePath: CACHE_FILE,
      };
      const result = await fetchTradingEconomicsChromium(deps);
      expect(result!.cpi).toBeCloseTo(3.1, 1);
    });
  });

  // ── TEC-08: Never throws — always returns MacroIndicators | null ──────────
  describe("TEC-08: function never throws", () => {
    it("does not throw even when scraper explodes with no cache", async () => {
      const deps: TeChromiumDeps = {
        scrape: async () => { throw new Error("SEGFAULT"); },
        cachePath: CACHE_FILE,
      };
      let threw = false;
      try {
        await fetchTradingEconomicsChromium(deps);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });
});
