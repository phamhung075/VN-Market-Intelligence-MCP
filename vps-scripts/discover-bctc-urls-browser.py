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

SSC (congbothongtin.ssc.gov.vn) — FIX-VPS-SSC-CURL-SCRAPER:
  - SanGiaoDiv.xhtml → HTTP 404 (endpoint removed as of 2026-04-26). DROPPED.
  - NewsSearch (no .xhtml extension) → HTTP 200, Oracle ADF page (~84 KB).
    Loopback GET returns 6.8 KB JS redirect script — params extracted via regex.
    No Chromium / Playwright needed (FIX-VPS-SSC-CURL-SCRAPER, 2026-06-06).
  - curl-based 3-step workflow:
    1. GET /faces/NewsSearch → JSESSIONID cookie + _afrLoop + Adf-Window-Id
    2. GET /faces/NewsSearch;jsessionid=X?_afrLoop=Y&_afrWindowMode=2&Adf-Window-Id=Z → ViewState
    3a. POST PPR search (Faces-Request: partial/ajax) → result table XML
    3b. POST full-form download (NO Faces-Request) → octet-stream PDF bytes
    4. Save to /root/bctc-cache/<CODE>/<filename>
    5. Return stable URL: http://<VPS_IP>:<PORT>/bctc-files/<CODE>/<filename>
  - VPS proxy endpoint (vps-proxy-server.js):
    GET /bctc-files/:code/:filename → serves /root/bctc-cache/<code>/<filename>
  - No direct stable PDF URL exists — all downloads are session-bound POST triggers.
  - Proven for GAS Q1/2026: 15.4 MB PDF, VCB Q4/2025: 18.9 MB.

Usage:
    python3 discover-bctc-urls-browser.py VNM 2024 Q4
Output (HNX/UPCOM success):
    {"results": [{"url": "https://owa.hnx.vn/...", "source": "HNX", "confidence": 0.9}], "error": null}
Output (HOSE stock — downloaded via SSC NewsSearch curl-based HTTP):
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
import urllib.error
import ssl
import http.cookiejar
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

    # FIX-CTG-2b: Only accept rank 0 (consolidated) or rank 1 (full statement).
    # Rank >= 2 means the only candidates are generic/undiscriminated documents
    # (e.g. "QĐ TGĐ thay đổi địa điểm" — a CEO decision, not a BCTC).
    # Return None so HOSE-listed tickers fall through cleanly to the hsx.vn
    # direct path (FIX-CTG-1) instead of returning a non-BCTC document.
    if best_rank >= 2:
        print(
            f"    SKIP all-generic rank={best_rank} best_id={best_id} "
            f"title={best_title[:80]} — no acceptable BCTC found on this page",
            file=sys.stderr,
        )
        return None

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
# SSC portal — stateful curl-based NewsSearch (FIX-VPS-SSC-CURL-SCRAPER)
#
# SanGiaoDiv.xhtml was removed from the SSC portal → HTTP 404 as of 2026-04-26.
# NewsSearch (congbothongtin.ssc.gov.vn/faces/NewsSearch) returns HTTP 200.
# Plain HTTP GET returns only a 6.8 KB JS loopback script — NOT a 7 KB splash.
# Simulating the loopback step via regex (no JS execution needed) delivers the
# full 84 KB Oracle ADF rendered page. No Chromium / Playwright required.
#
# 3-step stateful HTTP recipe (proven from VPS, 2026-06-06):
#   1. GET /faces/NewsSearch → JSESSIONID cookie + _afrLoop + Adf-Window-Id
#   2. GET /faces/NewsSearch;jsessionid=X?_afrLoop=Y&_afrWindowMode=2&Adf-Window-Id=Z
#      → ViewState + form id (84 KB rendered page)
#   3a. POST (PPR/AJAX, Faces-Request: partial/ajax) → result table XML
#   3b. POST (full form, NO Faces-Request header) → octet-stream PDF bytes
#
# Recon doc: docs/vps-sources/ssc-bctc-newsearch/recon.md
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

# Exchange code mapping (SSC form field pt9:soc3)
_EXCHANGE_CODES = {"HOSE": "1", "HNX": "0", "UPCOM": "2"}

# DOM row offset: page initialises 15 empty rows before result rows.
# First search result → DOM index 15.
_SSC_ROW_OFFSET = 15

