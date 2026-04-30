/**
 * Infrastructure — Trading Economics Playwright/Chromium Scraper
 *
 * Scrapes https://tradingeconomics.com/vietnam/indicators using a headless
 * Chromium browser (Playwright) because the page is a React SPA — plain
 * HTTP/cheerio only returns skeleton HTML with no indicator values.
 *
 * Design decisions:
 *   - 6-hour result cache persisted to JSON (default /app/data/te-cache.json)
 *     to avoid hammering the site.
 *   - On scrape failure: returns cached data if < 12h old, else returns null.
 *   - The `scrape` function is injected (TeChromiumDeps) so tests mock it
 *     without launching a real browser.
 *   - Never throws — all errors are caught and result in null.
 *   - Stealth headers: realistic User-Agent + Accept-Language.
 *
 * Returns MacroIndicators matching the existing tradingEconomics.ts interface
 * so callers can swap between the two transparently.
 *
 * Layer: infrastructure/fetchers — may use HTTP/browser/fs; must not import domain/.
 *
 * @module infrastructure/fetchers/tradingEconomicsChromium
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../logger.js";
import type { MacroIndicators } from "./tradingEconomics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Target URL for the Vietnam macro indicators page. */
const TE_URL = "https://tradingeconomics.com/vietnam/indicators";

/** Cache TTL: re-scrape after 6 hours. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Stale-cache fallback window: use cache up to 12 hours after expiry on failure. */
const STALE_CACHE_MAX_MS = 12 * 60 * 60 * 1000;

/** Default cache file path inside Docker data volume. */
const DEFAULT_CACHE_FILE = "/app/data/te-cache.json";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Persisted cache record. */
export interface TeCacheEntry {
  /** ISO timestamp when the data was scraped. */
  cachedAt: string;
  /** Scraped macro indicators. */
  data: MacroIndicators;
}

/**
 * Dependency injection interface for testability.
 *
 * @property scrape    - Function that does the actual browser scrape.
 *                       In production this uses Playwright; in tests it is mocked.
 * @property cachePath - Override for the JSON cache file path (default /app/data/te-cache.json).
 */
