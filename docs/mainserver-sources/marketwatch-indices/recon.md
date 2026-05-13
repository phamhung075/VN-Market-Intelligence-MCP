# Recon — marketwatch-indices

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://www.marketwatch.com/investing/index/vni
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,*/*' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  --compressed \
  -L \
  "https://www.marketwatch.com/investing/index/vni"
# Returns 200 (redirects to DE:XFRA VNI stock, not VN Index — wrong ticker mapping)
```

## HTTP Probe Results

- **Status:** 200 OK (after 302 redirect)
- **Final URL:** https://www.marketwatch.com/investing/stock/vni?countryCode=DE&iso=XFRA
- **Content-Type:** text/html; charset=utf-8
- **Redirect chain:** `/investing/index/vni` → 302 → `/investing/stock/vni?countryCode=DE&iso=XFRA`
- **Response headers of note:**
  - `server: Kestrel` — .NET Kestrel server
  - `strict-transport-security: max-age=63072000` — HSTS
  - `set-cookie: mw_loc={"Region":"PAC","Country":"FR","Continent":"EU"...}` — geo detection (France)
  - `set-cookie: gdprApplies=true` — GDPR flag from France IP
  - Via CloudFront (`x-amz-cf-pop: MRS53-P3`)
  - `set-cookie: ab_uuid=...` — A/B test UUID
  - Akamai DNS prefix found: `<link rel="dns-prefetch" href="//a248.e.akamai.net" />`
  - `captcha-site-key=6LcmI7sUAAAAAF-vTKb3JIwIzz2CXCx8hJW0Ukis` — Google reCAPTCHA present in page

## Anti-Bot Assessment

- **Type:** none (200 delivered cleanly) but captcha present for triggered flows
- **Evidence:**
  - Direct 200 response with full page HTML
  - No `datadome`, `_pxhd`, `_abck` active challenge
  - `captcha-site-key` in page body — reCAPTCHA loaded for certain user actions (form submissions, not page reads)
  - `dns-prefetch` to `a248.e.akamai.net` — Akamai for static assets only
  - `gdprApplies=true` — GDPR mode from France (cookie consent modal, not bot block)
- **Geo-blocked from main server:** no (France IP returns content, `mw_loc.Country=FR`)
- **Recommendation:** Straightforward curl/requests for HTML scraping — page delivers content without challenge. GDPR consent modal is JS-rendered and doesn't block data. For data extraction, use WSJ internal API (see below) which is cleaner. Technique: `header-rotation.md`

## Page Structure

### DOM Selectors (HTML — MarketWatch instrument page)

- `h1.company__name` → instrument name
- `bg-quote.value` → current price (requires JS rendering for live value)
- `span[class*="change--percent"]` → percentage change
- `div.intraday__data` → intraday price summary
- `table.table--primary` → key statistics table
- `span[class*="timestamp"]` → data timestamp
- `div[class*="chartWrap"]` → chart container

### WSJ Internal API (MarketWatch uses WSJ APIs)

- Quote API (probed — returns data):
  `https://api.wsj.net/api/dylan/markets/v2/CatchAll/GetInstrumentData?ticker=<TICKER>&type=<TYPE>&dialects=Charting&CalcType=None`
  - Note: Returns 400 for `VNI` (ticker not found in WSJ database for index)
  - Works for: `DJIA`, `SPX`, `COMP` (NASDAQ)

### Correct VN Market Ticker on MarketWatch

- VN Index is NOT tracked as `/investing/index/vni` — it redirects to a German Frankfurt-listed stock "VNI"
- Correct approach: Use Yahoo Finance v8 API for VN indices (more reliable)

## Sample Response Excerpt

```html
<title>VNI Stock Price | Avnet Inc. Stock Quote (Germany: Frankfurt) | MarketWatch</title>
<link rel="dns-prefetch" href="//a248.e.akamai.net" />
captcha-site-key=6LcmI7sUAAAAAF-vTKb3JIwIzz2CXCx8hJW0Ukis
```

## Notes

- MarketWatch does NOT have VN Index (VNINDEX) as a tracked instrument — `/investing/index/vni` redirects to a German stock with ticker "VNI" (Avnet Inc.).
- For US/global market indices (S&P 500, Dow Jones, NASDAQ, Nikkei, Hang Seng), MarketWatch pages deliver content via curl but data is JS-rendered (requires Playwright for live values).
- Alternative: MarketWatch has a quotes API used internally; requires session cookies from a browser visit.
- For VN-specific market data, Yahoo Finance v8 or direct HOSE/HNX APIs are more reliable.
- GDPR consent modal from France IP — irrelevant for server-side scraping (not a bot block).
- MarketWatch is most useful for US macro news text extraction; not recommended for structured market data.
