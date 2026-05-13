#!/usr/bin/env python3
"""
investing_calendar_fetch.py — Cloudflare Turnstile bypass via FlareSolverr

Technique: flaresolverr-bypass
RAM: ~10MB helper process (FlareSolverr container holds the Chromium process ~96MB)
Called by: investing-economic-calendar.ts (Node spawns this as subprocess)
Helper: flaresolverr_helper.py

2026-05-13 history:
  - curl_cffi chrome124/136 → CF Turnstile v2 JS challenge (403 on warmup) — BLOCKED
  - FlareSolverr v3.4.6 provisioned by ops → smoke test PASSED (1.53MB HTML, 5s)
  - This file now uses FlareSolverrHelper for the GET warmup step
  - cf_clearance cookie cached in-process; subsequent requests try curl_cffi fast path
  - POST to calendar API still done via curl_cffi (lightweight) using captured cookies

Flow per invocation:
  1. Check cf_clearance cache → if valid, try curl_cffi direct GET (fast path)
  2. If cache miss or 403 → call FlareSolverr to solve CF challenge + get cf_clearance
  3. Cache cf_clearance (TTL 25min)
  4. POST to calendar API endpoint using curl_cffi with full cookie jar
  5. Parse HTML fragment → EconomicCalendarEvent list

Usage:
    python3 investing_calendar_fetch.py --country 35
    python3 investing_calendar_fetch.py         # defaults to country 35 (Vietnam)

Output (stdout JSON):
    {"status": "ok", "data": [...events...], "fetched_at": "<ISO>"}
    {"status": "error", "reason": "..."}
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone

# ── Dependency guards ──────────────────────────────────────────────────────────

try:
    from flaresolverr_helper import fetch_with_fast_path, FlareSolverrError
except ImportError:
    # Fallback: resolve module from same directory
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    try:
        from flaresolverr_helper import fetch_with_fast_path, FlareSolverrError
    except ImportError:
        print(json.dumps({
            "status": "error",
            "reason": "flaresolverr_helper not found — expected in same directory"
        }))
        sys.exit(1)

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    print(json.dumps({
        "status": "error",
        "reason": "curl_cffi not installed — run: pip install curl_cffi"
    }))
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    print(json.dumps({
        "status": "error",
        "reason": "beautifulsoup4 not installed — run: pip install beautifulsoup4 lxml"
    }))
    sys.exit(1)

logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

BASE_URL = "https://www.investing.com"
CALENDAR_PAGE_URL = f"{BASE_URL}/economic-calendar/"
CALENDAR_API_URL = f"{BASE_URL}/economic-calendar/Service/getCalendarFilteredData"

POST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": CALENDAR_PAGE_URL,
    "Origin": BASE_URL,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}

# ── HTML parsing ───────────────────────────────────────────────────────────────

def parse_impact(row) -> str:
    """Parse event impact level from bull-icon CSS class on the row."""
    if row.select_one("span.grayFullBullishIcon"):
        return "low"
    if row.select_one("span.orangeFullBullishIcon"):
        return "medium"
    if row.select_one("span.redFullBullishIcon"):
        return "high"
    return "unknown"


def parse_calendar_html(html: str) -> list[dict]:
    """
    Parse investing.com economic calendar HTML table fragment.
    Returns list of EconomicCalendarEvent-shaped dicts.
    """
    soup = BeautifulSoup(html, "lxml")
    events = []
    for row in soup.select("tr.js-event-item"):
        time_el     = row.select_one("td.left.time")
        country_el  = row.select_one("td.country span")
        event_el    = row.select_one("td.event a")
        actual_el   = row.select_one("td.actual")
        forecast_el = row.select_one("td.forecast")
        previous_el = row.select_one("td.previous")

        events.append({
            "time":     time_el.text.strip()                    if time_el    else "",
            "country":  country_el.get("title", "")            if country_el else "",
            "event":    event_el.text.strip()                   if event_el   else "",
            "actual":   actual_el.text.strip()                  if actual_el  else "",
            "forecast": forecast_el.text.strip()                if forecast_el else "",
            "previous": previous_el.text.strip()                if previous_el else "",
            "impact":   parse_impact(row),
        })
    return events


# ── Main fetch logic ───────────────────────────────────────────────────────────

def fetch_calendar(country_id: str) -> dict:
    """
    Fetch investing.com economic calendar for a given country.

    Step 1: Warm up CF session via FlareSolverr (or fast-path if cf_clearance cached).
    Step 2: POST to calendar API endpoint with CF session cookies via curl_cffi.
    Step 3: Parse HTML table fragment.

    Returns:
        {"status": "ok", "data": [...], "fetched_at": "<ISO>"}
        {"status": "error", "reason": "..."}
    """
    # Step 1 — acquire CF session (FlareSolverr or fast-path)
    try:
        _warmup_html, cookies = fetch_with_fast_path(
            CALENDAR_PAGE_URL,
            impersonate="chrome136",
        )
    except FlareSolverrError as exc:
        return {"status": "error", "reason": f"FlareSolverr solve failed: {exc}"}
    except Exception as exc:
        return {"status": "error", "reason": f"Warmup exception: {exc}"}

    if not cookies.get("cf_clearance"):
        return {
            "status": "error",
            "reason": "No cf_clearance cookie in FlareSolverr solution — challenge not solved"
        }

    # Step 2 — POST to calendar API with captured CF cookies
    post_data: dict[str, str] = {
        "timeZone":      "55",           # UTC+7 (Vietnam)
        "timeFilter":    "timeRemain",   # events from now onwards
        "currentTab":    "thisWeek",
        "submitFilters": "1",
        "limit_from":    "0",
    }
    if country_id:
        post_data["country[]"] = country_id

    try:
        session = cffi_requests.Session(impersonate="chrome136")
        # Inject the full cookie jar from FlareSolverr solution
        for name, value in cookies.items():
            session.cookies.set(name, value)

        # Brief pause to avoid rate-limiting on rapid warmup → API call
        time.sleep(1.0)

        api_resp = session.post(
            CALENDAR_API_URL,
            headers=POST_HEADERS,
            data=post_data,
            timeout=15,
        )
        if api_resp.status_code != 200:
            return {
                "status": "error",
                "reason": f"Calendar POST failed: HTTP {api_resp.status_code}"
            }
    except Exception as exc:
        return {"status": "error", "reason": f"Calendar POST exception: {exc}"}

    # Step 3 — parse
    try:
        events = parse_calendar_html(api_resp.text)
    except Exception as exc:
        return {"status": "error", "reason": f"HTML parse error: {exc}"}

    return {
        "status":     "ok",
        "data":       events,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Investing.com calendar — FlareSolverr bypass")
    parser.add_argument("--country", default="35", help="Country ID (default: 35 = Vietnam)")
    args = parser.parse_args()

    result = fetch_calendar(args.country)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
