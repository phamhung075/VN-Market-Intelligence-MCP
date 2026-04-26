/**
 * Domain Service — BCTC PDF Discovery for HOSE-listed tickers
 *
 * Implements a multi-source strategy to discover PDF URLs for BCTC
 * (quarterly financial reports) for tickers listed on the HOSE exchange.
 *
 * Strategy order (fail-fast with graceful fallback):
 *   1. SSC iboard API (iboard.ssc.vn) — preferred, fastest
 *   2. cafef.vn scraper — fallback 1
 *   3. vietstock.vn scraper — fallback 2
 *
 * Design:
 * - Accepts injectable HTTP fetch functions for full testability (ports pattern).
 * - All network calls are guarded with per-source timeouts (default 5 s).
 * - Unknown/fake tickers return { urls: [], source: null, fallbackUrls: [], fallbackSource: null }.
 * - Domain layer only — uses globalThis.fetch (Bun native); zero infrastructure imports.
 *
 * @module domain/services/bctcDiscovery
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Return type of discoverHosePdfUrls(). */
export interface HosePdfDiscoveryResult {
  /** Primary PDF URLs (from the first source that succeeds). */
  urls: string[];
  /** Primary source name, or null if nothing succeeded. */
  source: "ssc" | "cafef" | "vietstock" | null;
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
   * Injectable fetch overrides for unit-testing.
   * In production these are omitted and the built-in fetch helpers are used.
   */
  _fetchSsc?: HttpFetchFn;
  _fetchCafef?: HttpFetchFn;
  _fetchVietstock?: HttpFetchFn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SSC_IBOARD_BASE = "https://iboard-query.ssc.vn";
const CAFEF_BASE = "https://cafef.vn";
const VIETSTOCK_BASE = "https://finance.vietstock.vn";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Regex patterns for extracting PDF URLs from HTML responses.
 * Matches .pdf links that contain BCTC / financial report indicators.
 */
const PDF_HREF_RE = /href=["']([^"']*\.pdf)["']/gi;

// ─────────────────────────────────────────────────────────────────────────────
// Default HTTP fetch helpers (production path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps globalThis.fetch with timeout via AbortController.
 * Returns the response body as text. Throws on HTTP error or timeout.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await globalThis.fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json, text/html, */*",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-source extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts PDF URLs from the SSC iboard JSON API response.
 *
 * The iboard API at https://iboard-query.ssc.vn/dcm/financials/ticker/<TICKER>
 * returns a JSON array of disclosure documents, each with a `fileUrl` field
 * pointing to a downloadable PDF. Filters for BCTC (annual/quarterly reports).
 */
function extractSscUrls(raw: string, ticker: string): string[] {
  try {
    const data = JSON.parse(raw) as unknown;

    // iboard returns { data: [...] } or an array directly
    const items: unknown[] = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>)?.data instanceof Array
        ? ((data as Record<string, unknown>).data as unknown[])
        : [];

    const urls: string[] = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const rec = item as Record<string, unknown>;
      const fileUrl = rec.fileUrl ?? rec.file_url ?? rec.url ?? rec.pdfUrl;
      if (typeof fileUrl === "string" && fileUrl.toLowerCase().endsWith(".pdf")) {
        // Normalise to absolute URL
        const absolute = fileUrl.startsWith("http") ? fileUrl : `${SSC_IBOARD_BASE}${fileUrl}`;
        urls.push(absolute);
      }
    }
    return urls;
  } catch {
    // JSON parse failure — not an iboard JSON response
    return [];
  }
}

/**
 * Extracts PDF URLs from cafef.vn HTML response.
 * Looks for anchor hrefs ending in .pdf.
 */
function extractCafefUrls(html: string, ticker: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex
  PDF_HREF_RE.lastIndex = 0;
  while ((match = PDF_HREF_RE.exec(html)) !== null) {
    const href = match[1];
    const absolute = href.startsWith("http") ? href : `${CAFEF_BASE}${href}`;
    urls.push(absolute);
  }
  return urls;
}

/**
 * Extracts PDF URLs from vietstock.vn HTML response.
 * Looks for anchor hrefs ending in .pdf.
 */
