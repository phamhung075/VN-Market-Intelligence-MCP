# SPIKE 1916 — bctcQueueEnricher: 0 URLs for 14/30 Tickers

- **Question:** Is `bctcQueueEnricherJob` returning 0 URLs for 14/30 tickers because SSC portal HTML structure changed (Cheerio selectors stale), or is it auth-block / rate-limit / other?
- **Date:** 2026-05-14
- **Timebox:** 120 min
- **Approach tried:** Live HTTP probes of all 4 discovery strategies for failing tickers (DPM, KBC, MWG) and working tickers (VCB, FPT). Log analysis from `data/logs/tool-bctcqueueenricher.log`. VPS proxy server code audit. Full trace of bctcDiscovery.ts strategy chain.

---

## Root Cause — CONFIRMED

**The enricher has NEVER successfully populated source_url for any ticker. All 4 discovery strategies are broken simultaneously.**

### Why the "9 tickers work" framing is misleading

The 9 tickers (VCB, FPT, DIG, BSR, DGC, HPG, SHB, VEA, VNM) with PDFs on disk got their `source_url` populated by the **VPS-push mechanism** (`fetch-bctc.sh` + `discover-bctc-urls-browser.py` running on VPS), NOT by `bctcQueueEnricherJob`. Those rows already have valid `http://125.212.251.27:8765/bctc-files/...` URLs in `bctc_vps_queue.source_url` and are therefore excluded from the enricher's `WHERE source_url IS NULL` clause. The enricher never touched them.

The 14 failing tickers have `source_url = NULL` and `attempts = 0`. The enricher runs against them every 15 min and returns 0 URLs every time. Log evidence confirms this has been the case since at least **2026-04-22** (the earliest log entry).

---

## Strategy-by-Strategy Failure Analysis

### Strategy 0 — VPS Playwright endpoint (`BCTC_DISCOVER_URL`)

**Status: DEAD — route never deployed on VPS**

Config in `docker-compose.yml`: `BCTC_DISCOVER_URL: http://125.212.251.27:8765/proxy/bctc-discover`

Live probe results:
- Without `X-API-Key`: `HTTP 401 {"error":"Unauthorized"}` (fast fail, 0.4s)
- With `X-API-Key: <VPS_PUSH_API_KEY>`: `HTTP 404 {"error":"Not found","path":"/proxy/bctc-discover/DPM?year=2025&quarter=4"}`

Root cause: The VPS proxy server (`vps-scripts/vps-proxy-server.js`) has **no `/proxy/bctc-discover` route**. It only exposes:
- `GET /health`
- `GET /proxy/ssc-iboard/*`
- `GET /bctc-files/:code/:filename`

The `/proxy/bctc-discover` endpoint was referenced in code comments as "task 1822d-a" but was never added to the VPS proxy.

**Secondary issue:** `bctcHttpFetcher.ts` sends only `User-Agent` and `Accept` headers — it never sends `X-API-Key`. Every request to any VPS-authenticated endpoint will return 401 before the missing-route 404 is even relevant.

**Falsified hypothesis:** This is NOT a Cheerio selector issue. `bctcDiscovery.ts` does not use Cheerio at all. Cheerio is only used in `infrastructure/fetchers/rss.ts` and `infrastructure/fetchers/ssc.ts`, neither of which is imported by `bctcDiscovery.ts` or `bctcQueueEnricherJob.ts`.

### Strategy 1 — SSC iboard JSON API (`SSC_IBOARD_BASE_URL`)

**Status: DEAD — upstream domain NXDOMAIN since 2026-04-27**

Config: `SSC_IBOARD_BASE_URL: http://125.212.251.27:8765/proxy/ssc-iboard`

Live probe (with `X-API-Key`):
```
GET /proxy/ssc-iboard/dcm/financials/ticker/DPM → HTTP 502
{"error":"Bad gateway","detail":"getaddrinfo ENOTFOUND iboard-query.ssc.vn"}
```

Same result for VCB (working ticker). The upstream `iboard-query.ssc.vn` is NXDOMAIN. This was already documented in `bctcDiscovery.ts` line 14 as of 2026-04-27 but the strategy was kept for forward-compatibility.

### Strategy 2 — cafef.vn FinanceInfo JSON API

**Status: DEAD — endpoint migrated, returns HTML page with 0 PDFs**

Live probe:
```
GET https://s.cafef.vn/Candles/FinanceInfo.ashx?symbol=DPM&type=5&PageIndex=1&PageSize=10
→ HTTP 301 → Location: https://cafef.vn/du-lieu/candles/financeinfo.ashx
→ HTTP 404 (query params lost in redirect)
```

After following redirect to `cafef.vn/du-lieu/candles/financeinfo.ashx` (without params): HTTP 200, but response is an HTML navigation/login page with **zero PDF hrefs**. `extractCafefUrls()` returns `[]` for every ticker.

### Strategy 3 — vietstock.vn HTML scraper

**Status: DEAD — returns HTTP 404 for BCTC report pages**

