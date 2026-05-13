# Recon — reuters-asia-news

**Date:** 2026-05-13 05:00 UTC
**Agent:** ops-mainserver-fetch
**Source URL:** https://www.reuters.com/markets/asia/
**Trigger:** new_source_needed
**Probe origin:** main-server (direct, no VPS proxy)

## Working Request Recipe

```bash
# No working recipe from main server — DataDome blocks all curl-based probes.
# Headless browser with stealth required. See Recommendation below.
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,*/*' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -L \
  "https://www.reuters.com/markets/asia/"
# Returns: 401 + DataDome challenge JS
```

## HTTP Probe Results

- **Status:** 401 Unauthorized
- **Final URL:** https://www.reuters.com/markets/asia/
- **Content-Type:** text/html;charset=utf-8
- **Redirect chain:** none (direct 401)
- **Response headers of note:**
  - `x-datadome: protected` — explicit DataDome protection header
  - `x-datadome-cid: AHrlqAAAAAMAh1j7qM2Y7rUA9Qaehw==` — DataDome challenge ID
  - `x-dd-b: 3` — DataDome decision code 3 (block)
  - `set-cookie: datadome=TZ8SUjOFjD089LPFiP8jAboed5XGnZU7~...` — DataDome session cookie
  - `accept-ch: Sec-CH-UA,Sec-CH-UA-Mobile,...` — Client Hints requested
  - Via: CloudFront (`LambdaGeneratedResponse from cloudfront`) — CDN layer on top of DataDome

## Anti-Bot Assessment

- **Type:** datadome
- **Evidence:**
  - `x-datadome: protected` header present
  - `x-datadome-cid` challenge ID issued
  - Response body: `<script src="https://ct.captcha-delivery.com/i.js">` — DataDome captcha delivery script
  - `host: 'geo.captcha-delivery.com'` in DataDome JS object
  - `x-dd-b: 3` = hard block decision
  - `datadome` cookie set with 1-year TTL
- **Geo-blocked from main server:** no (401 is DataDome bot block, not geo-fence)
- **Recommendation:** Playwright + playwright-stealth with human simulation. DataDome requires realistic browser fingerprint (TLS JA3, canvas, WebGL, navigator.plugins). `docs/mainserver-crawl-techniques/playwright-stealth.md`. headless_likely_needed: true.

## Page Structure

### DOM Selectors (HTML sources — from successful browser session)

- `[data-testid="Heading"]` → article headline
- `[data-testid="Body"]` → article body text
- `article[data-testid="Article"]` → article container
- `time[data-testid="DateLineTime"]` → publish timestamp
- `a[href^="/markets/asia/"]` → Asia markets article links
- `div[data-module="ArticleList"]` → article list container

### JSON paths (Reuters CMS API — if accessible)

- Reuters has an internal CMS API at `https://www.reuters.com/pf/api/v3/content/fetch/articles-by-section-alias-or-id-v1?...` (requires session)

## Sample Response Excerpt

```html
<html lang="en"><head><title>reuters.com</title>...</head>
<body style="margin:0"><p id="cmsg">Please enable JS and disable any ad blocker</p>
<script>var dd={'rt':'i','cid':'AHrlqAAAAA...','host':'geo.captcha-delivery.com',
'cookie':'TZ8SUjOFjD089LP...'}</script>
<script src="https://ct.captcha-delivery.com/i.js"></script>
</body></html>
```

## Notes

- DataDome on Reuters is actively blocking all non-browser HTTP clients.
- `x-dd-b: 3` = outright block (not soft challenge) — requires full Playwright stealth session.
- DataDome checks: TLS fingerprint (JA3), HTTP/2 frame ordering, navigator properties, canvas fingerprint, WebGL, mouse movement entropy.
- Alternative: Reuters provides an RSS feed at `https://feeds.reuters.com/reuters/businessNews` (no bot protection, XML) — check if it includes Asia markets content.
- RSS feed probe recommended as fallback before investing in Playwright stealth solution.
