#!/usr/bin/env python3
"""
investing_calendar_fetch.py — Cloudflare-managed bypass helper

Technique: cloudflare-managed-bypass (curl_cffi, chrome124 impersonation)
RAM: ~25MB (curl_cffi + lxml + Python interpreter)
Called by: investing-economic-calendar.ts (Node spawns this as subprocess)

Usage:
    python3 investing_calendar_fetch.py --country 35
    python3 investing_calendar_fetch.py  # all countries

Output: JSON on stdout:
    {"status": "ok", "data": [...events...], "fetched_at": "..."}
    {"status": "error", "reason": "..."}
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone

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

BASE_URL = "https://www.investing.com"
CALENDAR_URL = f"{BASE_URL}/economic-calendar/Service/getCalendarFilteredData"

WARMUP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

POST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"{BASE_URL}/economic-calendar/",
    "Origin": BASE_URL,
}


def parse_impact(row) -> str:
    """Parse impact level from bull-icon CSS classes."""
    if row.select_one("span.grayFullBullishIcon"):
        return "low"
    if row.select_one("span.orangeFullBullishIcon"):
        return "medium"
    if row.select_one("span.redFullBullishIcon"):
        return "high"
    return "unknown"


def fetch_calendar(country_id: str) -> dict:
    """
    Two-step Cloudflare bypass:
    1. GET page to warm up __cf_bm + __cflb cookies (TLS impersonation via curl_cffi)
    2. POST to calendar API with captured CF session cookies
    """
    session = cffi_requests.Session(impersonate="chrome124")

    # Step 1: warmup — get CF cookies
    try:
        warm_resp = session.get(
            f"{BASE_URL}/economic-calendar/",
            headers=WARMUP_HEADERS,
            timeout=15,
            allow_redirects=True,
        )
        if warm_resp.status_code not in (200, 308, 301, 302):
            return {
                "status": "error",
                "reason": f"CF warmup failed: HTTP {warm_resp.status_code}"
            }
        time.sleep(1.5)  # brief pause after CF warmup
    except Exception as exc:
        return {"status": "error", "reason": f"CF warmup exception: {exc}"}

    # Step 2: POST to calendar API
    post_data = {
        "timeZone": "55",           # UTC+7 (Vietnam)
        "timeFilter": "timeRemain", # events from now
        "currentTab": "thisWeek",
        "submitFilters": "1",
        "limit_from": "0",
    }
    if country_id:
        post_data["country[]"] = country_id

    try:
        resp = session.post(
            CALENDAR_URL,
            headers=POST_HEADERS,
            data=post_data,
            timeout=15,
        )
        if resp.status_code != 200:
            return {
                "status": "error",
                "reason": f"Calendar POST failed: HTTP {resp.status_code}"
            }
    except Exception as exc:
        return {"status": "error", "reason": f"Calendar POST exception: {exc}"}

    # Step 3: parse HTML table fragment
    soup = BeautifulSoup(resp.text, "lxml")
    events = []
    for row in soup.select("tr.js-event-item"):
        time_el = row.select_one("td.left.time")
        country_el = row.select_one("td.country span")
        event_el = row.select_one("td.event a")
        actual_el = row.select_one("td.actual")
        forecast_el = row.select_one("td.forecast")
        previous_el = row.select_one("td.previous")

        events.append({
            "time": time_el.text.strip() if time_el else "",
            "country": country_el.get("title", "") if country_el else "",
            "event": event_el.text.strip() if event_el else "",
            "actual": actual_el.text.strip() if actual_el else "",
            "forecast": forecast_el.text.strip() if forecast_el else "",
            "previous": previous_el.text.strip() if previous_el else "",
            "impact": parse_impact(row),
        })

    return {
        "status": "ok",
        "data": events,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    parser = argparse.ArgumentParser(description="Investing.com calendar scraper")
    parser.add_argument("--country", default="35", help="Country ID (35=Vietnam)")
    args = parser.parse_args()

    result = fetch_calendar(args.country)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
