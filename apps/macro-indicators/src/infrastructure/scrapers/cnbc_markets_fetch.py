#!/usr/bin/env python3
"""
cnbc_markets_fetch.py — CNBC quote API fetch helper

Technique: curl_cffi Chrome impersonation (~15MB RAM)
RAM: ~15MB (curl_cffi + Python interpreter)
Called by: cnbc-world-markets.ts (spawns this as subprocess)

Replaces Bun native fetch which accumulated >8s over 6 sequential fetches.
Also fixes symbol mapping: the CNBC API returns data for dot-prefixed symbols
(.SPX, .DJI, .IXIC, .N225, .HSI, .FTSE) — not the legacy SP500/DJ30/NASDAQ ones.
Both the old symbols (code=1, no data) and new dotted symbols (code=0, with data)
are tried; dotted symbols are preferred.

Usage:
    python3 cnbc_markets_fetch.py --symbols .SPX .DJI .IXIC .N225
    python3 cnbc_markets_fetch.py  # uses DEFAULT_SYMBOLS (dotted)

Output (stdout):
    {"status": "ok", "data": {".SPX": {...}, ...}, "fetched_at": "..."}
    {"status": "error", "reason": "..."}
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import urlencode

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    print(json.dumps({
        "status": "error",
        "reason": "curl_cffi not installed — run: pip install curl_cffi"
    }))
    sys.exit(1)

QUOTE_BASE = (
    "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol"
)

# Dotted symbols return code=0 with actual price data.
# Legacy symbols (SP500/DJ30/NASDAQ/NIKKEI225/FTSE100/HK.HSI) return code=1
# with no price data — they are intentionally excluded here.
DEFAULT_SYMBOLS: list[str] = [
    ".SPX",    # S&P 500
    ".DJI",    # Dow Jones Industrial Average
    ".IXIC",   # NASDAQ Composite
    ".N225",   # Nikkei 225
    ".HSI",    # Hang Seng Index
    ".FTSE",   # FTSE 100
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.cnbc.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
}


def build_url(symbol: str) -> str:
    params = urlencode({
        "symbols": symbol,
        "requestMethod": "itv",
        "noform": "1",
        "partnerId": "2",
        "fund": "1",
        "exthrs": "1",
        "output": "json",
        "events": "1",
    })
    return f"{QUOTE_BASE}?{params}"


def fetch_quote(session: cffi_requests.Session, symbol: str) -> tuple[str, dict | None]:
    """Fetch a single CNBC quote. Returns (symbol, quote|None)."""
    url = build_url(symbol)
    try:
        resp = session.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            return symbol, None
        raw = resp.json()
        quote = (
            raw.get("FormattedQuoteResult", {})
               .get("FormattedQuote", [{}])[0]
        )
        last = quote.get("last")
        if not last:
            return symbol, None
        return symbol, {
            "symbol": quote.get("symbol", symbol),
            "last": last,
            "change": quote.get("change", ""),
            "changePct": quote.get("change_pct", ""),
            "open": quote.get("open", ""),
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception:
        return symbol, None


def fetch_all(symbols: list[str]) -> dict:
    """Fetch all symbols in parallel. Returns envelope dict."""
    session = cffi_requests.Session(impersonate="chrome136")
    data: dict[str, dict | None] = {}

    with ThreadPoolExecutor(max_workers=min(len(symbols), 6)) as pool:
        futures = {pool.submit(fetch_quote, session, sym): sym for sym in symbols}
        for future in as_completed(futures):
            sym, quote = future.result()
            data[sym] = quote

    return {
        "status": "ok",
        "data": data,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="CNBC quote API batch fetcher")
    parser.add_argument(
        "--symbols", nargs="*", default=DEFAULT_SYMBOLS,
        help="Space-separated CNBC symbols. Use dotted form (.SPX, .DJI, etc.)"
    )
    args = parser.parse_args()

    result = fetch_all(args.symbols)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
