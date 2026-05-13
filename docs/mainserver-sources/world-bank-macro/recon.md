# Recon — world-bank-macro

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://api.worldbank.org/v2/country/VN/indicator/NY.GDP.MKTP.CD?format=json&per_page=5
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: application/json' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -L \
  "https://api.worldbank.org/v2/country/VN/indicator/NY.GDP.MKTP.CD?format=json&per_page=10&mrv=10"
```

## HTTP Probe Results

- **Status:** 200 OK
- **Final URL:** https://api.worldbank.org/v2/country/VN/indicator/NY.GDP.MKTP.CD?format=json&per_page=5
- **Content-Type:** application/json;charset=utf-8
- **Redirect chain:** none (direct 200)
- **Response headers of note:**
  - `server: cloudflare` — Cloudflare CDN (no challenge issued)
  - `cf-ray: 9faf179e7c794dfe-MRS` — CF ray ID (passive, not challenge)
  - `access-control-allow-origin: *` — open CORS
  - `cache-control: public, max-age=2592000` — 30-day cache (static data)
  - `set-cookie: __cf_bm=...` — Cloudflare bot management cookie (passive)
  - `access-control-allow-methods: GET` — GET-only API

## Anti-Bot Assessment

- **Type:** none (Cloudflare passive only — no challenge)
- **Evidence:**
  - 200 OK with full JSON data returned
  - `__cf_bm` cookie = Cloudflare Bot Management passive fingerprint (not a challenge)
  - `cf-ray` header present but no `cf.challenge` body
  - `access-control-allow-origin: *` — fully open API
  - No `datadome`, `_pxhd`, `_abck` cookies
- **Geo-blocked from main server:** no
- **Recommendation:** straightforward requests/curl — no bot bypass needed. Plain GET request works. Technique: none (`header-rotation.md` for politeness).

## Page Structure

### JSON Paths (World Bank API v2)

- `$[0].page` → current page number
- `$[0].pages` → total pages
- `$[0].per_page` → results per page
- `$[0].total` → total data points
- `$[0].lastupdated` → dataset last update date
- `$[1][*].indicator.id` → indicator code (e.g. `NY.GDP.MKTP.CD`)
- `$[1][*].indicator.value` → indicator name (e.g. `GDP (current US$)`)
- `$[1][*].country.id` → ISO-2 country code (`VN`)
- `$[1][*].country.value` → country name (`Viet Nam`)
- `$[1][*].date` → year (string)
- `$[1][*].value` → data value (float or null if not yet published)

### URL Pattern

`https://api.worldbank.org/v2/country/{iso2}/indicator/{indicator-code}?format=json&per_page={n}&mrv={most-recent-n}`

### Key VN Indicators

- `NY.GDP.MKTP.CD` — GDP (current US$)
- `NY.GDP.MKTP.KD.ZG` — GDP growth (annual %)
- `FP.CPI.TOTL.ZG` — Inflation (CPI annual %)
- `BX.KLT.DINV.CD.WD` — FDI inflows
- `NE.EXP.GNFS.CD` — Exports of goods and services
- `NE.IMP.GNFS.CD` — Imports of goods and services
- `SL.UEM.TOTL.ZS` — Unemployment rate

## Sample Response Excerpt

```json
[{"page":1,"pages":14,"per_page":5,"total":66,"sourceid":"2","lastupdated":"2026-04-08"},
[{"indicator":{"id":"NY.GDP.MKTP.CD","value":"GDP (current US$)"},
"country":{"id":"VN","value":"Viet Nam"},"countryiso3code":"VNM",
"date":"2024","value":476388230307.175,"unit":"","obs_status":"","decimal":0},
{"date":"2023","value":433857681378.291},
{"date":"2022","value":413445230668.578}]]
```

## Notes

- World Bank API is fully open — no API key required, no registration, CORS enabled.
- Data is annual (not real-time) — latest VN GDP 2024 = 476.39bn USD (updated 2026-04-08).
- 2025 value is null — not yet published (World Bank publishes ~18 months after year-end).
- Pagination: use `per_page=50&mrv=10` to get last 10 years in one call.
- Rate limit: generous but undocumented — 1 req/second safe, bulk requests recommended with delay.
- `mrv=N` param returns N most recent values without needing pagination — preferred for recent data.
