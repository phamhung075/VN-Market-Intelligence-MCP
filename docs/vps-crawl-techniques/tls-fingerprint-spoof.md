# Technique — tls-fingerprint-spoof

**Problem:** Target server inspects the TLS ClientHello fingerprint (JA3/JA4 hash) to distinguish browser from Python scraper. Python `requests` and `httpx` emit a predictable `urllib3` TLS fingerprint that is trivially blocklisted.
**Anti-bot type:** cloudflare_js / ip_block (TLS-level)
**Date documented:** 2026-05-13

## Solution Approach

Use `curl_cffi` to replace Python's TLS stack with the exact ClientHello, cipher suite order, ALPN sequence, and HTTP/2 SETTINGS frames of a real Chrome/Safari/Firefox build. The JA4+ fingerprint (successor to JA3 — sorts TLS extensions alphabetically, strips GREASE, stable across Chrome randomization) computed at the CDN edge sees a legitimate browser. curl_cffi wraps `curl-impersonate` via cffi so no browser process is spawned — RSS per request is ~5–15 MB vs 300–500 MB for Chromium.

As of curl_cffi >= 0.15, fingerprint profiles update independently (`curl-cffi update`) without a full pip upgrade.

## Libraries Required

- `curl_cffi >= 0.7` (install: `pip install curl_cffi`)

## Code Snippet

```python
from curl_cffi import requests as cffi_requests
import datetime

def fetch_tls_spoof(url: str, impersonate: str = "chrome124", headers: dict | None = None) -> dict:
    """
    GET url with Chrome TLS fingerprint impersonation.
    impersonate values: chrome110, chrome120, chrome124, chrome131,
                        safari17, firefox120, etc.
    """
    h = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    }
    if headers:
        h.update(headers)
    resp = cffi_requests.get(url, impersonate=impersonate, headers=h, timeout=20)
    resp.raise_for_status()
    return {
        "status": "ok",
        "data": resp.text,
        "fetched_at": datetime.datetime.utcnow().isoformat(),
    }

# Session-based (persist cookies across requests — critical for session warmup)
session = cffi_requests.Session()
resp = session.get(url, impersonate="chrome124")
```

## RAM Cost

- Per-request: ~5–15 MB
- Idle process: ~10 MB
- vs. Chromium: 300–500 MB (33–100x lighter)
- Suitable for VPS with ~1 GB RAM alongside 4 other services

## Known Limits

- Bypasses TLS/JA4 check and initial Cloudflare JS challenge (Bot Score threshold)
- Does NOT solve Cloudflare Turnstile (requires JS engine or 2captcha)
- Does NOT spoof WebRTC, canvas, WebGL — only TLS + HTTP/2 layer
- Does NOT bypass Akamai Device Registration (requires C++ sensor patches)
- Must pair with consistent UA matching the impersonated browser version
- Datacenter VPS IP (Vinahost Vietnam IP) may still score lower than residential even with perfect TLS

## References

- [curl_cffi GitHub](https://github.com/lexiforest/curl_cffi)
- [Anti-Bot Bypass Guide 2026 — Asad Ikram](https://asadfix.github.io/scraping-guide/)
- [Web Scraping With curl_cffi 2026 — Bright Data](https://brightdata.com/blog/web-data/web-scraping-with-curl-cffi)
- [JA3/JA4 fingerprint tool — Scrapfly](https://scrapfly.io/web-scraping-tools/ja3-fingerprint)
