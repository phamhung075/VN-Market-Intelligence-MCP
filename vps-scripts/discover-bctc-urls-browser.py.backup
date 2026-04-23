#!/usr/bin/env python3
"""
BCTC PDF URL discovery — Task 1297 fixed version.

Portal investigation findings (2026-04-24):

HOSE (hsx.vn):
  - Old ArticleList?category=BCTC endpoint → 404 (portal migrated to React SPA).
  - api.hsx.vn news API exists but returns items with no PDF URLs (ADF PPR links).
  - HOSE BCTC PDFs are NOT discoverable via automated scraping.
  - Stocks: VNM, BID, FPT, VCB, HPG, ... (Ho Chi Minh Exchange)

HNX (hnx.vn):
  - cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=X → redirects to homepage.
  - Working POST API: /ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH
    - pAction=1, pNhomTin='FIN_REPORT' (with single quotes!), pMaChungKhoan={CODE}
    - pFromDate/pToDate in DD/MM/YYYY format — server-side filtering WORKS with pAction=1.
    - Returns HTML table with SYMBOL column + funcShowFileAttach(articleId) links.
  - PDF via: POST /ModuleArticles/ArticlesCPEtfs/ArticlesFileAttach {pArticlesID: id}
    - Returns HTML with href="https://owa.hnx.vn/ftp/...pdf"
  - Stocks: SHB, ACB(?), PVS, NVB, ... (Hanoi Exchange)

UPCOM (hnx.vn):
  - Same hnx.vn domain (not upcom.hnx.vn which has invalid SSL).
  - POST API: /ModuleArticles/ArticlesCPEtfs/NextPageTCPHUpCoM
    - Same pAction=1 pattern.
  - Same ArticlesFileAttach for PDF.
  - Stocks: VEA, MCH, ... (Unlisted Market)

SSC (congbothongtin.ssc.gov.vn):
  - Non-browser UA → returns full SSR HTML (~92 KB) with x17f table.
  - Table shows 15 most recent BCTC docs across ALL companies (no filtering).
  - No direct PDF URLs (ADF PPR links only).
  - Useful as fallback: confirms document existence but no PDF URL.

Usage:
    python3 discover-bctc-urls-browser.py VNM 2024 Q4
Output (success):
    {"results": [{"url": "https://owa.hnx.vn/...", "source": "HNX", "confidence": 0.9}], "error": null}
Output (HOSE stock — no PDF discoverable):
    {"results": [], "error": "HOSE portal broken: PDF URLs not discoverable for VNM 2024 Q4. Use SSC queue."}
"""

import sys
import json
import re
import html as html_lib
import urllib.request
import urllib.parse
import ssl
from typing import Optional, Dict, Any, List

# ---------------------------------------------------------------------------
# TLS + shared HTTP helpers
# ---------------------------------------------------------------------------

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Origin": "https://hnx.vn",
}

_BOT_HEADERS = {
    "User-Agent": "VN-Market-Intelligence/1.0",
    "Accept": "text/html,application/xhtml+xml",
}


def _http_get(url: str, headers: Dict[str, str], timeout: int = 15) -> str:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _http_post(url: str, data: Dict[str, str], referer: str, timeout: int = 15) -> str:
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=encoded, headers={
        **_BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": referer,
    })
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
        return resp.read().decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Quarter / year text matching
# ---------------------------------------------------------------------------

def matches_quarter_and_year(text: str, quarter: str, year: int) -> bool:
    """
    Return True if text contains matching year AND quarter marker.
    quarter: "Q1" | "Q2" | "Q3" | "Q4"
    """
    if not text:
        return False
    t = text.lower()
    q = quarter.upper()[-1]  # "Q4" → "4"
    yr = str(year)
    if yr not in t:
        return False
    patterns = [
        f"q{q}", f"quý {q}", f"quy {q}", f"kỳ {q}", f"ky {q}",
        f"quarter {q}", f"{q}/{yr}", f"0{q}/{yr}",
        f"q{q}/{yr}", f"quý {q}/{yr}",
    ]
    return any(p in t for p in patterns)


def matches_annual(text: str, year: int) -> bool:
    """Return True if text describes an annual (year-end) report for this year."""
    t = text.lower()
    yr = str(year)
    if yr not in t:
        return False
    annual_kw = ["năm", "nam", "annual", "niên độ", "nien do", "cả năm", "ca nam"]
    quarterly_kw = ["quý", "quy", "quarter", "kỳ"]
    has_annual = any(kw in t for kw in annual_kw)
    has_quarter = any(kw in t for kw in quarterly_kw)
    return has_annual and not has_quarter


def is_valid_pdf_url(url: str) -> bool:
    if not url:
        return False
    lower = url.lower()
    return (
        lower.endswith(".pdf")
        and (lower.startswith("http://") or lower.startswith("https://"))
        and not any(x in lower for x in ["javascript:", "data:", "file://"])
    )


# ---------------------------------------------------------------------------
# HNX / UPCOM — POST-based discovery
# ---------------------------------------------------------------------------

