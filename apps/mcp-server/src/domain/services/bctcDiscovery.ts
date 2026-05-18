/**
 * Domain Service -- BCTC PDF Discovery for HOSE-listed tickers
 *
 * Implements a multi-source strategy to discover PDF URLs for BCTC
 * (quarterly financial reports) for tickers listed on the HOSE exchange.
 *
 * Strategy order (fail-fast with graceful fallback):
 *   0. hsx.vn mediafiles API -- primary (TASK-BCTC-3b, 2026-05-15).
 *      Two-call recipe: resolve ticker → numeric ID via /l/api/v1/1/securities/stock,
 *      then fetch BCTC PDFs via /m/api/v1/1/mediafiles/5/{id}. Accessible from France
 *      with no VPS, no Playwright, no auth beyond static token HJ2HNS3SKICV4FNE.
 *      HOSE-only: HNX/UPCOM tickers return empty list → falls through to strategy 1.
 *      Only runs when _fetchHsx is supplied in DiscoverOptions.
 *   1. VPS Playwright endpoint -- secondary when BCTC_DISCOVER_URL is set.
 *      Calls GET {BCTC_DISCOVER_URL}/{ticker}?year={y}&quarter={q} on the VPS.
 *      VPS runs discover-bctc-urls-browser.py as a subprocess (Playwright).
 *      Returns Python script JSON: { results: [{url, source, confidence}], error }.
 *   2. [REMOVED] SSC iboard JSON API -- TASK_1944b: permanently dead 2026-05-18.
 *      iboard-query.ssc.vn is NXDOMAIN since 2026-04-27. Returns 502/[] for every
 *      ticker via the VPS proxy. No restoration expected. See SPIKE_1916.
 *   3. [REMOVED] cafef.vn document JSON API -- TASK_1916b: permanently dead.
 *      s.cafef.vn/Candles/FinanceInfo.ashx returns HTTP 301 then redirects to
 *      cafef.vn/du-lieu/candles/financeinfo.ashx then 302 then /404.aspx. All
 *      query params are lost at the first redirect. Investigated 3 replacement
 *      candidates (2026-05-14):
 *        (a) cafef.vn/tai-lieu-tai-chinh/<ticker>/bctc -- 302 captcha from France
 *        (b) VNDirect document API -- NXDOMAIN from France
 *        (c) SSC via VPS -- already covered by Strategy 0
 *      All failed. Strategy 0 (VPS-routed Playwright) is sufficient. See SPIKE_1916.
 *   4. [REMOVED] vietstock.vn HTML scraper -- TASK_1944b: permanently dead 2026-05-18.
 *      finance.vietstock.vn/<ticker>/bao-cao-tai-chinh returns HTTP 404 for every
 *      ticker. bctcHttpFetcher throws on !res.ok → caught as []. See SPIKE_1916.
 *
 * Design:
 * - Accepts injectable HTTP fetch functions for full testability (ports pattern).
 * - All network calls are guarded with per-source timeouts (default 5 s).
 * - Unknown/fake tickers return { urls: [], source: null, fallbackUrls: [], fallbackSource: null }.
 * - Domain layer only -- reads Bun.env for config; zero infrastructure imports.
 *
 * 2026-04-27 FIX (branch fix/bctc-url-enrichment):
 *   - Added SSC_IBOARD_BASE_URL env override so VPS proxy can be used for
 *     iboard API calls (iboard-query.ssc.vn is NXDOMAIN from France).
 *     NOTE: SSC strategy fully removed in TASK_1944b (2026-05-18) — NXDOMAIN permanent.
 *   - Replaced cafef HTML scraper with s.cafef.vn JSON API (FinanceInfo endpoint).
 *     The /[ticker]/bao-cao-tai-chinh.chn pattern returned HTTP 404; the financial
 *     docs section on cafef renders entirely via JavaScript -- no static PDF hrefs.
 *
 * 2026-04-27 FIX (branch fix/bctc-playwright-enrichment):
 *   - iboard-query.ssc.vn confirmed NXDOMAIN (dead domain, not geo-blocked).
 *   - Added Strategy 0: VPS Playwright endpoint via BCTC_DISCOVER_URL env var.
 *     The VPS proxy server runs discover-bctc-urls-browser.py as a subprocess.
 *     Endpoint: GET {BCTC_DISCOVER_URL}/{ticker}?year={y}&quarter={q}
 *   - Added _fetchVpsPlaywright injectable for testability.
 *   - Added year/quarter to DiscoverOptions for parameterised VPS endpoint call.
 *
 * 2026-05-14 FIX (branch task/1916b-fix-cafef-strategy-replacement):
 *   - Strategy 2 (cafef.vn FinanceInfo.ashx) removed permanently. All 3 replacement
 *     candidates dead from France. Strategy 0 (VPS Playwright) is the robust fallback.
 *   - _fetchCafef kept in DiscoverOptions for backward-compat (no-op; ignored).
 *   - See SPIKE_1916 + TASK_1916b for investigation log.
 *
 * 2026-05-15 FEATURE (TASK-BCTC-3b):
 *   - Added Strategy 0: hsx.vn mediafiles API (new primary).
 *     Two-call recipe confirmed HTTP 200 from France. No VPS, no Playwright.
 *     Returns [] for HNX/UPCOM tickers; falls through to VPS Playwright (now strategy 1).
 *   - _fetchHsx injectable added to DiscoverOptions (different arity from HttpFetchFn).
 *   - "hsx" added to HosePdfDiscoveryResult.source union.
 *   - Strategy numbering updated: hsx(0) → VPS Playwright(1) → SSC(2) → vietstock(3).
 *   - See docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md § Main-Server Recon.
 *
 * @module domain/services/bctcDiscovery
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Return type of discoverHosePdfUrls(). */
export interface HosePdfDiscoveryResult {
  /** Primary PDF URLs (from the first source that succeeds). */
  urls: string[];
  /**
   * Primary source name, or null if nothing succeeded.
   * Note: "cafef" is retained in the union for backward compatibility with existing
   * DB rows written before TASK_1916b removed Strategy 2 (2026-05-14).
   * "hsx" added in TASK-BCTC-3b (2026-05-15) for the hsx.vn mediafiles strategy.
   */
  source: "hsx" | "vps-playwright" | "ssc" | "cafef" | "vietstock" | null;
  /** Secondary PDF URLs (from next source tried, if populated). */
  fallbackUrls?: string[];
  /** Secondary source name. */
  fallbackSource?: string | null;
}