# SSC JSESSIONID session timeout (ms) per JS config — ~10 hours.
# We create a fresh session per call; no caching across calls.
_SSC_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _sanitise_filename(name: str) -> str:
    """
    Sanitise a filename for safe use in URLs and filesystem paths.
    Replaces spaces with hyphens, strips non-ASCII chars, collapses runs of dots.
    """
    name = name.strip()
    name = re.sub(r"[\s/\\:*?\"<>|]+", "-", name)
    # Remove non-ASCII (Vietnamese diacritics in SSC filenames)
    name = name.encode("ascii", errors="ignore").decode("ascii")
    name = re.sub(r"-{2,}", "-", name)
    name = re.sub(r"\.{2,}", ".", name)
    return name.strip("-")


def _ssc_make_opener() -> urllib.request.OpenerDirector:
    """Build a urllib opener with a cookie jar and SSL CERT_NONE context."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ctx),
    )
    opener._jar = jar  # type: ignore[attr-defined]
    return opener


def _ssc_get(opener: urllib.request.OpenerDirector, url: str,
             extra_headers: Optional[Dict[str, str]] = None,
             timeout: int = 20) -> bytes:
    """GET via opener, returns raw bytes."""
    headers = {
        "User-Agent": _SSC_UA,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with opener.open(req, timeout=timeout) as resp:
        return resp.read()


def _ssc_post(opener: urllib.request.OpenerDirector, url: str,
              data: Dict[str, str], ajax: bool = True,
              timeout: int = 30) -> tuple:
    """
    POST via opener. Returns (raw_bytes, response_headers_dict).
    ajax=True adds Faces-Request: partial/ajax (PPR search).
    ajax=False omits it (full form POST for PDF download).
    """
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    headers = {
        "User-Agent": _SSC_UA,
        "Accept": "application/xml, text/xml, */*; q=0.01" if ajax else "application/pdf,application/octet-stream,*/*",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": SSC_SEARCH_URL,
    }
    if ajax:
        headers["Faces-Request"] = "partial/ajax"
    req = urllib.request.Request(url, data=encoded, headers=headers)
    with opener.open(req, timeout=timeout) as resp:
        raw = resp.read()
        resp_headers = {k.lower(): v for k, v in resp.headers.items()}
    return raw, resp_headers


def _ssc_get_jsessionid(opener: urllib.request.OpenerDirector) -> str:
    """Extract JSESSIONID from the cookie jar."""
    for cookie in opener._jar:  # type: ignore[attr-defined]
        if cookie.name == "JSESSIONID":
            return cookie.value
    return ""


def _ssc_parse_rows(body: str, code: str, year: int, quarter: str) -> List[tuple]:
    """
    Parse SSC PPR XML search response and extract candidate rows.

    Cell ids in result table:
      pt9:t1:{N}:c3   — Report type (contains "Hợp nhất" for consolidated)
      pt9:t1:{N}:c5   — Ticker symbol
      pt9:t1:{N}:c111 — Document summary / filename hint
      pt9:t1:{N}:c7   — Submission date

    First result row DOM index = _SSC_ROW_OFFSET (15).

    Returns sorted list of (rank, dom_idx, title) for matching rows.
    rank: 0=consolidated full-statement (best), 1=non-consolidated, 2=generic, 99=skip.
    """
    code_upper = code.upper()
    candidates: List[tuple] = []

    # Decode HTML entities — body is XML CDATA with HTML entities inside
    decoded = html_lib.unescape(body)

    # Find all row DOM indices present in the response
    row_indices = set(int(m) for m in re.findall(r'id="pt9:t1:(\d+):c5"', decoded))
    print(f"  [SSC-CURL] row indices found: {sorted(row_indices)}", file=sys.stderr)

    for idx in sorted(row_indices):
        # Extract ticker cell — content is inside <span> nested in <td>
        # Use </td> as closing delimiter, then strip all tags
        m_ticker = re.search(
            rf'id="pt9:t1:{idx}:c5"[^>]*>(.*?)</td>',
            decoded, re.DOTALL
        )
        ticker_text = html_lib.unescape(
            re.sub(r"<[^>]+>", "", m_ticker.group(1) if m_ticker else "")
        ).strip().upper()

        if ticker_text != code_upper:
            continue

        # Extract document summary (c111 = filename hint)
        # Content: HTML-entity-encoded text inside <span> inside <td>
        m_c111 = re.search(
            rf'id="pt9:t1:{idx}:c111"[^>]*>(.*?)</td>',
            decoded, re.DOTALL
        )
        title = html_lib.unescape(
            re.sub(r"<[^>]+>", "", m_c111.group(1) if m_c111 else "")
        ).strip()

        # Extract report type (c3 — contains "Hợp nhất" for consolidated)
        m_c3 = re.search(
            rf'id="pt9:t1:{idx}:c3"[^>]*>(.*?)</td>',
            decoded, re.DOTALL
        )
        report_type = html_lib.unescape(
            re.sub(r"<[^>]+>", "", m_c3.group(1) if m_c3 else "")
        ).strip()

        if not title:
            continue

        matched = False
        if matches_quarter_and_year(title, quarter, year):
            matched = True
        elif quarter.upper() == "Q4" and matches_annual(title, year):
            matched = True

        if not matched:
            print(
                f"    idx={idx} ticker={ticker_text} SKIP no-match title={title[:60]!r}",
                file=sys.stderr,
            )
            continue

        if is_cover_letter_title(title):
            print(
                f"    idx={idx} SKIP cover-letter title={title[:60]!r}",
                file=sys.stderr,
            )
            continue

        # Rank: prefer consolidated
        is_cons = "hợp nhất" in report_type.lower() or "hợp nhất" in title.lower() or "hop nhat" in title.lower()
        rank = 0 if is_cons else 1
        candidates.append((rank, idx, title))
        print(
            f"    CANDIDATE rank={rank} idx={idx} type={report_type[:40]!r} title={title[:60]!r}",
            file=sys.stderr,
        )

    candidates.sort(key=lambda c: c[0])
    return candidates


def discover_from_ssc_curl(
    code: str,
    year: int,
    quarter: str,
) -> Optional[Dict[str, Any]]:
    """
    3-step stateful HTTP discovery on SSC NewsSearch — no Chromium/Playwright.

    Proven recipe from docs/vps-sources/ssc-bctc-newsearch/recon.md:
      Step 1: GET loopback → JSESSIONID + _afrLoop + Adf-Window-Id
      Step 2: GET ADF page → ViewState + form id
      Step 3a: POST PPR search → result table XML → parse rows
      Step 3b: POST full-form download → octet-stream PDF → save to cache

    exchange defaults to HOSE (pt9:soc3="1") when code is not in a known map;
    pass pt9:soc3="" to search all exchanges simultaneously (implementation detail #5).
    """
    code = code.upper()
    quarter = quarter.upper()

    # FIX-BCTC-EXCHANGE-CODE (2026-06-15): comment said "pass soc3='' for all exchanges"
    # but the code used _EXCHANGE_CODES.get("HOSE","1") = "1", filtering to HOSE only.
    # UPCOM tickers (ACV, VEA, VNH, etc.) were invisible because soc3=1 excludes them.
    # Fix: always use "" (all exchanges) — SSC handles dedup internally.
    exchange_code = ""  # search all exchanges: HOSE=1, HNX=0, UPCOM=2 are all included

    print(f"  [SSC-CURL] start code={code} {year} {quarter}", file=sys.stderr)

    opener = _ssc_make_opener()

    # ------------------------------------------------------------------
    # Step 1 — GET loopback → JSESSIONID + _afrLoop + Adf-Window-Id
    # ------------------------------------------------------------------
    try:
        body1_bytes = _ssc_get(opener, SSC_SEARCH_URL)
        body1 = body1_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"  [SSC-CURL] step1 GET error: {exc}", file=sys.stderr)
        return None

    jsessionid = _ssc_get_jsessionid(opener)
    if not jsessionid:
        print("  [SSC-CURL] no JSESSIONID after step1", file=sys.stderr)
        return None

    # FIX-BCTC-AFRLOOP-ROLLOVER (2026-06-15): SSC afrLoop counter rolled from
    # 26xxx to 27xxx on ~2026-06-15T12-16Z. Old regex r"(26\d{14,16})" only
    # matched values starting with "26" → fell through to hardcoded fallback
    # "26000000000000000" → step2 GET returned the JS loopback again (not ADF page)
    # → ViewState not found → all SSC searches returned 0 rows.
    # Fix: match any 15-18 digit decimal number (Oracle ADF counter is epoch-derived,
    # prefix is not stable). Also fix winId: parse from the runLoopback() positional
    # args (8th arg) rather than a loose string scan that mismatched other tokens.
    m_loop = re.search(r"(\d{15,18})", body1)
    afr_loop = m_loop.group(1) if m_loop else "27000000000000000"

    m_win = re.search(
        r"runLoopback\(\s+11,\s+'_afrLoop',\s+'(\d+)',\s+'_afrWindowMode',"
        r"\s+'Adf-Window-Id',\s+'_afrPage',\s+'',\s+'([^']+)'",
        body1,
    )
    win_id = m_win.group(2) if m_win else "w0"

    print(
        f"  [SSC-CURL] step1 OK jsessionid=...{jsessionid[-8:]} "
        f"afrLoop={afr_loop} winId={win_id}",
        file=sys.stderr,
    )

    # ------------------------------------------------------------------
    # Step 2 — GET ADF page → ViewState + form id
    # ------------------------------------------------------------------
    adf_url = (
        f"{SSC_SEARCH_URL};jsessionid={jsessionid}"
        f"?_afrLoop={afr_loop}&_afrWindowMode=2&Adf-Window-Id={win_id}"
    )
    try:
        body2_bytes = _ssc_get(opener, adf_url, extra_headers={"Referer": SSC_SEARCH_URL})
        body2 = body2_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"  [SSC-CURL] step2 GET error: {exc}", file=sys.stderr)
        return None

    m_vs = re.search(r'name="javax\.faces\.ViewState"\s+value="([^"]+)"', body2)
    vs = m_vs.group(1) if m_vs else ""
    m_form = re.search(r'name="org\.apache\.myfaces\.trinidad\.faces\.FORM"\s+value="([^"]+)"', body2)
    form_id = m_form.group(1) if m_form else "f1"

    if not vs:
        print("  [SSC-CURL] step2: ViewState not found in ADF page", file=sys.stderr)
        return None

    print(
        f"  [SSC-CURL] step2 OK vs={vs!r} form={form_id!r} "
        f"page_size={len(body2):,}B",
        file=sys.stderr,
    )

    # ------------------------------------------------------------------
    # Step 3a — PPR search POST → result table XML
    # ------------------------------------------------------------------
    search_data = {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": "pt9:b1",
        "javax.faces.partial.execute": "@all",
        "javax.faces.partial.render": "@all",
        "javax.faces.ViewState": vs,
        "org.apache.myfaces.trinidad.faces.FORM": form_id,
        "Adf-Window-Id": win_id,
        "pt9:it8112": code,
        "pt9:soc3": exchange_code,
    }
    try:
        search_bytes, _ = _ssc_post(opener, SSC_SEARCH_URL, search_data, ajax=True)
        search_body = search_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"  [SSC-CURL] step3a PPR POST error: {exc}", file=sys.stderr)
        return None

    print(
        f"  [SSC-CURL] step3a PPR response size={len(search_body):,}B",
        file=sys.stderr,
    )

    # Re-extract ViewState from PPR response (may be updated)
    m_vs2 = re.search(
        r'<update id="javax\.faces\.ViewState"[^>]*><!\[CDATA\[([^\]]+)\]\]>',
        search_body,
    )
    if m_vs2:
        vs = m_vs2.group(1).strip()
        print(f"  [SSC-CURL] ViewState updated from PPR: {vs!r}", file=sys.stderr)

    # Parse candidate rows
    candidates = _ssc_parse_rows(search_body, code, year, quarter)
    if not candidates:
        print(
            f"  [SSC-CURL] no matching rows for {code} {year} {quarter}",
            file=sys.stderr,
        )
        return None

    best_rank, best_dom_idx, best_title = candidates[0]
    print(
        f"  [SSC-CURL] best row: rank={best_rank} dom_idx={best_dom_idx} title={best_title[:80]!r}",
        file=sys.stderr,
    )

    # ------------------------------------------------------------------
    # Step 3b — Full form POST download (NOT PPR — omit Faces-Request header)
    # ------------------------------------------------------------------
    dl_source = f"pt9:t1:{best_dom_idx}:cil4z"
    download_data = {
        "javax.faces.source": dl_source,
        dl_source: dl_source,
        "javax.faces.ViewState": vs,
        "org.apache.myfaces.trinidad.faces.FORM": form_id,
        "Adf-Window-Id": win_id,
        "pt9:it8112": code,
        "pt9:soc3": exchange_code,
    }
    try:
        pdf_bytes, dl_headers = _ssc_post(
            opener, SSC_SEARCH_URL, download_data, ajax=False, timeout=60
        )
    except Exception as exc:
        print(f"  [SSC-CURL] step3b download POST error: {exc}", file=sys.stderr)
        return None

    print(
        f"  [SSC-CURL] download response size={len(pdf_bytes):,}B "
        f"content-type={dl_headers.get('content-type', '?')}",
        file=sys.stderr,
    )

    # Validate PDF magic bytes
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        print(
            f"  [SSC-CURL] download not a PDF (magic={pdf_bytes[:8]!r}) — likely no file",
            file=sys.stderr,
        )
        return None

    # Extract filename from Content-Disposition header
    raw_filename = ""
    cd = dl_headers.get("content-disposition", "")
    m_cd = re.search(r"filename\*=utf-8''([^\s;]+)", cd, re.IGNORECASE)
    if m_cd:
        raw_filename = urllib.parse.unquote(m_cd.group(1))
    else:
        m_cd2 = re.search(r'filename="?([^";]+)"?', cd, re.IGNORECASE)
        if m_cd2:
            raw_filename = m_cd2.group(1).strip()
    if not raw_filename:
        raw_filename = f"{code}-bctc-{quarter}-{year}.pdf"

    safe_filename = _sanitise_filename(raw_filename)
    if not safe_filename.lower().endswith(".pdf"):
        safe_filename += ".pdf"

    # Save to cache directory
    cache_dir = os.path.join(_BCTC_CACHE_DIR, code.upper())
    os.makedirs(cache_dir, exist_ok=True)
    dest_path = os.path.join(cache_dir, safe_filename)
    try:
        with open(dest_path, "wb") as f:
            f.write(pdf_bytes)
    except OSError as exc:
        print(f"  [SSC-CURL] save error: {exc}", file=sys.stderr)
        return None

    file_size = os.path.getsize(dest_path)
    print(
        f"  [SSC-CURL] saved {safe_filename} ({file_size:,} bytes) → {dest_path}",
        file=sys.stderr,
    )

    if file_size < 1_000:
        print(f"  [SSC-CURL] file too small — likely error page", file=sys.stderr)
        try:
            os.remove(dest_path)
        except OSError:
            pass
        return None

    proxy_url = (
        f"{_VPS_PROXY_BCTC_BASE}"
        f"/{urllib.parse.quote(code.upper())}"
        f"/{urllib.parse.quote(safe_filename)}"
    )
    return {
        "url": proxy_url,
        "source": "SSC-NewsSearch",
        "confidence": 0.92,
        "page_title": raw_filename,
        "local_path": dest_path,
    }


def discover_from_hose_ssc(code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Discover BCTC PDF for HOSE-listed stocks via SSC NewsSearch portal.

    Uses stateful plain HTTP (urllib + cookie jar, no Chromium/Playwright).
    3-step Oracle ADF handshake: loopback GET → ADF page GET → PPR search → download POST.
    Proven recipe from docs/vps-sources/ssc-bctc-newsearch/recon.md.

    FIX-VPS-SSC-CURL-SCRAPER: replaces the Playwright path (pthread_create EAGAIN crash).
    """
    try:
        return discover_from_ssc_curl(code, year, quarter)
    except Exception as exc:
        print(f"  [HOSE-SSC] error: {exc}", file=sys.stderr)
        return None


def discover_from_ssc(code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Generic SSC fallback for any exchange listing.

    FIX-VPS-SSC-CURL-SCRAPER: now uses plain HTTP curl-based implementation.
    Kept for backward compatibility — delegates to discover_from_ssc_curl.
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
      3. SSC NewsSearch via stateful plain HTTP (FIX-VPS-SSC-CURL-SCRAPER) —
         downloads PDF to VPS cache, returns stable proxy URL
         (http://<VPS_IP>:8765/bctc-files/<CODE>/<filename>).
         Covers HOSE-listed stocks and any HNX/UPCOM not found via POST API.
         No Chromium / Playwright — uses urllib cookie jar + 3-step ADF handshake.

    FIX-VPS-SSC-CURL-SCRAPER:
      SanGiaoDiv.xhtml (old HOSE-SSC filter endpoint) removed — was HTTP 404.
      SSC NewsSearch curl path replaces Playwright (pthread_create EAGAIN crash fix).
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

    # 3. SSC NewsSearch via stateful plain HTTP (no Playwright).
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
