#!/usr/bin/env python3
"""
BCTC PDF URL discovery — fix/bctc-ssc-newsearch edition.

Portal investigation findings (2026-04-26):

HOSE (hsx.vn):
  - Old ArticleList?category=BCTC endpoint → 404 (portal migrated to React SPA).
  - api.hsx.vn news API exists but returns items with no PDF URLs (ADF PPR links).
  - HOSE BCTC PDFs are NOT discoverable via automated scraping.
  - 2026-05-13: KNOWN BROKEN — SPA shell requires browser session. DO NOT
    attempt to fix HSX side with lightweight HTTP (requests/httpx/curl_cffi).
    Out of scope. See docs/vps-sources/hsx-bctc/recon.md for details.
  - Stocks: VNM, BID, FPT, VCB, HPG, ... (Ho Chi Minh Exchange)

HNX (hnx.vn):
  - cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=X → redirects to homepage.
  - Working POST API: /ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH
    - pAction=1, pNhomTin='FIN_REPORT' (with single quotes!), pMaChungKhoan={CODE}
    - pFromDate/pToDate in DD/MM/YYYY format — server-side filtering UNRELIABLE.
    - Returns HTML table with SYMBOL column + funcShowFileAttach(articleId) links.
    - FALLBACK: Query without dates, client-side filter by title year/quarter.
  - PDF via: POST /ModuleArticles/ArticlesCPEtfs/ArticlesFileAttach {pArticlesID: id}
    - Returns HTML with href="https://owa.hnx.vn/ftp/...pdf"
  - Stocks: SHB, ACB(?), PVS, NVB, ... (Hanoi Exchange)

UPCOM (hnx.vn):
  - Same hnx.vn domain (not upcom.hnx.vn which has invalid SSL).
  - POST API: /ModuleArticles/ArticlesCPEtfs/NextPageTCPHUpCoM
    - Same pAction=1 pattern.
  - Same ArticlesFileAttach for PDF.
  - Stocks: VEA, MCH, ... (Unlisted Market)

SSC (congbothongtin.ssc.gov.vn) — fix/bctc-ssc-newsearch:
  - SanGiaoDiv.xhtml → HTTP 404 (endpoint removed as of 2026-04-26). DROPPED.
  - NewsSearch (no .xhtml extension) → HTTP 200, Oracle ADF page (~84 KB).
    Plain HTTP GET with non-browser UA returns only JS splash (~7 KB) — not useful.
    Playwright required to fully render the Oracle ADF app.
  - Playwright workflow (confirmed working 2026-04-26):
    1. GET /faces/NewsSearch → networkidle
    2. Fill pt9:it8112::content (ticker input)
    3. Click "Tìm kiếm" button → wait 4 s
    4. Parse <tr role="row"> cells: col[2]=ticker, col[5]=title, col[6]=date
    5. Click download icon (last-cell <a>) for matched row → expect_download
    6. File served as application/octet-stream with Content-Disposition filename
    7. Save to /root/bctc-cache/<CODE>/<filename>
    8. Return stable URL: http://<VPS_IP>:<PORT>/bctc-files/<CODE>/<filename>
  - VPS proxy endpoint (vps-proxy-server.js):
    GET /bctc-files/:code/:filename → serves /root/bctc-cache/<code>/<filename>
  - No direct stable PDF URL exists — all downloads are session-bound POST triggers.
  - PDF confirmed for VCB Q4 2025: 18.9 MB, filename includes date+ticker+title.

Usage:
    python3 discover-bctc-urls-browser.py VNM 2024 Q4
Output (HNX/UPCOM success):
    {"results": [{"url": "https://owa.hnx.vn/...", "source": "HNX", "confidence": 0.9}], "error": null}
Output (HOSE stock — downloaded via SSC NewsSearch Playwright):
    {"results": [{"url": "http://125.212.251.27:8765/bctc-files/VCB/20260131-VCB-BCTC-Q4-2025.pdf",
                  "source": "SSC-NewsSearch", "confidence": 0.92}], "error": null}
Output (not found):
    {"results": [], "error": "No PDF found for VNM 2024 Q4..."}
"""

