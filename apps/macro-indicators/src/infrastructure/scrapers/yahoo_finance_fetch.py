#!/usr/bin/env python3
"""
yahoo_finance_fetch.py — Yahoo Finance v8 chart API fetch helper

Technique: curl_cffi Chrome impersonation (~15MB RAM)
RAM: ~15MB (curl_cffi + Python interpreter; no heavy parse deps)
Called by: yahoo-finance-fx-indices.ts (spawns this as subprocess)

Replaces Bun native fetch which accumulated >8s over 12 sequential symbols.
curl_cffi runs all symbols in parallel and does not timeout under container egress.

Usage:
    python3 yahoo_finance_fetch.py --symbols EURUSD=X USDVND=X ^GSPC
    python3 yahoo_finance_fetch.py  # uses DEFAULT_SYMBOLS

Output (stdout):
    {"status": "ok", "data": {"EURUSD=X": {...}, ...}, "fetched_at": "..."}
    {"status": "error", "reason": "..."}
"""

import argparse
import json
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

BASE_URL = "https://query2.finance.yahoo.com/v8/finance/chart"

DEFAULT_SYMBOLS = [
    "EURUSD=X", "USDVND=X", "USDJPY=X", "GBPUSD=X",
    "^GSPC", "^DJI", "^IXIC", "^N225", "^HSI", "000001.SS", "^FTSE",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
}


def fetch_symbol(session: cffi_requests.Session, symbol: str) -> tuple[str, dict | None]:
    """Fetch a single symbol from the v8 chart API. Returns (symbol, quote|None)."""
    url = f"{BASE_URL}/{symbol}?interval=1d&range=1d"
    try:
        resp = session.get(url, headers=HEADERS, timeout=12)
        if resp.status_code != 200:
            return symbol, None
        raw = resp.json()
        meta = raw.get("chart", {}).get("result", [{}])[0].get("meta", {})
        price = meta.get("regularMarketPrice")
        if price is None:
            return symbol, None
        return symbol, {
            "symbol": meta.get("symbol", symbol),
            "price": price,
            "currency": meta.get("currency", "USD"),
            "exchangeName": meta.get("exchangeName", ""),
            "dayHigh": meta.get("regularMarketDayHigh"),
            "dayLow": meta.get("regularMarketDayLow"),
            "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow"),
            "lastUpdated": (
                datetime.fromtimestamp(meta["regularMarketTime"], tz=timezone.utc).isoformat()
                if meta.get("regularMarketTime")
                else datetime.now(timezone.utc).isoformat()
            ),
        }
    except Exception as exc:
        return symbol, None


def fetch_all(symbols: list[str]) -> dict:
    """Fetch all symbols in parallel. Returns envelope dict."""
    session = cffi_requests.Session(impersonate="chrome136")
    data: dict[str, dict | None] = {}

    with ThreadPoolExecutor(max_workers=min(len(symbols), 6)) as pool:
        futures = {pool.submit(fetch_symbol, session, sym): sym for sym in symbols}
        for future in as_completed(futures):
            sym, quote = future.result()
            data[sym] = quote

    return {
        "status": "ok",
        "data": data,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Yahoo Finance v8 chart API batch fetcher")
    parser.add_argument("--symbols", nargs="*", default=DEFAULT_SYMBOLS,
                        help="Space-separated list of Yahoo Finance symbols")
    args = parser.parse_args()

    result = fetch_all(args.symbols)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
