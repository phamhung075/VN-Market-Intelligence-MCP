# Technique — playwright-stealth

**Problem:** Sites with DataDome (Reuters) or PerimeterX (Bloomberg) bot protection that blocks all non-browser HTTP clients. These systems validate TLS JA3/JA4 fingerprint, HTTP/2 frame ordering, navigator properties, canvas fingerprint, WebGL vendor, mouse movement entropy, and scroll behavior simultaneously.
**Anti-bot type:** datadome / perimeterx
**Date documented:** 2026-05-13
**RAM cost:** ~350-500MB per Chromium instance (Playwright Chromium headless + stealth layer)

## Solution Approach

**2026 context:** Traditional `playwright-stealth` (JS-level patch) effectiveness has declined for DataDome as JS-level "stealth" is increasingly detected. Best current approach:

1. **Primary (DataDome / PX passive):** Playwright + `playwright-stealth` plugin with realistic viewport, geolocation, and human-behavior simulation (mouse movement, scroll, timing jitter). Effective for PerimeterX passive phase (Bloomberg).
2. **Alternative for DataDome (stronger):** `camoufox` — Firefox-based anti-detect browser that patches fingerprints at the C++ level (not JS injection). More robust against DataDome JA4 checks. Maintained but experimental as of 2026-05 due to Firefox version lag.
3. **Fallback for Reuters:** Reuters RSS feed (`https://feeds.reuters.com/reuters/businessNews`) — no bot protection, XML, try this first before investing in full Playwright stealth.

**Always close browser context after each fetch** to free RAM.

## Libraries Required

- `playwright` >= 1.44.0 (install: `pip install playwright && playwright install chromium`)
- `playwright-stealth` >= 1.0.6 (install: `pip install playwright-stealth`)
- OR `camoufox` >= 0.4.0 as alternative (install: `pip install camoufox[geoip]`)

## Code Snippet

### Playwright + playwright-stealth (DataDome / PerimeterX)

```python
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync
from datetime import datetime, timezone
import json
import random
import time

def fetch_with_playwright_stealth(url: str, wait_for: str = "networkidle") -> dict:
    """
    Fetch a page using Playwright + playwright-stealth.
    Always closes browser context after fetch to release ~350MB RAM.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--window-size=1920,1080",
            ],
        )
        try:
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                locale="en-US",
                timezone_id="America/New_York",
                geolocation={"longitude": -73.935242, "latitude": 40.730610},  # New York
                permissions=["geolocation"],
            )
            page = context.new_page()
            stealth_sync(page)

            # Human-like: random pre-navigation pause
            time.sleep(random.uniform(0.5, 1.5))

            response = page.goto(url, wait_until=wait_for, timeout=30000)
            if not response or response.status >= 400:
                return {"status": "error", "reason": f"HTTP {response.status if response else 'no response'}"}

            # Simulate human scroll
            page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
            time.sleep(random.uniform(0.3, 0.8))
            page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
            time.sleep(random.uniform(0.2, 0.5))

            html = page.content()
            return {
                "status": "ok",
                "data": html,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            return {"status": "error", "reason": str(e)}
        finally:
            browser.close()  # ALWAYS close — releases ~350MB RAM

def fetch_bloomberg_headlines(max_articles: int = 10) -> dict:
    """Fetch Bloomberg public headlines using Playwright stealth."""
    result = fetch_with_playwright_stealth("https://www.bloomberg.com/markets")
    if result["status"] != "ok":
        return result

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(result["data"], "lxml")
    headlines = []
    for el in soup.select("[data-component='headline']")[:max_articles]:
        headlines.append(el.text.strip())

    # Also try __NEXT_DATA__ for structured data
    next_data_el = soup.select_one("script#__NEXT_DATA__")
    if next_data_el:
        try:
            next_data = json.loads(next_data_el.string)
            # Extract stories if available in pageProps
            page_props = next_data.get("props", {}).get("pageProps", {})
            if "stories" in page_props:
                for story in page_props["stories"][:max_articles]:
                    if story.get("headline"):
                        headlines.append(story["headline"])
        except (json.JSONDecodeError, AttributeError):
            pass

    return {
        "status": "ok",
        "data": headlines,
        "fetched_at": result["fetched_at"],
    }
```

