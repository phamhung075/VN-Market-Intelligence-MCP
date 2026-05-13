# Technique — open-api-key

**Problem:** API endpoint is open and well-structured but requires a registered free API key passed as a query parameter or header. No bot protection on the API subdomain. Web pages may be blocked (e.g., by Akamai) but the API path is unprotected.
**Anti-bot type:** login_required (API key only — no bot challenge)
**Date documented:** 2026-05-13
**RAM cost:** ~5MB per scraper process (requests library, no browser)

## Solution Approach

Register for a free API key (e.g., FRED: instant approval at https://fred.stlouisfed.org/docs/api/api_key.html). Store the key in `.env` as an environment variable. Pass the key as a query parameter on every request. Use `requests` or `httpx` for the HTTP call — no bot bypass needed. Validate key on startup and fail loudly if missing.

This technique applies to: FRED (St. Louis Fed), any open REST API requiring only an API key (World Bank, IMF WEO alternative, etc.).

## Libraries Required

- `requests` >= 2.31.0 (install: `pip install requests`)
- `python-dotenv` >= 1.0.0 (install: `pip install python-dotenv`)

## Code Snippet

```python
import os
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
FRED_API_KEY = os.environ.get("FRED_API_KEY")

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

SERIES_MAP = {
    "fed_funds_rate": "FEDFUNDS",
    "us_cpi": "CPIAUCSL",
    "vix": "VIXCLS",
    "us_10y_yield": "GS10",
    "yield_spread_10y2y": "T10Y2Y",
    "usd_broad_index": "DTWEXBGS",
    "us_unemployment": "UNRATE",
    "us_10y_breakeven_inflation": "T10YIE",
}

def fetch_fred_series(series_id: str, limit: int = 10) -> dict:
    if not FRED_API_KEY:
        return {"status": "error", "reason": "FRED_API_KEY not set in environment"}
    params = {
        "series_id": series_id,
        "limit": limit,
        "sort_order": "desc",
        "file_type": "json",
        "api_key": FRED_API_KEY,
    }
    try:
        resp = requests.get(FRED_BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        observations = data.get("observations", [])
        return {
            "status": "ok",
            "series_id": series_id,
            "data": [
                {"date": o["date"], "value": o["value"]}
                for o in observations
                if o["value"] != "."
            ],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except requests.RequestException as e:
        return {"status": "error", "reason": str(e)}

def fetch_all_macro() -> dict:
    """Fetch all tracked FRED series in one pass."""
    results = {}
    for name, series_id in SERIES_MAP.items():
        results[name] = fetch_fred_series(series_id)
    return {
        "status": "ok",
        "data": results,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

if __name__ == "__main__":
    import json
    print(json.dumps(fetch_fred_series("FEDFUNDS", limit=3), indent=2))
```

## RAM Profiling

```bash
/usr/bin/time -v python fred_macro_scraper.py 2>&1 | grep "Maximum resident"
# Expected: 25-40MB total (Python + requests + JSON parse)
# Net scraper overhead: ~5MB
```

## Known Limits

- FRED API key must be provisioned before scraper can run — action needed: add FRED_API_KEY to `.env`.
- Rate limit: 120 requests per 60 seconds per API key (generous — well within budget for 8 series).
- FRED data is US/global macro only — no VN-specific data.
- Data update frequency: daily for most series; weekly/monthly for some (FEDFUNDS = monthly).
- "." value in observations means data not yet published — filter out.
- Do NOT scrape fred.stlouisfed.org web pages — Akamai TLS block (irrelevant since API is the path).

## Sources Used

- [FRED API documentation](https://fred.stlouisfed.org/docs/api/fred/)
- FRED recon doc: `docs/mainserver-sources/fred-macro/recon.md`
- [Bright Data curl_cffi guide](https://brightdata.com/blog/web-data/web-scraping-with-curl-cffi)
