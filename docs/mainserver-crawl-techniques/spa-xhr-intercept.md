# Technique — spa-xhr-intercept

**Problem:** Site is a JavaScript SPA (Single Page Application) where all data is fetched client-side via XHR/fetch calls. Static HTTP probes return a 200 SPA shell but no data. The actual API endpoints are unknown and must be discovered by observing network traffic during a real browser session.
**Anti-bot type:** none (bot protection is not the challenge — API discovery is the challenge)
**Date documented:** 2026-05-13
**RAM cost:** ~350-450MB for the Playwright discovery session (one-time); ~5-15MB for subsequent direct API calls once endpoints are known

## Solution Approach

Two phases:

**Phase 1 — API Discovery (one-time, headless):** Use Playwright to load the SPA and intercept all XHR/fetch network requests. Record every request made to API endpoints matching the expected pattern. Log the full URL, request headers, and response body. After one Playwright session, the actual API endpoints are known.

**Phase 2 — Direct API calls (ongoing, lightweight):** Once endpoints are documented, call them directly with `requests` + appropriate headers (including any auth tokens or session cookies found in Phase 1). No headless browser needed for ongoing scraping — RAM drops to ~5-15MB.

Applied to: ADB KIDB (`kidb.adb.org`) — Vue.js SPA with unknown internal API paths.

## Libraries Required

- Phase 1 (discovery): `playwright` >= 1.44.0 (install: `pip install playwright && playwright install chromium`)
- Phase 2 (ongoing): `requests` >= 2.31.0 (install: `pip install requests`)

## Code Snippet

### Phase 1 — Playwright API Discovery

```python
from playwright.sync_api import sync_playwright, Request, Response
from datetime import datetime, timezone
import json
import re

ADB_KIDB_URL = "https://kidb.adb.org"
# Expected API pattern — adjust regex after discovery
API_PATTERN = re.compile(r"kidb\.adb\.org/(?:api|data|service|graphql)")

def discover_adb_api_endpoints(save_to: str = "/tmp/adb_endpoints.json") -> dict:
    """
    Load ADB KIDB SPA and intercept XHR/fetch requests to discover API endpoints.
    Run this ONCE. After endpoints are found, switch to direct requests (Phase 2).
    RAM cost: ~400MB during run. Browser closes when done.
    """
    discovered = []

    def on_request(request: Request):
        url = request.url
        if API_PATTERN.search(url) or "adb.org" in url and request.resource_type in ("xhr", "fetch"):
            discovered.append({
                "url": url,
                "method": request.method,
                "headers": dict(request.headers),
                "post_data": request.post_data,
            })

    def on_response(response: Response):
        url = response.url
        if API_PATTERN.search(url) or "adb.org" in url and response.request.resource_type in ("xhr", "fetch"):
            try:
                body = response.json()
                for entry in discovered:
                    if entry["url"] == url:
                        entry["response_sample"] = str(body)[:500]
            except Exception:
                pass

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            page = context.new_page()
            page.on("request", on_request)
            page.on("response", on_response)

            # Load SPA and wait for network to settle
            page.goto(f"{ADB_KIDB_URL}/kidb", wait_until="networkidle", timeout=30000)

            # Try to navigate to Vietnam data by clicking or routing
            # Adjust selector after inspecting SPA routing
            try:
                page.click("[data-country='VNM'], [data-iso='VNM'], text='Vietnam'", timeout=5000)
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass

            # Save discovery results
            result = {
                "discovered_at": datetime.now(timezone.utc).isoformat(),
                "endpoints": discovered,
            }
            with open(save_to, "w") as f:
                json.dump(result, f, indent=2)
            return {"status": "ok", "data": result}
        except Exception as e:
            return {"status": "error", "reason": str(e)}
        finally:
            browser.close()  # Release ~400MB RAM


### Phase 2 — Direct API calls (after discovery)

def fetch_adb_kidb_direct(endpoint: str, params: dict = None) -> dict:
    """
    Call ADB KIDB internal API directly after Phase 1 discovery.
    Fill `endpoint` from the discovered URL in /tmp/adb_endpoints.json.
    RAM cost: ~15MB (requests only).
    """
    import requests
    try:
        resp = requests.get(
            endpoint,
            params=params or {},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Referer": ADB_KIDB_URL,
                "Origin": ADB_KIDB_URL,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return {
            "status": "ok",
            "data": resp.json(),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"status": "error", "reason": str(e)}


### ADB Bulk Download Fallback (no JS needed)

def fetch_adb_bulk_download_links() -> dict:
    """
    Fallback: scrape ADB KIDB bulk download page for Excel/CSV links.
    No JS execution needed for download page listing.
    """
    import requests
    from bs4 import BeautifulSoup
    try:
        resp = requests.get(
            f"{ADB_KIDB_URL}/kidb",
            headers={"User-Agent": "Mozilla/5.0 (compatible)"},
            timeout=10,
        )
        soup = BeautifulSoup(resp.text, "lxml")
        links = [
            {"text": a.text.strip(), "href": a["href"]}
            for a in soup.find_all("a", href=True)
            if "download" in a.get("href", "").lower() or ".xlsx" in a.get("href", "") or ".csv" in a.get("href", "")
        ]
        return {"status": "ok", "data": links, "fetched_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return {"status": "error", "reason": str(e)}
```

## RAM Profiling

```bash
# Phase 1 — Discovery (one-time):
/usr/bin/time -v python adb_kidb_discovery.py 2>&1 | grep "Maximum resident"
# Expected: 400-500MB (Playwright + Chromium SPA rendering)

# Phase 2 — Ongoing direct API (after discovery):
/usr/bin/time -v python adb_kidb_scraper.py 2>&1 | grep "Maximum resident"
# Expected: 25-40MB (Python + requests + JSON parse)
```

## Known Limits

- Phase 1 must be re-run if ADB KIDB changes its internal API structure (SPA version updates).
- `networkidle` timeout may be insufficient for complex SPAs — increase to 60s if needed.
- ADB KIDB uses Azure CDN — not Akamai/Cloudflare — so direct API calls after discovery are not bot-blocked.
- `CORS: *` header observed in recon — internal API likely allows cross-origin, so session/auth cookies should not be required.
- Phase 1 discovery result should be documented in `docs/mainserver-sources/adb-kidb/recon.md` as a follow-up entry once endpoints are found.
- Data freshness: "last updated 27 April 2026" per recon — monthly or quarterly update cycle.

## Sources Used

- [Playwright Network Interception docs](https://playwright.dev/python/docs/network)
- ADB KIDB recon doc: `docs/mainserver-sources/adb-kidb/recon.md`
- [Playwright Chromium RAM benchmark](https://datawookie.dev/blog/2025-06-06-playwright-browser-footprint/)
