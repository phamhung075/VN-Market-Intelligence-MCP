# Technique — header-rotation

**Problem:** Source blocks or rate-limits requests based on repetitive User-Agent or missing browser-standard headers. Common with nginx-fronted VN sites (VietStock, VnExpress) and IIS sites (VnEconomy, VietnamBiz). No Cloudflare or TLS check — purely header heuristics.
**Anti-bot type:** ip_block (light UA heuristic)
**Date documented:** 2026-05-13

## Solution Approach

Maintain a pool of 5+ realistic, current browser User-Agent strings across OS/browser combinations. Rotate through the pool on each request (sequential or random). Pair with standard browser headers (`Accept`, `Accept-Language`, `Accept-Encoding`, `Referer`) that match the UA. Add a human-like inter-request delay (2–6s). Use `requests.Session` to persist server-set session cookies automatically (session cookies on first response are replayed on subsequent requests to the same domain — prevents "new session" detection pattern).

This is a lightweight upgrade from bare `requests.get()`. Does not change TLS fingerprint — add `tls-fingerprint-spoof` if TLS detection is added.

## Libraries Required

- `requests >= 2.28` (install: `pip install requests`)

## Code Snippet

```python
import requests
import time
import random
import datetime
from typing import Iterator

UA_POOL = [
    # Chrome 124 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Safari 17 macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    # Firefox 125 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Chrome 123 Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    # Mobile Safari iOS 17
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]
_ua_idx = 0

def next_ua() -> str:
    global _ua_idx
    ua = UA_POOL[_ua_idx % len(UA_POOL)]
    _ua_idx += 1
    return ua

BASE_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

def is_blocked(resp: requests.Response) -> bool:
    if resp.status_code in (403, 429, 503):
        return True
    t = resp.text.lower()
    return any(kw in t for kw in ["captcha", "robot", "cloudflare", "access denied", "just a moment", "unusual traffic"])

def fetch_with_rotation(
    url: str,
    referer: str | None = None,
    max_retries: int = 3,
    delay_range: tuple[int, int] = (2, 6),
    session: requests.Session | None = None,
) -> dict:
    sess = session or requests.Session()
    for attempt in range(1, max_retries + 1):
        ua = next_ua()
        h = {**BASE_HEADERS, "User-Agent": ua}
        if referer:
            h["Referer"] = referer
        try:
            resp = sess.get(url, headers=h, timeout=20, allow_redirects=True)
            if is_blocked(resp):
                if attempt < max_retries:
                    time.sleep(random.randint(*delay_range))
                continue
            return {
                "status": "ok",
                "data": resp.text,
                "fetched_at": datetime.datetime.utcnow().isoformat(),
            }
        except requests.RequestException as e:
            if attempt < max_retries:
                time.sleep(2)
    return {"status": "error", "reason": "max_retries_exceeded"}

def human_delay(min_s: int = 2, max_s: int = 6) -> None:
    time.sleep(random.randint(min_s, max_s))
```

## RAM Cost

- Per-request: ~3–8 MB (requests + urllib3)
- Session object: ~1 MB persistent
- Pool rotation: zero overhead
- Lightest non-trivial technique in the catalog

## Known Limits

- Does NOT change TLS fingerprint — JA3/JA4 still shows `urllib3` fingerprint. Upgrade to `tls-fingerprint-spoof` if blocked despite UA rotation.
- Session cookies (`ASP.NET_SessionId`, `device_env`) are handled automatically by `requests.Session` — this is sufficient for VN sites that set these without JS challenge.
- Does NOT solve any JS challenge — purely header-level mitigation.
- UA rotation helps against naive UA blocklists; sophisticated detectors ignore UA entirely and use TLS+behavioral signals.
- Rate limits (429): increase `delay_range` to `(10, 20)` seconds; check `Retry-After` header if present.

## Sources Served

- `vn-news-rss` (14 RSS feeds) — via deployed `fetch-vn-news.sh` (bash equivalent pattern)
- Applicable to any new VN source with `anti_bot_type: none` or `ip_block (light)`

## References

- [vn-news-rss recon doc](docs/vps-sources/vn-news-rss/recon.md)
- [ua-rotation-rss technique doc](docs/vps-crawl-techniques/ua-rotation-rss.md)
- [TLS fingerprinting guide — Rayobyte](https://rayobyte.com/blog/tls-fingerprinting/)
- [HTTP/2 fingerprinting — Scrapfly](https://scrapfly.io/blog/posts/http2-http3-fingerprinting-guide)