import sys
import json
import os
import re
import html as html_lib
import urllib.request
import urllib.parse
import ssl
import asyncio
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
# Cover-letter / full-statement content discrimination
# ---------------------------------------------------------------------------
#
# FIX-CTG-2 (BCTC-FETCH-CORRECTNESS): The HNX national portal accepts
# disclosures from ALL listed tickers, including HOSE-listed ones (e.g. CTG).
# A cover-letter article (Công Văn Công Bố Thông Tin, ~2 pages, ~350–524 KB)
# passes the quarter/year filter because its title contains the year and "quy N".
# Without content discrimination the first matching article is returned — which
# may be the cover letter rather than the actual B02-TCTD financial statement.
#
# HOSE-listed tickers should resolve via the hsx.vn Strategy-0 direct path
# (fixed by FIX-CTG-1 in mcp-server).  This HNX-portal path is the fallback
# for HNX/UPCOM-listed tickers; the discrimination below is defence-in-depth
# that prevents cover-letter mis-selection whenever the fallback IS used.
# ---------------------------------------------------------------------------

# Keywords that indicate a cover-letter / notice document (not the statement).
# These appear in titles like "CV CBTT BCTC Quy I.2026" or "Công văn CBTT ...".
#
# NOTE: "giai trinh" / "giải trình" is intentionally EXCLUDED here.
# Real CTG statement filenames include "va giai trinh bien dong loi nhuan"
# ("and explanation of profit variance") as a sub-clause appended to the BCTC
# title — this is NOT a cover letter.  The proximate cover-letter signals are
# always the "cv cbtt" / "công văn cbtt" / "cbtt link" prefixes.
_COVER_LETTER_KEYWORDS = [
    "cv cbtt",          # "Công Văn Công Bố Thông Tin" abbreviation (ASCII)
    "cong van cbtt",    # same without diacritics
    "công văn cbtt",    # same with diacritics
    "công văn công bố thông tin",
    "cong van cong bo thong tin",
    "cbtt link bctc",   # "CBTT kèm link BCTC" — disclosure notice with a link
    "cbtt kem link",
]

# Keywords that indicate an actual financial statement document.
# A cover-letter title "CV CBTT BCTC Quy I.2026" DOES contain "bctc" — but it
# also contains a cover-letter keyword, so the cover-letter test fires first.
# A full-statement title "BCTC Hợp nhất Quy I.2026" contains only "bctc"/"báo
# cáo tài chính" without any cover-letter keyword → classified as full statement.
_FULL_STATEMENT_KEYWORDS = [
    "báo cáo tài chính",
    "bao cao tai chinh",
    "bctc",
]

# Keywords that specifically indicate the consolidated (hợp nhất) full statement.
# Used for ranking when multiple full-statement matches exist on the same page.
_CONSOLIDATED_KEYWORDS = [
    "hợp nhất",
    "hop nhat",
]


