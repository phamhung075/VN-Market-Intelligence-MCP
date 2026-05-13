#!/usr/bin/env python3
"""
trading_economics_fetch.py — TradingEconomics VN indicator scraper

Technique: curl_cffi Chrome impersonation + Sec-Fetch headers (~15MB RAM)
RAM: ~15MB (curl_cffi + Python interpreter; lxml only if installed)
Called by: trading-economics-vn.ts (spawns this as subprocess)

Replaces Bun native fetch which timed out at 8s (7 sequential fetches × 2-3.5s = ~17-24s).
Fetches all 7 VN indicators in parallel via ThreadPoolExecutor.

Session warmup: TradingEconomics issues ASP.NET_SessionId on first request;
shared session across all parallel requests ensures cookie propagation.

Usage:
    python3 trading_economics_fetch.py
    python3 trading_economics_fetch.py --slugs gdp inflation-cpi interest-rate

Output (stdout):
    {"status": "ok", "data": {"gdp": {...}, ...}, "fetched_at": "..."}
    {"status": "error", "reason": "..."}
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    print(json.dumps({
        "status": "error",
        "reason": "curl_cffi not installed — run: pip install curl_cffi"
    }))
    sys.exit(1)

BASE_URL = "https://tradingeconomics.com/vietnam"

VN_SLUGS: dict[str, str] = {
    "gdp":                   "gdp",
    "inflation_cpi":         "inflation-cpi",
    "balance_trade":         "balance-of-trade",
    "interest_rate":         "interest-rate",
    "unemployment":          "unemployment-rate",
    "fdi":                   "foreign-direct-investment",
    "industrial_production": "industrial-production",
}

BROWSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Referer": "https://www.google.com/",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
}


def extract_json_ld(html: str) -> dict | None:
    """Extract schema.org Dataset block from HTML. Returns first Dataset found.

    Handles three structures:
      - Top-level list:  [{@type: Dataset, ...}, ...]
      - Top-level obj:   {@type: Dataset, ...}
      - @graph wrapper:  {@graph: [{@type: Dataset, ...}, ...]}  (used by TE)
    """
    pattern = re.compile(
        r'<script[^>]+type="application/ld\+json"[^>]*>([\s\S]*?)</script>',
        re.IGNORECASE,
    )
    for match in pattern.finditer(html):
        try:
            parsed = json.loads(match.group(1))
            # Unwrap @graph containers
            if isinstance(parsed, dict) and "@graph" in parsed:
                candidates = parsed["@graph"]
            elif isinstance(parsed, list):
                candidates = parsed
            else:
                candidates = [parsed]
            for item in candidates:
                if isinstance(item, dict) and item.get("@type") == "Dataset":
                    return item
        except (json.JSONDecodeError, AttributeError):
            pass
    return None


def extract_og_description(html: str) -> str:
    """Extract og:description or meta description from HTML."""
    og = re.search(
        r'<meta[^>]+property="og:description"[^>]+content="([^"]+)"', html, re.IGNORECASE
    )
    if og:
        return og.group(1)
    meta = re.search(
        r'<meta[^>]+name="description"[^>]+content="([^"]+)"', html, re.IGNORECASE
    )
    return meta.group(1) if meta else ""


def fetch_indicator(session: cffi_requests.Session, name: str, slug: str) -> tuple[str, dict | None]:
    """Fetch one TE indicator page and extract JSON-LD dataset."""
    url = f"{BASE_URL}/{slug}"
    try:
        resp = session.get(url, headers=BROWSE_HEADERS, timeout=15, allow_redirects=True)
        if resp.status_code != 200:
            return name, None
        html = resp.text
        json_ld = extract_json_ld(html)
        if not json_ld:
            return name, None
        return name, {
            "name": json_ld.get("name", slug),
            "latestValue": extract_og_description(html),
            "temporalCoverage": json_ld.get("temporalCoverage", ""),
            "dateModified": json_ld.get("dateModified", ""),
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception:
        return name, None


def fetch_all(slugs: dict[str, str]) -> dict:
    """Fetch all indicators in parallel. Returns envelope dict."""
    session = cffi_requests.Session(impersonate="chrome136")
    data: dict[str, dict | None] = {}

    with ThreadPoolExecutor(max_workers=min(len(slugs), 5)) as pool:
        futures = {
            pool.submit(fetch_indicator, session, name, slug): name
            for name, slug in slugs.items()
        }
        for future in as_completed(futures):
            name, result = future.result()
            data[name] = result

    return {
        "status": "ok",
        "data": data,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="TradingEconomics VN indicator scraper")
    parser.add_argument(
        "--slugs", nargs="*", default=None,
        help="Indicator slugs to fetch (e.g. gdp inflation-cpi). Default: all 7 VN slugs"
    )
    args = parser.parse_args()

    if args.slugs:
        # Build a sub-dict from provided slugs
        slugs = {s.replace("-", "_"): s for s in args.slugs}
    else:
        slugs = VN_SLUGS

    result = fetch_all(slugs)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
