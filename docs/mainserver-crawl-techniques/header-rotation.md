# Technique — header-rotation

**Problem:** Sites using User-Agent heuristics, basic bot-detection headers, or soft rate limiting that returns 403/429 to default library UA strings.
**Anti-bot type:** none / ip_block / soft heuristics
**Date documented:** 2026-05-13
**RAM cost:** ~5MB per scraper process (requests library + headers dict)

## Solution Approach

Rotate through a realistic set of modern browser User-Agent strings (Chrome 120-124 on Windows/Mac/Linux) and include a full set of browser-like Accept, Accept-Language, Accept-Encoding, and Referer headers. For session-based sites (e.g. TradingEconomics with ASP.NET_SessionId), use `requests.Session()` to persist cookies across calls. Add a 1-3 second jitter between requests to avoid rate-limit triggers.

## Libraries Required

- `requests` >= 2.31.0 (install: `pip install requests`)
- `fake-useragent` >= 1.5.1 (optional UA pool: `pip install fake-useragent`)

## Code Snippet

```python
import requests
import time
import random
from datetime import datetime, timezone

UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

def make_headers(referer: str = "https://www.google.com/") -> dict:
    return {
        "User-Agent": random.choice(UA_POOL),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": referer,
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }

def fetch(url: str, referer: str = "https://www.google.com/") -> dict:
    session = requests.Session()
    try:
        resp = session.get(url, headers=make_headers(referer), timeout=10)
        resp.raise_for_status()
        time.sleep(random.uniform(0.5, 2.0))  # jitter
        return {"status": "ok", "data": resp.text, "fetched_at": datetime.now(timezone.utc).isoformat()}
    except requests.RequestException as e:
        return {"status": "error", "reason": str(e)}
```

## RAM Profiling

```bash
# Measure on macOS/Linux:
/usr/bin/time -l python scraper.py 2>&1 | grep "maximum resident"
# macOS: "maximum resident set size"
# Linux: /usr/bin/time -v python scraper.py 2>&1 | grep "Maximum resident"
# Expected: 20-40MB total (Python interpreter + requests + data)
# Net scraper overhead (above base Python): ~5MB
```

## Known Limits

- Does not bypass any real bot detection (JS challenges, fingerprinting, DataDome, PX, Akamai).
- Effective only for sites with no active bot protection or soft UA filters.
- Session-based sites (ASP.NET_SessionId) require session persistence across calls — use `requests.Session()`.
- `tebot: False` header (TradingEconomics specific) confirmed with realistic UA + headers; monitor for changes.
- Rate limiting: some sites enforce IP-level throttling regardless of UA rotation — back off on 429.

## Sources Used

- [curl_cffi Python scraping 2026 (Bright Data)](https://brightdata.com/blog/web-data/web-scraping-with-curl-cffi)
- [How to Bypass Cloudflare (Scrapfly)](https://scrapfly.io/blog/posts/how-to-bypass-cloudflare-anti-scraping)
- TradingEconomics recon doc: `docs/mainserver-sources/trading-economics-vn/recon.md`
- MarketWatch recon doc: `docs/mainserver-sources/marketwatch-indices/recon.md`
- World Bank recon doc: `docs/mainserver-sources/world-bank-macro/recon.md`
- CNBC recon doc: `docs/mainserver-sources/cnbc-world-markets/recon.md`