HNX_BASE = "https://hnx.vn"
HNX_NY_ENDPOINT = f"{HNX_BASE}/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH"
HNX_UP_ENDPOINT = f"{HNX_BASE}/ModuleArticles/ArticlesCPEtfs/NextPageTCPHUpCoM"
HNX_FILE_ENDPOINT = f"{HNX_BASE}/ModuleArticles/ArticlesCPEtfs/ArticlesFileAttach"
HNX_NY_REFERER = f"{HNX_BASE}/thong-tin-cong-bo-ny-tcph.html"
HNX_UP_REFERER = f"{HNX_BASE}/thong-tin-cong-bo-up-hnx.html"

# Date window: Q4 reports filed Jan–Mar of next year; quarterly ~45 days after quarter end
_QUARTER_WINDOWS = {
    "Q1": ("01/04/{y}", "30/06/{y}"),
    "Q2": ("01/07/{y}", "30/09/{y}"),
    "Q3": ("01/10/{y}", "31/12/{y}"),
    "Q4": ("01/01/{ny}", "31/03/{ny}"),  # ny = year+1
}


def _date_window(quarter: str, year: int):
    """Return (from_date, to_date) in DD/MM/YYYY for the expected filing window."""
    q = quarter.upper()
    next_year = year + 1
    pattern = _QUARTER_WINDOWS.get(q, ("01/01/{y}", "31/12/{y}"))
    from_d = pattern[0].format(y=year, ny=next_year)
    to_d = pattern[1].format(y=year, ny=next_year)
    return from_d, to_d


def _parse_article_ids_and_titles(html: str, code: str, year: int, quarter: str) -> Optional[int]:
    """
    Parse one page of HNX disclosure HTML.

    Each row:
      - SYMBOL: <a href="/cophieu-etfs/chi-tiet-chung-khoan-{ny|up}-{code}.html">
      - File:   funcShowFileAttach(articleId, 1)
      - Title:  <a class="hrefViewDetail">title text</a>

    Returns article ID on first match, None otherwise.
    """
    code_lower = code.lower()
    row_re = re.compile(
        r"chi-tiet-chung-khoan-(?:ny|up)-([a-z0-9]+)\.html"
        r".*?funcShowFileAttach\((\d+)"
        r".*?hrefViewDetail[^>]+>(.*?)</a",
        re.DOTALL | re.IGNORECASE,
    )
    for m in row_re.finditer(html):
        row_code = m.group(1).lower()
        article_id = int(m.group(2))
        title = html_lib.unescape(m.group(3)).strip()

        if row_code != code_lower:
            continue

        if matches_quarter_and_year(title, quarter, year):
            print(f"    MATCH id={article_id} title={title[:80]}", file=sys.stderr)
            return article_id

        # Annual report counts for Q4
        if quarter.upper() == "Q4" and matches_annual(title, year):
            print(f"    MATCH annual id={article_id} title={title[:80]}", file=sys.stderr)
            return article_id

    return None


def _fetch_pdf_url(article_id: int) -> Optional[str]:
    """POST to ArticlesFileAttach, extract first valid PDF href."""
    try:
        html = _http_post(HNX_FILE_ENDPOINT, {"pArticlesID": str(article_id)},
                          referer=HNX_NY_REFERER)
        for url in re.findall(r'href="(https?://[^"]+\.pdf[^"]*)"', html, re.IGNORECASE):
            if is_valid_pdf_url(url):
                return url
    except Exception as e:
        print(f"    ArticlesFileAttach error id={article_id}: {e}", file=sys.stderr)
    return None


def _discover_hnx_upcom(
    code: str, year: int, quarter: str,
    endpoint: str, referer: str, source_label: str,
    max_pages: int = 5,
) -> Optional[Dict[str, Any]]:
    """
    Common HNX/UPCOM discovery using pAction=1 filtered POST API.

    The POST with pAction=1 activates server-side filtering by:
      - pMaChungKhoan = stock code
      - pFromDate / pToDate = date range (DD/MM/YYYY)
      - pNhomTin = 'FIN_REPORT' (note: single quotes required by server)
    """
    from_date, to_date = _date_window(quarter, year)
    print(f"  [{source_label}] code={code} window={from_date}–{to_date}", file=sys.stderr)

    for page in range(1, max_pages + 1):
        print(f"  [{source_label}] page {page}", file=sys.stderr)
        try:
            html = _http_post(endpoint, {
                "pNumPage": str(page),
                "pAction": "1",              # Activates server-side filtering
                "pNhomTin": "'FIN_REPORT'",  # Single quotes required
                "pTieuDeTin": "",
                "pMaChungKhoan": code,
                "pFromDate": from_date,
                "pToDate": to_date,
                "pOrderBy": "",
                "pNumRecord": "20",
            }, referer=referer)
        except Exception as e:
            print(f"  [{source_label}] fetch error p{page}: {e}", file=sys.stderr)
            break

        # Empty result
        if "Không tìm thấy dữ liệu" in html or "funcShowFileAttach" not in html:
            print(f"  [{source_label}] no results at page {page}", file=sys.stderr)
            break

        article_id = _parse_article_ids_and_titles(html, code, year, quarter)
        if article_id is not None:
            pdf_url = _fetch_pdf_url(article_id)
            if pdf_url:
                return {
                    "url": pdf_url,
                    "source": source_label,
                    "confidence": 0.90 if source_label == "HNX" else 0.85,
                    "page_title": f"{source_label} article {article_id}",
                }

    return None


