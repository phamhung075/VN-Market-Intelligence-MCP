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

**Evidence collected:** `https://www.hsx.vn/static/js/main.d430e296.js` (2.43 MB, analyzed locally), live HTTP probes to `api.hsx.vn` and `staticfile.hsx.vn` from France (2026-05-15).
**Code reference:** No spike branch (investigation was read-only HTTP probes + JS bundle analysis).
