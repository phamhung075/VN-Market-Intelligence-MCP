# Technique — cloudflare-managed-bypass

**Problem:** Sites protected by Cloudflare Bot Management (`__cf_bm` passive cookie) or CF Managed Challenge where direct `requests` gets blocked or returns empty content. The CF Bot Management passive phase issues a `__cf_bm` cookie that gates subsequent API calls.
**Anti-bot type:** cloudflare_managed
**Date documented:** 2026-05-13
**RAM cost:** ~15-25MB per scraper process (curl_cffi is preferred in 2026; cloudscraper as fallback ~25MB)

## Solution Approach

**2026 recommendation: curl_cffi over cloudscraper.** Legacy `cloudscraper` is largely ineffective against modern Cloudflare Turnstile, Bot Fight Mode, and newer managed challenges. Use `curl_cffi` with `impersonate="chrome124"` to spoof TLS/JA3/JA4 fingerprints at the libcurl level — this passes most passive `__cf_bm` checks without triggering the active JS challenge.

For investing.com economic calendar (passive `__cf_bm` mode):
1. Use `curl_cffi` to GET the page and capture `__cf_bm` + `__cflb` cookies.
2. POST to `/economic-calendar/Service/getCalendarFilteredData` with the captured cookies and correct `X-Requested-With: XMLHttpRequest` header.
3. Parse the HTML table fragment response.

If `curl_cffi` is insufficient and Cloudflare escalates to JS challenge: escalate to FlareSolverr (Docker-based undetected-chromedriver, ~400MB) or Playwright stealth.

## Libraries Required

- `curl_cffi` >= 0.7.1 (install: `pip install curl_cffi`)
- `beautifulsoup4` >= 4.12.0 (HTML parse: `pip install beautifulsoup4`)
- `lxml` >= 5.0.0 (fast parser: `pip install lxml`)

## Code Snippet

```python
from curl_cffi import requests as cffi_requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
import json

BASE_URL = "https://www.investing.com"
CALENDAR_URL = f"{BASE_URL}/economic-calendar/Service/getCalendarFilteredData"

def fetch_investing_calendar(country_id: str = "35") -> dict:
    """
    Fetch Investing.com economic calendar for a given country.
    country_id=35 is Vietnam (needs verification via session inspection).
    Uses curl_cffi to bypass Cloudflare __cf_bm passive challenge.
    """
    session = cffi_requests.Session(impersonate="chrome124")
    try:
        # Step 1: GET page to warm up CF cookies
        warm_resp = session.get(
            f"{BASE_URL}/economic-calendar/",
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
            },
            timeout=15,
        )
        if warm_resp.status_code not in (200, 308):
            return {"status": "error", "reason": f"CF warmup failed: {warm_resp.status_code}"}

        # Step 2: POST to calendar API with CF session cookies
        post_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE_URL}/economic-calendar/",
            "Origin": BASE_URL,
        }
        post_data = {
            "country[]": country_id,
            "timeZone": "55",          # UTC+7
            "timeFilter": "timeRemain",
            "currentTab": "thisWeek",
            "submitFilters": "1",
            "limit_from": "0",
        }
        resp = session.post(CALENDAR_URL, headers=post_headers, data=post_data, timeout=15)
        if resp.status_code != 200:
            return {"status": "error", "reason": f"Calendar POST failed: {resp.status_code}"}

        # Step 3: Parse HTML table fragment
        soup = BeautifulSoup(resp.text, "lxml")
        events = []
        for row in soup.select("tr.js-event-item"):
            events.append({
                "time": row.select_one("td.left.time") and row.select_one("td.left.time").text.strip(),
                "country": row.select_one("td.country span") and row.select_one("td.country span").get("title", ""),
                "event": row.select_one("td.event a") and row.select_one("td.event a").text.strip(),
                "actual": row.select_one("td.actual") and row.select_one("td.actual").text.strip(),
                "forecast": row.select_one("td.forecast") and row.select_one("td.forecast").text.strip(),
                "previous": row.select_one("td.previous") and row.select_one("td.previous").text.strip(),
            })
        return {
            "status": "ok",
            "data": events,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"status": "error", "reason": str(e)}

if __name__ == "__main__":
    print(json.dumps(fetch_investing_calendar(), indent=2))
```

## RAM Profiling

```bash
/usr/bin/time -v python investing_calendar_scraper.py 2>&1 | grep "Maximum resident"
# Expected: 35-60MB total (Python + curl_cffi + libcurl + BS4 + lxml)
# Net scraper overhead above base Python: ~15-25MB
# curl_cffi embeds libcurl with browser TLS stacks — heavier than plain requests but far lighter than Playwright
```

## Known Limits

- `cloudscraper` (2026): largely ineffective against Cloudflare Turnstile/Bot Fight Mode — not recommended as primary.
- `curl_cffi` handles passive `__cf_bm` well; if site escalates to interactive Turnstile or CAPTCHA, escalate to FlareSolverr or Playwright stealth.
- Vietnam country code on investing.com calendar needs session inspection to verify (likely 35 — unconfirmed from recon). Action: run scraper with `country[]` omitted first to get all events, then filter by country name.
- Rate limit: ~20 req/min from same IP — add 3-5s delay between calendar pulls.
- Session cookies (`__cf_bm`, `__cflb`) have short TTL (~30 min) — re-warmup on each scrape cycle.
- Cloudflare protection level can change — monitor for 403 responses and escalate technique if needed.

## Sources Used

- [curl_cffi GitHub](https://github.com/lexiforest/curl_cffi)
- [How to Use curl_cffi (DataHut)](https://www.blog.datahut.co/post/web-scraping-without-getting-blocked-curl-cffi)
- [Bright Data curl_cffi guide](https://brightdata.com/blog/web-data/web-scraping-with-curl-cffi)
- [Bypass Cloudflare in 2026 (ScrapeOps)](https://scrapeops.io/web-scraping-playbook/how-to-bypass-cloudflare/)
- [FlareSolverr Definitive Guide](https://spyderproxy.com/blog/flaresolverr-guide)
- Investing.com recon doc: `docs/mainserver-sources/investing-economic-calendar/recon.md`
