/**
 * Domain Service -- BCTC PDF Discovery for HOSE-listed tickers
 *
 * Implements a multi-source strategy to discover PDF URLs for BCTC
 * (quarterly financial reports) for tickers listed on the HOSE exchange.
 *
 * Strategy order (fail-fast with graceful fallback):
 *   0. VPS Playwright endpoint -- primary when BCTC_DISCOVER_URL is set.
 *      Calls GET {BCTC_DISCOVER_URL}/{ticker}?year={y}&quarter={q} on the VPS.
 *      VPS runs discover-bctc-urls-browser.py as a subprocess (Playwright).
 *      Returns Python script JSON: { results: [{url, source, confidence}], error }.
 *   1. SSC iboard JSON API -- fallback when VPS unavailable.
 *      Base URL: SSC_IBOARD_BASE_URL env var (default: https://iboard-query.ssc.vn).
 *      NOTE: iboard-query.ssc.vn is NXDOMAIN (dead domain) as of 2026-04-27.
 *      Still kept as fallback in case domain is restored.
 *   2. [REMOVED] cafef.vn document JSON API -- TASK_1916b: permanently dead.
 *      s.cafef.vn/Candles/FinanceInfo.ashx returns HTTP 301 then redirects to
 *      cafef.vn/du-lieu/candles/financeinfo.ashx then 302 then /404.aspx. All
 *      query params are lost at the first redirect. Investigated 3 replacement
 *      candidates (2026-05-14):
 *        (a) cafef.vn/tai-lieu-tai-chinh/<ticker>/bctc -- 302 captcha from France
 *        (b) VNDirect document API -- NXDOMAIN from France
 *        (c) SSC via VPS -- already covered by Strategy 0
 *      All failed. Strategy 0 (VPS-routed Playwright) is sufficient. See SPIKE_1916.
 *   3. vietstock.vn HTML scraper -- fallback 2 (rarely succeeds; JS-rendered).
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
   */
  source: "vps-playwright" | "ssc" | "cafef" | "vietstock" | null;
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
  _fetchVpsPlaywright?: HttpFetchFn;
  _fetchSsc?: HttpFetchFn;
  /**
   * @deprecated TASK_1916b: Strategy 2 (cafef.vn FinanceInfo.ashx) permanently removed.
   * This field is accepted for backward-compat so existing test callers do not break,
   * but it is never invoked. Pass any value or omit entirely.
   */
  _fetchCafef?: HttpFetchFn;
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

/**
 * Resolve the SSC iboard API base URL at call time.
 *
 * Reads SSC_IBOARD_BASE_URL env var on every invocation so that:
 *   1. Tests can override Bun.env["SSC_IBOARD_BASE_URL"] after module import.
 *   2. Production can hot-swap the proxy without restarting (env reload).
 *
 * Default: https://iboard-query.ssc.vn
 * Override: SSC_IBOARD_BASE_URL=https://vps-proxy.example.com/iboard
 */
function getSscIboardBase(): string {
  return (typeof Bun !== "undefined" ? Bun.env["SSC_IBOARD_BASE_URL"] : undefined) ??
    "https://iboard-query.ssc.vn";
}

// TASK_1916b: CAFEF_API_BASE and CAFEF_BASE removed. Strategy 2 dead. See module docblock.

const VIETSTOCK_BASE = "https://finance.vietstock.vn";

// TASK_1916b: PDF_HREF_RE removed -- was only used by extractCafefUrls (now deleted).

// ---------------------------------------------------------------------------
// Per-source extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts PDF URLs from the SSC iboard JSON API response.
 *
 * The iboard API at <SSC_IBOARD_BASE>/dcm/financials/ticker/<TICKER>
 * returns a JSON array of disclosure documents, each with a fileUrl field
 * pointing to a downloadable PDF. Filters for BCTC (annual/quarterly reports).
 */
function extractSscUrls(raw: string, _ticker: string): string[] {
  const check = stripAnsiJunk(raw);
  if (check.junk || check.isNull) return [];
  try {
    const data = JSON.parse(check.cleaned) as unknown;

    // iboard returns { data: [...] } or an array directly
    const items: unknown[] = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>)?.data instanceof Array
        ? ((data as Record<string, unknown>).data as unknown[])
        : [];

    const iboardBase = getSscIboardBase();
    const urls: string[] = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const rec = item as Record<string, unknown>;
      const fileUrl = rec.fileUrl ?? rec.file_url ?? rec.url ?? rec.pdfUrl;
      if (typeof fileUrl === "string" && fileUrl.toLowerCase().endsWith(".pdf")) {
        // Normalise to absolute URL
        const absolute = fileUrl.startsWith("http") ? fileUrl : `${iboardBase}${fileUrl}`;
        urls.push(absolute);
      }
    }
    return urls;
  } catch {
    // JSON parse failure -- not an iboard JSON response
    return [];
  }
}

// TASK_1916b: extractCafefUrls removed -- Strategy 2 (cafef.vn FinanceInfo.ashx)
// permanently dead (301->404). See module docblock and SPIKE_1916 for full diagnosis.

/**
 * Extracts PDF URLs from vietstock.vn HTML response.
 * Looks for anchor hrefs ending in .pdf.
 */
