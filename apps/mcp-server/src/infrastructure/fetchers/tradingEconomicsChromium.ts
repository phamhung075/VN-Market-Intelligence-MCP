/**
 * Infrastructure — Trading Economics Puppeteer/Chromium Scraper
 *
 * Scrapes https://tradingeconomics.com/vietnam/indicators using a headless
 * Chromium browser (puppeteer-core) because the page is a React SPA — plain
 * HTTP/cheerio only returns skeleton HTML with no indicator values.
 *
 * Also scrapes https://tradingeconomics.com/vietnam/news for the news feed
 * (Task 1799) — same SPA pattern, requires Puppeteer.
 *
 * Design decisions:
 *   - 6-hour result cache persisted to JSON (default /app/data/te-cache.json)
 *     to avoid hammering the site.
 *   - On scrape failure: returns cached data if < 12h old, else returns null.
 *   - News cache TTL: 30 minutes (default /app/data/te-news-cache.json).
 *   - On news scrape failure: serves stale cache up to 2h, else returns [].
 *   - The `scrape` function is injected (TeChromiumDeps / TeNewsDeps) so tests
 *     mock it without launching a real browser.
 *   - Never throws — all errors are caught and result in null / [].
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
import type { LaunchOptions } from "puppeteer-core";

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

/**
 * Realistic browser User-Agent used for all Trading Economics Chromium requests.
 * Centralised here so both playwrightScrape() and playwrightScrapeNews() stay in sync.
 */
export const TE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * URL patterns to block via Puppeteer request interception.
 * Drops analytics, tag managers and tracking pixels to reduce fingerprinting
 * surface and page-load time.
 *
 * Task 1834b — anti-bot hardening.
 */
export const TE_BLOCKED_PATTERNS: string[] = [
  "**/google-analytics.com/**",
  "**/googletagmanager.com/**",
  "**/doubleclick.net/**",
  "**/facebook.com/tr/**",
  "**/hotjar.com/**",
  "**/mixpanel.com/**",
];

/**
 * Returns the shared Puppeteer launch config for all Trading Economics Chromium scrapers.
 *
 * The 13 flags are the hardened set for headless Chromium inside Docker:
 *   - no-sandbox / disable-setuid-sandbox : required when running as root in Docker
 *   - disable-dev-shm-usage              : Docker default /dev/shm 64 MB is too small
 *   - disable-gpu / no-first-run / no-zygote : stability under constrained container env
 *   - NOTE: --single-process is intentionally omitted — it causes TargetCloseError
 *     on Chromium 147 when page.content() is called after domcontentloaded on SPAs.
 */
export function buildChromiumLaunchConfig(): LaunchOptions {
  return {
    executablePath:
      Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",      // use /tmp instead of /dev/shm (Docker default 64MB is too small)
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",                  // avoids zygote process crash in Docker
      // NOTE: --single-process is intentionally omitted — it causes TargetCloseError
      // on Chromium 147 when page.content() is called after domcontentloaded on SPAs.
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--hide-scrollbars",
      "--metrics-recording-only",
      "--mute-audio",
      "--safebrowsing-disable-auto-update",
      // Task 1834b — anti-bot hardening
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
    ],
    // Task 1834b — randomised viewport avoids fixed-size bot fingerprint
    defaultViewport: {
      width: 1280 + Math.floor(Math.random() * 200),
      height: 800 + Math.floor(Math.random() * 200),
    },
  };
}

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
 *                       In production this uses Puppeteer; in tests it is mocked.
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
// Production Puppeteer scraper (lazy-loaded to avoid import errors when
// puppeteer-core is not installed — callers that inject deps never reach this)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Launches a headless Chromium instance via puppeteer-core and extracts the
 * three key macro indicators from the Trading Economics Vietnam indicators page.
 *
 * Selector strategy:
 *   1. Wait for `table.table` (≤ 15 s timeout).
 *   2. Walk rows looking for GDP Growth Rate, Inflation Rate, Interest Rate.
 *   3. Extract the numeric value from the adjacent cell.
 *
 * This function is never called in tests (deps.scrape is mocked).
 */