def is_cover_letter_title(title: str) -> bool:
    """
    Return True when the title indicates a cover-letter / notice document
    rather than the actual financial statement.

    Logic:
      A title is a cover letter when it contains at least one cover-letter keyword
      WITHOUT ALSO containing a full-statement keyword that appears OUTSIDE the
      cover-letter phrase.  The single exception: a title that is purely a
      full-statement heading (e.g. "BCTC Hợp nhất Quy I.2026") is NOT a cover
      letter even if "bctc" appears, because it has no cover-letter keyword.

    In practice:
      "CV CBTT BCTC Quy I.2026"              → cover_kw="cv cbtt"             → True
      "Công văn CBTT Quy I.2026"             → cover_kw="công văn cbtt"        → True
      "BCTC hop nhat Quy I.2026"             → no cover_kw                     → False
      "BCTC hop nhat Quy I.2026 va giai trinh bien dong loi nhuan"
                                             → no cover_kw ("giai trinh" alone
                                               is NOT a cover-letter signal)   → False
      "Báo cáo tài chính Quy I.2026"         → no cover_kw, has full_kw        → False
      "CBTT link BCTC Quy I.2026"            → cover_kw="cbtt link bctc"       → True
    """
    t = title.lower()
    has_cover_kw = any(kw in t for kw in _COVER_LETTER_KEYWORDS)
    if not has_cover_kw:
        return False
    # If it has a full-statement keyword as well the title might genuinely name
    # the financial statement.  But "CV CBTT BCTC ..." is still a cover letter
    # (it references BCTC but is itself a notice document).  The deciding signal
    # is the presence of a cover-letter keyword regardless of co-occurrence.
    return True


def is_full_statement_title(title: str) -> bool:
    """
    Return True when the title indicates an actual financial statement document.
    A cover-letter title is NOT a full statement even when it mentions "bctc".
    """
    if is_cover_letter_title(title):
        return False
    t = title.lower()
    return any(kw in t for kw in _FULL_STATEMENT_KEYWORDS)


def is_consolidated_title(title: str) -> bool:
    """Return True when the title indicates the consolidated (hợp nhất) statement."""
    t = title.lower()
    return any(kw in t for kw in _CONSOLIDATED_KEYWORDS)


