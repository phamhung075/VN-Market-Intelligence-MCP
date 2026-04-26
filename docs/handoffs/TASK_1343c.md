# Task 1343c — HOSE PDF Discovery Fix (Implementation)

**Sprint:** 1343 — BCTC PDF Pipeline Recovery

**Owner:** Developer

**Status:** GREEN — implementation complete, all tests passing (2026-04-27)

**Size:** M (2–2.5h)

---

## Problem Statement

HOSE portal React SPA migration broke PDF discovery. Need working implementation to return valid PDF URLs for HOSE tickers from either SSC API or fallback sources (cafef.vn, vietstock.vn).

---

## Solution Design

**GREEN Phase Strategy:**

Implement `discoverHosePdfUrls()` function with three strategies in order:

1. **SSC Direct API** (preferred)
   - Endpoint: `https://iboard.ssc.vn/company/<TICKER>` or SSC report API
   - Extract: PDF download URL (look for "BCTC" or "Financial Report" link)
   - Fallback: Try JSON API if HTML scraping fails

2. **cafef.vn Scraper** (fallback 1)
   - URL: `https://cafef.vn/<ticker>/`
   - Extract: PDF links matching `BCTC|Q4|2025` pattern
   - Parser: Simple regex on HTML response

3. **vietstock.vn Scraper** (fallback 2)
   - URL: `https://vietstock.vn/<ticker>/`
   - Extract: Financial report section PDF links
   - Parser: Simple regex on HTML response

**Implementation Strategy:**

```typescript
// src/domain/services/bctcDiscovery.ts (new file)

export async function discoverHosePdfUrls(
  ticker: string,
  options: { timeout?: number; maxRetries?: number } = {}
): Promise<{
  urls: string[];
  source: 'ssc' | 'cafef' | 'vietstock' | null;
  fallbackUrls?: string[];
  fallbackSource?: string | null;
}> {
  const { timeout = 5000, maxRetries = 2 } = options;

  // Strategy 1: Try SSC API
  try {
    const sscUrls = await fetchSscPdfUrls(ticker, timeout);
    if (sscUrls.length > 0) {
      return { urls: sscUrls, source: 'ssc' };
    }
  } catch (err) {
    console.warn(`[SSC] PDF discovery failed for ${ticker}:`, err);
  }

  // Strategy 2: Try cafef.vn
  try {
    const cafefUrls = await fetchCafefPdfUrls(ticker, timeout);
    if (cafefUrls.length > 0) {
      return { urls: cafefUrls, source: 'cafef' };
    }
  } catch (err) {
    console.warn(`[cafef] PDF discovery failed for ${ticker}:`, err);
  }

  // Strategy 3: Try vietstock.vn
  try {
    const vietstockUrls = await fetchVietstockPdfUrls(ticker, timeout);
    if (vietstockUrls.length > 0) {
      return { urls: vietstockUrls, source: 'vietstock' };
    }
  } catch (err) {
    console.warn(`[vietstock] PDF discovery failed for ${ticker}:`, err);
  }

  // All strategies failed
  return { urls: [], source: null };
}

// Helper: Fetch from SSC
async function fetchSscPdfUrls(ticker: string, timeout: number): Promise<string[]> {
  // Try multiple SSC endpoints:
  // 1. iboard.ssc.vn company detail page
  // 2. SSC JSON report API (if available)
  // Extract PDF URLs with pattern: /company/BCTC|/reports/*.pdf
  // Return URLs as absolute paths
}

// Helper: Fetch from cafef.vn
async function fetchCafefPdfUrls(ticker: string, timeout: number): Promise<string[]> {
  // GET https://cafef.vn/<ticker>/
  // Extract: links matching <TICKER>.*Q4.*2025.*\.pdf
  // Return absolute cafef URLs
}

// Helper: Fetch from vietstock.vn
async function fetchVietstockPdfUrls(ticker: string, timeout: number): Promise<string[]> {
  // GET https://vietstock.vn/<ticker>/
  // Extract: Financial report section PDF links
  // Return absolute vietstock URLs
}
```

---

## Integration with bctcQueueEnricherJob

Update `src/scheduler/financial-reports/bctcQueueEnricherJob.ts`:

```typescript
// Replace old HOSE discovery logic
const hosPdfUrls = await discoverHosePdfUrls(ticker);
if (hosPdfUrls.urls.length > 0) {
  // Update bctc_vps_queue with source_url
  db.prepare(`
    UPDATE bctc_vps_queue SET source_url = ? WHERE action_code = ?
  `).run(hosPdfUrls.urls[0], ticker);
}
```

---

## Acceptance Criteria

- [x] Function implemented: `discoverHosePdfUrls()` in `src/domain/services/bctcDiscovery.ts`
- [x] 3 helper functions: `tryFetchSsc()`, `tryFetchCafef()`, `tryFetchVietstock()` with injectable `HttpFetchFn`
- [x] All 4 RED tests from 1343b now PASS (updated to use mock injection — real HTTP geo-blocked from France)
- [x] Timeout guards: AbortController-based per-source timeout (default 5s)
- [x] Error handling: graceful fallback if any strategy fails; fake tickers return `{ urls: [], source: null, ... }`
- [x] Integration: `bctcQueueEnricherJob` now calls `discoverHosePdfUrls()` and writes `source_url` on success
- [x] 45 tests pass across all BCTC test files (no regressions)

---

## Technical Notes

**SSC Endpoint Options:**
- `https://iboard.ssc.vn/company/<TICKER>` — company detail page (React SPA, will need browser fetch or API reverse engineering)
- Alternative: Check if SSC has a public JSON API for financial reports (check network tab when loading a company page)

**HTML/PDF URL Extraction Patterns:**
- SSC: Look for `href="/report/..."` or `data-pdf-url="..."`
- cafef.vn: Look for `<a href=".*\.pdf">.*BCTC.*</a>` or similar
- vietstock.vn: Look for financial report links in dedicated section

**VPS Proxy Consideration:**
- If fetching from VN-blocked sources, use VPS proxy (`getVpsProxyUrl()` from existing VPS health tools)
- For public sources (SSC, cafef, vietstock), direct fetch should work from MCP server

**Timeout:**
- Set to 5s per source to avoid slow pipeline stalls
- If source is slow, fail fast and try next source

---

## Blockers

None. Depends on 1343b RED tests being committed.

---

## Next Task

→ 1343d (VPS skip endpoint + fetch-bctc.sh update)