/**
 * Injectable HTTP fetch function signature.
 * Matches the minimal interface needed by each strategy.
 */
export type HttpFetchFn = (url: string, timeoutMs: number) => Promise<string>;

/** Options bag for discoverHosePdfUrls(). */
export interface DiscoverOptions {
  /** Per-source request timeout in milliseconds. Default: 5000. */
  timeout?: number;
  /**
   * Report year -- used to construct the VPS Playwright endpoint URL.
   * E.g. 2025. Defaults to current year when not supplied.
   */
  year?: number;
  /**
   * Report quarter -- used to construct the VPS Playwright endpoint URL.
   * E.g. "Q4". Defaults to "Q4" when not supplied.
   */
  quarter?: string;
  /**
   * Injectable fetch overrides for unit-testing.
   * In production these are omitted and the built-in fetch helpers are used.
   */
  /**
   * Injectable for Strategy 0 (hsx.vn mediafiles).
   * Different arity from HttpFetchFn — accepts (ticker, year, timeoutMs).
   * Optional: omitting it disables Strategy 0.
   * In production, wire fetchHsxBctcUrls from infrastructure/fetchers/hsxBctcFetcher.ts.
   * TASK-BCTC-3b (2026-05-15).
   */
  _fetchHsx?: (ticker: string, year: number, timeoutMs: number) => Promise<string[]>;
  _fetchVpsPlaywright?: HttpFetchFn;
  /**
   * @deprecated TASK_1944b: Strategy 2 (SSC iboard) permanently removed 2026-05-18.
   * iboard-query.ssc.vn is NXDOMAIN — returns [] for every ticker. See SPIKE_1916.
   * This field is accepted for backward-compat so existing callers do not break,
   * but it is never invoked. Pass any value or omit entirely.
   */
  _fetchSsc?: HttpFetchFn;
  /**
   * @deprecated TASK_1916b: Strategy 3 (cafef.vn FinanceInfo.ashx) permanently removed.
   * This field is accepted for backward-compat so existing test callers do not break,
   * but it is never invoked. Pass any value or omit entirely.
   */
  _fetchCafef?: HttpFetchFn;
  /**
   * @deprecated TASK_1944b: Strategy 4 (vietstock.vn) permanently removed 2026-05-18.
   * finance.vietstock.vn returns HTTP 404 for every ticker — JS-rendered, no PDF hrefs.
   * This field is accepted for backward-compat so existing callers do not break,
   * but it is never invoked. Pass any value or omit entirely.
   */
  _fetchVietstock?: HttpFetchFn;
}

