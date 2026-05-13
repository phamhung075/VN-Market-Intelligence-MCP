# Technique — ssc-playwright-download

**Problem:** SSC disclosure portal (`congbothongtin.ssc.gov.vn/faces/NewsSearch`) is an Oracle ADF SPA. Plain HTTP GET returns a 7 KB JS splash — no article data. The page requires full JS execution to render search results and trigger PDF downloads. No REST API or static PDF URL exists; downloads are session-bound POST triggers.
**Anti-bot type:** js_mini (Oracle ADF requires JS execution for search/download; no explicit anti-bot, but SPA is non-scrapable without JS)
**Date documented:** 2026-05-13

## Solution Approach

Use Playwright (async_api) to fully render the Oracle ADF page, fill the ticker input field (selector `#pt9:it8112::content`), click the search button ("Tìm kiếm"), wait 4s for ADF AJAX refresh, parse `<tr role="row">` result rows, match against target quarter/year using Vietnamese text patterns, click the download icon for the matched row using `expect_download`, save PDF to `/root/bctc-cache/<CODE>/`, and return a stable proxy URL via `vps-proxy-server.js` (`http://<VPS_IP>:8765/bctc-files/<CODE>/<filename>`).

**RAM constraint caveat:** Playwright/Chromium requires ~300-500 MB RAM. The VPS has ~1 GB total. The `vn-bctc-fetch.service` has `TasksMax=32` and `MemoryMax=256M`. Chromium requires more than 32 threads to start and hits `pthread_create: Resource temporarily unavailable`. **This technique is currently non-functional on this VPS in its systemd-constrained form.**

## Libraries Required

- `playwright >= 1.40` (install: `pip install playwright && playwright install chromium`)
- Requires: `MemoryMax >= 512M` and `TasksMax >= 100` in the systemd service unit

## Code Snippet

```python
import asyncio, os, re, html as html_lib
from playwright.async_api import async_playwright

SSC_SEARCH_URL = "https://congbothongtin.ssc.gov.vn/faces/NewsSearch"
BCTC_CACHE_DIR = os.environ.get("BCTC_CACHE_DIR", "/root/bctc-cache")
VPS_PROXY_BASE = os.environ.get("VPS_PROXY_BCTC_BASE", "http://125.212.251.27:8765/bctc-files")

async def ssc_download(code: str, year: int, quarter: str) -> dict | None:
    cache_dir = os.path.join(BCTC_CACHE_DIR, code.upper())
    os.makedirs(cache_dir, exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            accept_downloads=True,
        )
        page = await ctx.new_page()
        await page.goto(SSC_SEARCH_URL, timeout=30_000, wait_until="networkidle")
        await page.wait_for_timeout(2_000)

        ticker_el = await page.query_selector("#pt9\\:it8112\\:\\:content")
        if not ticker_el:
            await browser.close()
            return None
        await ticker_el.fill(code.upper())

        for btn in await page.query_selector_all("button, a"):
            if "Tìm kiếm" in (await btn.text_content() or ""):
                await btn.click()
                break
        await page.wait_for_timeout(4_000)

        html_content = await page.content()
        # ... parse rows, match quarter/year, click download icon ...
        # (full implementation in discover-bctc-urls-browser.py)

        await browser.close()
    return None  # stub
```

## Current Failure Mode on VPS

```
BrowserType.launch: Target page, context or browser has been closed
pthread_create: Resource temporarily unavailable (11)
```

Root cause: `TasksMax=32` in `vn-bctc-fetch.service` prevents Chromium from spawning its required thread pool. Chromium needs ~100+ threads.

Fix options:
1. Add `TasksMax=512` to `vn-bctc-fetch.service` (ops task)
2. Replace Playwright with a no-browser path for HOSE/SSC (preferred — see `hsx-bctc/triage.md`)

## Known Limits

- VPS RAM ~1 GB total. Chromium allocates 300-500 MB. Running Playwright while other services are active risks OOM.
- Oracle ADF session is ephemeral — no stable direct PDF URL exists; proxy URL relies on downloaded file persisting in `/root/bctc-cache/`.
- `--no-sandbox` required on Linux VPS without user namespaces. Security trade-off acceptable for internal VPS.
- Playwright and Chromium are **forbidden under the standard VPS RAM constraint rule** for new scrapers. This technique is documented for the existing SSC use case only.

## Sources Served

- `hsx-bctc` (HOSE-listed tickers, SSC portal fallback) — currently failing due to TasksMax

## References

- [Playwright async_api docs](https://playwright.dev/python/docs/api/class-browsertype)
- [discover-bctc-urls-browser.py SSC implementation](ssh root@125.212.251.27:/root/discover-bctc-urls-browser.py)
- [hsx-bctc recon doc](docs/vps-sources/hsx-bctc/recon.md)
- [hsx-bctc triage](docs/vps-sources/hsx-bctc/triage.md)