### Reuters RSS Fallback (preferred for Reuters — no bot protection)

```python
import xml.etree.ElementTree as ET
import requests
from datetime import datetime, timezone

REUTERS_RSS = "https://feeds.reuters.com/reuters/businessNews"

def fetch_reuters_rss(max_items: int = 15) -> dict:
    """
    Fetch Reuters business news via RSS — no bot protection.
    Use this BEFORE attempting Playwright stealth on reuters.com.
    """
    try:
        resp = requests.get(
            REUTERS_RSS,
            headers={"User-Agent": "Mozilla/5.0 (compatible; VNMarketBot/1.0)"},
            timeout=10,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        items = []
        for item in root.findall(".//item")[:max_items]:
            items.append({
                "title": (item.find("title") and item.find("title").text) or "",
                "link": (item.find("link") and item.find("link").text) or "",
                "pub_date": (item.find("pubDate") and item.find("pubDate").text) or "",
                "description": (item.find("description") and item.find("description").text) or "",
            })
        return {
            "status": "ok",
            "data": items,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"status": "error", "reason": str(e)}
```

## RAM Profiling

```bash
# Playwright Chromium headless instance:
/usr/bin/time -v python bloomberg_scraper.py 2>&1 | grep "Maximum resident"
# Expected: 400-550MB total process RSS (Python + Chromium renderer + V8 engine)
# Chromium base allocation: ~150MB before first navigation (2026 benchmark)
# Peak per page load: ~350-500MB depending on page JS bundle size
# Browser.close() releases memory — do not keep browser open between cycles

# Reuters RSS (no browser):
/usr/bin/time -v python reuters_rss_scraper.py 2>&1 | grep "Maximum resident"
# Expected: 30-50MB (Python + requests + XML parse)
```

## Known Limits

- **playwright-stealth (JS-level patching):** Declining effectiveness against DataDome in 2026. DataDome validates JA4 TLS fingerprint + HTTP/2 frame ordering which JS patches cannot fix. May fail on heavily monitored sites.
- **Camoufox (C++ level):** Stronger than playwright-stealth for DataDome, but as of 2026-05 has a maintenance gap and experimental releases — test before production use.
- **Bloomberg paywall:** Only public/free headlines are accessible regardless of stealth technique. Full article content requires subscription.
- **Reuters DataDome:** `x-dd-b: 3` (hard block) may require residential proxies in addition to stealth browser. Try RSS feed first.
- Headless detection: some advanced systems detect headless via `navigator.webdriver`, `window.chrome`, GPU rendering absence. playwright-stealth patches these but not at protocol level.
- RAM is significant — close browser immediately after fetch. Do not run multiple Playwright instances concurrently without ops RAM budget approval.
- Container memory: each concurrent Playwright instance = ~400-500MB. With 2 concurrent instances = ~900MB committed. Flag ops before adding second concurrent headless scraper.

## Sources Used

- [Playwright Stealth bypass DataDome (Scrapfly)](https://scrapfly.io/blog/posts/how-to-bypass-datadome-anti-scraping)
- [How to Bypass DataDome 2026 (ZenRows)](https://www.zenrows.com/blog/datadome-bypass)
- [Playwright Anti-Bot 2026 (AlterLab)](https://alterlab.io/blog/playwright-bot-detection-what-actually-works-in-2026)
- [Camoufox anti-detect browser](https://github.com/daijro/camoufox)
- [Playwright Chromium RAM benchmark (DataWookie)](https://datawookie.dev/blog/2025-06-06-playwright-browser-footprint/)
- [Best Playwright Stealth 2026 (Scrapewise)](https://scrapewise.ai/blogs/playwright-stealth-2026)
- Reuters recon doc: `docs/mainserver-sources/reuters-asia-news/recon.md`
- Bloomberg recon doc: `docs/mainserver-sources/bloomberg-markets/recon.md`
