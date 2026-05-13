# Recon — bloomberg-markets

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://www.bloomberg.com/markets
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
  "https://www.bloomberg.com/markets"
# Returns 200 with full page HTML, but content gated by subscription paywall JS
```

## HTTP Probe Results

- **Status:** 200 OK
- **Final URL:** https://www.bloomberg.com/markets
- **Content-Type:** text/html; charset=utf-8
- **Redirect chain:** none (direct 200)
- **Response headers of note:**
  - `set-cookie: _pxhd=PQZ9hoLm609K...` — PerimeterX fingerprint cookie (`_pxhd`)
  - `set-cookie: country_code=FR` — geo detection (France)
  - `set-cookie: exp_pref=EUR` — currency preference
  - `x-powered-by: Next.js` — Next.js SSR
  - `etag` present — cache headers work
  - `session_id`, `agent_id`, `session_key` cookies — Bloomberg session tracking
  - Served via Fastly CDN (`x-served-by: cache-mrs10554-MRS`)

## Anti-Bot Assessment

- **Type:** perimeterx (passive fingerprint only at first load) + subscription paywall
- **Evidence:**
  - `_pxhd` cookie set — PerimeterX human detection cookie (passive phase)
  - No active challenge at initial GET (200 returned)
  - Bloomberg uses PerimeterX in passive monitoring mode initially; challenge triggered on subsequent requests or API calls
  - Page content is loaded via Next.js `__NEXT_DATA__` hydration — SSR delivers initial shell
  - Actual market data and articles are behind subscription paywall (login required to read full content)
- **Geo-blocked from main server:** no (France IP accepted, `country_code=FR` set)
- **Recommendation:** For public headline scraping, Playwright stealth bypasses PX passive phase. Subscription content is paywalled regardless of bot-bypass technique — only free/public sections accessible. `docs/mainserver-crawl-techniques/perimeterx-bypass.md`. headless_likely_needed: true.

## Page Structure

### DOM Selectors (HTML sources)

- `[data-component="headline"]` → article headline
- `[data-component="overline"]` → section label
- `article[data-id]` → article container with ID
- `time[data-type="published-at"]` → publish timestamp
- `div[class*="media-ui-FullWidthAd"]` → ad containers (skip)
- `div[data-page-type="lineup-curation"]` → main content area
- `a[href^="/news/articles/"]` → news article links

### JSON Paths (Next.js __NEXT_DATA__)

- `window.__NEXT_DATA__.props.pageProps.story.headline` → headline
- `window.__NEXT_DATA__.props.pageProps.story.publishedAt` → publish time
- `window.__NEXT_DATA__.props.pageProps.story.url` → canonical URL

## Sample Response Excerpt

```html
<main><div data-page-type="lineup-curation">
<div class="media-ui-FullWidthAd_fullWidthAdWrapper-...">
<div data-component="leaderboard-ad" data-ad-status="rendering">
```

## Notes

- Bloomberg 200 response delivers an HTML shell via Next.js SSR; actual article content and market data tables are loaded via client-side JS fetching authenticated API endpoints.
- PerimeterX `_pxhd` cookie issued at first load — this is the passive fingerprint phase; active PX challenge (`403 + PX block page`) triggers if subsequent requests look bot-like.
- Paywall status: Bloomberg requires subscription for market data and full article text. Only headlines and brief teasers are accessible without login.
- `country_code=FR` header confirms no geo-block from France.
- For headline-only use cases (news signal), Playwright stealth can scrape `data-component="headline"` selectors reliably.
- bloomberg.com/feeds/podcasts (RSS) available for some content types — no bot protection.
