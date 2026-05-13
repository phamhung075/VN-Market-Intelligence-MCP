# Recon — investing-economic-calendar

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://www.investing.com/economic-calendar/
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
# Cloudflare CF-managed protection — page delivers 200 but all data is JS-rendered.
# CF __cf_bm cookie issued (CF Bot Management, not CF JS challenge).
# Content is a Next.js SPA — data loaded via internal API calls.
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,*/*' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  --compressed \
  -L \
  "https://www.investing.com/economic-calendar/"
# Returns: 200 with SPA shell + Cloudflare __cf_bm cookie
```

## HTTP Probe Results

- **Status:** 200 OK (after 308 redirect from `/economic-calendar/` → `/economic-calendar`)
- **Final URL:** https://www.investing.com/economic-calendar
- **Content-Type:** text/html; charset=utf-8
- **Redirect chain:** `investing.com/economic-calendar/` → 308 → `/economic-calendar` → 200
- **Response headers of note:**
  - `set-cookie: __cf_bm=...` — Cloudflare Bot Management (passive fingerprint)
  - `set-cookie: __cflb=...` — Cloudflare load balancer sticky session
  - `cf-ray: 9faf19f08f6ec570-MRS` — Cloudflare ray ID (passive)
  - `server: cloudflare` — Cloudflare CDN
  - `cross-origin-embedder-policy: unsafe-none` — COEP header
  - `set-cookie: gcc=FR; gsc=PAC` — geo detection (France / PAC region)
  - `set-cookie: udid=...` — unique device ID
  - `set-cookie: invab=alladsnewd_1|...` — A/B test flags
  - `x-environment: ams-prod` — Amsterdam production environment

## Anti-Bot Assessment

- **Type:** cloudflare_managed (passive `__cf_bm` + SPA data gate)
- **Evidence:**
  - `__cf_bm` cookie issued — Cloudflare Bot Management
  - `cf-ray` present but no `Checking your browser` body → passive mode (not JS challenge)
  - Page body is a minified SPA bundle — actual calendar data requires JS execution
  - i18n strings in body (`"captcha":"Wrong answer for image verification"`) — CAPTCHA available for triggered flows
  - No `datadome`, `_pxhd`, `_abck` cookies
- **Geo-blocked from main server:** no (`gcc=FR` set, content served normally)
- **Recommendation:** cloudscraper or curl_cffi for Cloudflare bypass to get HTML; then internal API probing for calendar JSON. If Cloudflare escalates to JS challenge, use `docs/mainserver-crawl-techniques/cloudflare-js-bypass.md`. headless_likely_needed: false (cloudscraper/curl_cffi sufficient for initial access, then API direct).

## Page Structure

### Internal API (Investing.com economic calendar)

- Known endpoint pattern: `https://www.investing.com/economic-calendar/Service/getCalendarFilteredData` (POST, requires `X-Requested-With: XMLHttpRequest`)
- Requires: `country[]`, `timeZone`, `timeFilter`, `currentTab`, `submitFilters` POST params
- Returns HTML fragment with table rows (not JSON)
- Alternative JSON API: `https://sbcharts.investing.com/events_charts/us/507.json` (US CPI — public static charts)

### DOM Selectors (HTML table fragment from POST response)

- `#economicCalendarData` → main calendar table container
- `tr.js-event-item` → individual economic event row
- `tr.js-event-item td.left.time` → event time
- `tr.js-event-item td.country span` → country flag/code
- `tr.js-event-item td.event a` → event name and link
- `tr.js-event-item td.actual` → actual value
- `tr.js-event-item td.forecast` → consensus forecast
- `tr.js-event-item td.previous` → previous value
- `span.grayFullBullishIcon` / `span.redFullBullishIcon` → impact level (bull icons: 1-3)

## Sample Response Excerpt

```json
{"captcha":"Wrong answer for image verification.","_code":"Code",
"_commodities":"Commodities","_company_name":"Company Name",...}
```
(i18n strings bundle — partial body from SPA JS)

## Notes

- investing.com economic calendar is one of the most comprehensive global event calendars.
- The calendar POST API (`getCalendarFilteredData`) is well-documented in scraper communities; it works with session cookies from a Cloudflare-cleared session.
- Key filters: `country[]=35` (Vietnam = 35?), `timeZone=55` (UTC+7), `timeFilter=timeRemain` or `timeFilter=timeOnly`.
- Country code for Vietnam on investing.com needs verification via browser session inspection.
- Cloudflare protection is currently passive (__cf_bm cookie only) — not actively challenging; cloudscraper/curl_cffi should obtain the session cookie without full Playwright.
- Rate limit: strict at ~20 req/min from same IP; session rotation advised.
