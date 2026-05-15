/**
 * Infrastructure Fetcher -- hsx.vn BCTC PDF Discovery
 *
 * Implements a two-call HTTP recipe against api.hsx.vn to discover BCTC
 * (financial report) PDF URLs for HOSE-listed tickers.
 *
 * Two-call recipe:
 *   1. GET https://api.hsx.vn/l/api/v1/1/securities/stock?code={TICKER}
 *      → extract data.list[0].id (numeric securities ID)
 *      → empty list means non-HOSE ticker; returns [] immediately (not an error)
 *
 *   2. GET https://api.hsx.vn/m/api/v1/1/mediafiles/5/{numericId}?pageIndex=1&pageSize=100&year={year}
 *      → filter items where fileType === ".pdf" and filePath is non-empty
 *      → construct URL: filePath.replace("~", "https://staticfile.hsx.vn")
 *
 * Required headers on every call:
 *   - type: HJ2HNS3SKICV4FNE  (static public token from hsx.vn JS bundle, 2026-03-06)
 *   - Origin: https://www.hsx.vn
 *   - Referer: https://www.hsx.vn/
 *   - User-Agent: BROWSER_UA
 *
 * Confirmed working from France (HTTP 200) 2026-05-15. No VPS needed.
 * See docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md § Main-Server Recon.
 *
 * Risk: static token HJ2HNS3SKICV4FNE may rotate if HOSE rebuilds their SPA bundle.
 * If all HOSE tickers start returning empty, re-scrape main.d430e296.js for updated token.
 *
 * TASK-BCTC-3b (2026-05-15)
 *
 * @module infrastructure/fetchers/hsxBctcFetcher
 */

import { BROWSER_UA } from "./browserHeaders.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Static public API token embedded in hsx.vn SPA JS bundle (REACT_APP_TYPE). */
const HSX_API_TOKEN = "HJ2HNS3SKICV4FNE";

/** Static file CDN host for hsx.vn PDF downloads. */
const STATICFILE_BASE = "https://staticfile.hsx.vn";

/** Ticker-to-numeric-ID lookup endpoint (SERVICE_LISTING). */
const HSX_LISTING_API = "https://api.hsx.vn/l/api/v1/1/securities/stock";

/** BCTC mediafiles endpoint template (SERVICE_MEDIA). typeId=5 = financial reports. */
const HSX_MEDIAFILES_API = "https://api.hsx.vn/m/api/v1/1/mediafiles/5";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HsxSecuritiesItem {
  id: number;
  code: string;
  name?: string;
}

interface HsxSecuritiesResponse {
  data?: {
    list?: HsxSecuritiesItem[];
  };
}

interface HsxMediafileItem {
  fileName?: string;
  fileType?: string;
  filePath?: string;
  publishDate?: number;
  time?: string;
  type?: string;
}

interface HsxMediafilesResponse {
  data?: {
    list?: HsxMediafileItem[];
  };
}

// ---------------------------------------------------------------------------
// Shared headers builder
// ---------------------------------------------------------------------------

function buildHsxHeaders(): Record<string, string> {
  return {
    type: HSX_API_TOKEN,
    Origin: "https://www.hsx.vn",
    Referer: "https://www.hsx.vn/",
    "User-Agent": BROWSER_UA,
    Accept: "application/json, */*",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover BCTC PDF URLs for a HOSE-listed ticker via hsx.vn mediafiles API.
 *
 * Two-call recipe:
 *   1. Resolve ticker → numeric securities ID via /l/api/v1/1/securities/stock
 *   2. Fetch BCTC PDF list via /m/api/v1/1/mediafiles/5/{id}
 *
 * Returns empty array when:
 *   - Ticker not found on hsx.vn (HNX/UPCOM tickers return empty data.list)
 *   - Any HTTP error or network timeout
 *   - Parse failure on either response
 *
 * Never throws. Silent fail → caller falls through to next strategy.
 *
 * @param ticker     Stock ticker symbol (e.g. "VNM", "HPG")
 * @param year       Report year filter (e.g. 2025). Pass 0 for all years.
 * @param timeoutMs  AbortController timeout in milliseconds
 * @returns Array of PDF download URLs (staticfile.hsx.vn) or []
 */
export async function fetchHsxBctcUrls(
  ticker: string,
  year: number,
  timeoutMs: number,
): Promise<string[]> {
  // ── Env gate — set HSX_BCTC_ENABLED=false to skip Strategy 0 entirely ───
  if (Bun.env.HSX_BCTC_ENABLED === "false") return [];

  // ── Step 1: resolve ticker → numeric ID ─────────────────────────────────
  const numericId = await resolveNumericId(ticker, timeoutMs);
  if (numericId === undefined) {
    // Non-HOSE ticker or HTTP error — not an error, just not on hsx.vn
    return [];
  }

  // ── Step 2: fetch BCTC PDF list ──────────────────────────────────────────
  return fetchMediafileUrls(numericId, year, timeoutMs);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a ticker symbol to its hsx.vn numeric securities ID.
 * Returns undefined for non-HOSE tickers (empty data.list) or on error.
 */
async function resolveNumericId(
  ticker: string,
  timeoutMs: number,
): Promise<number | undefined> {
  const url = `${HSX_LISTING_API}?code=${encodeURIComponent(ticker.toUpperCase())}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await globalThis.fetch(url, {
      signal: controller.signal,
      headers: buildHsxHeaders(),
    });

    if (!res.ok) return undefined;

    const json = await res.json() as HsxSecuritiesResponse;
    const list = json?.data?.list;

    if (!Array.isArray(list) || list.length === 0) {
      // Non-HOSE ticker — not an error
      return undefined;
    }

    const item = list[0];
    if (!item || typeof item.id !== "number") return undefined;

    return item.id;
  } catch {
    // Network error, timeout, or parse failure
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches BCTC PDF items from the mediafiles endpoint and constructs download URLs.
 * Returns [] on any error.
 */
async function fetchMediafileUrls(
  numericId: number,
  year: number,
  timeoutMs: number,
): Promise<string[]> {
  const url =
    `${HSX_MEDIAFILES_API}/${numericId}` +
    `?pageIndex=1&pageSize=100&year=${year}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await globalThis.fetch(url, {
      signal: controller.signal,
      headers: buildHsxHeaders(),
    });

    if (!res.ok) return [];

    const json = await res.json() as HsxMediafilesResponse;
    const list = json?.data?.list;

    if (!Array.isArray(list)) return [];

    const urls: string[] = [];
    for (const item of list) {
      if (typeof item !== "object" || item === null) continue;
      const { fileType, filePath } = item;

      // Filter: PDF file type and filePath present
      if (fileType !== ".pdf") continue;
      if (typeof filePath !== "string" || filePath.length === 0) continue;

      // Construct download URL: replace tilde prefix with CDN base
      const downloadUrl = filePath.replace("~", STATICFILE_BASE);
      urls.push(downloadUrl);
    }

    return urls;
  } catch {
    // Network error, timeout, or parse failure
    return [];
  } finally {
    clearTimeout(timer);
  }
}