// ---------------------------------------------------------------------------
// ANSI / junk detection -- single source of truth in domain/utils/ansiUtils
// Re-exported here so existing callers (tests, extractors) continue to work.
// ---------------------------------------------------------------------------

export type { JunkCheckResult } from "../utils/ansiUtils.js";
export { stripAnsiJunk } from "../utils/ansiUtils.js";
import { stripAnsiJunk } from "../utils/ansiUtils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Resolve the VPS Playwright discovery endpoint base URL at call time.
 *
 * Reads BCTC_DISCOVER_URL env var on every invocation.
 * Returns undefined when the env var is not set -- strategy is skipped.
 *
 * Production value: http://125.212.251.27:8765/proxy/bctc-discover
 * Endpoint shape: GET {base}/{ticker}?year={y}&quarter={q}
 *
 * The VPS proxy server runs discover-bctc-urls-browser.py as a subprocess
 * and returns: { results: [{url, source, confidence}], error: string|null }
 */
function getBctcDiscoverUrl(): string | undefined {
  return typeof Bun !== "undefined" ? Bun.env["BCTC_DISCOVER_URL"] : undefined;
}

// TASK_1916b: CAFEF_API_BASE and CAFEF_BASE removed. Strategy 3 dead. See module docblock.
// TASK_1944b: VIETSTOCK_BASE, SSC_IBOARD_BASE_URL, getSscIboardBase() removed. Strategies 2+4 dead.

// TASK_1916b: PDF_HREF_RE removed -- was only used by extractCafefUrls (now deleted).

// ---------------------------------------------------------------------------
// Per-source extraction helpers
// ---------------------------------------------------------------------------

// TASK_1916b: extractCafefUrls removed -- Strategy 3 (cafef.vn FinanceInfo.ashx)
// permanently dead (301->404). See module docblock and SPIKE_1916 for full diagnosis.

// TASK_1944b: extractSscUrls removed -- Strategy 2 (SSC iboard) permanently dead
// 2026-05-18. iboard-query.ssc.vn is NXDOMAIN. Returns [] for every ticker. See SPIKE_1916.

// TASK_1944b: extractVietstockUrls removed -- Strategy 4 (vietstock.vn) permanently dead
// 2026-05-18. finance.vietstock.vn returns HTTP 404 for every ticker. See SPIKE_1916.

// ---------------------------------------------------------------------------
// hsx.vn mediafiles -- Strategy 0
// ---------------------------------------------------------------------------

/**
 * Try to find PDF URLs via the hsx.vn mediafiles API.
 *
 * Only runs when an _fetchHsx injectable is supplied. Returns [] otherwise.
 * HOSE tickers: resolves to numeric ID → fetches BCTC PDF list.
 * HNX/UPCOM tickers: ID lookup returns empty list → returns [] gracefully.
 *
 * TASK-BCTC-3b (2026-05-15)
 */
