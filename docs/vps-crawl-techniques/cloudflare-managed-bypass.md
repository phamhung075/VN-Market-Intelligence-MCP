# Technique — cloudflare-managed-bypass

**Problem:** Target uses Cloudflare Managed Challenge or Turnstile (v3+). Neither plain requests nor curl_cffi TLS spoofing is sufficient — the challenge requires JS execution to produce a signed proof-of-work token and/or CAPTCHA interaction.
**Anti-bot type:** cloudflare_managed
**Date documented:** 2026-05-13

## 2026 Effectiveness Warning

**cloudscraper is largely ineffective against Cloudflare Managed Challenge and Turnstile as of 2026.** It was designed for CF IUAM v1/v2 (JS math challenge). Modern Cloudflare challenges (v3+, Turnstile) cannot be solved by cloudscraper's execjs engine alone. cloudscraper with a 2captcha/anticaptcha integration can solve Turnstile, but this adds latency and cost per request.

For pure HTTP bypass of Cloudflare Managed Challenge: **no free, lightweight, RAM-safe solution exists.** The practical options are:

1. Find the underlying API endpoint (avoids Cloudflare-protected HTML page entirely)
2. Use a paid managed scraping API (Bright Data, Zyte) — out of scope for VPS deployment
3. Cookie warmup: solve the challenge once manually, extract `cf_clearance` + `__cf_bm` cookies, replay them (short-lived — expires ~30 min, IP-bound)

## Libraries Required

Option A (cloudscraper with 2captcha — not recommended for VPS):
- `cloudscraper >= 1.2.71` (install: `pip install cloudscraper`)
- 2captcha API key (paid)

Option B (manual cf_clearance cookie replay):
- `requests >= 2.28` or `curl_cffi >= 0.7`

## Code Snippet — Option B (cf_clearance replay)

```python
import requests
import datetime

def fetch_with_cf_clearance(
    url: str,
    cf_clearance: str,
    cf_bm: str | None = None,
    user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
) -> dict:
    """
    Replay a manually obtained cf_clearance cookie.
    cf_clearance is IP-bound and typically expires in 30 minutes.
    The User-Agent MUST match exactly what was used when the cookie was issued.
    """
    session = requests.Session()
    session.cookies.set("cf_clearance", cf_clearance, domain=".cafef.vn")
    if cf_bm:
        session.cookies.set("__cf_bm", cf_bm, domain=".cafef.vn")
    resp = session.get(url, headers={
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    }, timeout=20)
    if resp.status_code in (403, 503):
        return {"status": "error", "reason": f"cf_clearance_expired http={resp.status_code}"}
    return {"status": "ok", "data": resp.text, "fetched_at": datetime.datetime.utcnow().isoformat()}
```

## Code Snippet — Option A (cloudscraper, basic CF JS only)

```python
import cloudscraper
import datetime

def fetch_cloudscraper(url: str) -> dict:
    """
    Use cloudscraper for Cloudflare IUAM v1/v2 JS challenge only.
    Will FAIL against Turnstile and managed challenge in 2026.
    """
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    resp = scraper.get(url, timeout=30)
    if resp.status_code != 200:
        return {"status": "error", "reason": f"http={resp.status_code}"}
    return {"status": "ok", "data": resp.text, "fetched_at": datetime.datetime.utcnow().isoformat()}
```

## RAM Cost

- cloudscraper (no Node.js JS engine): ~20–30 MB
- cloudscraper + Node.js: ~50–80 MB (Node.js spawned per challenge solve)
- cf_clearance replay (requests only): ~5–10 MB
- Chromium (FlareSolverr): 300–500 MB — **FORBIDDEN on this VPS**

## Decision Tree for VN Sources

```
Source uses Cloudflare?
  ├── CF RP only (server: cf-rp) → plain-requests-open-api (no challenge)
  ├── CF IUAM JS challenge → cloudflare-js-bypass (curl_cffi)
  ├── CF Managed Challenge/Turnstile
  │     ├── Underlying API discoverable? → Use API directly (bypass HTML page)
  │     ├── Low-frequency crawl? → Manual cf_clearance replay (30-min window)
  │     └── High-frequency? → Escalate to ops for managed proxy
  └── CF Bot Management Pro → Escalate (no free lightweight path)
```

## Known Limits

- cf_clearance cookie is IP-bound: must use the same VPS IP it was issued for
- cf_clearance typically expires in 30 minutes — manual refresh required
- cloudscraper cannot solve Turnstile without 2captcha integration (paid, ~$2/1000 solves)
- All browser automation for solving challenges (FlareSolverr, etc.) is FORBIDDEN due to VPS RAM constraint
- No VN financial source currently requires managed challenge bypass (as of 2026-05-13)

## References

- [cloudscraper GitHub](https://github.com/VeNoMouS/cloudscraper)
- [Cloudscraper guide 2026 — RoundProxies](https://roundproxies.com/blog/cloudscraper/)
- [Cloudflare Bypass 2026 — Scrapfly](https://scrapfly.io/blog/posts/how-to-bypass-cloudflare-anti-scraping)
- [5 Working Methods to Bypass Cloudflare 2026 — Scrape.do](https://scrape.do/blog/bypass-cloudflare/)
