#!/usr/bin/env python3
"""
vietstock-agm-plan.py — Vietstock AGM business plan scraper.

Fetches planned targets (revenue, pre-tax profit, after-tax profit) and
quarterly implementation status (actuals vs plan) for one or more tickers
from finance.vietstock.vn.

Technique: ASP.NET CSRF double-submit cookie warmup (no Chromium needed).
  Step 1: GET ke-hoach-kinh-doanh.htm → warm ASP.NET_SessionId cookie,
          parse __RequestVerificationToken from hidden input.
  Step 2: POST GetData_PlannedTarget (same session) → plan figures.
  Step 3: POST GetData_PlannedTarget_ImplementStatus (same session) → actuals.

See: docs/vps-sources/vietstock-agm-plan/recon.md
Sprint: RAPID-DATA-LAYER / FIX-G / 2026-06-04

Usage:
  # Single ticker (used by router for on-demand pull):
  python3 vietstock-agm-plan.py --ticker FPT

  # Batch sweep of all watchlist tickers:
  python3 vietstock-agm-plan.py --batch VNM,FPT,VCB,HPG,BID,...

Output (JSON to stdout):
  {
    "status": "ok",
    "tickers_ok": ["FPT", "VCB", ...],
    "tickers_fallback": [],          # API returned no data — PDF path needed (logged)
    "tickers_error": [],
    "data": {
      "FPT": {
        "planned": [
          {"stock_code": "FPT", "ptid": 7, "pt_name": "Doanh thu kế hoạch",
           "year": 2026, "value_raw": 58580000000000.0, "value_ty": 58580.0}
        ],
        "actuals": [
          {"stock_code": "FPT", "year": 2026, "report_term_id": 1,
           "report_norm_id": 2206, "ptid": 7,
           "value_raw": 331874704000000.0, "value_ty": 331874.704}
        ]
      }
    },
    "fetched_at": "2026-06-04T08:10:00Z"
  }

On error:
  { "status": "error", "reason": "...", "fetched_at": "..." }
"""

import sys
import json
import re
import time
import argparse
import http.cookiejar
import ssl
import gzip
import io
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL = "https://finance.vietstock.vn"
PLAN_ENDPOINT = f"{BASE_URL}/Data/GetData_PlannedTarget"
ACTUALS_ENDPOINT = f"{BASE_URL}/Data/GetData_PlannedTarget_ImplementStatus"
WARMUP_URL_TEMPLATE = f"{BASE_URL}/{{ticker}}/ke-hoach-kinh-doanh.htm"

# Request headers — mimic a real Chrome browser from Vietnam
REQUEST_HEADERS_HTML = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    # NOTE: omit Accept-Encoding so urllib does not receive gzip (urllib's HTTPHandler
    # does not auto-decompress; receiving gzip then decoding as utf-8 produces garbage).
    "Connection": "keep-alive",
}

REQUEST_HEADERS_JSON = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "vi-VN,vi;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Connection": "keep-alive",
}

TIMEOUT = 30  # seconds per request
INTER_TICKER_DELAY = 0.35  # seconds between tickers (gentle pacing)


# ── SSL context — CERT_NONE (finance.vietstock.vn has valid cert but some
# intermediate chains on VPS can fail; match recon-doc Python idiom) ─────────

def _make_ssl_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


# ── Session: one CookieJar opener per invocation ──────────────────────────────

def _make_opener():
    """Build a urllib opener with a shared CookieJar (session-level)."""
    jar = http.cookiejar.CookieJar()
    ctx = _make_ssl_ctx()
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx),
        urllib.request.HTTPCookieProcessor(jar),
    )
    return opener, jar


def _build_request(url, headers, data=None):
    """Construct a urllib.request.Request with the given headers and optional POST body."""
    req = urllib.request.Request(url, data=data)
    for k, v in headers.items():
        req.add_header(k, v)
    return req


# ── CSRF token extraction ─────────────────────────────────────────────────────

