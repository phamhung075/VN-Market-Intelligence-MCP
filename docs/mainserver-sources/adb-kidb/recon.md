# Recon — adb-kidb

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://kidb.adb.org
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
# No working REST API found via probing — all /api/v1/, /api/v2/, /api/series/, /api/countries/ 
# return 404 "route not found". ADB KIDB is a Vue.js/React SPA that fetches data via 
# internal endpoints discovered from browser network tab. Homepage serves clean HTML.
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html' \
  --compressed \
  -L \
  "https://kidb.adb.org"
# Returns: 200 OK, SPA shell HTML
```

## HTTP Probe Results

- **Status:** 200 OK (homepage) | 404 (all probed API paths)
- **Final URL:** https://kidb.adb.org
- **Content-Type:** text/html
- **Redirect chain:** none (direct 200)
- **Response headers of note:**
  - `x-azure-ref` — Azure CDN (not Akamai, not Cloudflare)
  - `access-control-allow-origin: *` — open CORS on API (but correct paths unknown)
  - `cache-control: no-cache, private` — on 404 responses
  - `x-frame-options: SAMEORIGIN` — frame protection
  - No `datadome`, `_pxhd`, `__cf_bm`, `_abck` cookies
- **API endpoints probed (all 404):**
  - `/api/v1/indicators?iso3=VNM&indicator=GrDP_USD`
  - `/api/v2/indicators/VNM`
  - `/api/data/VNMGDP`
  - `/api/v1/data?series=...`
  - `/api/adbki/timeSeries?country=VNM&...`
  - `/api/series?country=VNM&indicator=GrDP_USD`
  - `/api/countries`
  - `/api/indicator?country=VNM`

## Anti-Bot Assessment

- **Type:** none (no bot protection detected — API discovery is the blocker, not bot protection)
- **Evidence:**
  - Homepage returns 200 with clean HTML
  - API 404s return JSON error messages (not bot challenge pages)
  - No anti-bot cookies or headers observed
  - Azure CDN (not Akamai Bot or DataDome)
- **Geo-blocked from main server:** no
- **Recommendation:** Browser network tab inspection needed to discover actual internal API endpoints. Use Playwright to load the SPA and intercept XHR/fetch calls to find the correct API path. Alternative: ADB provides bulk data downloads at `https://kidb.adb.org/kidb` (Excel/CSV) — scrape download links instead. Also consider ADB's SDMX API at `https://data.adb.org`. Technique: `playwright-stealth.md` for API discovery only; once endpoints are found, plain requests will work.

## Page Structure

### DOM Selectors (SPA — from homepage HTML)

- `<title>Key Indicators Database – Asian Development Bank</title>` — confirmed SPA title
- `window.dataLayer` + GTM-5FL8D97W — Google Tag Manager
- SPA routes via Vue Router or React Router — actual data rendered client-side

### Expected API Shape (from ADB docs/similar patterns)

- Likely endpoint pattern: `/api/data?country=VNM&indicator=<code>&startYear=2020&endYear=2024`
- Or SDMX: `https://data.adb.org/api/v1/data/<dataflow>/<country>/<indicator>?format=jsondata`

## Sample Response Excerpt

```json
{"message": "The route api/v1/indicators could not be found."}
```
(404 on all probed REST paths — SPA with hidden internal API)

## Notes

- kidb.adb.org is a JavaScript SPA (Vue.js or React) — all data fetched client-side.
- The correct internal API endpoints are discoverable only via browser DevTools Network tab.
- dev-mainserver-crawls must use Playwright to: (1) load the SPA, (2) intercept network requests, (3) record the actual API endpoint + parameters.
- ADB also offers bulk data via: `https://kidb.adb.org/kidb#download` (login-free Excel/CSV downloads).
- ADB Stata/R package endpoints may give structured access without SPA inspection.
- Data freshness: "last updated on 27 April 2026" (from meta description).
- Probed `data.adb.org` Cloudflare JS challenge → defer to separate recon once API paths confirmed.
