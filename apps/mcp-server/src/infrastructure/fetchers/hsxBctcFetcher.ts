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
 *      → if quarter is provided, filter to only items whose `time` field matches
 *         that quarter (e.g. "01.2025"=Q1, "02.2025"=Q2, "03.2025"=Q3, "04.2025"=Q4)
 *      → prefer type="Quý" (quarterly) entries; prefer fileName containing "hop nhat"
 *         (consolidated B02-TCTD) over cover-letter/notice PDFs
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
 * FIX-CTG-1 (2026-06-03): Added quarter parameter to `fetchHsxBctcUrls` and
 *   `fetchMediafileUrls`. When a quarter is supplied (e.g. "Q1", "Q3"):
 *   - Items are filtered to only those whose `time` field's month prefix matches
 *     the quarter: "01"→Q1, "02"→Q2, "03"→Q3, "04"→Q4. Time field format is
 *     "MM.YYYY" (e.g. "01.2026", "03.2025").
 *   - Items are ranked: type="Quý" preferred over "Năm"/"Bán niên"; within
 *     type-equal items, fileName containing "hop nhat" (consolidated) is ranked
 *     above cover-letter/notice PDFs (fileName containing "cv cbtt" or "cbtt").
 *   This prevents the enricher from writing a wrong-quarter URL into a queue row
 *   (observed: Q3-2025 and Q2-2025 CTG rows corrupted with Q1-2026 URL).
 *
 * @module infrastructure/fetchers/hsxBctcFetcher
 */

import { BROWSER_UA } from "./browserHeaders.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Static public API token embedded in hsx.vn SPA JS bundle (REACT_APP_TYPE). */
const HSX_API_TOKEN = "HJ2HNS3SKICV4FNE";

// ---------------------------------------------------------------------------
// B3-SPACE-URLS-FIX (2026-06-07)
// ---------------------------------------------------------------------------

/**
 * Safely percent-encode a staticfile.hsx.vn URL returned by the mediafiles API.
 *
 * hsx.vn filePath values contain literal spaces, parentheses, and other chars
 * that are invalid in HTTP request-target lines (RFC 3986). This function encodes
 * only those characters while preserving already-encoded sequences so the
 * function is idempotent (calling it twice yields the same output).
 *
 * Characters encoded:
 *   ' ' (U+0020)  → %20
 *   '(' (U+0028)  → %28
 *   ')' (U+0029)  → %29
 *
 * Characters deliberately NOT encoded:
 *   '/' ':' '?' '=' '#' '&' '@' '!' '$' '\'' '*' '+' ',' ';' '~'
 *   (they carry semantic meaning in the URL structure)
 *   '%XX' sequences already in the string (idempotency guard — a pre-encoded
 *   space %20 is left as-is; only a bare percent that is NOT followed by two
 *   hex digits is itself encoded to %25).
 *
 * @param url  Full https://staticfile.hsx.vn/... URL (post tilde-replace)
 * @returns    URL safe for use as an HTTP request-target
 *
 * @example
 *   encodeHsxUrl("https://staticfile.hsx.vn/Uploads/20260420 - PPC (TV, English).pdf")
 *   // → "https://staticfile.hsx.vn/Uploads/20260420%20-%20PPC%20%28TV%2C%20English%29.pdf"
 *
 *   // Idempotency:
 *   encodeHsxUrl(encodeHsxUrl("https://staticfile.hsx.vn/a b.pdf"))
 *   // → "https://staticfile.hsx.vn/a%20b.pdf"  (same as single call)
 */
export function encodeHsxUrl(url: string): string {
  return (
    url
      // Guard: encode bare % that is NOT already part of a %XX sequence
      .replace(/%(?![0-9A-Fa-f]{2})/g, "%25")
      // Spaces → %20
      .replace(/ /g, "%20")
      // Parentheses (common in Vietnamese filenames) → %28 / %29
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
  );
}

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
 * When `quarter` is supplied, filters to items whose `time` field matches that
 * quarter (format "MM.YYYY": "01"=Q1, "02"=Q2, "03"=Q3, "04"=Q4), then ranks
 * results: consolidated ("hop nhat") PDF first, then other Quý-type PDFs, then
 * the rest. This ensures each queue row is enriched with its OWN quarter's URL.
 *
 * Returns empty array when:
 *   - Ticker not found on hsx.vn (HNX/UPCOM tickers return empty data.list)
 *   - Any HTTP error or network timeout
 *   - Parse failure on either response
 *   - quarter is supplied but no items match it
 *
 * Never throws. Silent fail → caller falls through to next strategy.
 *
 * @param ticker     Stock ticker symbol (e.g. "VNM", "HPG")
 * @param year       Report year filter (e.g. 2025). Pass 0 for all years.
 * @param timeoutMs  AbortController timeout in milliseconds
 * @param quarter    Optional report quarter (e.g. "Q1", "Q3"). When supplied,
 *                   only items for that quarter are returned.
 * @returns Array of PDF download URLs (staticfile.hsx.vn), ranked best-first, or []
 */
