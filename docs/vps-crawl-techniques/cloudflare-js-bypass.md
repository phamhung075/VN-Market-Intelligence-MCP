# Technique — cloudflare-js-bypass

**Problem:** Target is behind Cloudflare JS challenge (IUAM — "I'm Under Attack Mode" or equivalent). Plain requests/httpx receives a 403 or JS challenge page instead of content. TLS fingerprint of Python libraries is detected at CDN edge.
**Anti-bot type:** cloudflare_js
**Date documented:** 2026-05-13

## Solution Approach

Use `curl_cffi` with `impersonate="chrome124"` (or latest stable). This replicates the exact TLS ClientHello, JA4+ fingerprint, cipher suite order, and HTTP/2 SETTINGS frames of Chrome. Cloudflare's edge computes the JA4 hash from the ClientHello before any HTTP exchange; a matching Chrome profile produces a trusted Bot Score.

This handles Cloudflare JS challenge (v1/v2). It does NOT handle Cloudflare Managed Challenge (Turnstile) which requires additional JS execution. For VN sources, most sites using Cloudflare are using it as a Reverse Proxy (`server: cf-rp`) that passes RSS/API requests unchallenged — curl_cffi is the upgrade path if/when they enable IUAM.

## Libraries Required

- `curl_cffi >= 0.7` (install: `pip install curl_cffi`)

## Code Snippet

```python
from curl_cffi import requests as cffi_requests
import datetime

CF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

def fetch_cf_protected(url: str, referer: str | None = None) -> dict:
    """
    Fetch a Cloudflare JS-challenged page using Chrome TLS impersonation.
    Returns {"status": "ok", "data": <html_text>, "fetched_at": <ISO>}.
    """
    h = dict(CF_HEADERS)
    if referer:
        h["Referer"] = referer
    session = cffi_requests.Session()
    resp = session.get(url, impersonate="chrome124", headers=h, timeout=30, allow_redirects=True)
    if resp.status_code in (403, 429, 503):
        return {"status": "error", "reason": f"cf_blocked http={resp.status_code}"}
    return {
        "status": "ok",
        "data": resp.text,
        "fetched_at": datetime.datetime.utcnow().isoformat(),
    }
```

## RAM Cost

- Per-request: ~5–15 MB (curl_cffi is HTTP-only, no browser process)
- vs. Chromium: 300–500 MB
- Safe to run on 1 GB VPS alongside other services

## Decision: curl_cffi vs cloudscraper

| Scenario | Recommended |
|----------|-------------|
| Cloudflare JS challenge (v1/v2) | curl_cffi — lighter, more reliable in 2026 |
| Cloudflare Managed Challenge / Turnstile | Neither (requires browser or 2captcha) |
| Cloudflare RP (non-blocking, passes RSS) | plain-requests-open-api (no bypass needed) |

cloudscraper uses Node.js/execjs to solve the JS challenge — heavier, and **largely ineffective against Cloudflare v3+ and Turnstile as of 2026**. Prefer curl_cffi unless the site specifically requires JS challenge cookie.

## Known Limits

- Cloudflare Turnstile (v3/Managed Challenge) is NOT bypassed — requires JS execution + CAPTCHA solve
- VPS datacenter IP (Vinahost Vietnam) may still receive higher challenge rates than residential IPs
- Cloudflare Bot Management Pro (large e-commerce) requires additional JS layer signals — not relevant for VN financial data sources
- Keep impersonate profile up to date: Chrome 124 was current as of 2026-05. Run `curl-cffi update` to pull latest fingerprints.

## VN Sources Applicable

- `cafef.vn` RSS (currently passing without bypass — upgrade path if CF IUAM activates)
- Any future VN financial source detected with `anti_bot_type: cloudflare_js`

## References

- [curl_cffi GitHub](https://github.com/lexiforest/curl_cffi)
- [How to Bypass Cloudflare 2026 — Scrapfly](https://scrapfly.io/blog/posts/how-to-bypass-cloudflare-anti-scraping)
- [Cloudflare Bypass Methods 2026 — Bright Data](https://brightdata.com/blog/web-data/bypass-cloudflare)
- [curl_cffi Bright Data tutorial 2026](https://brightdata.com/blog/web-data/web-scraping-with-curl-cffi)