function extractVietstockUrls(html: string, _ticker: string): string[] {
  const urls: string[] = [];
  const re = /href=["']([^"']*\.pdf)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1];
    if (href === undefined) continue;
    const absolute = href.startsWith("http") ? href : `${VIETSTOCK_BASE}${href}`;
    urls.push(absolute);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// VPS Playwright endpoint -- Strategy 0
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

/**
 * Try to find PDF URLs via the SSC iboard JSON API.
 *
 * The base URL is resolved at call time from SSC_IBOARD_BASE_URL env var.
 * When running geo-blocked (France), set SSC_IBOARD_BASE_URL to a VPS proxy
 * that forwards /dcm/financials/ticker/<TICKER> to iboard-query.ssc.vn.
 *
 * Returns empty array on any error (network, parse, HTTP error).
 */
async function tryFetchSsc(
  ticker: string,
  timeout: number,
  fetchFn: HttpFetchFn,
): Promise<string[]> {
  const base = getSscIboardBase();
  const url = `${base}/dcm/financials/ticker/${encodeURIComponent(ticker.toUpperCase())}`;
  try {
    const raw = await fetchFn(url, timeout);
    return extractSscUrls(raw, ticker);
  } catch {
    return [];
  }
}

// TASK_1916b: tryFetchCafef removed -- Strategy 2 permanently dead. See module docblock.

/**
 * Try to find PDF URLs from vietstock.vn financial section.
 * Returns empty array on any error.
 */
async function tryFetchVietstock(
  ticker: string,
  timeout: number,
  fetchFn: HttpFetchFn,
): Promise<string[]> {
  const url = `${VIETSTOCK_BASE}/${ticker.toUpperCase()}/bao-cao-tai-chinh`;
  try {
    const html = await fetchFn(url, timeout);
    return extractVietstockUrls(html, ticker);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover BCTC PDF URLs for a HOSE-listed ticker.
 *
 * Tries three sources in order:
 *   0. VPS Playwright endpoint (when BCTC_DISCOVER_URL is set) -- highest confidence
 *   1. SSC iboard JSON API (via SSC_IBOARD_BASE_URL)
 *   2. vietstock.vn HTML scraper (rarely succeeds; all content JS-rendered)
 *
 * Strategy 2 (cafef.vn FinanceInfo.ashx) was permanently removed in TASK_1916b
 * (2026-05-14). The endpoint is dead (301->404) and all 3 replacement candidates
 * failed from France. See SPIKE_1916 for investigation log.
 *
 * The first source that returns >= 1 PDF URL wins (primary result).
 * The next source that also returns URLs is stored as fallback.
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
  // Production callers wire bctcHttpFetch from infrastructure/fetchers/bctcHttpFetcher.ts.
  // Test callers supply stubs via _fetchVpsPlaywright / _fetchSsc / _fetchVietstock.
  //
  // _fetchVpsPlaywright is optional: strategy 0 only runs when BCTC_DISCOVER_URL is set,
  // so tests that exercise only strategies 1-2 may omit it.
  // _fetchSsc / _fetchVietstock are always required.
  // _fetchCafef is accepted but silently ignored (deprecated, see DiscoverOptions).
  const fetchVpsPlaywright = options._fetchVpsPlaywright;
  const fetchSsc           = options._fetchSsc;
  const fetchVietstock     = options._fetchVietstock;

  if (!fetchSsc || !fetchVietstock) {
    throw new Error(
      "[bctcDiscovery] fetch functions must be supplied via DiscoverOptions. " +
      "Use bctcHttpFetch from infrastructure/fetchers/bctcHttpFetcher.ts as the production default.",
    );
  }

  // Strategy 0: VPS Playwright endpoint
  // Only runs when BCTC_DISCOVER_URL is configured AND a fetch function is supplied.
  // Runs discover-bctc-urls-browser.py on the VPS as a subprocess.
  const vpsUrls = fetchVpsPlaywright
    ? await tryFetchVpsPlaywright(ticker, year, quarter, timeout, fetchVpsPlaywright)
    : [];
  if (vpsUrls.length > 0) {
    // Best-effort fallback from SSC
    const sscUrls = await tryFetchSsc(ticker, timeout, fetchSsc);
    return {
      urls: vpsUrls,
      source: "vps-playwright",
      fallbackUrls: sscUrls,
      fallbackSource: sscUrls.length > 0 ? "ssc" : null,
    };
  }

  // Strategy 1: SSC iboard
  const sscUrls = await tryFetchSsc(ticker, timeout, fetchSsc);
  if (sscUrls.length > 0) {
    // Best-effort fallback from vietstock (cafef removed in TASK_1916b)
    const vietstockUrls = await tryFetchVietstock(ticker, timeout, fetchVietstock);
    return {
      urls: sscUrls,
      source: "ssc",
      fallbackUrls: vietstockUrls,
      fallbackSource: vietstockUrls.length > 0 ? "vietstock" : null,
    };
  }

  // Strategy 2: vietstock.vn
  // TASK_1916b: cafef.vn strategy removed. Vietstock promoted to strategy 2.
  const vietstockUrls = await tryFetchVietstock(ticker, timeout, fetchVietstock);
  if (vietstockUrls.length > 0) {
    return {
      urls: vietstockUrls,
      source: "vietstock",
      fallbackUrls: [],
      fallbackSource: null,
    };
  }

  // All strategies failed
  return {
    urls: [],
    source: null,
    fallbackUrls: [],
    fallbackSource: null,
  };
}