def _extract_csrf_token(html: str) -> str | None:
    """
    Parse __RequestVerificationToken value from the page HTML.

    Vietstock serves minified HTML — attribute values are UNQUOTED, e.g.:
      <form ... id=__CHART_AjaxAntiForgeryForm ...>
        <input name=__RequestVerificationToken type=hidden value=ywpZWf...>
      </form>

    Order of precedence:
      1. name=__RequestVerificationToken followed by value= (covers minified HTML, name-before-value order)
      2. value= followed by name=__RequestVerificationToken (quoted attributes, value-before-name order)
      3. data-vtoken attribute (some page variants)
      4. form block scan
      5. Proximity search around any occurrence of __RequestVerificationToken
    """
    TOK = r'[A-Za-z0-9_\-]{20,}'

    # Pattern 1 — name= THEN value= (minified HTML, Vietstock current format)
    # Handles both quoted and unquoted value=
    m = re.search(
        r'name=(?:["\'])?__RequestVerificationToken(?:["\'])?[^>]*?'
        r'value=(?:["\'])?(' + TOK + r')(?:["\'\s>])',
        html,
        re.IGNORECASE,
    )
    if m:
        return m.group(1)

    # Pattern 2 — value= THEN name= (reversed attribute order, quoted)
    m = re.search(
        r'value=["\'](' + TOK + r')["\'][^>]*name=["\']__RequestVerificationToken["\']',
        html,
        re.IGNORECASE,
    )
    if m:
        return m.group(1)

    # Pattern 3 — data-vtoken attribute
    m = re.search(r'data-vtoken=["\']?(' + TOK + r')["\'\s]', html)
    if m:
        return m.group(1)

    # Pattern 4 — form block containing __CHART_AjaxAntiForgeryForm → find any value=
    form_m = re.search(
        r'id=(?:["\'])?__CHART_AjaxAntiForgeryForm(?:["\'])?[^>]*>.*?</form>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if form_m:
        form_html = form_m.group(0)
        vm = re.search(r'value=(?:["\'])?(' + TOK + r')(?:["\'\s>])', form_html, re.IGNORECASE)
        if vm:
            return vm.group(1)

    # Pattern 5 — proximity: find value= near any occurrence of __RequestVerificationToken
    idx = html.find('__RequestVerificationToken')
    if idx >= 0:
        chunk = html[max(0, idx - 200): idx + 500]
        vm = re.search(r'value=(?:["\'])?(' + TOK + r')(?:["\'\s>])', chunk, re.IGNORECASE)
        if vm:
            return vm.group(1)

    return None


# ── Per-ticker fetch ─────────────────────────────────────────────────────────

def fetch_ticker(opener, ticker: str) -> dict:
    """
    Fetch planned targets + implementation actuals for a single ticker.

    Returns:
      {
        "planned": [...],   # list of plan rows
        "actuals": [...],   # list of actual rows
        "error": None | str
      }
    """
    warmup_url = WARMUP_URL_TEMPLATE.format(ticker=ticker)
    referer = warmup_url

    # ── Step 1: Warm session, get CSRF token ──────────────────────────────────
    try:
        req1 = _build_request(warmup_url, {
            **REQUEST_HEADERS_HTML,
            "Referer": f"{BASE_URL}/",
        })
        resp1 = opener.open(req1, timeout=TIMEOUT)
        raw1 = resp1.read()
        # Decompress if server sent gzip despite us not requesting it
        content_enc = resp1.headers.get("Content-Encoding", "")
        if content_enc == "gzip" or (raw1[:2] == b'\x1f\x8b'):
            try:
                raw1 = gzip.decompress(raw1)
            except Exception:
                pass
        # Decode — vietstock sends utf-8
        try:
            body1 = raw1.decode("utf-8", errors="replace")
        except Exception:
            body1 = raw1.decode("latin-1", errors="replace")
    except Exception as exc:
        return {"planned": [], "actuals": [], "error": f"warmup GET failed: {exc}"}

    csrf_token = _extract_csrf_token(body1)
    if not csrf_token:
        # Fallback: sometimes the token is in a meta tag
        m = re.search(
            r'<meta[^>]+name=["\']__RequestVerificationToken["\'][^>]+content=["\']([A-Za-z0-9_\-]{20,})["\']',
            body1,
            re.IGNORECASE,
        )
        if m:
            csrf_token = m.group(1)

    if not csrf_token:
        return {
            "planned": [],
            "actuals": [],
            "error": "CSRF token not found in ke-hoach page — page structure may have changed",
        }

    post_headers = {
        **REQUEST_HEADERS_JSON,
        "Referer": referer,
    }

    # ── Step 2: Fetch planned targets ─────────────────────────────────────────
    plan_data = urllib.parse.urlencode({
        "stockCode": ticker,
        "__RequestVerificationToken": csrf_token,
    }).encode("utf-8")

    def _read_response(resp):
        """Read response and handle potential gzip encoding."""
        raw = resp.read()
        content_enc = resp.headers.get("Content-Encoding", "")
        if content_enc == "gzip" or (raw[:2] == b'\x1f\x8b'):
            try:
                raw = gzip.decompress(raw)
            except Exception:
                pass
        return raw.decode("utf-8", errors="replace")

    planned_rows = []
    try:
        req2 = _build_request(PLAN_ENDPOINT, post_headers, data=plan_data)
        resp2 = opener.open(req2, timeout=TIMEOUT)
        body2 = _read_response(resp2)
        parsed2 = json.loads(body2)
        raw_plan = (parsed2.get("data") or {}).get("Data_Results") or []
        for row in raw_plan:
            val_raw = row.get("Value") or 0.0
            planned_rows.append({
                "stock_code": row.get("StockCode", ticker),
                "ptid": row.get("PTID"),
                "pt_name": row.get("PTName", ""),
                "year": row.get("YearPeriod"),
                "value_raw": val_raw,
                "value_ty": round(val_raw / 1e9, 3) if val_raw else 0.0,
            })
    except Exception as exc:
        return {"planned": [], "actuals": [], "error": f"plan POST failed: {exc}"}

    # ── Step 3: Fetch implementation actuals ──────────────────────────────────
    # Same session/cookie, same CSRF token
    actuals_rows = []
    try:
        req3 = _build_request(ACTUALS_ENDPOINT, post_headers, data=plan_data)
        resp3 = opener.open(req3, timeout=TIMEOUT)
        body3 = _read_response(resp3)
        parsed3 = json.loads(body3)
        raw_actuals = (parsed3.get("data") or {}).get("Data_Results") or []
        for row in raw_actuals:
            val_raw = row.get("Value") or 0.0
            actuals_rows.append({
                "stock_code": row.get("StockCode", ticker),
                "year": row.get("YearPeriod"),
                "report_term_id": row.get("ReportTermID"),
                "report_norm_id": row.get("ReportNormID"),
                "ptid": row.get("PTID"),
                "value_raw": val_raw,
                "value_ty": round(val_raw / 1e9, 3) if val_raw else 0.0,
            })
    except Exception as exc:
        # Actuals failure is non-fatal — return plan only with a warning
        return {
            "planned": planned_rows,
            "actuals": [],
            "error": f"actuals POST failed (plan ok): {exc}",
        }

    return {"planned": planned_rows, "actuals": actuals_rows, "error": None}


# ── Main entry ────────────────────────────────────────────────────────────────

def run(tickers: list[str]) -> dict:
    """
    Sweep a list of tickers. Warms session once, replays across all.
    Returns the full result payload.
    """
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if not tickers:
        return {"status": "error", "reason": "No tickers provided", "fetched_at": fetched_at}

    opener, _jar = _make_opener()

    data = {}
    tickers_ok = []
    tickers_fallback = []  # API returned 0 plan rows — may need PDF fallback
    tickers_error = []

    for i, ticker in enumerate(tickers):
        if i > 0:
            time.sleep(INTER_TICKER_DELAY)

        result = fetch_ticker(opener, ticker)

        if result["error"] and not result["planned"]:
            tickers_error.append(ticker)
        elif not result["planned"]:
            # API returned empty data — likely ticker not in Vietstock structured DB
            tickers_fallback.append(ticker)
        else:
            if result["error"]:
                # Partial — plan ok, actuals failed
                tickers_fallback.append(ticker)
            else:
                tickers_ok.append(ticker)

        data[ticker] = {
            "planned": result["planned"],
            "actuals": result["actuals"],
        }
        if result["error"]:
            data[ticker]["_warning"] = result["error"]

    return {
        "status": "ok",
        "tickers_ok": tickers_ok,
        "tickers_fallback": tickers_fallback,
        "tickers_error": tickers_error,
        "data": data,
        "fetched_at": fetched_at,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Fetch AGM business plan + actuals from finance.vietstock.vn"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--ticker", help="Single ticker (uppercase, e.g. FPT)")
    group.add_argument(
        "--batch",
        help="Comma-separated list of tickers for batch sweep (e.g. FPT,VIC,ACB)",
    )
    args = parser.parse_args()

    if args.ticker:
        tickers = [args.ticker.upper().strip()]
    else:
        tickers = [t.strip().upper() for t in args.batch.split(",") if t.strip()]

    result = run(tickers)
    print(json.dumps(result, ensure_ascii=False, indent=None))
    sys.exit(0 if result.get("status") == "ok" else 1)


if __name__ == "__main__":
    main()
