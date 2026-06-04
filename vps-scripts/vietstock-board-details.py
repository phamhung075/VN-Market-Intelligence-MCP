#!/usr/bin/env python3
"""
vietstock-board-details.py — Vietstock board-of-management officer details scraper.

Fetches current-term officers (name, position, appointment year) for one or
more tickers from finance.vietstock.vn/data/boarddetails.

Technique: ASP.NET CSRF double-submit cookie warmup (no Chromium needed).
  Step 1: GET /{ticker}/board-of-management.htm → warm ASP.NET_SessionId cookie,
          parse __RequestVerificationToken from hidden input (unquoted-attr pattern).
  Step 2: POST code={ticker}&page=1&__RequestVerificationToken={token}
          to /data/boarddetails → current-term officer groups.

CRITICAL: parameter MUST be `code`, NOT `stockCode`.
  stockCode returns HTTP 200 + empty body (silent failure).

See: docs/vps-sources/officer-start-date/recon.md
Sprint: RAPID-DATA-LAYER / FIX-I-A / 2026-06-04

Usage:
  # Single ticker:
  python3 vietstock-board-details.py --ticker FPT

  # Batch sweep of all watchlist tickers:
  python3 vietstock-board-details.py --batch VNM,FPT,VCB,HPG,BID,...

Output (JSON to stdout):
  {
    "status": "ok",
    "tickers_ok": ["FPT", "VCB"],
    "tickers_error": [],
    "data": {
      "FPT": [
        {
          "name": "Trương Gia Bình",
          "position_text": "CTHĐQT",
          "appointment_year": 1988,
          "closed_date": "2025-12-31T00:00:00",
          "year_of_birth": 1963,
          "independence": 0,
          "total_shares": 12345678
        }
      ]
    },
    "fetched_at": "2026-06-04T10:00:00Z"
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
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL = "https://finance.vietstock.vn"
BOARD_ENDPOINT = f"{BASE_URL}/data/boarddetails"
WARMUP_URL_TEMPLATE = f"{BASE_URL}/{{ticker}}/board-of-management.htm"

# Request headers — mimic a real Chrome browser from Vietnam.
# NOTE: omit Accept-Encoding so urllib does not receive gzip (urllib's HTTPHandler
# does not auto-decompress; receiving gzip then decoding as utf-8 produces garbage).
REQUEST_HEADERS_HTML = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
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

TIMEOUT = 30            # seconds per request
INTER_TICKER_DELAY = 0.35  # seconds between tickers (gentle pacing)

# FromDate values that map to null — covers all observed N/A variants
_NA_PATTERNS = {"n/a", "na", "", "độc lập", "doc lap"}


# ── SSL context ───────────────────────────────────────────────────────────────

def _make_ssl_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


# ── Session: per-ticker opener (fresh CookieJar each ticker) ─────────────────

def _make_opener():
    """Build a urllib opener with a fresh CookieJar."""
    jar = http.cookiejar.CookieJar()
    ctx = _make_ssl_ctx()
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx),
        urllib.request.HTTPCookieProcessor(jar),
    )
    return opener


def _build_request(url, headers, data=None):
    req = urllib.request.Request(url, data=data)
    for k, v in headers.items():
        req.add_header(k, v)
    return req


# ── CSRF token extraction (verbatim from vietstock-agm-plan.py) ───────────────

def _extract_csrf_token(html: str) -> str | None:
    """
    Parse __RequestVerificationToken value from the page HTML.

    Vietstock serves minified HTML — attribute values are UNQUOTED, e.g.:
      <input name=__RequestVerificationToken type=hidden value=ywpZWf...>

    Order of precedence:
      1. name= THEN value= (minified HTML, Vietstock current format)
      2. value= THEN name= (reversed attribute order, quoted)
      3. data-vtoken attribute
      4. form block scan (__CHART_AjaxAntiForgeryForm)
      5. Proximity search around any occurrence of __RequestVerificationToken
    """
    TOK = r'[A-Za-z0-9_\-]{20,}'

    # Pattern 1
    m = re.search(
        r'name=(?:["\'])?__RequestVerificationToken(?:["\'])?[^>]*?'
        r'value=(?:["\'])?(' + TOK + r')(?:["\'\s>])',
        html,
        re.IGNORECASE,
    )
    if m:
        return m.group(1)

    # Pattern 2
    m = re.search(
        r'value=["\'](' + TOK + r')["\'][^>]*name=["\']__RequestVerificationToken["\']',
        html,
        re.IGNORECASE,
    )
    if m:
        return m.group(1)

    # Pattern 3
    m = re.search(r'data-vtoken=["\']?(' + TOK + r')["\'\s]', html)
    if m:
        return m.group(1)

    # Pattern 4
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

    # Pattern 5
    idx = html.find('__RequestVerificationToken')
    if idx >= 0:
        chunk = html[max(0, idx - 200): idx + 500]
        vm = re.search(r'value=(?:["\'])?(' + TOK + r')(?:["\'\s>])', chunk, re.IGNORECASE)
        if vm:
            return vm.group(1)

    return None


# ── FromDate → appointment_year ───────────────────────────────────────────────

def _parse_appointment_year(from_date_raw) -> int | None:
    """
    Convert Vietstock FromDate field to integer year, or null.

    FromDate is a space-padded year string: "2022      ", "1988      ",
    "N/A       ", "Độc lập".
    - Strip whitespace.
    - If result is in _NA_PATTERNS or cannot be parsed as 4-digit int: return None.
    - NEVER fabricate a year.
    """
    if from_date_raw is None:
        return None
    s = str(from_date_raw).strip()
    if s.lower() in _NA_PATTERNS:
        return None
    # Must be a 4-digit integer in plausible range (1900–2100)
    try:
        year = int(s)
        if 1900 <= year <= 2100:
            return year
    except (ValueError, TypeError):
        pass
    return None


# ── Per-ticker fetch ──────────────────────────────────────────────────────────

def fetch_ticker(ticker: str) -> dict:
    """
    Fetch page=1 (current-term) officer groups for a single ticker.

    Per-ticker session warmup: fresh opener each call so cookies don't
    bleed between tickers (recon note — rate limit not detected, but
    isolation is cleaner and mirrors the AGM plan pattern).

    Returns:
      {
        "officers": [...],   # list of parsed officer records
        "error": None | str
      }
    """
    opener = _make_opener()
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
        # Gzip safety-net (defensive: we omit Accept-Encoding but server may still gzip)
        content_enc = resp1.headers.get("Content-Encoding", "")
        if content_enc == "gzip" or (raw1[:2] == b'\x1f\x8b'):
            try:
                raw1 = gzip.decompress(raw1)
            except Exception:
                pass
        try:
            body1 = raw1.decode("utf-8", errors="replace")
        except Exception:
            body1 = raw1.decode("latin-1", errors="replace")
    except Exception as exc:
        return {"officers": [], "error": f"warmup GET failed: {exc}"}

    csrf_token = _extract_csrf_token(body1)
    # Fallback: meta tag
    if not csrf_token:
        m = re.search(
            r'<meta[^>]+name=["\']__RequestVerificationToken["\'][^>]+content=["\']([A-Za-z0-9_\-]{20,})["\']',
            body1,
            re.IGNORECASE,
        )
        if m:
            csrf_token = m.group(1)

    if not csrf_token:
        return {
            "officers": [],
            "error": "CSRF token not found in board-of-management page — page structure may have changed",
        }

    # ── Step 2: POST to /data/boarddetails, page=1 only (current term) ───────
    # CRITICAL: parameter name is `code`, NOT `stockCode`.
    # Using `stockCode` returns HTTP 200 + empty body (silent failure).
    post_data = urllib.parse.urlencode({
        "code": ticker,
        "page": 1,
        "__RequestVerificationToken": csrf_token,
    }).encode("utf-8")

    post_headers = {
        **REQUEST_HEADERS_JSON,
        "Referer": referer,
        "Origin": BASE_URL,
    }

    try:
        req2 = _build_request(BOARD_ENDPOINT, post_headers, data=post_data)
        resp2 = opener.open(req2, timeout=TIMEOUT)
        raw2 = resp2.read()
        content_enc2 = resp2.headers.get("Content-Encoding", "")
        if content_enc2 == "gzip" or (raw2[:2] == b'\x1f\x8b'):
            try:
                raw2 = gzip.decompress(raw2)
            except Exception:
                pass
        body2 = raw2.decode("utf-8", errors="replace")
    except Exception as exc:
        return {"officers": [], "error": f"boarddetails POST failed: {exc}"}

    if not body2 or not body2.strip():
        return {
            "officers": [],
            "error": (
                "boarddetails returned empty body — possible wrong parameter name "
                "or ticker not in Vietstock DB"
            ),
        }

    # ── Parse officer records ─────────────────────────────────────────────────
    try:
        groups = json.loads(body2)
    except Exception as exc:
        return {"officers": [], "error": f"JSON parse failed: {exc} | body[:200]={body2[:200]}"}

    if not isinstance(groups, list):
        return {"officers": [], "error": f"Unexpected response shape (not a list): {type(groups)}"}

    # groups = array of term-period objects, each with a Details[] key.
    # page=1 returns the most recent term group(s) only.
    # We collect all officers from all groups returned on page=1,
    # then deduplicate by (name, position_text) keeping the first occurrence
    # (earliest group in page-1 response = most recent term).
    seen = {}
    officers = []
    for group in groups:
        details = group.get("Details") or []
        for rec in details:
            name = (rec.get("Name") or "").strip()
            position_text = (rec.get("PositionText") or "").strip()
            key = (name.lower(), position_text.lower())
            if key in seen:
                continue
            seen[key] = True

            appointment_year = _parse_appointment_year(rec.get("FromDate"))

            closed_date_raw = rec.get("ClosedDate")
            closed_date = closed_date_raw if isinstance(closed_date_raw, str) else None

            year_of_birth_raw = rec.get("YearOfBirth")
            try:
                year_of_birth = int(year_of_birth_raw) if year_of_birth_raw else None
            except (ValueError, TypeError):
                year_of_birth = None

            independence_raw = rec.get("Independence")
            try:
                independence = int(independence_raw) if independence_raw is not None else 0
            except (ValueError, TypeError):
                independence = 0

            total_shares_raw = rec.get("TotalShares")
            try:
                total_shares = int(total_shares_raw) if total_shares_raw is not None else None
            except (ValueError, TypeError):
                total_shares = None

            officers.append({
                "name": name,
                "position_text": position_text,
                "appointment_year": appointment_year,
                "closed_date": closed_date,
                "year_of_birth": year_of_birth,
                "independence": independence,
                "total_shares": total_shares,
            })

    return {"officers": officers, "error": None}


# ── Main entry ────────────────────────────────────────────────────────────────

def run(tickers: list[str]) -> dict:
    """
    Sweep a list of tickers. Per-ticker session warmup (fresh opener each).
    Returns the full result payload.
    """
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if not tickers:
        return {"status": "error", "reason": "No tickers provided", "fetched_at": fetched_at}

    data = {}
    tickers_ok = []
    tickers_error = []

    for i, ticker in enumerate(tickers):
        if i > 0:
            time.sleep(INTER_TICKER_DELAY)

        result = fetch_ticker(ticker)

        if result["error"] and not result["officers"]:
            tickers_error.append(ticker)
        else:
            tickers_ok.append(ticker)

        data[ticker] = result["officers"]
        if result["error"]:
            # Attach warning but still include ticker in data
            data[f"_warning_{ticker}"] = result["error"]

    return {
        "status": "ok",
        "tickers_ok": tickers_ok,
        "tickers_error": tickers_error,
        "data": data,
        "fetched_at": fetched_at,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Fetch board-of-management officer details from finance.vietstock.vn"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--ticker", help="Single ticker (uppercase, e.g. FPT)")
    group.add_argument(
        "--batch",
        help="Comma-separated list of tickers for batch sweep (e.g. FPT,VCB,VNM)",
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
