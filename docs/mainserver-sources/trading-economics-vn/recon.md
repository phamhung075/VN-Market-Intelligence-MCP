# Recon — trading-economics-vn

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://tradingeconomics.com/vietnam/gdp
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,*/*' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Referer: https://www.google.com/' \
  --compressed \
  -L \
  "https://tradingeconomics.com/vietnam/gdp"
```

## HTTP Probe Results

- **Status:** 200 OK
- **Final URL:** https://tradingeconomics.com/vietnam/gdp
- **Content-Type:** text/html; charset=utf-8
- **Redirect chain:** none (direct 200)
- **Response headers of note:**
  - `tebot: False` — TE's own bot flag (set to False, request accepted)
  - `teserver: TEIIS` / `TEIIS2` — backend routing
  - `x-cache: Miss from cloudfront` — CloudFront CDN (not CF challenge)
  - `x-amz-cf-pop: MRS53-P4` — Marseille PoP (France origin confirmed)
  - `ASP.NET_SessionId` cookie set — session-based

## Anti-Bot Assessment

- **Type:** none (soft session gate only)
- **Evidence:**
  - No `cf-ray` header, no `Checking your browser` in body
  - No `datadome`, `_pxhd`, `_abck` cookies
  - `tebot: False` header confirms request accepted as human
  - Page delivers full HTML with data content
  - Login link present (`sso.tradingeconomics.com/sso/login`) but page content readable without login
- **Geo-blocked from main server:** no (France IP → full page returned)
- **Recommendation:** straightforward requests/curl with session cookie persistence. Some deeper data (CSV/API download) requires a paid API key. Public page data is freely scraped via HTML. Technique: `header-rotation.md`

## Page Structure

### DOM Selectors (HTML sources)

- `#aspnetForm` → main data form wrapper
- `table.table` or `div.table-responsive` → data values table (inspect rendered JS for exact IDs)
- `script` containing `var TESymbol = 'VietnamGDP'` → JS variable for chart data source
- `TEChartsDatasource: 'https://d3ii0wo49og5mi.cloudfront.net'` → chart data CDN base URL
- `meta[name="description"]` content → latest value summary (e.g. "worth 476.39 billion US dollars in 2024")

### JSON/API paths (structured data)

- Chart PNG URL pattern: `https://d3fy651gv2fhd3.cloudfront.net/charts/vietnam-gdp.png?s=vietnamgdp&projection=te&v=<timestamp>`
- Schema.org JSON-LD in `<script type="application/ld+json">` → `@type: Dataset` with `temporalCoverage`, `dateModified`, `alternateName`
- TE public API (requires free API key): `https://api.tradingeconomics.com/historical/country/vietnam/indicator/gdp?c=<apikey>&format=json`

## Sample Response Excerpt

```
{"@type": "Dataset","name": "Vietnam GDP","alternateName": "Vietnam GDP - Historical Dataset (1985-12-31/2024-12-31)",
"description": "The Gross Domestic Product (GDP) in Vietnam was worth 476.39 billion US dollars in 2024...",
"temporalCoverage": "1985-12-31/2024-12-31","spatialCoverage": "Vietnam",
"distribution": [{"@type": "DataDownload","encodingFormat": "CSV",...}]}
```

## Notes

- TE serves full page HTML to curl with realistic headers — no JS challenge required for public indicator pages.
- Data values on page reflect World Bank source: VN GDP 2024 = 476.39 bn USD.
- API access (JSON/CSV download) requires free registration at tradingeconomics.com/api → get free API key (limited calls/month).
- `TELastUpdate: 202507011452` in JS — last data update timestamp pattern.
- Rate limit: not enforced for basic HTML scraping; API tier limits apply for structured download.
- URL pattern for any VN indicator: `https://tradingeconomics.com/vietnam/<indicator-slug>` (e.g. `inflation-cpi`, `balance-of-trade`, `interest-rate`).
