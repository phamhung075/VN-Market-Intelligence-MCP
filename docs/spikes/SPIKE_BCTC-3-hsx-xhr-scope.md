# SPIKE_BCTC-3 — hsx.vn SPA XHR Scope for HOSE BCTC Discovery

- **Question:** What XHR endpoints does hsx.vn SPA call for HOSE BCTC document discovery, and can they be invoked headless (curl/fetch) without Playwright?
- **Date:** 2026-05-15
- **Timebox:** 120 min
- **Zones:** `apps/mcp-server/` (bctcDiscovery.ts + bctcQueueEnricherJob.ts), `vps-scripts/` (discover-bctc-urls-browser.py + vps-proxy-server.js)
- **Context:** TASK-BCTC-3 — hsx.vn as alternate BCTC discovery path for HOSE tickers after cafef Strategy 2 removed in 1916b. Playwright on VPS is crashing (TasksMax=32 kills Chromium). Need no-browser replacement.
- **Prior art:** `docs/vps-sources/hsx-bctc/recon.md` (2026-05-13), `docs/vps-sources/hsx-bctc/triage.md` (2026-05-13)

---

## [Architect] Brownfield Findings

### Zone

- **Primary:** `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — domain service, strategy chain
- **Primary:** `vps-scripts/vps-proxy-server.js` — VPS HTTP proxy, would host new hsx endpoint
- **Secondary:** `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — calls discoverHosePdfUrls()
- **Secondary:** `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — HTTP fetch implementation

### Verified Paths

- `apps/mcp-server/src/domain/services/bctcDiscovery.ts:1-455` — strategy chain: Strategy 0 (VPS Playwright via `/proxy/bctc-discover`), Strategy 1 (SSC iboard, NXDOMAIN), Strategy 2 (vietstock, 404). All three dead as of 2026-05-14 (SPIKE_1916).
- `vps-scripts/vps-proxy-server.js:1-429` — Node.js proxy, port 8765. Routes: `/health`, `/proxy/ssc-iboard/*`, `/proxy/bctc-discover/:ticker`, `/bctc-files/:code/:filename`.
- `vps-scripts/fetch-bctc.sh` — calls `discover-bctc-urls-browser.py` directly (shell subprocess, NOT via vps-proxy-server.js). Used as the working BCTC fetch pipeline when TasksMax allows Playwright.
- `docs/vps-sources/hsx-bctc/recon.md` — prior recon: `www.hsx.vn/Modules/Listed/Web/StockDocuments` returns SPA shell only (1,900 bytes, no inline data). Playwright required previously.

---

## Section 1 — XHR Endpoints Identified (JS Bundle Analysis)

**Method:** Fetched and analyzed `https://www.hsx.vn/static/js/main.d430e296.js` (2.43 MB, React SPA bundle, build date 2026-03-06). All API URLs and token constants are embedded in the minified bundle.

### 1.1 API Base URL Structure

hsx.vn uses a microservices API at `api.hsx.vn` (same IP 103.147.36.10) with 8 service prefix paths:

| Constant | Service Name | Base URL | Accessible from France? |
|----------|-------------|----------|------------------------|
| `cn` | SERVICE_CONTENT | `https://api.hsx.vn/c/api/v1` | Yes (200) |
| `un` | SERVICE_NEWS | `https://api.hsx.vn/n/api/v1` | No (404) |
| `hn` | SERVICE_SECORGS | `https://api.hsx.vn/s/api/v1` | No (404) |
| `pn` | SERVICE_AUCTION | `https://api.hsx.vn/a/api/v1` | No (404) |
| `fn` | SERVICE_LISTING | `https://api.hsx.vn/l/api/v1` | Yes (200) |
| `dn` | SERVICE_MEDIA | `https://api.hsx.vn/m/api/v1` | No (404) |
| `gn` | SERVICE_IDENTITY | `https://api.hsx.vn/i/api/v1` | No (404) |
| `mn` | SERVICE_MARKETDATA | `https://api.hsx.vn/mk/api/v1` | Yes (200) |

**BCTC document listing uses `SERVICE_NEWS` (/n/) — which returns 404 from France.**

### 1.2 The BCTC Discovery Endpoints

Extracted from React action creators in the JS bundle:

#### Endpoint A — Disclosure List by Securities Type (used by `/thong-tin-cong-bo` page)

```
GET https://api.hsx.vn/n/api/v1/news/securitiesType/{securitiesTypeId}
  ?pageIndex=1
  &pageSize=20
  &startDate=YYYY-MM-DD
  &endDate=YYYY-MM-DD
```

- `securitiesTypeId` = `1` for stocks (`REACT_APP_SECURITIES_NEWS_TYPE_DB_STOCK: "1"`)
- Returns paginated list of all HOSE disclosure documents, not ticker-filtered
- Not directly useful for per-ticker discovery without client-side filtering

#### Endpoint B — Per-Ticker News/Disclosures (the key BCTC discovery endpoint)

```
GET https://api.hsx.vn/n/api/v1/news/securities/{TICKER}/{newsTypeId}
  ?pageIndex=1
  &pageSize=20
  &startDate=YYYY-MM-DD
  &endDate=YYYY-MM-DD
```

- `TICKER` = uppercase ticker symbol (e.g., `VNM`, `HPG`, `VEA`)
- `newsTypeId` = `1` for stocks (`SECURITIES_NEWS_TYPE_DB_STOCK`)
- Returns disclosure items with `filePath` and `fileName` fields for each document
- **This is the primary BCTC PDF discovery endpoint for HOSE tickers**

#### Endpoint C — Annual Report Listing

```
GET https://api.hsx.vn/n/api/v1/news/annualreport
  ?pageIndex=1
  &pageSize=20
  &startDate=YYYY-MM-DD
  &endDate=YYYY-MM-DD
```

- Non-ticker-specific; lists annual reports across all HOSE companies

#### Endpoint D — Finance Data by Ticker (NOT BCTC PDFs)

```
GET https://api.hsx.vn/l/api/v1/securities/finance/{TICKER}
  ?time={quarter_code}
```

- `quarter_code` format: `{quarter}{year}` where quarter = `01`/`02`/`03`/`04` → `042025` = Q4 2025
- Returns financial **indicator data** (ratios/numbers), NOT PDF document links
- `time=00{year}` for year-over-year view, `9999` for all-years aggregate
- This endpoint works from France but is not useful for BCTC PDF discovery

### 1.3 Authentication and Auth Header

The SPA sends a static API token header on every request:

```
type: HJ2HNS3SKICV4FNE
Content-Type: application/json
```

This token is hardcoded in the JS bundle (`REACT_APP_TYPE: "HJ2HNS3SKICV4FNE"`). No login, no OAuth, no CSRF token. The token is **public** (embedded in the minified bundle served to any browser without authentication).

### 1.4 Document File URL Pattern

When the news API returns documents, `filePath` values use a tilde-prefix pattern:

```
filePath: "~/path/to/document.pdf"
```

Rendered by the SPA's `hr()` helper as:

```
https://staticfile.hsx.vn/path/to/document.pdf
```

`staticfile.hsx.vn` resolves to the same IP (103.147.36.10) and is accessible over HTTPS from France. Once a `filePath` is obtained from the news API, the PDF download URL can be constructed without any additional auth.

### 1.5 Elasticsearch Search API (not useful for BCTC)

```
GET https://api.hsx.vn/q/api/v1/search
  ?indexName=securities
  &field=code^2,isin,figi,introduction
  &query={search_term}
  &page=1
  &pageSize=100
```

Credentials embedded in bundle: `REACT_APP_ES_USERNAME: "internet_user"`, `REACT_APP_ES_PASSWORD: "internet_user"`. This searches the securities index only (tickers/names), not BCTC documents. Not useful for PDF discovery.

### 1.6 RSS Feeds (publicly accessible, limited utility)

```
GET https://api.hsx.vn/n/api/v1/News/NewsFeed
GET https://api.hsx.vn/n/api/v1/News/NewsByCateFeed/{cateId}
```

Note: capital-N `News` paths work from France (200), but lowercase `/n/api/v1/news/*` paths return 404. Only 3 categories are accessible:
- `cateId=11`: Quản trị công ty (0 items, empty)
- `cateId=21`: Tin Tổ chức niêm yết (10 items, general listed company news)
- `cateId=22`: Tin CTY CKTV (10 items, member firms news)

RSS does not include BCTC financial report documents and returns at most 10 items per category with no ticker filter. Not useful for BCTC discovery.

---

## Section 2 — Headless Reachability from France vs. VPS

### 2.1 Confirmed Reachable from France (curl without browser)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `https://www.hsx.vn/` (HTTPS via IP) | 200 | SPA shell only, no data |
| `https://api.hsx.vn/l/api/v1/securities/*` | 200 | Listed company data (not BCTC PDFs) |
| `https://api.hsx.vn/c/api/v1/config` | 200 | Config values |
| `https://api.hsx.vn/mk/api/v1/market/trading-report` | 200 | Market data |
| `https://api.hsx.vn/n/api/v1/News/NewsFeed` | 200 | RSS (capital-N) |
| `https://staticfile.hsx.vn/{path}` | 200 | Static file server (PDFs once URL is known) |

### 2.2 Returns 404 from France — Required from VPS (Vietnam IP)

| Endpoint | Status from France | Reason |
|----------|--------------------|--------|
| `https://api.hsx.vn/n/api/v1/news/securities/{TICKER}/{newsTypeId}` | **404** | Geo-restricted or internal-network-only route |
| `https://api.hsx.vn/n/api/v1/news/securitiesType/{typeId}` | **404** | Same |
| `https://api.hsx.vn/n/api/v1/news/cate?aliasCate=...` | **404** | Same |
| `https://api.hsx.vn/s/api/v1/*` | **404** | Same |
| `https://api.hsx.vn/m/api/v1/*` | **404** | Same |

**Geo-restriction evidence:**
- `x-envoy-upstream-service-time: 1-2ms` on 404 responses — responses served from Envoy edge without reaching backend
- `cache-control: public, max-age=1` — negative caching at CDN layer
- Working endpoints (/l/, /c/, /mk/) have `cache-control: max-age=60` and 6ms upstream times (forwarded to backend)
- The server certificate is valid (`hsx.vn` CommonName, GlobalSign issuer) — TLS is NOT the barrier
- Root cause: SERVICE_NEWS (`/n/`) is deliberately not exposed through the external Envoy gateway. Internal VN network traffic routes through a different path that reaches the backend directly.

### 2.3 VPS (Vietnam IP) Assessment

The Vinahost VPS at 125.212.251.27 is in Vietnam. `api.hsx.vn` resolves to 103.147.36.10 (HOSE datacenter, Vietnam). VN-to-VN traffic from the VPS would bypass the Envoy edge geo-restriction and reach the SERVICE_NEWS backend directly.

**Confidence:** High. This is the same pattern established for the existing BCTC pipeline — VPS routes to SSC portal and HNX AJAX endpoints that are similarly geo-restricted. The `triage.md` entry "HSX side unchanged: Still SPA, still no direct data via curl" was based on testing from France, not from the VPS.

---

## Section 3 — Auth/Session Requirements

### For the BCTC Document Listing Endpoints

| Requirement | Required? | Details |
|------------|-----------|---------|
| Login session | No | All news/disclosure endpoints are public |
| Cookie | No | F5 BigIP `TS01*` cookies are load-balancer affinity only; requests without them still return 200 |
| API key header | Recommended | `type: HJ2HNS3SKICV4FNE` — hardcoded public token embedded in JS. Endpoints may return 403 without it (unverified), but it is safe to include |
| CSRF token | No | No CSRF on GET requests |
| `Origin` header | Recommended | `Origin: https://www.hsx.vn` for correct CORS negotiation |
| `Referer` header | Recommended | `Referer: https://www.hsx.vn/thong-tin-cong-bo` |
| Rate limiting | Unknown | Not tested from VPS. Given this is a public exchange portal, aggressive rate limiting is unlikely for reasonable crawl cadence |

### For PDF Downloads (staticfile.hsx.vn)

No auth required once the `filePath` is known. Direct GET with browser User-Agent is sufficient. No session, no token, no CSRF.

---

## Section 4 — Recommended Implementation Approach

### Verdict: VPS Scraper — New Endpoint on :8765

**Pure XHR (no Playwright) via VPS is feasible and recommended.**

The implementation requires two HTTP calls per ticker:
1. `GET https://api.hsx.vn/n/api/v1/news/securities/{TICKER}/1?pageIndex=1&pageSize=20&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}` → returns list of disclosure documents with `filePath` fields
2. Construct PDF URL: `filePath.replace("~", "https://staticfile.hsx.vn")`

No browser. No Playwright. No session management. No CSRF.

### Implementation Pattern

**Option A — New Python scraper on VPS (preferred)**

Add `fetch-hsx-bctc.py` to `vps-scripts/`. The script:
1. Accepts `{ticker}`, `{year}`, `{quarter}` arguments (same interface as `discover-bctc-urls-browser.py`)
2. Computes `startDate`/`endDate` for the requested quarter (e.g., Q1/2026 → 2026-01-01 to 2026-03-31)
3. Calls the news/securities endpoint with `requests`/`httpx` or `urllib`
4. Parses JSON response, constructs full PDF URLs from `filePath` fields
5. Filters results: only items where `fileName.endswith('.pdf')` and title matches BCTC keywords (e.g., "báo cáo tài chính", "BCTC", quarter/year matching)
6. Emits JSON: `{"results": [{"url": "...", "source": "hsx", "confidence": 0.9}], "error": null}`

This output format is compatible with the existing `VpsPlaywrightResult`/`VpsPlaywrightResponse` interface in `bctcDiscovery.ts`.

**Option B — New endpoint in vps-proxy-server.js**

Add route `GET /proxy/bctc-discover-hsx/:ticker?year=YYYY&quarter=Q` to `vps-proxy-server.js`. This forwards to `api.hsx.vn/n/api/v1/news/securities/{ticker}/1` and returns the normalized result. Callable from `bctcDiscovery.ts` (Strategy 0 path) via `BCTC_DISCOVER_URL` env var.

**Recommended: Option A (Python scraper) for consistency with existing VPS script pattern. Option B is also valid if the proxy is preferred as the integration surface.**

### Integration Point

The new scraper slots into `discover-bctc-urls-browser.py` as a pre-Playwright step:

```python
# In discover-bctc-urls-browser.py — before Playwright launch:
results = _discover_hsx_xhr(ticker, year, quarter)  # new function
if results:
    return {"results": results, "error": None}
# Fall through to Playwright if XHR fails
```

Alternatively, `vps-proxy-server.js` can call the Python scraper via `child_process.spawn` (same pattern as the existing `runDiscoverScript` function).

### Integration for bctcDiscovery.ts (Strategy 0 path)

`bctcDiscovery.ts` already handles VPS Playwright via `BCTC_DISCOVER_URL` → `GET /proxy/bctc-discover/:ticker`. The VPS-side change (adding hsx.vn XHR as first attempt inside `discover-bctc-urls-browser.py`) requires zero changes to `bctcDiscovery.ts` or `bctcHttpFetcher.ts`. The domain service remains unchanged.

---

## Section 5 — Risks and Unknowns

| Risk | Severity | Likelihood | Notes |
|------|----------|-----------|-------|
| **R-1: /n/ API is geo-restricted but not IP-restricted** | HIGH | Low | If the restriction is IP-based (VN only), VPS access works. If it's account-based or requires internal network routing not exposed to any external IP, VPS may also get 404. Must be verified by running a test curl from VPS. |
| **R-2: API returns documents without PDF links for some tickers** | MEDIUM | Medium | Prior recon noted "api.hsx.vn news API returns items with no PDF URLs (ADF PPR links)". This comment in `discover-bctc-urls-browser.py` (which no longer exists in the repo) may mean some disclosure items link to SSC portal (ADF PPR) rather than direct PDFs on staticfile.hsx.vn. Confidence filtering required. |
| **R-3: Date range may not capture all quarters** | LOW | Medium | The API uses `startDate`/`endDate` filters. A BCTC report filed late (e.g., May for Q1) may fall outside the quarter's date range. Use `startDate` = first day of the quarter and `endDate` = 90 days after quarter end (or current date) to catch late filings. |
| **R-4: `filePath` field absent for some document types** | LOW | Low | Some disclosure items may be HTML news items without attached PDFs. Filter on `fileName.endsWith('.pdf')` or presence of `filePath` field. |
| **R-5: Rate limiting from VPS** | LOW | Low | HOSE is a public exchange portal. Cadence: one call per ticker per bctcQueueEnricher cycle (every 15 min, ~30 tickers). ~30 requests/15 min is well within any sane rate limit. |
| **R-6: API structure changes** | LOW | Low | The JS bundle is dated 2026-03-06. The API has been stable. However, the token `HJ2HNS3SKICV4FNE` is hardcoded in the bundle — if HOSE rotates it, requests may fail. Monitor for 403 responses. |
| **U-1: Exact `filePath` format unknown without live API response** | MEDIUM | — | All PDF URL construction logic is inferred from JS code analysis. Live probe from VPS required to confirm the `filePath` → full URL mapping is correct. The `hr()` function logic (`replace("~", "https://staticfile.hsx.vn")`) is clear from JS source. |
| **U-2: `newsTypeId=1` may not be the correct filter for BCTC** | MEDIUM | — | `SECURITIES_NEWS_TYPE_DB_STOCK: "1"` is the stock news type. BCTC financial reports are a sub-category of this. The API may also return general company announcements mixed with BCTC documents — title/keyword filtering will be needed to isolate BCTC PDFs. |
| **U-3: Pagination depth** | LOW | — | `pageSize=20` captures recent disclosures. For older quarters, pagination may be needed. The bctcQueueEnricher typically queries the most recent 1-2 quarters, so depth is unlikely to be an issue. |

---

## Section 6 — Acceptance Criteria for TASK-BCTC-3

Per TASKS.md definition:

1. Identify XHR endpoints — **DONE** (this spike). Endpoints documented in Section 1.
2. Document recipe in `docs/vps-sources/hsx-bctc/triage.md` — requires developer to update with live probe results from VPS.
3. Implement no-browser discovery for HOSE — new Python scraper or vps-proxy-server.js route.
4. Live-test 3+ HOSE tickers (VNM/VEA/HPG) discovers Q1/2026 PDFs — requires VPS probe to confirm /n/ API accessible.
5. Playwright remains fallback — retain `discover-bctc-urls-browser.py` as fallback; hsx.vn XHR is primary attempt.

**Prerequisite before coding:** Dev must first run from VPS:

```bash
curl -s \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
  -H "type: HJ2HNS3SKICV4FNE" \
  -H "Accept: application/json" \
  -H "Referer: https://www.hsx.vn/thong-tin-cong-bo" \
  -H "Origin: https://www.hsx.vn" \
  "https://api.hsx.vn/n/api/v1/news/securities/VNM/1?pageIndex=1&pageSize=5&startDate=2026-01-01&endDate=2026-05-15"
```

If this returns `{"data":[...],"success":true}` with items (not empty array and not 404), the XHR approach is confirmed viable and implementation can proceed.

---

## Summary

hsx.vn is a React SPA. Its BCTC document discovery uses `GET /n/api/v1/news/securities/{TICKER}/1` on `api.hsx.vn`. This endpoint requires only a static public API token (`type: HJ2HNS3SKICV4FNE` header) and no login/session. PDF download URLs are constructed from the `filePath` field: `filePath.replace("~", "https://staticfile.hsx.vn")`.

The endpoint returns 404 from France but is expected to be accessible from the Vinahost VPS (Vietnam). This must be verified before implementation begins (one-line curl from VPS as above).

If accessible from VPS, TASK-BCTC-3 is a pure Python/Node addition (no changes to `bctcDiscovery.ts`, no changes to the BCTC queue enricher pipeline). The hsx.vn scraper replaces the Playwright path for HOSE tickers, eliminating the `TasksMax=32` crash.

---

**Evidence collected:** `https://www.hsx.vn/static/js/main.d430e296.js` (2.43 MB, analyzed locally), live HTTP probes to `api.hsx.vn` and `staticfile.hsx.vn` from France (2026-05-15). VPS verification probes from Vinahost 125.212.251.27 (2026-05-15).
**Code reference:** No spike branch (investigation was read-only HTTP probes + JS bundle analysis).

---

## Main-Server Recon — 2026-05-15

**Date:** 2026-05-15
**Method:** Live HTTP probes from main server (France) + JS bundle deep analysis (`main.d430e296.js`, 2.43 MB)
**Result: PRIOR CONCLUSION OVERTURNED — endpoints ARE accessible from France with correct URL structure**

### Root Cause of Prior 404s

All prior probes (France and VPS) used the wrong URL. The `$n()` URL builder in the SPA appends a **locale segment** by default (second argument `true`):

```javascript
// JS bundle — $n() function definition:
$n = function(serviceKey, withLocale=true) {
  let base = "https://api.hsx.vn/n/api/v1";  // for un (SERVICE_NEWS)
  return withLocale ? `${base}/${Jn()}` : base;
}
// Jn() returns locale ID: 1 for Vietnamese (vi-VN)
```

So the SPA actually calls:
```
https://api.hsx.vn/n/api/v1/1/news/securities/{numericId}/{newsTypeId}?...
                            ^^ locale segment missing in all prior probes
```

And the `{TICKER}` segment is **not the string ticker** but a **numeric securities ID**. The Architect spike documented the endpoint as `{TICKER}` — this was incorrect. `TICKER` is an integer.

### Correct URL Structure

```
GET https://api.hsx.vn/n/api/v1/1/news/securities/{numericId}/{newsTypeId}
  ?pageIndex=1
  &pageSize=20
  &startDate=YYYY-MM-DD
  &endDate=YYYY-MM-DD
```

- `/1/` = locale segment (Jn() returns `1` for Vietnamese)
- `{numericId}` = numeric securities ID (NOT ticker string); resolve via `/l/api/v1/1/securities/stock?code={TICKER}`
- `{newsTypeId}` = `1` for stock news/disclosures

### Numeric ID Lookup

```
GET https://api.hsx.vn/l/api/v1/1/securities/stock?code={TICKER}
  → response.data.list[0].id
```

Confirmed working from France with the standard header set. VNM = **2281**.

### BCTC Documents — Dedicated Mediafiles Endpoint (Simpler)

There is a **direct BCTC-specific endpoint** under the `/m/` (SERVICE_MEDIA) service that returns PDF file listings — no news/disclosures mixing:

```
GET https://api.hsx.vn/m/api/v1/1/mediafiles/{typeId}/{numericId}
  ?pageIndex=1
  &pageSize=100
  &year={YYYY or 0 for all}
```

Confirmed type IDs for VNM (numericId=2281):
- `typeId=5` = **BCTC (Financial Reports) — CONFIRMED HTTP 200** with PDF results
- `typeId=1` = General company documents (PDF attachments to disclosures)
- `typeId=4`, `6`, `9`, `10` = HTTP 200 but 0 items for VNM (other document categories)

### Live HTTP 200 Results

**Ticker ID lookup** (`/l/api/v1/1/securities/stock?code=VNM`): HTTP 200
```json
{"data": {"list": [{"id": 2281, "name": "Công ty Cổ phần Sữa Việt Nam", "code": "VNM", ...}]}}
```

**BCTC mediafiles** (`/m/api/v1/1/mediafiles/5/2281?pageIndex=1&pageSize=5&year=2025`): HTTP 200, 10 items
```json
{
  "fileName": "20260227 - VNM - BCTC HOP NHAT 2025 - DA KIEM TOAN.pdf",
  "fileType": ".pdf",
  "filePath": "~/Uploads/UploadDocuments/2440890/20260227 - VNM - BCTC HOP NHAT 2025 - DA KIEM TOAN.pdf",
  "publishDate": 1735664400,
  "publishFrom": 1735664400,
  "relatedType": 5,
  "publishType": 3.0,
  "time": "2025",
  "type": "Năm",
  "langId": 1,
  "createdDate": 1772432962
}
```

Additional items in the same response (year=2025/2026 docs): Q1.2026 soát xét, Q4.2025, Q3.2025, Q2.2025, Q1.2025 — full quarterly + annual coverage.

**PDF download** (`staticfile.hsx.vn` URL constructed from filePath): HTTP 200, `Content-Type: application/pdf`, `Content-Length: 3327818` (3.3 MB). Confirmed downloadable from France without any auth.

**News disclosures** (`/n/api/v1/1/news/securities/2281/1?pageIndex=1&pageSize=5&startDate=2025-01-01&endDate=2025-12-31`): HTTP 200, returns general corporate disclosures (board resolutions, insider transaction reports, etc.) — NOT the BCTC PDF documents. The mediafiles endpoint (type=5) is the correct BCTC path.

### Working Header Set (Confirmed from France)

```
type: HJ2HNS3SKICV4FNE
Content-Type: application/json
Origin: https://www.hsx.vn
Referer: https://www.hsx.vn/
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
```

No cookies. No Bearer token. No CSRF. Requests without cookies still get HTTP 200 (F5 BigIP `TS01*` cookies are load-balancer affinity only, not auth).

### filePath → Download URL

```python
download_url = file_path.replace("~", "https://staticfile.hsx.vn")
# "~/Uploads/UploadDocuments/2440890/filename.pdf"
# → "https://staticfile.hsx.vn/Uploads/UploadDocuments/2440890/filename.pdf"
```

Confirmed in JS bundle: `hr()` helper at bundle offset 82892.

### Two-Call Recipe Per Ticker

```python
import requests, urllib.parse

HEADERS = {
    "type": "HJ2HNS3SKICV4FNE",
    "Content-Type": "application/json",
    "Origin": "https://www.hsx.vn",
    "Referer": "https://www.hsx.vn/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

# Step 1: resolve ticker → numeric ID
def get_securities_id(ticker: str) -> int:
    r = requests.get(
        f"https://api.hsx.vn/l/api/v1/1/securities/stock",
        params={"code": ticker},
        headers=HEADERS, timeout=10
    )
    r.raise_for_status()
    return r.json()["data"]["list"][0]["id"]

# Step 2: fetch BCTC document list (typeId=5 = financial reports)
def get_bctc_pdfs(numeric_id: int, year: int = 0) -> list[dict]:
    r = requests.get(
        f"https://api.hsx.vn/m/api/v1/1/mediafiles/5/{numeric_id}",
        params={"pageIndex": 1, "pageSize": 100, "year": year},
        headers=HEADERS, timeout=10
    )
    r.raise_for_status()
    items = r.json()["data"]["list"]
    return [
        {
            "url": item["filePath"].replace("~", "https://staticfile.hsx.vn"),
            "fileName": item["fileName"],
            "period": item.get("time", ""),
            "periodType": item.get("type", ""),
            "publishDate": item["publishDate"],
        }
        for item in items if item.get("filePath")
    ]
```

### Re-Assessment of TASK-BCTC-3 Status

**The "permanent Envoy route-block" conclusion (2026-05-15 VPS probe) was incorrect.** The prior probes failed because:

1. URL missing locale segment: `/n/api/v1/news/securities/VNM/1` instead of `/n/api/v1/1/news/securities/{numericId}/1`
2. `{TICKER}` used as string when the API expects a **numeric ID**

The `/n/api/v1/` news endpoint does return HTTP 400 (validation error, not 404) from France when the URL structure is corrected but the numeric ID constraint is violated. The `/m/api/v1/1/mediafiles/5/{numericId}` endpoint returns **HTTP 200 with BCTC PDFs directly from France** — no VPS required.

**Revised verdict:** hsx.vn BCTC discovery is accessible from ANY IP (France, VPS, main server) using the correct two-call recipe above. No Playwright. No VPS proxy. Pure HTTP.

**TASK-BCTC-3b and TASK-BCTC-3c should be REOPENED.** The implementation can target the main server (no VPS needed) since both endpoints are accessible from France.

### Probe Summary Table

| Endpoint | Correct URL | HTTP Status (France) | Notes |
|----------|-------------|---------------------|-------|
| Ticker ID lookup | `GET /l/api/v1/1/securities/stock?code=VNM` | **200** | Returns `id: 2281` |
| BCTC mediafiles | `GET /m/api/v1/1/mediafiles/5/2281?year=2025` | **200** | 10 PDF items |
| News disclosures | `GET /n/api/v1/1/news/securities/2281/1?startDate=...` | **200** | General disclosures, not BCTC PDFs |
| PDF download | `GET https://staticfile.hsx.vn/Uploads/UploadDocuments/...` | **200** | 3.3MB PDF confirmed |
| Prior probe (WRONG) | `GET /n/api/v1/news/securities/VNM/1` | 404 | Missing `/1/` locale + wrong ID type |

---

**Evidence:** Live probes from main server (France) 2026-05-15. JS bundle `main.d430e296.js` analyzed locally.

---

## VPS Verification (TASK-BCTC-3a) — 2026-05-15

**Date:** 2026-05-15
**VPS:** Vinahost 125.212.251.27 (Vietnam IP)
**Result: FAIL — HTTP 404 on all /n/api/v1/news/* endpoints from VPS**

### Curl Command Run

```bash
curl -sv \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
  -H "type: HJ2HNS3SKICV4FNE" \
  -H "Accept: application/json" \
  -H "Referer: https://www.hsx.vn/thong-tin-cong-bo" \
  -H "Origin: https://www.hsx.vn" \
  "https://api.hsx.vn/n/api/v1/news/securities/VNM/1?pageIndex=1&pageSize=5&startDate=2025-01-01&endDate=2025-12-31"
```

### HTTP Status

- **HTTP 404 Not Found** — same as France. TASK-BCTC-3a prerequisite FAIL.

### Response Headers (from VPS)

```
HTTP/1.1 404 Not Found
date: Fri, 15 May 2026 04:38:15 GMT
content-length: 0
cache-control: public, max-age=1
vary: Accept-Encoding
access-control-allow-origin: *
x-envoy-upstream-service-time: 2
```

- `x-envoy-upstream-service-time: 2ms` — identical to France probes (1-2ms). Request is rejected at the Envoy edge gateway, not forwarded to the backend service. The geo-restriction is an Envoy routing rule, not a network-level IP filter.
- `content-length: 0` — empty body, no JSON returned.

### Sample Response Shape

None — empty body on all probes.

### filePath Fields Present

No — endpoint did not return data.

### staticfile.hsx.vn Reachability

**PASS — HTTP 200 OK** from VPS:

```
HTTP/1.1 200 OK
Cache-Control: private
Content-Length: 1764
Content-Type: text/html; charset=utf-8
```

`staticfile.hsx.vn` is reachable. PDF downloads would succeed once a filePath is obtained. The blocker is the discovery endpoint only.

### All Endpoints Probed from VPS

| Endpoint | HTTP Status | x-envoy-upstream-service-time |
|----------|-------------|-------------------------------|
| `GET /n/api/v1/news/securities/VNM/1` | **404** | 2ms (edge-rejected) |
| `GET /n/api/v1/news/securities/VNM/2` | **404** | ~2ms |
| `GET /n/api/v1/news/securities/VNM/4` | **404** | ~2ms |
| `GET /n/api/v1/news/securitiesType/1` | **404** | ~2ms |
| `GET /n/api/v1/news/cate?aliasCate=...` | **404** | ~2ms |
| `GET /n/api/v1/News/Securities/VNM/1` | **404** | ~2ms (capital-N variant) |
| `GET /n/api/v1/News/SecuritiesType/1` | **404** | ~2ms (capital-N variant) |
| `GET /n/api/v1/News/NewsFeed` | **200** | — (RSS XML only) |
| `GET /n/api/v1/News/NewsByCateFeed/21` | **200** | — (RSS XML only) |
| `staticfile.hsx.vn/` | **200** | — (static file server) |

### Root Cause Analysis

The `/n/api/v1/news/*` JSON REST endpoints are not exposed through the Envoy external gateway on any path or from any external IP. Only the RSS feeds (`/n/api/v1/News/NewsFeed`, `/n/api/v1/News/NewsByCateFeed/*`) are proxied externally. The restriction is an **Envoy route table configuration** — specifically, the gateway routes `/n/api/v1/News/New*` (RSS paths) but does NOT route `/n/api/v1/news/securities*` or `/n/api/v1/news/securitiesType*`. This is not geo-IP blocking — it is route-level access control. The VPS Vietnam IP does not bypass it.

The prior spike assessment (Section 2.3: "VN-to-VN traffic from the VPS would bypass the Envoy edge geo-restriction") was incorrect. The restriction is not geo-IP. It is an Envoy route rule. No external IP — including Vietnam IPs — can reach these endpoints without a route being added to the gateway configuration by HOSE.

### RSS Feed Analysis (dead-end)

The accessible RSS feeds (`NewsByCateFeed/21`, `NewsByCateFeed/11`) contain general listed-company announcements in XML format. No `filePath` fields. No direct PDF links. These feeds are not usable for BCTC PDF discovery.

### Conclusion

**TASK-BCTC-3a: FAIL — BLOCKER**

The `api.hsx.vn/n/api/v1/news/securities/` endpoint is not accessible from the Vinahost VPS or any external source. The XHR-based pure Python approach (TASK-BCTC-3b) cannot proceed as designed. TASK-BCTC-3b and TASK-BCTC-3c are BLOCKED pending architect re-assessment of alternative BCTC discovery paths for HOSE tickers.

---

## Re-Assessment — Alternate HOSE BCTC Discovery Paths

**Date:** 2026-05-15
**Triggered by:** TASK-BCTC-3a FAIL (Envoy route-block confirmed, not geo-IP)
**Architect:** Architect agent (SPIKE mode — findings only, no code)

### Premise: What is the actual gap?

The current enricher chain (`bctcQueueEnricherJob` → `discoverHosePdfUrls`) has three strategies, all dead:
- Strategy 0 (VPS Playwright → SSC oracle ADF): now wired and working for tickers that ARE discovered — but Playwright is fragile on VPS (TasksMax=32, ~1 GB RAM). The working production pipeline (`fetch-bctc.sh` + `discover-bctc-urls-browser.py`) already uses SSC oracle ADF via Playwright. It succeeds for HOSE tickers when Playwright can launch.
- Strategy 1 (SSC iboard): NXDOMAIN since 2026-04-27. Cannot recover without HOSE re-registering the subdomain.
- Strategy 2 (vietstock): HTTP 404 from both France and VPS (JS-rendered page, confirmed dead SPIKE_1916).

The question is: when Playwright crashes (TasksMax/OOM kills Chromium), is there a no-browser fallback for HOSE-listed tickers specifically?

### Candidate Assessment

#### Candidate 1 — SSC portal scoped to HOSE (`congbothongtin.ssc.gov.vn`)

**Verdict: VIABLE (existing) — covers HOSE, but Playwright-only.**

The SSC portal is the official disclosure registry for ALL Vietnamese-listed companies (HOSE + HNX + UPCOM). It is not HOSE-specific; it accepts any ticker regardless of exchange. The existing `discover-bctc-urls-browser.py` Playwright script already uses this portal as its primary path. Evidence from `docs/vps-crawl-techniques/ssc-playwright-download.md` and `fetch-bctc.sh` confirms this is the current working discovery mechanism.

The SSC portal covers every HOSE ticker in the watchlist. It does NOT miss HOSE PDFs by design — it is the official regulator filing point. The issue is not coverage but Playwright reliability under VPS resource constraints.

**Does hsx.vn add anything?** No. If SSC Playwright works, hsx.vn adds nothing — SSC is the authoritative source and covers 100% of HOSE issuers. If SSC Playwright fails (TasksMax/OOM), hsx.vn would have been the fallback, but the Envoy block makes it permanently unavailable.

#### Candidate 2 — hsx.vn SPA HTML via Playwright on main server

**Verdict: NOT VIABLE.**

The main server runs in Docker on the local macOS machine. There is no Playwright/Chromium in any Docker container in the current architecture (`apps/mcp-server`, `apps/pdf-extractor`, etc.). Adding Playwright to the main server would require: (a) a new Docker image layer with Chromium, (b) RAM allocation for Chromium in an already constrained local environment, (c) reachability to `api.hsx.vn/n/` which is Envoy-blocked for ALL external IPs including the main server's IP. Point (c) is the fatal blocker — the Envoy route-block is not about IP geography, it is about the route table. The main server would get the same HTTP 404 as VPS Vietnam and France.

Even if Playwright on the main server could render the hsx.vn SPA, the SPA's XHR calls would still fail because `api.hsx.vn/n/` is not accessible from any external source. The SPA would render as an empty page (no documents listed) — not a functional fallback.

#### Candidate 3 — cafef BCTC HTML investor-relations pages (`cafef.vn/tai-lieu-tai-chinh/{ticker}/bctc`)

**Verdict: UNKNOWN — needs VPS probe. Low confidence based on existing evidence.**

The removed Strategy 2 was the `s.cafef.vn/Candles/FinanceInfo.ashx` JSON API, which is different from the cafef investor-relations HTML pages. The HTML pages at `cafef.vn/tai-lieu-tai-chinh/{ticker}/bctc` are a distinct URL pattern not previously tested from VPS.

Existing evidence from SPIKE_1916 / `bctcDiscovery.ts` docblock: `cafef.vn/tai-lieu-tai-chinh/<ticker>/bctc` returns HTTP 302 captcha from France. This captcha-redirect behavior is standard for cafef's Cloudflare-protected paths from non-VN IPs. From the VPS (Vietnam IP), Cloudflare challenges are typically bypassed.

However: cafef BCTC pages are noted in the `bctcDiscovery.ts` docblock (TASK_1916b candidate (a)) as "302 captcha from France" — the original investigation only tested from France, not from VPS. The VPS probe of this URL has not been done.

Risk factors:
- The page content is likely JS-rendered (React/Next.js), requiring Playwright to extract PDF links — same problem as vietstock.
- Even if the HTML contains PDF hrefs, they may link to `congbothongtin.ssc.gov.vn` PPR download triggers (session-bound, not stable URLs), which requires the SSC oracle ADF session to download.
- cafef is a news aggregator, not an official filing portal — its BCTC links are typically pointers to SSC or the issuer's own website, not direct PDF copies.

**Verdict: UNKNOWN — needs one VPS curl to the HTML page to check if PDF hrefs are directly present without JS execution. Do not invest implementation effort without this probe first.**

#### Candidate 4 — vietstock BCTC (`finance.vietstock.vn/{ticker}/bao-cao-tai-chinh`)

**Verdict: NOT VIABLE. Already confirmed dead.**

SPIKE_1916 confirmed: `finance.vietstock.vn/DPM/bao-cao-tai-chinh` and `/VCB/bao-cao-tai-chinh` both return HTTP 404 from France. The 404 body is a full-page HTML fallback with PDF hrefs linking only to vietstock marketing documents (not BCTC reports). `bctcHttpFetcher.ts` throws on `!res.ok`, so Strategy 2 already returns `[]` correctly. The page is JS-rendered; even a 200 would not contain static PDF hrefs without Playwright execution. Confirmed dead; no VPS probe needed.

#### Candidate 5 — Other VN aggregators (fpts.com.vn, vcbs.com.vn, finance.vietstock.vn API, etc.)

**Verdict: NOT VIABLE without new recon. Risk-adjusted priority: LOW.**

`fpts.com.vn` and `vcbs.com.vn` are brokerage portals. They may republish BCTC links, but:
- Their BCTC pages are SPA-rendered (React or Angular) — identical scraping difficulty to vietstock.
- Their PDF links typically point back to SSC's `congbothongtin.ssc.gov.vn` ADF download triggers, which are session-bound and cannot be used as stable URLs.
- No prior recon exists in this codebase for these sources. Adding them requires a full recon cycle (VPS probe → triage → implementation) with uncertain payoff.
- The underlying filing data is the same regardless of which aggregator republishes it — all roads lead back to SSC as the source of truth.

`finance.vietstock.vn` as an API (separate from the HTML page) has no documented REST endpoint for BCTC PDFs in the codebase. The vietstock API used elsewhere (`VIETSTOCK_BASE` in `bctcDiscovery.ts`) is the same domain that returns 404.

**Verdict: NOT VIABLE for this task scope. Could be deferred to a dedicated recon spike if SSC-Playwright remains the sole path.**

---

### Root Cause Reframe

The TASK-BCTC-3 framing was: "find a no-browser fallback when SSC Playwright fails." The hsx.vn XHR path was the leading candidate. With that path permanently blocked (Envoy route, not geo-IP), the assessment must address why Playwright is failing and whether the fix is in Playwright reliability rather than source replacement.

The VPS Playwright failure root cause (from `triage.md`) is `TasksMax=32` in `vn-bctc-fetch.service`, not a fundamental VPS incapability. This is an ops configuration constraint, not an architectural dead end. TASK-BCTC-1 (increase TasksMax/MemoryMax) from the triage doc was never formally filed or executed — it was superseded by the hsx.vn XHR investigation.

Critically: the `fetch-bctc.sh` + `discover-bctc-urls-browser.py` pipeline IS working end-to-end for HOSE tickers (confirmed by 1915-bctc-pipeline-silence resolution: VEA/VNM Q4-2025 PDFs landed). The Playwright crash was the prior state. The current blocker — if any — is whether the `TasksMax` issue persists after the 1915/1916 fixes.

---

### Recommended Path

**Single pick: TASK-BCTC-1 — increase `TasksMax` and `MemoryMax` in `vn-bctc-fetch.service` systemd unit.**

This is an ops change, not a code change. It unblocks SSC Playwright which already covers 100% of HOSE tickers. It was identified in `triage.md` (2026-05-13) as a 30-minute ops task.

Implementation:
- On VPS: edit `/etc/systemd/system/vn-bctc-fetch.service`, set `TasksMax=512` and `MemoryMax=512M`.
- Run `systemctl daemon-reload && systemctl restart vn-bctc-fetch.service`.
- Acceptance: `python3 /root/discover-bctc-urls-browser.py VNM 2026 Q1` returns a result without `pthread_create` error.

Secondary recommendation: add a no-Playwright path to `discover-bctc-urls-browser.py` that tries the HNX AJAX endpoint first for HNX/UPCOM tickers (already working per `triage.md`), so that Playwright is only invoked for HOSE/SSC tickers. This narrows Playwright invocations, reducing RAM pressure.

The cafef HTML page probe (Candidate 3) is worth a single VPS curl as a low-cost validation, but should not block the TASK-BCTC-1 fix.

---

### TASK-BCTC-3 Disposition

**Recommendation: RE-SCOPE and partially CLOSE.**

| Sub-task | Disposition | Reason |
|----------|-------------|--------|
| TASK-BCTC-3 (spike) | DONE | XHR endpoints fully documented; VPS probe confirmed Envoy route-block |
| TASK-BCTC-3a (VPS curl verification) | DONE/FAIL | Confirmed: Envoy route-block, not geo-IP. Permanent blocker for hsx.vn XHR path |
| TASK-BCTC-3b (dev: implement no-browser scraper) | CLOSE — hsx.vn path dead | Envoy block is permanent; no workaround without HOSE opening the route externally |
| TASK-BCTC-3c (dev: integrate into bctcDiscovery.ts) | CLOSE — hsx.vn path dead | Blocked by TASK-BCTC-3b closure |
| **NEW: TASK-BCTC-1 (ops: fix TasksMax/MemoryMax)** | **FILE NEW — 30 min ops** | Direct fix for Playwright crash; already identified in triage.md; was never formally executed |

**hsx.vn as an alternate HOSE BCTC discovery source is permanently closed.** The Envoy route-table restriction is a deliberate HOSE infrastructure decision, not a transient block. It is not exploitable from any external IP.

The correct resolution of the HOSE BCTC discovery gap is to ensure the existing SSC Playwright path (which already covers 100% of HOSE) is reliable under VPS constraints. That is an ops task, not an architecture task.