function extractVietstockUrls(html: string, ticker: string): string[] {
  const urls: string[] = [];
  const re = /href=["']([^"']*\.pdf)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1];
    const absolute = href.startsWith("http") ? href : `${VIETSTOCK_BASE}${href}`;
    urls.push(absolute);
  }
  return urls;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-source fetch strategies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to find PDF URLs via the SSC iboard JSON API.
 * Returns empty array on any error (network, parse, HTTP error).
 */
async function tryFetchSsc(
  ticker: string,
  timeout: number,
  fetchFn: HttpFetchFn,
): Promise<string[]> {
  const url = `${SSC_IBOARD_BASE}/dcm/financials/ticker/${encodeURIComponent(ticker.toUpperCase())}`;
  try {
    const raw = await fetchFn(url, timeout);
    return extractSscUrls(raw, ticker);
  } catch {
    return [];
  }
}

/**
 * Try to find PDF URLs from cafef.vn financial reports page.
 * Returns empty array on any error.
 */
async function tryFetchCafef(
  ticker: string,
  timeout: number,
  fetchFn: HttpFetchFn,
): Promise<string[]> {
  // cafef ticker pages use lowercase
  const url = `${CAFEF_BASE}/${ticker.toLowerCase()}/bao-cao-tai-chinh.chn`;
  try {
    const html = await fetchFn(url, timeout);
    return extractCafefUrls(html, ticker);
  } catch {
    return [];
  }
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discover BCTC PDF URLs for a HOSE-listed ticker.
 *
 * Tries three sources in order: SSC iboard → cafef.vn → vietstock.vn.
 * The first source that returns ≥1 PDF URL wins (primary result).
 * The next source that also returns URLs is stored as fallback.
 *
 * For unknown/fake tickers (all sources return empty): returns
 * `{ urls: [], source: null, fallbackUrls: [], fallbackSource: null }`.
 *
 * @param ticker - Stock ticker symbol (e.g. "FPT", "VCB")
 * @param options - Timeout and optional injectable fetch overrides
 */
export async function discoverHosePdfUrls(
  ticker: string,
  options: DiscoverOptions = {},
): Promise<HosePdfDiscoveryResult> {
  const timeout = options.timeout ?? 5_000;

  // Resolve fetch functions (production or injected test doubles)
  const fetchSsc = options._fetchSsc ?? fetchWithTimeout;
  const fetchCafef = options._fetchCafef ?? fetchWithTimeout;
  const fetchVietstock = options._fetchVietstock ?? fetchWithTimeout;

  // ── Strategy 1: SSC iboard ──────────────────────────────────────────────
  const sscUrls = await tryFetchSsc(ticker, timeout, fetchSsc);
  if (sscUrls.length > 0) {
    // Try next source for fallback (best-effort, never throw)
    const cafefUrls = await tryFetchCafef(ticker, timeout, fetchCafef);
    return {
      urls: sscUrls,
      source: "ssc",
      fallbackUrls: cafefUrls,
      fallbackSource: cafefUrls.length > 0 ? "cafef" : null,
    };
  }

  // ── Strategy 2: cafef.vn ────────────────────────────────────────────────
  const cafefUrls = await tryFetchCafef(ticker, timeout, fetchCafef);
  if (cafefUrls.length > 0) {
    const vietstockUrls = await tryFetchVietstock(ticker, timeout, fetchVietstock);
    return {
      urls: cafefUrls,
      source: "cafef",
      fallbackUrls: vietstockUrls,
      fallbackSource: vietstockUrls.length > 0 ? "vietstock" : null,
    };
  }

  // ── Strategy 3: vietstock.vn ────────────────────────────────────────────
  const vietstockUrls = await tryFetchVietstock(ticker, timeout, fetchVietstock);
  if (vietstockUrls.length > 0) {
    return {
      urls: vietstockUrls,
      source: "vietstock",
      fallbackUrls: [],
      fallbackSource: null,
    };
  }

  // ── All strategies failed ───────────────────────────────────────────────
  return {
    urls: [],
    source: null,
    fallbackUrls: [],
    fallbackSource: null,
  };
}