# Title rank for candidate selection (lower = better).
# Full consolidated statement → 0 (best)
# Full statement (non-consolidated) → 1
# Unknown / undiscriminated → 2
# Cover letter → 99 (skip)
def _title_rank(title: str) -> int:
    if is_cover_letter_title(title):
        return 99
    if is_full_statement_title(title):
        return 0 if is_consolidated_title(title) else 1
    return 2


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
    # Sprint-1953a: add zero-padded variants (SSC returns "quý 01", "Quý 04", etc.)
    q0 = q.zfill(2)  # "1" -> "01", "4" -> "04"
    patterns = [
        # Non-padded
        f"q{q}", f"quý {q}", f"quy {q}", f"kỳ {q}", f"ky {q}",
        f"quarter {q}", f"{q}/{yr}", f"0{q}/{yr}",
        f"q{q}/{yr}", f"quý {q}/{yr}",
        # Zero-padded variants (SSC NewsSearch format: "quý 01 năm 2026")
        f"q{q0}", f"quý {q0}", f"quy {q0}", f"kỳ {q0}", f"ky {q0}",
        f"quarter {q0}", f"{q0}/{yr}", f"q{q0}/{yr}", f"quý {q0}/{yr}",
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
HNX_NY_REFERER = f"{HNX_BASE}/vi-vn/thong-tin-cong-bo-ny-tcph.html"  # 2026-05-13: /vi-vn/ prefix required (server 302s without it)
HNX_UP_REFERER = f"{HNX_BASE}/vi-vn/thong-tin-cong-bo-up-hnx.html"  # 2026-05-13: /vi-vn/ prefix required

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

    FIX-CTG-2: Collect ALL quarter/year-matching candidates on the page, then
    return the best-ranked one (full consolidated statement > full statement >
    generic match; cover letters are SKIPPED entirely).  Previously the function
    returned the FIRST match, which could be a cover-letter PDF.
    """
    code_lower = code.lower()
    row_re = re.compile(
        r"chi-tiet-chung-khoan-(?:ny|up)-([a-z0-9]+)\.html"
        r".*?funcShowFileAttach\((\d+)"
        r".*?hrefViewDetail[^>]+>(.*?)</a",
        re.DOTALL | re.IGNORECASE,
    )

    # Collect (rank, article_id, title) for all passing rows.
    candidates: List[tuple] = []

    for m in row_re.finditer(html):
        row_code = m.group(1).lower()
        article_id = int(m.group(2))
        title = html_lib.unescape(m.group(3)).strip()

        # slug format: ticker + listingcode (e.g. 'shb125017', not just 'shb')
        if not (row_code == code_lower or row_code.startswith(code_lower)):
            continue

        matched = False
        if matches_quarter_and_year(title, quarter, year):
            matched = True
        # Annual report counts for Q4
        elif quarter.upper() == "Q4" and matches_annual(title, year):
            matched = True

        if not matched:
            continue

        # FIX-CTG-2: skip cover-letter articles (CV CBTT, Công văn CBTT, etc.)
        if is_cover_letter_title(title):
            print(
                f"    SKIP cover-letter id={article_id} title={title[:80]}",
                file=sys.stderr,
            )
            continue

        rank = _title_rank(title)
        candidates.append((rank, article_id, title))
        print(
            f"    CANDIDATE rank={rank} id={article_id} title={title[:80]}",
            file=sys.stderr,
        )

    if not candidates:
        return None

    # Sort ascending by rank: 0=consolidated full-statement wins.
    candidates.sort(key=lambda c: c[0])
    best_rank, best_id, best_title = candidates[0]
    print(
        f"    BEST id={best_id} rank={best_rank} title={best_title[:80]}",
        file=sys.stderr,
    )
    return best_id


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
    Common HNX/UPCOM discovery using pAction=1 POST API.

    STRATEGY:
    1. First attempt: Use server-side filtering with pFromDate/pToDate
    2. If no results: Fall back to unfiltered query, client-side filter
    """
    from_date, to_date = _date_window(quarter, year)
    code_lower = code.lower()
    
    # ATTEMPT 1: Server-side filtering
    print(f"  [{source_label}] code={code} window={from_date}–{to_date}", file=sys.stderr)

    for page in range(1, max_pages + 1):
        print(f"  [{source_label}] page {page} (filtered)", file=sys.stderr)
        try:
            html = _http_post(endpoint, {
                "pNumPage": str(page),
                "pAction": "1",              # Activates server-side filtering
                "pNhomTin": "",              # 2026-05-13: empty string — FIN_REPORT wrapper no longer required
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

        # --- Homepage fallback detection (2026-05-13 fix) ---
        # Server silently returns full homepage (~40KB, <title>Trang chủ</title>)
        # when POST params are wrong. Detect this and raise a clear error instead
        # of silently storing junk. Root cause: old pageIndex/pageSize params.
        if len(html) > 30_000 and "Trang ch\u1ee7" in html:
            raise RuntimeError(
                f"[{source_label}] Homepage fallback detected on page {page} "
                f"(size={len(html)}B) — POST params may be wrong. "
                f"Check pAction/pNhomTin/pMaChungKhoan."
            )

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

    # ATTEMPT 2: Unfiltered search with client-side filtering
    print(f"  [{source_label}] Fallback: unfiltered search for {code}", file=sys.stderr)
    try:
        html = _http_post(endpoint, {
            "pNumPage": "1",
            "pAction": "1",
            "pNhomTin": "",  # 2026-05-13: empty
            "pTieuDeTin": "",
            "pMaChungKhoan": code,
            "pFromDate": "",
            "pToDate": "",
            "pOrderBy": "",
            "pNumRecord": "20",
        }, referer=referer)
        
        if "funcShowFileAttach" in html:
            article_id = _parse_article_ids_and_titles(html, code, year, quarter)
            if article_id is not None:
                pdf_url = _fetch_pdf_url(article_id)
                if pdf_url:
                    return {
                        "url": pdf_url,
                        "source": source_label,
                        "confidence": 0.85 if source_label == "HNX" else 0.80,
                        "page_title": f"{source_label} article {article_id} (fallback)",
                    }
    except Exception as e:
        print(f"  [{source_label}] fallback error: {e}", file=sys.stderr)

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
# SSC portal — Playwright-based NewsSearch (fix/bctc-ssc-newsearch)
#
# SanGiaoDiv.xhtml was removed from the SSC portal → HTTP 404 as of 2026-04-26.
# NewsSearch (congbothongtin.ssc.gov.vn/faces/NewsSearch) returns HTTP 200 and
# works, but requires Playwright: the page is an Oracle ADF app that returns
# only a 7 KB JS splash via plain HTTP GET.
#
# Workflow (confirmed 2026-04-26 on VPS):
#   1. Playwright loads /faces/NewsSearch → networkidle (~84 KB rendered page)
#   2. Fill #pt9:it8112::content with ticker symbol
#   3. Click "Tìm kiếm" button → 4 s wait for ADF AJAX refresh
#   4. Parse <tr role="row"> table: col[2]=ticker, col[5]=title, col[6]=date
#   5. Match row against (quarter, year) using existing text-matching helpers
#   6. Click download icon (last-cell <a>) for matched row → expect_download
#   7. PDF served as application/octet-stream; filename in Content-Disposition
#   8. Save to /root/bctc-cache/<CODE>/<sanitised_filename>
#   9. Return stable proxy URL: http://<VPS_IP>:<PORT>/bctc-files/<CODE>/<filename>
#      (served by vps-proxy-server.js GET /bctc-files/:code/:filename)
# ---------------------------------------------------------------------------

SSC_BASE = "https://congbothongtin.ssc.gov.vn"
SSC_SEARCH_URL = f"{SSC_BASE}/faces/NewsSearch"

# VPS proxy URL for serving cached BCTC PDFs.
# Can be overridden via VPS_PROXY_BCTC_BASE env var (useful for testing).
_VPS_PROXY_BCTC_BASE = os.environ.get(
    "VPS_PROXY_BCTC_BASE",
    "http://125.212.251.27:8765/bctc-files",
)

# Directory on VPS where downloaded PDFs are stored.
_BCTC_CACHE_DIR = os.environ.get("BCTC_CACHE_DIR", "/root/bctc-cache")


def _sanitise_filename(name: str) -> str:
    """
    Sanitise a filename for safe use in URLs and filesystem paths.
    Replaces spaces with hyphens, strips non-ASCII chars, collapses runs of dots.
    """
    # Normalise: strip leading/trailing whitespace
    name = name.strip()
    # Replace spaces and unsafe chars with hyphens
    name = re.sub(r"[\s/\\:*?\"<>|]+", "-", name)
    # Remove non-ASCII (Vietnamese diacritics in filenames from SSC)
    name = name.encode("ascii", errors="ignore").decode("ascii")
    # Collapse multiple hyphens/dots
    name = re.sub(r"-{2,}", "-", name)
    name = re.sub(r"\.{2,}", ".", name)
    return name.strip("-")


async def _ssc_newsearch_playwright(
    code: str,
    year: int,
    quarter: str,
    prefer_consolidated: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Use Playwright to search SSC NewsSearch and download the matching BCTC PDF.

    Args:
        code: Ticker symbol (upper-case), e.g. "VCB"
        year: Report year, e.g. 2025
        quarter: Quarter string, e.g. "Q4"
        prefer_consolidated: If True, prefer "Hợp nhất" (consolidated) report
            over "Mẹ" (parent/standalone) when both appear.

    Returns:
        Result dict with stable proxy URL, or None on failure.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("  [SSC-NS] playwright not available — skipping", file=sys.stderr)
        return None

    cache_dir = os.path.join(_BCTC_CACHE_DIR, code.upper())
    os.makedirs(cache_dir, exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        ctx = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            accept_downloads=True,
        )
        page = await ctx.new_page()

        try:
            print(f"  [SSC-NS] Loading {SSC_SEARCH_URL}", file=sys.stderr)
            await page.goto(SSC_SEARCH_URL, timeout=30_000, wait_until="networkidle")
            await page.wait_for_timeout(2_000)

            # Fill the ticker input field (Oracle ADF id convention adds ::content suffix)
            ticker_sel = "#pt9\\:it8112\\:\\:content"
            ticker_el = await page.query_selector(ticker_sel)
            if not ticker_el:
                print(f"  [SSC-NS] ticker input not found (selector={ticker_sel})", file=sys.stderr)
                return None
            await ticker_el.fill(code.upper())

            # Click "Tìm kiếm" (search) button
            search_btn = None
            for btn in await page.query_selector_all("button, a"):
                txt = (await btn.text_content() or "").strip()
                if "Tìm kiếm" in txt:
                    search_btn = btn
                    break
            if not search_btn:
                print("  [SSC-NS] search button not found", file=sys.stderr)
                return None

            await search_btn.click()
            await page.wait_for_timeout(4_000)

            # Parse result rows
            html_content = await page.content()
            rows_html = re.findall(
                r'<tr[^>]*role="row"[^>]*>(.*?)</tr>', html_content, re.DOTALL
            )
            print(f"  [SSC-NS] rows found: {len(rows_html)}", file=sys.stderr)

            if not rows_html:
                print("  [SSC-NS] no rows returned for ticker", file=sys.stderr)
                return None

            # Find matching row: prefer quarterly over annual, consolidated over parent
            target_idx: Optional[int] = None
            annual_idx: Optional[int] = None
            code_upper = code.upper()

            for i, row_html in enumerate(rows_html):
                cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.DOTALL)
                if len(cells) < 6:
                    continue
                ticker_cell = html_lib.unescape(re.sub(r"<[^>]+>", "", cells[2])).strip().upper()
                title = html_lib.unescape(re.sub(r"<[^>]+>", "", cells[5])).strip()
                report_type = html_lib.unescape(re.sub(r"<[^>]+>", "", cells[3])).strip()

                if ticker_cell != code_upper:
                    continue

                is_consolidated = "Hợp nhất" in report_type or "hợp nhất" in title.lower()

                print(f"    row {i}: type={report_type[:40]!r} title={title[:60]!r}", file=sys.stderr)

                if matches_quarter_and_year(title, quarter, year):
                    if target_idx is None:
                        target_idx = i
                        print(f"  [SSC-NS] MATCH row {i}: {title[:80]}", file=sys.stderr)
                    elif prefer_consolidated and is_consolidated:
                        target_idx = i
                        print(f"  [SSC-NS] BETTER MATCH (consolidated) row {i}: {title[:80]}", file=sys.stderr)
                    if prefer_consolidated and is_consolidated:
                        # Consolidated quarterly is the best possible match — stop
                        break

                elif quarter.upper() == "Q4" and matches_annual(title, year):
                    if annual_idx is None:
                        annual_idx = i
                        print(f"  [SSC-NS] ANNUAL MATCH row {i}: {title[:80]}", file=sys.stderr)

            # Fall back to annual match for Q4
            if target_idx is None and annual_idx is not None:
                target_idx = annual_idx

            if target_idx is None:
                print(
                    f"  [SSC-NS] no match for {code} {year} {quarter} in {len(rows_html)} rows",
                    file=sys.stderr,
                )
                return None

            # Click the download icon for the matched row
            download_icons = await page.query_selector_all("tr[role='row'] td:last-child a")
            if target_idx >= len(download_icons):
                print(
                    f"  [SSC-NS] row {target_idx} has no download icon (only {len(download_icons)} icons)",
                    file=sys.stderr,
                )
                return None

            icon = download_icons[target_idx]
            icon_id = await icon.get_attribute("id") or f"row_{target_idx}"
            print(f"  [SSC-NS] clicking download icon: {icon_id}", file=sys.stderr)

            async with page.expect_download(timeout=60_000) as dl_info:
                await icon.click()
            dl = await dl_info.value

            raw_filename = dl.suggested_filename or f"{code}-bctc-{quarter}-{year}.pdf"
            safe_filename = _sanitise_filename(raw_filename)
            if not safe_filename.lower().endswith(".pdf"):
                safe_filename += ".pdf"

            dest_path = os.path.join(cache_dir, safe_filename)
            await dl.save_as(dest_path)

            file_size = os.path.getsize(dest_path) if os.path.exists(dest_path) else 0
            print(
                f"  [SSC-NS] downloaded {safe_filename} ({file_size:,} bytes) → {dest_path}",
                file=sys.stderr,
            )

            if file_size < 1_000:
                print(f"  [SSC-NS] file too small ({file_size} bytes) — likely error page", file=sys.stderr)
                try:
                    os.remove(dest_path)
                except OSError:
                    pass
                return None

            # Return stable proxy URL
            proxy_url = f"{_VPS_PROXY_BCTC_BASE}/{urllib.parse.quote(code.upper())}/{urllib.parse.quote(safe_filename)}"
            return {
                "url": proxy_url,
                "source": "SSC-NewsSearch",
                "confidence": 0.92,
                "page_title": raw_filename,
                "local_path": dest_path,
            }

        except Exception as exc:
            print(f"  [SSC-NS] error: {exc}", file=sys.stderr)
            return None
        finally:
            await browser.close()


def discover_from_hose_ssc(code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Discover BCTC PDF for HOSE-listed stocks via SSC NewsSearch portal.

    Uses Playwright to fully render the Oracle ADF page, search by ticker,
    download the matched PDF to VPS cache, and return a stable proxy URL.

    SanGiaoDiv.xhtml was removed from the SSC portal (HTTP 404 since 2026-04-26).
    Plain HTTP GET to NewsSearch returns only the JS splash (~7 KB) — not useful.
    Playwright is required to interact with the Oracle ADF application.

    Returns result with stable proxy URL, or None if not found / Playwright fails.
    """
    try:
        result = asyncio.run(_ssc_newsearch_playwright(code, year, quarter))
        return result
    except Exception as exc:
        print(f"  [HOSE-SSC] asyncio.run error: {exc}", file=sys.stderr)
        return None


def discover_from_ssc(code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Generic SSC fallback for any exchange listing (non-Playwright).

    NOTE: This path only works when Playwright is available (same as hose_ssc above).
    Kept for backward compatibility — delegates to the same Playwright implementation.
    Returns document existence confirmation with proxy URL, or None if not found.
    """
    return discover_from_hose_ssc(code, year, quarter)


# ---------------------------------------------------------------------------
# Main discovery
# ---------------------------------------------------------------------------

def discover_bctc_pdf(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """
    Discover BCTC PDF URL.

    Order:
      1. HNX  — POST API, direct PDF URL (owa.hnx.vn)
      2. UPCOM — POST API, direct PDF URL (owa.hnx.vn)
      3. SSC NewsSearch via Playwright — downloads PDF to VPS cache, returns
         stable proxy URL (http://<VPS_IP>:8765/bctc-files/<CODE>/<filename>)
         Covers HOSE-listed stocks and any HNX/UPCOM not found via POST API.

    fix/bctc-ssc-newsearch:
      SanGiaoDiv.xhtml (old HOSE-SSC filter endpoint) removed — was HTTP 404.
      SSC NewsSearch Playwright now provides real PDF URLs, not just confirmation.
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

    # 3. SSC NewsSearch via Playwright
    #    Downloads PDF to /root/bctc-cache/<CODE>/ and returns a stable proxy URL.
    #    Works for any exchange listing visible on congbothongtin.ssc.gov.vn.
    result = discover_from_hose_ssc(code, year, quarter)
    if result and result.get("url"):
        results.append(result)
        return {"results": results, "error": None}

    return {
        "results": [],
        "error": (
            f"No PDF found for {code} {year} {quarter}. "
            f"HNX/UPCOM POST API returned no match. "
            f"SSC NewsSearch Playwright: either not found or download failed. "
            f"Check VPS logs for details."
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