async function tryFetchHsx(
  ticker: string,
  year: number,
  timeout: number,
  fetchFn: ((ticker: string, year: number, timeoutMs: number) => Promise<string[]>) | undefined,
): Promise<string[]> {
  if (!fetchFn) return [];
  try {
    return await fetchFn(ticker, year, timeout);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// VPS Playwright endpoint -- Strategy 1 (was Strategy 0)
// ---------------------------------------------------------------------------

/**
 * Response shape returned by the VPS /proxy/bctc-discover/:ticker endpoint.
 * The endpoint runs discover-bctc-urls-browser.py <ticker> <year> Q<quarter>
 * and forwards the JSON output verbatim.
 */
interface VpsPlaywrightResult {
  url: string | null;
  source: string;
  confidence: number;
  page_title?: string;
}

interface VpsPlaywrightResponse {
  results: VpsPlaywrightResult[];
  error: string | null;
}

/**
 * Extracts PDF URLs from the VPS Playwright endpoint JSON response.
 *
 * Only includes urls that:
 *   - Are non-null strings
 *   - End with .pdf (case-insensitive)
 *   - Start with http:// or https://
 *
 * The Python script may return null url for HOSE-SSC confirmation entries
 * (document confirmed to exist but no direct PDF link available).
 */
function extractVpsPlaywrightUrls(raw: string): string[] {
  const check = stripAnsiJunk(raw);
  if (check.junk || check.isNull) return [];
  try {
    const parsed = JSON.parse(check.cleaned) as VpsPlaywrightResponse;
    if (!parsed || !Array.isArray(parsed.results)) return [];

    return parsed.results
      .map((r) => r.url)
      .filter((u): u is string => {
        if (typeof u !== "string" || !u) return false;
        const lower = u.toLowerCase();
        return lower.endsWith(".pdf") && (lower.startsWith("http://") || lower.startsWith("https://"));
      });
  } catch {
    return [];
  }
}

/**
 * Try to find PDF URLs via the VPS Playwright endpoint.
 *
 * Only runs when BCTC_DISCOVER_URL env var is set. Returns [] otherwise.
 * Endpoint: GET {BCTC_DISCOVER_URL}/{ticker}?year={y}&quarter={q}
 * The quarter number is extracted from "Q4" to "4" for the query param.
 */
async function tryFetchVpsPlaywright(
  ticker: string,
  year: number,
  quarter: string,
  timeout: number,
  fetchFn: HttpFetchFn,
): Promise<string[]> {
  const base = getBctcDiscoverUrl();
  if (!base) return [];

  const quarterNum = quarter.replace(/^Q/i, "");
  const url =
    `${base}/${encodeURIComponent(ticker.toUpperCase())}` +
    `?year=${year}&quarter=${encodeURIComponent(quarterNum)}`;

  try {
    const raw = await fetchFn(url, timeout);
    return extractVpsPlaywrightUrls(raw);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-source fetch strategies
// ---------------------------------------------------------------------------

// TASK_1916b: tryFetchCafef removed -- Strategy 3 permanently dead. See module docblock.

// TASK_1944b: tryFetchSsc removed -- Strategy 2 (SSC iboard) permanently dead 2026-05-18.
// iboard-query.ssc.vn is NXDOMAIN since 2026-04-27. Returns [] for every ticker. See SPIKE_1916.

// TASK_1944b: tryFetchVietstock removed -- Strategy 4 (vietstock.vn) permanently dead 2026-05-18.
// finance.vietstock.vn returns HTTP 404 for every ticker. JS-rendered, no PDF hrefs. See SPIKE_1916.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover BCTC PDF URLs for a HOSE-listed ticker.
 *
 * Tries two live sources in order (dead strategies removed in TASK_1944b):
 *   0. hsx.vn mediafiles API (when _fetchHsx is supplied) -- primary (TASK-BCTC-3b)
 *      HOSE-only. HNX/UPCOM tickers return [] and fall through to strategy 1.
 *   1. VPS Playwright endpoint (when BCTC_DISCOVER_URL is set) -- covers all exchanges
 *
 * Removed strategies:
 *   2. [REMOVED TASK_1944b] SSC iboard JSON API -- iboard-query.ssc.vn NXDOMAIN since 2026-04-27
 *   3. [REMOVED TASK_1916b] cafef.vn FinanceInfo.ashx -- 301->404, all replacements dead
 *   4. [REMOVED TASK_1944b] vietstock.vn HTML scraper -- HTTP 404 for every ticker
 *
 * The first source that returns >= 1 PDF URL wins (primary result).
 *
 * For unknown/fake tickers (all sources return empty): returns
 * { urls: [], source: null, fallbackUrls: [], fallbackSource: null }.
 *
 * @param ticker  - Stock ticker symbol (e.g. "FPT", "VCB")
 * @param options - Timeout, year/quarter context, injectable fetch overrides
 */
export async function discoverHosePdfUrls(
  ticker: string,
  options: DiscoverOptions = {},
): Promise<HosePdfDiscoveryResult> {
  const timeout = options.timeout ?? 5_000;
  const year = options.year ?? new Date().getFullYear();
  const quarter = options.quarter ?? "Q4";

  // Resolve fetch functions -- must be supplied by caller (no inline default).
  // Production callers wire bctcHttpFetch from infrastructure/fetchers/bctcHttpFetcher.ts
  // and fetchHsxBctcUrls from infrastructure/fetchers/hsxBctcFetcher.ts.
  // Test callers supply stubs via injectable options.
  //
  // _fetchHsx is optional: strategy 0 only runs when the injectable is supplied.
  // _fetchVpsPlaywright is optional: strategy 1 only runs when BCTC_DISCOVER_URL is set.
  // _fetchSsc / _fetchCafef / _fetchVietstock are deprecated no-ops (TASK_1944b / TASK_1916b).
  const fetchHsx           = options._fetchHsx;
  const fetchVpsPlaywright = options._fetchVpsPlaywright;

  // Strategy 0: hsx.vn mediafiles API (TASK-BCTC-3b, 2026-05-15)
  // Only runs when _fetchHsx is supplied in options.
  // HOSE-only: HNX/UPCOM tickers return [] (not an error), falls through to strategy 1.
  const hsxUrls = await tryFetchHsx(ticker, year, timeout, fetchHsx);
  if (hsxUrls.length > 0) {
    return {
      urls: hsxUrls,
      source: "hsx",
      fallbackUrls: [],
      fallbackSource: null,
    };
  }

  // Strategy 1: VPS Playwright endpoint
  // Only runs when BCTC_DISCOVER_URL is configured AND a fetch function is supplied.
  // Runs discover-bctc-urls-browser.py on the VPS as a subprocess.
  const vpsUrls = fetchVpsPlaywright
    ? await tryFetchVpsPlaywright(ticker, year, quarter, timeout, fetchVpsPlaywright)
    : [];
  if (vpsUrls.length > 0) {
    return {
      urls: vpsUrls,
      source: "vps-playwright",
      fallbackUrls: [],
      fallbackSource: null,
    };
  }

  // Strategy 2 (SSC iboard): REMOVED TASK_1944b — iboard-query.ssc.vn NXDOMAIN since 2026-04-27. See SPIKE_1916.
  // Strategy 3 (cafef.vn): REMOVED TASK_1916b — endpoint dead (301→404). See SPIKE_1916.
  // Strategy 4 (vietstock.vn): REMOVED TASK_1944b — HTTP 404 for every ticker. See SPIKE_1916.

  // All strategies failed
  return {
    urls: [],
    source: null,
    fallbackUrls: [],
    fallbackSource: null,
  };
}