export async function playwrightScrape(url: string): Promise<MacroIndicators> {
  // Dynamic import so TypeScript does not require puppeteer-core to be
  // installed at compile time — the Docker image installs it at build time.
  const puppeteer = (await import("puppeteer-core")).default;

  const browser = await puppeteer.launch(buildChromiumLaunchConfig());

  const fetchedAt = new Date().toISOString();
  const nullResult: MacroIndicators = {
    country: "vietnam",
    cpi: null,
    gdpGrowth: null,
    interestRate: null,
    fetchedAt,
  };

  try {
    const page = await browser.newPage();

    await page.setUserAgent(TE_USER_AGENT);

    // Task 1834b — block analytics/tracking requests to reduce fingerprint surface
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const reqUrl = req.url();
      const shouldBlock = TE_BLOCKED_PATTERNS.some((pat) => {
        // Convert glob-style "**/<host>/**" to a simple hostname check
        const host = pat.replace(/^\*\*\//, "").replace(/\/\*\*$/, "");
        return reqUrl.includes(host);
      });
      if (shouldBlock) {
        req.abort().catch(() => { /* ignore abort errors */ });
      } else {
        req.continue().catch(() => { /* ignore continue errors */ });
      }
    });

    // Task 1834b — random human-like delay before navigation
    await new Promise<void>((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1000)));

    logger.info("[te-chromium] launching Chromium scrape", { url });
    // domcontentloaded is faster and more stable on heavy SPAs than networkidle2.
    // waitForSelector below handles the "page is ready" signal.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for the indicators table to appear
    try {
      await page.waitForSelector("table.table", { timeout: 20_000 });
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
    try { await browser.close(); } catch { /* ignore teardown errors on crashed browser */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches Vietnam macro indicators via Puppeteer/Chromium with a 6-hour cache.
 *
 * Cache strategy:
 *   - Cache age < 6h  → return cached data (no browser launch)
 *   - Cache age ≥ 6h  → attempt fresh scrape; update cache on success
 *   - Scrape failure + cache < 12h → return stale cache
 *   - Scrape failure + cache ≥ 12h → return null
 *   - Scrape failure + no cache    → return null
 *
 * @param deps - Injectable scraper and cache path (default: production Puppeteer + /app/data/te-cache.json)
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

// ═════════════════════════════════════════════════════════════════════════════
// Task 1799 — Vietnam News Feed scraper
// ═════════════════════════════════════════════════════════════════════════════

/** Target URL for the Vietnam news feed page. */
const TE_NEWS_URL = "https://tradingeconomics.com/vietnam/news";

/** Base URL used to resolve relative hrefs from the news page. */
const TE_BASE_URL = "https://tradingeconomics.com";

/** News cache TTL: re-scrape after 30 minutes (news is more time-sensitive). */
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;

/** Stale-news fallback: serve cache up to 2 hours after expiry on failure. */
const NEWS_STALE_CACHE_MAX_MS = 2 * 60 * 60 * 1000;

/** Default cache file path for news feed. */
const DEFAULT_NEWS_CACHE_FILE = "/app/data/te-news-cache.json";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single news item scraped from tradingeconomics.com/vietnam/news.
 */
export interface TENewsItem {
  title: string;
  /** Full URL: https://tradingeconomics.com + href */
  url: string;
  summary: string;
  /** Raw string from page e.g. "2 hours ago" */
  date: string;
  /** e.g. "GDP", "Inflation", "Trade" */
  category: string;
  source: "trading_economics";
}

/** Persisted news cache record. */
export interface TeNewsCacheEntry {
  cachedAt: string;
  data: TENewsItem[];
}

/**
 * Dependency injection interface for the news fetcher.
 *
 * @property scrape         - Returns raw page HTML (mocked in tests).
 * @property cachePath      - Override for the JSON cache file path.
 * @property cbStatePath    - Override for the CB state file path (default: TE_CB_STATE_PATH).
 *                            Inject a temp-dir path in tests to stay isolated.
 * @property onCircuitOpen  - Callback fired once when crash-loop threshold is crossed.
 *                            Defaults to a Telegram WORK alert in production.
 */
export interface TeNewsDeps {
  scrape: (url: string) => Promise<string>;
  cachePath?: string;
  cbStatePath?: string;
  onCircuitOpen?: (message: string) => Promise<void>;
  /**
   * Injectable sleep function for exponential backoff before the inner Chromium
   * retry. Defaults to real setTimeout. Inject a no-op in tests for isolation.
   * Sprint 1833g.
   */
  sleepMs?: (ms: number) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported pure helpers (also used in tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a relative date string (e.g. "2 hours ago", "3 days ago", "1 week ago",
 * "30 minutes ago") into an ISO 8601 UTC string.
 *
 * Returns the current time ISO string for any unrecognised format.
 */
export function parseRelativeDate(raw: string): string {
  const s = raw.trim().toLowerCase();
  const now = Date.now();

  // Pattern: "<n> <unit> ago"
  const match = s.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)\s+ago$/);
  if (match) {
    const n = parseInt(match[1]!, 10);
    const unit = match[2]!;
    let ms = 0;
    if (unit.startsWith("minute")) ms = n * 60 * 1000;
    else if (unit.startsWith("hour"))   ms = n * 3600 * 1000;
    else if (unit.startsWith("day"))    ms = n * 24 * 3600 * 1000;
    else if (unit.startsWith("week"))   ms = n * 7 * 24 * 3600 * 1000;
    return new Date(now - ms).toISOString();
  }

  // Fallback: return current time
  return new Date(now).toISOString();
}

/**
 * Extract TENewsItem[] from raw page HTML using cheerio.
 *
 * Selector map:
 *   Container : ul#stream li.te-stream-item
 *   Title+link: .te-stream-title-div a
 *   Summary   : span.te-stream-item-description
 *   Date      : small.te-stream-date
 *   Category  : a.badge.te-stream-category
 *
 * Exported for unit testing.
 */
export function extractTeNewsItems(html: string, limit: number): TENewsItem[] {
  // cheerio is already a project dependency (used in playwrightScrape above)
  // Synchronous load — safe to call from non-async contexts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require("cheerio") as typeof import("cheerio");
  const $ = cheerio.load(html);

  const items: TENewsItem[] = [];

  $("ul#stream li.te-stream-item").each((_idx: number, el: unknown) => {
    if (items.length >= limit) return false; // break

    const $el = $(el as never);

    const titleAnchor = $el.find(".te-stream-title-div a").first();
    const title = titleAnchor.text().trim();
    if (!title) return; // skip malformed items

    const href = titleAnchor.attr("href") ?? "";
    const url = href.startsWith("http") ? href : `${TE_BASE_URL}${href}`;

    const summary = $el.find("span.te-stream-item-description").first().text().trim();
    const date    = $el.find("small.te-stream-date").first().text().trim();
    const category = $el.find("a.badge.te-stream-category").first().text().trim();

    items.push({
      title,
      url,
      summary,
      date,
      category,
      source: "trading_economics",
    });
  });

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crash-loop guard — prevents infinite "Target closed" browser launch storms
//
// After TE_CHROMIUM_MAX_CONSECUTIVE_FAILURES top-level scrape failures that
// involve a "Target closed" error, the scraper is locked: subsequent calls
// return [] immediately without launching Chromium.  A single successful
// scrape resets the counter.  The first time the lock engages, onCircuitOpen
// is fired (default: Telegram WORK alert) so the ops team is notified once,
// not on every subsequent locked call.
//
// Sprint 1829b: CB state is now persisted to a JSON file so the counter
// survives Docker container restarts.  The default path is TE_CB_STATE_PATH
// but callers (and tests) can inject an alternate path via deps.cbStatePath.
// ─────────────────────────────────────────────────────────────────────────────

const TE_CHROMIUM_MAX_CONSECUTIVE_FAILURES = 3;

/** Default path for the persisted circuit-breaker state file. */
export const TE_CB_STATE_PATH = "/app/data/te-chromium-cb-state.json";

/** Shape of the persisted CB state file. */
export interface TeCbState {
  consecutiveErrors: number;
  alertSent: boolean;
  /**
   * Timestamp (ms since epoch) when the current 1-hour failure window started.
   * Used to reset consecutiveErrors when a new hour begins (max 3/hour semantics).
   * Sprint 1833g.
   */
  lastFailureWindowStartMs: number;
}

function loadCbState(statePath: string): TeCbState {
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TeCbState>;
    if (
      typeof parsed.consecutiveErrors === "number" &&
      typeof parsed.alertSent === "boolean"
    ) {
      return parsed as TeCbState;
    }
  } catch {
    // File missing or corrupt — start fresh
  }
  return { consecutiveErrors: 0, alertSent: false, lastFailureWindowStartMs: 0 };
}

function saveCbState(state: TeCbState, statePath: string): void {
  try {
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), "utf-8");
    fs.renameSync(tmp, statePath);
  } catch (err) {
    logger.warn("[te-chromium] failed to write CB state", {
      statePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Reset the crash-loop counter and wipe the persisted state file.
 * Exported for test isolation — do NOT call from production code.
 *
 * @param statePath - Override state file path (default: TE_CB_STATE_PATH).
 * @internal
 */
export function resetTeChromiumFailureCounter(statePath?: string): void {
  const p = statePath ?? TE_CB_STATE_PATH;
  saveCbState({ consecutiveErrors: 0, alertSent: false, lastFailureWindowStartMs: 0 }, p);
}

/**
 * @deprecated Alias for resetTeChromiumFailureCounter — kept for backwards
 * compatibility with existing test imports.
 * @internal
 */
export const resetTeChromiumCb = resetTeChromiumFailureCounter;

// ─────────────────────────────────────────────────────────────────────────────
// News cache helpers
// ─────────────────────────────────────────────────────────────────────────────

function readNewsCache(cachePath: string): TeNewsCacheEntry | null {
  try {
    const raw = fs.readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TeNewsCacheEntry>;
    if (
      typeof parsed.cachedAt === "string" &&
      Array.isArray(parsed.data)
    ) {
      return parsed as TeNewsCacheEntry;
    }
  } catch {
    // File missing or corrupt
  }
  return null;
}

function writeNewsCache(entry: TeNewsCacheEntry, cachePath: string): void {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${cachePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entry), "utf-8");
    fs.renameSync(tmp, cachePath);
  } catch (err) {
    logger.warn("[te-chromium-news] failed to write news cache", {
      cachePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function newsCacheAgeMs(entry: TeNewsCacheEntry): number {
  return Date.now() - new Date(entry.cachedAt).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Production Puppeteer scraper for news page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Launches a headless Chromium instance and returns the raw page HTML for
 * tradingeconomics.com/vietnam/news.
 *
 * Waits for ul#stream li.te-stream-item (timeout 20 s).
 * This function is never called in tests (deps.scrape is mocked).
 */
export async function playwrightScrapeNews(url: string): Promise<string> {
  const puppeteer = (await import("puppeteer-core")).default;

  const browser = await puppeteer.launch(buildChromiumLaunchConfig());

  try {
    const page = await browser.newPage();

    await page.setUserAgent(TE_USER_AGENT);

    // Task 1834b — block analytics/tracking requests to reduce fingerprint surface
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const reqUrl = req.url();
      const shouldBlock = TE_BLOCKED_PATTERNS.some((pat) => {
        const host = pat.replace(/^\*\*\//, "").replace(/\/\*\*$/, "");
        return reqUrl.includes(host);
      });
      if (shouldBlock) {
        req.abort().catch(() => { /* ignore abort errors */ });
      } else {
        req.continue().catch(() => { /* ignore continue errors */ });
      }
    });

    // Task 1834b — random human-like delay before navigation
    await new Promise<void>((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1000)));

    logger.info("[te-chromium-news] launching Chromium scrape", { url });
    // domcontentloaded is faster and more stable on heavy SPAs than networkidle2.
    // waitForSelector below handles the "page is ready" signal.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    try {
      await page.waitForSelector("ul#stream li.te-stream-item", { timeout: 20_000 });
    } catch {
      logger.warn("[te-chromium-news] timeout waiting for news stream — proceeding with current HTML");
    }

    return page.content();
  } finally {
    try { await browser.close(); } catch { /* ignore teardown errors on crashed browser */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — news
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches Vietnam news from tradingeconomics.com/vietnam/news via
 * Puppeteer/Chromium with a 30-minute cache.
 *
 * Cache strategy:
 *   - Cache age < 30 min → return cached data (no browser launch)
 *   - Cache age >= 30 min → attempt fresh scrape; update cache on success
 *   - Scrape failure + cache < 2h → return stale cache
 *   - Scrape failure + cache >= 2h → return []
 *   - Scrape failure + no cache   → return []
 *
 * On success, calls sourceHealthTracker.recordSuccess('tradingEconomics').
 * On failure, calls sourceHealthTracker.recordFailure('tradingEconomics', reason).
 *
 * @param limit - Maximum number of items to return (default 20)
 * @param deps  - Injectable scraper and cache path
 * @returns     - Array of TENewsItem, never throws
 */
export async function fetchTradingEconomicsNews(
  limit = 20,
  deps?: Partial<TeNewsDeps>,
): Promise<TENewsItem[]> {
  const cachePath = deps?.cachePath ?? DEFAULT_NEWS_CACHE_FILE;
  const cbStatePath = deps?.cbStatePath ?? TE_CB_STATE_PATH;
  const scrape = deps?.scrape ?? playwrightScrapeNews;

  try {
    // ── Check cache ──────────────────────────────────────────────────────────
    const cached = readNewsCache(cachePath);
    if (cached !== null) {
      const ageMs = newsCacheAgeMs(cached);
      if (ageMs < NEWS_CACHE_TTL_MS) {
        logger.debug("[te-chromium-news] returning cached news", {
          ageMinutes: Math.round(ageMs / 60_000),
          itemCount: cached.data.length,
        });
        return cached.data.slice(0, limit);
      }
    }

    // ── Crash-loop guard: skip browser launch when circuit is locked ─────────
    // Load state from file on each check so restarts don't reset the count.
    const cbState = loadCbState(cbStatePath);

    if (cbState.consecutiveErrors >= TE_CHROMIUM_MAX_CONSECUTIVE_FAILURES) {
      if (!cbState.alertSent) {
        cbState.alertSent = true;
        saveCbState(cbState, cbStatePath);
        const alertMsg =
          `[te-chromium-news] Chromium crash loop detected — ` +
          `${cbState.consecutiveErrors} consecutive "Target closed" failures. ` +
          `Browser scrape suspended. Manual inspection required.`;
        logger.warn(alertMsg);
        try {
          const notify = deps?.onCircuitOpen;
          if (notify) {
            await notify(alertMsg);
          } else {
            const { sendTelegramWork } = await import("../notifiers/telegram.js");
            await sendTelegramWork(alertMsg, { parseMode: "" });
          }
        } catch { /* alert failure must not abort */ }
      }
      // Return stale cache or [] — do not launch browser
      if (cached !== null) {
        return cached.data.slice(0, limit);
      }
      return [];
    }

    // ── Attempt fresh scrape (retry once on "Target closed" crash) ───────────
    const _sleepFn = deps?.sleepMs ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    try {
      let html: string;
      try {
        html = await scrape(TE_NEWS_URL);
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (!msg.includes("Target closed")) throw firstErr;
        // Load CB state to compute backoff based on current failure count
        const stateForBackoff = loadCbState(cbStatePath);
        const backoffMs = Math.min(5_000 * Math.pow(2, stateForBackoff.consecutiveErrors), 60_000);
        logger.warn("[te-chromium-news] Target closed — applying exponential backoff before retry", {
          backoffMs,
          consecutiveErrors: stateForBackoff.consecutiveErrors,
        });
        await _sleepFn(backoffMs);
        logger.warn("[te-chromium-news] re-initialising browser and retrying after backoff");
        html = await scrape(TE_NEWS_URL);
      }
      // Scrape succeeded (with or without inner retry) — reset CB state
      saveCbState({ consecutiveErrors: 0, alertSent: false, lastFailureWindowStartMs: 0 }, cbStatePath);

      const items = extractTeNewsItems(html, limit);
      const entry: TeNewsCacheEntry = {
        cachedAt: new Date().toISOString(),
        data: items,
      };
      writeNewsCache(entry, cachePath);

      // Health tracking — success
      try {
        const { globalSourceTracker } = await import(
          "../observability/sourceHealthRegistry.js"
        );
        globalSourceTracker.recordSuccess("tradingEconomics");
      } catch { /* health tracking is best-effort */ }

      logger.info("[te-chromium-news] scraped news", { itemCount: items.length });
      return items;
    } catch (scrapeErr) {
      const errorMsg = scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr);
      logger.warn("[te-chromium-news] scrape failed", { error: errorMsg });

      // Increment crash-loop counter only for "Target closed" failures;
      // persist immediately so the count survives container restarts.
      // Sprint 1833g: apply hour-window reset — if >1 hour has passed since the
      // window started, reset the counter so max 3 failures/hour is enforced.
      if (errorMsg.includes("Target closed")) {
        const state = loadCbState(cbStatePath);
        const now = Date.now();
        if (now - state.lastFailureWindowStartMs > 3_600_000) {
          state.consecutiveErrors = 0;
          state.lastFailureWindowStartMs = now;
        }
        state.consecutiveErrors++;
        saveCbState(state, cbStatePath);
        logger.warn("[te-chromium-news] Target closed failure counted toward crash-loop threshold", {
          consecutiveFailures: state.consecutiveErrors,
          threshold: TE_CHROMIUM_MAX_CONSECUTIVE_FAILURES,
        });
      }

      // Health tracking — failure
      try {
        const { globalSourceTracker } = await import(
          "../observability/sourceHealthRegistry.js"
        );
        globalSourceTracker.recordFailure("tradingEconomics", errorMsg);
      } catch { /* health tracking is best-effort */ }

      // Fall back to stale cache if < 2h old
      if (cached !== null) {
        const ageMs = newsCacheAgeMs(cached);
        if (ageMs < NEWS_STALE_CACHE_MAX_MS) {
          logger.warn("[te-chromium-news] returning stale news cache after scrape failure", {
            ageMinutes: Math.round(ageMs / 60_000),
          });
          return cached.data.slice(0, limit);
        }
        logger.warn("[te-chromium-news] stale news cache too old — returning []", {
          ageHours: Math.round(ageMs / 3_600_000),
        });
      }

      return [];
    }
  } catch (outerErr) {
    // Safety net — this function must never throw
    logger.error("[te-chromium-news] unexpected error", {
      error: outerErr instanceof Error ? outerErr.message : String(outerErr),
    });
    return [];
  }
}
