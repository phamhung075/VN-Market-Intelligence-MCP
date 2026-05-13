# Technique — plain-requests-open-api

**Problem:** No anti-bot. Target is an open JSON or XML API with permissive CORS and no challenge gates. Minimal headers sufficient.
**Anti-bot type:** none
**Date documented:** 2026-05-13

## Solution Approach

When an endpoint returns clean 200 with standard security headers (HSTS, X-Frame-Options, X-Content-Type-Options) but no Cloudflare `cf-ray`, no `set-cookie` challenge, and `Access-Control-Allow-Origin: *`, plain `curl` or `requests.get()` with a realistic User-Agent is sufficient. No session warmup, no TLS fingerprint spoofing, no cookie handling. This is the lightest possible technique and should be used by default when recon confirms `anti_bot_type: none`.

## Libraries Required

- `requests >= 2.28` (install: `pip install requests`)
- `python3-xml` (stdlib, for XML parsing)

## Code Snippet

```python
import requests
import json

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
}

def fetch_vps_prices(codes: list[str]) -> dict:
    """Fetch VN stock quotes from VPS.com.vn batch API."""
    url = f"https://bgapidatafeed.vps.com.vn/getliststockdata/{','.join(codes)}"
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return {"status": "ok", "data": resp.json(), "fetched_at": __import__("datetime").datetime.utcnow().isoformat()}

def fetch_cafef_indices() -> dict:
    """Fetch VNINDEX/HNXINDEX from CafeF banggia subdomain."""
    url = "https://banggia.cafef.vn/stockhandler.ashx?index=true"
    h = {**HEADERS, "Referer": "https://cafef.vn/"}
    resp = requests.get(url, headers=h, timeout=15)
    resp.raise_for_status()
    return {"status": "ok", "data": resp.json(), "fetched_at": __import__("datetime").datetime.utcnow().isoformat()}
```

## Deployed Scraper Pattern

The deployed scrapers use `curl` (shell) rather than Python `requests` but the technique is identical — standard UA header + timeout. Key patterns in `fetch-prices.sh`:

- UA: `Mozilla/5.0` (minimal, sufficient since no fingerprint check)
- Connect timeout: 10s, max-time: 20s (60s for large watchlist batches)
- No session, no cookies, no redirect following needed
- jq for JSON transformation before MCP push

For the XML endpoint (Vietcombank FX), inline `python3 -c` with `xml.etree.ElementTree` parses the `ExrateList/Exrate` attributes.

## Known Limits

- Rate limit advisory on VCB XML: "one request every 5 minutes" (comment in response). Current 30-min interval is safe; do not increase frequency.
- VPS.com.vn batch endpoint: no observed rate limit at 60s interval. Increasing to <10s may trigger throttle.
- If endpoint adds Cloudflare or Akamai in future, upgrade to `curl_cffi` or `header-rotation` technique.
- Akamai CDN on VCB (`akamai-grn` header) is non-blocking today; theoretical IP-based rate limit possible at high frequency.
- `Access-Control-Allow-Origin` on VCB is restricted to `vcbdigibank.vietcombank.com.vn` for browser XHR, but server-side requests are unaffected.

## Sources Served

- `vps-prices` (bgapidatafeed.vps.com.vn) — VN stock OHLCV + foreign flow
- `cafef-index` (banggia.cafef.vn) — VNINDEX, HNXINDEX, VN30
- `sbv-rates` (portal.vietcombank.com.vn) — USD/VND and 19 other FX pairs

## References

- [curl_cffi Python library](https://github.com/lexiforest/curl_cffi)
- [VPS.com.vn API recon](docs/vps-sources/vps-prices/recon.md)
- [CafeF index recon](docs/vps-sources/cafef-index/recon.md)
- [SBV rates recon](docs/vps-sources/sbv-rates/recon.md)