Live probe:
```
GET https://finance.vietstock.vn/DPM/bao-cao-tai-chinh → HTTP 404 (545KB body)
GET https://finance.vietstock.vn/VCB/bao-cao-tai-chinh → HTTP 404 (545KB body)
```

The 404 body is a full-page HTML fallback with 4 PDF hrefs (vietstock marketing guides, not BCTC reports). Since `bctcHttpFetcher` throws on `!res.ok`, the 404 causes an exception in `tryFetchVietstock` which is caught and returns `[]`. No false-positive pollution.

---

## Why the Problem Is Not Ticker-Specific

The ops report of "14 tickers failing vs 9 working" reflects **DB state**, not per-ticker scraping differences. All 30 tickers would return 0 URLs from the enricher. The 9 "working" tickers bypass the enricher because they already have populated `source_url` values from the separate VPS-push pipeline.

Log evidence: `tool-bctcqueueenricher.log` (2026-04-22 to 2026-05-05) shows:
- `urlsPopulated: 0` in **every single batch completion record**
- VCB, FPT, HPG all appear in the "0 URLs found" warn lines (same as DPM, KBC, etc.)
- No `source_url populated` debug message was ever emitted

---

## Recommended Fix — Real Sprint Task

**Task scope:** Fix `bctcQueueEnricherJob` to reliably populate `source_url` for all 30 tickers.

**Two-pronged approach:**

### Fix A — Add `bctc-discover` route to VPS proxy + inject X-API-Key in bctcHttpFetcher (ops + dev)

The VPS-side `discover-bctc-urls-browser.py` already works (it powers `fetch-bctc.sh` successfully). Adding a `/proxy/bctc-discover/:ticker` HTTP endpoint to `vps-proxy-server.js` would make Strategy 0 viable.

Simultaneously, `bctcHttpFetcher.ts` must be extended to inject `X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}` when the request URL matches the VPS host.

**Files:**
- `vps-scripts/vps-proxy-server.js` — add `/proxy/bctc-discover/:ticker` route (runs `discover-bctc-urls-browser.py`)
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — add X-API-Key header injection for VPS URLs

### Fix B — Replace cafef Strategy 2 with a working alternative (dev only)

The `s.cafef.vn/Candles/FinanceInfo.ashx` endpoint is permanently dead. A replacement source is needed. Candidates:
- `cafef.vn/tai-lieu-tai-chinh/<ticker>/bctc` (investigate if JS-rendered or static)
- VNDirect document API (if available)
- Direct SSC `congbothongtin.ssc.gov.vn` scraping via VPS (already used by `fetch-bctc.sh`)

**Minimum viable fix:** Route all enrichment through Fix A (VPS `/proxy/bctc-discover`). Strategies 1–3 can remain as dead-but-harmless fallbacks until replaced.

---

## Carry-Forward Fix Acceptance Criteria

- `bctcQueueEnricher` logs `source_url populated` for previously-failing tickers (DPM, KBC, MWG, NVL, REE, TCH, VNH, and 7 others)
- `bctc_vps_queue` row count with non-null `source_url` increases for the 14 missing tickers
- No "0 URLs found" log entries for tickers where the VPS bctc-cache has the PDF

---

## Evidence Summary

| Probe | Ticker | Result | Root cause |
|---|---|---|---|
| `GET /proxy/bctc-discover/DPM?year=2025&quarter=4` (no auth) | DPM | 401 | No X-API-Key in bctcHttpFetcher |
| `GET /proxy/bctc-discover/DPM?year=2025&quarter=4` (with auth) | DPM | 404 | Route not deployed on VPS |
| `GET /proxy/bctc-discover/VCB` (with auth) | VCB | 404 | Route not deployed on VPS |
| `GET /proxy/ssc-iboard/dcm/financials/ticker/DPM` (with auth) | DPM | 502 | iboard-query.ssc.vn NXDOMAIN |
| `GET /proxy/ssc-iboard/dcm/financials/ticker/VCB` (with auth) | VCB | 502 | iboard-query.ssc.vn NXDOMAIN |
| `GET s.cafef.vn/Candles/FinanceInfo.ashx?symbol=DPM&type=5` | DPM | 301→404 | Endpoint migrated, params lost |
| `GET s.cafef.vn/Candles/FinanceInfo.ashx?symbol=VCB&type=5` | VCB | 301→404 | Endpoint migrated, params lost |
| `GET finance.vietstock.vn/DPM/bao-cao-tai-chinh` | DPM | 404 | JS-rendered, bctcHttpFetcher throws |
| `GET finance.vietstock.vn/VCB/bao-cao-tai-chinh` | VCB | 404 | JS-rendered, bctcHttpFetcher throws |

**All failures are infrastructure failures (dead endpoints, missing routes, missing auth). Zero Cheerio selector staleness. Zero rate-limiting. Zero geo-blocking at the app level.**

- **Code reference:** No spike branch (investigation was read-only + live HTTP probes)