export async function fetchHsxBctcUrls(
  ticker: string,
  year: number,
  timeoutMs: number,
  quarter?: string,
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
  return fetchMediafileUrls(numericId, year, timeoutMs, quarter);
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

// ---------------------------------------------------------------------------
// Quarter filtering and ranking helpers (FIX-CTG-1)
// ---------------------------------------------------------------------------

/**
 * Maps a quarter string (e.g. "Q1", "Q3") to its two-digit month prefix used
 * in the hsx.vn `time` field (format "MM.YYYY", e.g. "01.2026").
 *
 * The hsx.vn API uses: "01"=Q1, "02"=Q2, "03"=Q3, "04"=Q4.
 * Returns undefined for unrecognised quarter strings (no filtering applied).
 */
function quarterToMonthPrefix(quarter: string): string | undefined {
  const upper = quarter.toUpperCase().replace(/\s/g, "");
  switch (upper) {
    case "Q1": return "01";
    case "Q2": return "02";
    case "Q3": return "03";
    case "Q4": return "04";
    default:   return undefined;
  }
}

/**
 * Returns true when the item's `time` field matches the requested quarter.
 *
 * `time` field examples from hsx.vn:
 *   - "01.2026" → Q1 2026
 *   - "03.2025" → Q3 2025
 *   - "04.2025" → Q4 2025
 *   - "2025"    → annual (no quarter prefix)
 *
 * Matching rule: time starts with "<monthPrefix>." (e.g. "01." for Q1).
 */
function itemMatchesQuarter(time: string | undefined, monthPrefix: string): boolean {
  if (typeof time !== "string" || time.length === 0) return false;
  return time.startsWith(`${monthPrefix}.`);
}

/**
 * Ranks a PDF item for preference within a quarter.
 *
 * Lower score = higher preference (sorted ascending).
 *
 * Rank 0: type="Quý" (quarterly) AND fileName contains "hop nhat" (consolidated)
 * Rank 1: type="Quý" (quarterly), other filenames
 * Rank 2: everything else (annual, semi-annual, or unclear type)
 *
 * This ensures the full consolidated B02-TCTD statement is returned first,
 * ahead of standalone (riêng lẻ) or cover-letter PDFs.
 */
function rankItem(item: HsxMediafileItem): number {
  const typeIsQuy = item.type === "Quý" || item.type === "Quy";
  const nameIsHopNhat = typeof item.fileName === "string" &&
    item.fileName.toLowerCase().includes("hop nhat");
  if (typeIsQuy && nameIsHopNhat) return 0;
  if (typeIsQuy) return 1;
  return 2;
}

/**
 * Fetches BCTC PDF items from the mediafiles endpoint and constructs download URLs.
 *
 * When `quarter` is supplied:
 *   - Filters items to only those whose `time` field matches the quarter
 *     (via `quarterToMonthPrefix` → "01."/"02."/"03."/"04." prefix matching).
 *   - Sorts the remaining items by rank (consolidated "hop nhat" first).
 *
 * Returns [] on any error or when quarter filtering yields no results.
 */
async function fetchMediafileUrls(
  numericId: number,
  year: number,
  timeoutMs: number,
  quarter?: string,
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

    // Resolve the month-prefix filter for quarter filtering (FIX-CTG-1)
    const monthPrefix = quarter !== undefined ? quarterToMonthPrefix(quarter) : undefined;

    // Collect valid PDF items, optionally filtered by quarter
    const candidates: HsxMediafileItem[] = [];
    for (const item of list) {
      if (typeof item !== "object" || item === null) continue;
      const { fileType, filePath, time } = item;

      // Filter: PDF file type and filePath present
      if (fileType !== ".pdf") continue;
      if (typeof filePath !== "string" || filePath.length === 0) continue;

      // Quarter filter: when a month-prefix is resolved, skip non-matching items
      if (monthPrefix !== undefined && !itemMatchesQuarter(time, monthPrefix)) continue;

      candidates.push(item);
    }

    // Sort: consolidated quarterly PDFs first (FIX-CTG-1)
    candidates.sort((a, b) => rankItem(a) - rankItem(b));

    // Construct download URLs: replace tilde prefix with CDN base, then
    // percent-encode characters that are invalid in HTTP request-target lines
    // (spaces, parentheses). encodeHsxUrl is idempotent — already-encoded
    // sequences are left untouched (B3-SPACE-URLS-FIX 2026-06-07).
    return candidates.map(item =>
      encodeHsxUrl((item.filePath as string).replace("~", STATICFILE_BASE)),
    );
  } catch {
    // Network error, timeout, or parse failure
    return [];
  } finally {
    clearTimeout(timer);
  }
}