def discover_from_hnx(code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    return _discover_hnx_upcom(
        code, year, quarter, HNX_NY_ENDPOINT, HNX_NY_REFERER, "HNX"
    )


def discover_from_upcom(code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    return _discover_hnx_upcom(
        code, year, quarter, HNX_UP_ENDPOINT, HNX_UP_REFERER, "UPCOM"
    )


# ---------------------------------------------------------------------------
# SSC portal — non-browser UA, parse x17f table (listing confirmation only)
# ---------------------------------------------------------------------------

SSC_BASE = "https://congbothongtin.ssc.gov.vn"
SSC_SEARCH = f"{SSC_BASE}/faces/NewsSearch"
_SSC_MIN_BYTES = 50_000


def discover_from_ssc(code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Query SSC with non-browser UA to get SSR HTML.
    Returns document-existence confirmation with NO pdf_url (ADF portal has no direct links).
    Server does NOT filter by keyword/year; we parse the 15 most-recent rows client-side.
    """
    url = (f"{SSC_SEARCH}?"
           f"keyword={urllib.parse.quote(code)}&type=BCTC&year={year}")
    try:
        html = _http_get(url, headers=_BOT_HEADERS, timeout=20)
    except Exception as e:
        print(f"  [SSC] fetch error: {e}", file=sys.stderr)
        return None

    if len(html) < _SSC_MIN_BYTES:
        print(f"  [SSC] short response ({len(html)} bytes)", file=sys.stderr)
        return None

    x17f = re.search(r'class="x17f[^"]*"[^>]*>(.*?)</table>', html, re.DOTALL)
    if not x17f:
        return None

    rows = re.findall(r'<tr[^>]*role="row"[^>]*>(.*?)</tr>', x17f.group(1), re.DOTALL)
    code_upper = code.upper()

    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL)
        if len(cells) < 7:
            continue
        ticker = html_lib.unescape(re.sub(r"<[^>]+>", "", cells[2])).strip().upper()
        title = html_lib.unescape(re.sub(r"<[^>]+>", "", cells[3])).strip()

        if ticker != code_upper:
            continue
        if matches_quarter_and_year(title, quarter, year):
            print(f"  [SSC] confirmed ticker={ticker} title={title[:80]}", file=sys.stderr)
            return {
                "url": None,
                "source": "SSC",
                "confidence": 0.60,
                "page_title": title,
            }

    return None


# ---------------------------------------------------------------------------
# Main discovery
# ---------------------------------------------------------------------------

def discover_bctc_pdf(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """
    Discover BCTC PDF URL.

    Order: HNX → UPCOM → SSC (confirmation only, no PDF URL).
    HOSE stocks are NOT discoverable via automated scraping (portal broken).
    """
    code = code.upper()
    quarter = quarter.upper()
    results: List[Dict[str, Any]] = []

    print(f"Discovering {code} {year} {quarter}...", file=sys.stderr)

    # 1. Try HNX
    result = discover_from_hnx(code, year, quarter)
    if result and result.get("url"):
        results.append(result)
        return {"results": results, "error": None}

    # 2. Try UPCOM
    result = discover_from_upcom(code, year, quarter)
    if result and result.get("url"):
        results.append(result)
        return {"results": results, "error": None}

    # 3. SSC confirmation (no PDF URL — HOSE or other)
    result = discover_from_ssc(code, year, quarter)
    if result:
        # Document exists but we can't get the PDF URL
        return {
            "results": [],
            "error": (
                f"Document found on SSC ({result['page_title'][:60]}) "
                f"but no direct PDF URL available for {code} {year} {quarter}. "
                f"HOSE portal is inaccessible for automated PDF discovery."
            ),
        }

    return {
        "results": [],
        "error": (
            f"No PDF found for {code} {year} {quarter}. "
            f"If HOSE-listed: portal is broken. "
            f"If HNX/UPCOM: check if report was filed in the expected window."
        ),
    }


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({
            "results": [],
            "error": "Usage: python3 discover-bctc-urls-browser.py <CODE> <YEAR> <QUARTER>",
        }))
        sys.exit(1)

    try:
        code_arg = sys.argv[1].upper()
        year_arg = int(sys.argv[2])
        quarter_arg = sys.argv[3].upper()

        result = discover_bctc_pdf(code_arg, year_arg, quarter_arg)
        print(json.dumps(result, ensure_ascii=False))
    except (ValueError, IndexError):
        print(json.dumps({
            "results": [],
            "error": "Usage: python3 discover-bctc-urls-browser.py <CODE> <YEAR> <QUARTER>",
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "results": [],
            "error": f"Script error: {str(e)}",
        }))
        sys.exit(1)