export interface TeChromiumDeps {
  scrape: (url: string) => Promise<MacroIndicators>;
  cachePath?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function readCache(cachePath: string): TeCacheEntry | null {
  try {
    const raw = fs.readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TeCacheEntry>;
    if (
      typeof parsed.cachedAt === "string" &&
      parsed.data != null &&
      typeof parsed.data === "object"
    ) {
      return parsed as TeCacheEntry;
    }
  } catch {
    // File missing or corrupt
  }
  return null;
}

function writeCache(entry: TeCacheEntry, cachePath: string): void {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${cachePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entry), "utf-8");
    fs.renameSync(tmp, cachePath);
  } catch (err) {
    logger.warn("[te-chromium] failed to write cache", {
      cachePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function cacheAgeMs(entry: TeCacheEntry): number {
  return Date.now() - new Date(entry.cachedAt).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Production Playwright scraper (lazy-loaded to avoid import errors when
// playwright-core is not installed — callers that inject deps never reach this)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Launches a headless Chromium instance via Playwright and extracts the three
 * key macro indicators from the Trading Economics Vietnam indicators page.
 *
 * Selector strategy:
 *   1. Wait for `table.table` or `div[data-field]` (≤ 20 s timeout).
 *   2. Walk rows looking for GDP Growth Rate, Inflation Rate, Interest Rate.
 *   3. Extract the numeric value from the adjacent cell.
 *
 * This function is never called in tests (deps.scrape is mocked).
 */
export async function playwrightScrape(url: string): Promise<MacroIndicators> {
  // Dynamic import so TypeScript does not require playwright to be installed
  // at compile time — the Docker image installs it at build time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { chromium } = (await import("playwright-core")) as any;

  // Honour the system Chromium path set in the Docker image via the
  // PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var, so playwright-core uses the
  // already-installed system package instead of downloading its own binary.
  const executablePath =
    Bun.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] ?? undefined;

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const fetchedAt = new Date().toISOString();
  const nullResult: MacroIndicators = {
    country: "vietnam",
    cpi: null,
    gdpGrowth: null,
    interestRate: null,
    fetchedAt,
  };

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    const page = await context.newPage();

    logger.info("[te-chromium] launching Chromium scrape", { url });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for the indicators table to appear
    try {
      await page.waitForSelector("table.table, div[data-field]", { timeout: 20_000 });
    } catch {
      logger.warn("[te-chromium] timeout waiting for indicators table");
    }

    const html = await page.content();

    // Parse the HTML with cheerio (already a dependency)
    const { load } = await import("cheerio");
    const $ = load(html);

    const INDICATOR_MAP: Array<{
      key: keyof Pick<MacroIndicators, "cpi" | "gdpGrowth" | "interestRate">;
      labels: string[];
    }> = [
      { key: "cpi", labels: ["inflation rate", "cpi"] },
      { key: "gdpGrowth", labels: ["gdp growth rate", "gdp growth"] },
      { key: "interestRate", labels: ["interest rate"] },
    ];

    const result: MacroIndicators = { ...nullResult };

    for (const { key, labels } of INDICATOR_MAP) {
      const found: string[] = [];
      $("td").each((_idx: number, el: unknown) => {
        if (found.length > 0) return;
        const cellText = $(el as never)
          .text()
          .trim()
          .toLowerCase();
        const matched = labels.some(
          (label) => cellText === label || cellText.includes(label),
        );
        if (!matched) return;

        const nextTd = $(el as never).nextAll("td").first();
        if (nextTd.length > 0) {
          found.push(nextTd.text().trim());
          return;
        }
        const row = $(el as never).closest("tr");
        row.find("td").each((_i: number, cell: unknown) => {
          if (found.length > 0) return;
          if (cell === el) return;
          const raw = $(cell as never).text().trim();
          if (/^[-\d.]/.test(raw)) found.push(raw);
        });
      });

      if (found.length > 0 && found[0] !== undefined) {
        const cleaned = found[0].replace(/%/g, "").trim();
        const numMatch = cleaned.match(/^[-\d.]+/);
        if (numMatch) {
          const parsed = parseFloat(numMatch[0]);
          if (!isNaN(parsed)) result[key] = parsed;
        }
      }
    }

    logger.info("[te-chromium] scraped indicators", {
      cpi: result.cpi,
      gdpGrowth: result.gdpGrowth,
      interestRate: result.interestRate,
    });

    return result;
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches Vietnam macro indicators via Playwright/Chromium with a 6-hour cache.
 *
 * Cache strategy:
 *   - Cache age < 6h  → return cached data (no browser launch)
 *   - Cache age ≥ 6h  → attempt fresh scrape; update cache on success
 *   - Scrape failure + cache < 12h → return stale cache
 *   - Scrape failure + cache ≥ 12h → return null
 *   - Scrape failure + no cache    → return null
 *
 * @param deps - Injectable scraper and cache path (default: production Playwright + /app/data/te-cache.json)
 * @returns MacroIndicators on success, null on total failure
 */
export async function fetchTradingEconomicsChromium(
  deps?: Partial<TeChromiumDeps>,
): Promise<MacroIndicators | null> {
  const cachePath = deps?.cachePath ?? DEFAULT_CACHE_FILE;
  const scrape = deps?.scrape ?? playwrightScrape;

  try {
    // ── Check cache ──────────────────────────────────────────────────────────
    const cached = readCache(cachePath);
    if (cached !== null) {
      const ageMs = cacheAgeMs(cached);
      if (ageMs < CACHE_TTL_MS) {
        logger.debug("[te-chromium] returning cached indicators", {
          ageMinutes: Math.round(ageMs / 60_000),
        });
        return cached.data;
      }
    }

    // ── Attempt fresh scrape ─────────────────────────────────────────────────
    try {
      const fresh = await scrape(TE_URL);
      const entry: TeCacheEntry = {
        cachedAt: new Date().toISOString(),
        data: fresh,
      };
      writeCache(entry, cachePath);
      return fresh;
    } catch (scrapeErr) {
      logger.error("[te-chromium] scrape failed", {
        error: scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr),
      });

      // Fall back to stale cache if < 12h old
      if (cached !== null) {
        const ageMs = cacheAgeMs(cached);
        if (ageMs < STALE_CACHE_MAX_MS) {
          logger.warn("[te-chromium] returning stale cached indicators after scrape failure", {
            ageMinutes: Math.round(ageMs / 60_000),
          });
          return cached.data;
        }
        logger.warn("[te-chromium] stale cache too old — returning null", {
          ageHours: Math.round(ageMs / 3_600_000),
        });
      }

      return null;
    }
  } catch (outerErr) {
    // Safety net — this function must never throw
    logger.error("[te-chromium] unexpected error", {
      error: outerErr instanceof Error ? outerErr.message : String(outerErr),
    });
    return null;
  }
}
