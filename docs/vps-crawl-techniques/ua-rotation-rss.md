# Technique — ua-rotation-rss

**Problem:** RSS feeds served behind light protection (Cloudflare RP, session cookies, UA checks). No JS challenge but repeated requests with the same UA may trigger 403 or 429. Sources include CafeF (Cloudflare RP), VietStock (nginx + ASP.NET session cookie), VnExpress (device_env cookie).
**Anti-bot type:** none / ip_block (light)
**Date documented:** 2026-05-13

## Solution Approach

Rotate through a pool of 5 realistic User-Agent strings (Chrome/Win, Safari/Mac, Firefox/Win, Chrome/Linux, Mobile Safari/iPhone). On each request, cycle to the next UA. On block detection (403, 429, or body containing "captcha/robot/cloudflare/access denied"), retry with the next UA — up to 3 attempts per source. Add a human-like random delay (2-6s) between requests to different sources, shorter delay (2-4s) between pages of the same site. Use `curl --compressed` so gzip/deflate is accepted — matches real browser behaviour. Session cookies (`laravel_session`, `ASP.NET_SessionId`, `device_env`) are set by servers and passed automatically by curl's cookie jar (or requests.Session), allowing the server to treat the request as a valid browser session.

## Libraries Required

- `curl` (system, for shell deployment) or `requests >= 2.28` (Python equivalent)
- `python3 xml.etree.ElementTree` (stdlib) for RSS parsing

## Code Snippet

```python
import requests
import time
import random
import xml.etree.ElementTree as ET
import html

UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]
_ua_idx = 0

def next_ua() -> str:
    global _ua_idx
    ua = UA_POOL[_ua_idx]
    _ua_idx = (_ua_idx + 1) % len(UA_POOL)
    return ua

def is_blocked(body: str, status: int) -> bool:
    if status in (403, 429):
        return True
    body_lower = body.lower()
    return any(kw in body_lower for kw in ["captcha", "robot", "cloudflare", "access denied", "just a moment", "unusual traffic"])

def fetch_rss(source: str, url: str, max_items: int = 20, session: requests.Session = None) -> list:
    sess = session or requests.Session()
    for attempt in range(1, 4):
        ua = next_ua()
        try:
            resp = sess.get(url, headers={
                "User-Agent": ua,
                "Accept": "application/rss+xml,application/xml,text/xml,*/*",
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
                "Referer": "https://www.google.com/",
            }, timeout=20, allow_redirects=True)
            if is_blocked(resp.text, resp.status_code):
                time.sleep(2)
                continue
            tree = ET.fromstring(resp.content)
            items = []
            for item in tree.iter("item"):
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub = (item.findtext("pubDate") or "").strip()
                desc = html.unescape((item.findtext("description") or "")[:500])
                if title or link:
                    items.append({"title": title, "url": link, "publishedAt": pub,
                                  "content": desc, "source": source})
            return items[:max_items]
        except Exception:
            time.sleep(2)
    return []

def human_delay(min_s: int = 2, max_s: int = 6):
    time.sleep(random.randint(min_s, max_s))
```

## Deployed Scraper Pattern

`fetch-vn-news.sh` implements this in bash:

- 5-element UA pool, cycled sequentially (not randomly) across 14 sources
- `curl -s -w "\n__HTTP__%{http_code}"` trick separates body from HTTP code
- `is_blocked()` checks both HTTP code and body keywords
- Human delay: `$((MIN + RANDOM % (MAX - MIN + 1)))` seconds between sources
- XML parsed inline with `python3 -u -c` reading from stdin — avoids temp files for small payloads
- Large payloads (`ALL_JSON`) written to `mktemp` file to avoid "Argument list too long"

## Known Limits

- CafeF RSS is behind Cloudflare RP (`server: cf-rp`). If Cloudflare activates a managed challenge for RSS, this technique fails. Upgrade to `cloudflare-managed-bypass` if that happens.
- VietStock `ASP.NET_SessionId` is set without JS challenge — the session cookie is obtained automatically on first request. If VietStock adds a JS challenge, upgrade to `js-mini-challenge`.
- UA rotation does not change TLS fingerprint — a sophisticated detector (JA3/JA4) would see `requests` or `curl` fingerprint. Upgrade to `tls-fingerprint-spoof` if blocked despite UA rotation.
- `device_env` cookie on VnExpress is harmless — the server sets it automatically and reads it back. No JS computation needed.
- Current 2-6s human delay is appropriate for 14 sources polled sequentially. Do not reduce below 1s — VietStock nginx may 429.

## Sources Served

- `vn-news-rss` (14 RSS endpoints: CafeF, VnExpress, VnEconomy, VietStock, TuoiTre, NhanDan, NLD, VietnamBiz, VnBusiness)

## References

- [fetch-vn-news.sh deployed script on VPS](ssh root@125.212.251.27:/root/fetch-vn-news.sh)
- [vn-news-rss recon doc](docs/vps-sources/vn-news-rss/recon.md)
- [How to Use Cookies and Session in Python Web Scraping](https://www.worthwebscraping.com/how-to-use-cookies-and-session-in-python-web-scraping/)
