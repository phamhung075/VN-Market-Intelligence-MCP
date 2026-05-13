# Technique — hnx-ajax-post

**Problem:** HNX disclosure portal (hnx.vn) serves BCTC article lists via a POST-based AJAX endpoint with non-standard SSL (self-signed/untrusted CA). The endpoint is not a public JSON API — it returns HTML fragment containing article rows and file-attach IDs. A second POST to `ArticlesFileAttach` retrieves the actual PDF URL.
**Anti-bot type:** none (endpoint is open; the complexity is SSL + HTML parsing, not anti-bot)
**Date documented:** 2026-05-13
**Last updated:** 2026-05-13 (contract fix — Referer /vi-vn/ prefix + pNhomTin empty + ticker slug fix)

## Solution Approach

Use Python `urllib.request` with a custom SSL context (`ctx.verify_mode = ssl.CERT_NONE`, `ctx.check_hostname = False`) to bypass HNX's untrusted CA. Send a form-encoded POST with `pAction=1` and `pNhomTin=""` (empty string — the `'FIN_REPORT'` wrapper is no longer required). Include `X-Requested-With: XMLHttpRequest` and `Referer: https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html` (the `/vi-vn/` language prefix is required — server 302s without it as of 2026-05-13). Parse the returned HTML fragment with regex to extract `funcShowFileAttach(articleId)` and article titles. Match titles against target quarter/year using Vietnamese text patterns (`quý N/YYYY`, `Q{N}/{Y}`). Make a second POST to `ArticlesFileAttach` to resolve the PDF URL from `owa.hnx.vn`.

**Homepage fallback detection:** The server silently returns full homepage HTML (~40 KB, `<title>Trang chủ</title>`) when POST params are wrong. The scraper detects this condition (`len(body) > 30_000 AND "Trang chủ" in body`) and raises `RuntimeError` with a clear message instead of silently storing junk.

## Critical Parameters

- `pAction=0` — page navigation (browse all, unfiltered)
- `pAction=1` — filtered search (ticker + date range). Required when `pMaChungKhoan` is set.
- `pNhomTin=""` — empty string (2026-05-13: `'FIN_REPORT'` wrapper no longer required or recognised)
- `pMaChungKhoan=<CODE>` — ticker, uppercase
- `pFromDate`/`pToDate` — DD/MM/YYYY format. Q1 window: `01/04/YYYY` to `30/06/YYYY`. Empty = unfiltered.
- `pNumRecord=20` — results per page (max observed: 50)
- Pagination: `pNumPage=1` is newest records. Sorted newest-first.

## Ticker Slug Matching

The SYMBOL href in the response is `chi-tiet-chung-khoan-ny-<slug>.html` where `<slug>` is the ticker **plus a numeric listing suffix** (e.g. `shb125017`, not just `shb`). The scraper must check `slug.startswith(ticker.lower())`, not `slug == ticker.lower()`.

## Scope Limitation

This endpoint only serves **HNX-listed (NY)** and **UPCOM** tickers:

| Endpoint | Label | Referer (2026-05-13+) |
|----------|-------|---------|
| `/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH` | HNX NY | `https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html` |
| `/ModuleArticles/ArticlesCPEtfs/NextPageTCPHUpCoM` | UPCOM | `https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html` |

HOSE-listed tickers (VNM, MWG, BID, VCB, HPG, FPT, etc.) return `Không tìm thấy dữ liệu` — they are NOT on HNX/UPCOM. These require the SSC portal path.

## Libraries Required

- `urllib.request` (stdlib)
- `ssl` (stdlib)
- `re`, `html` (stdlib) for HTML parsing

## Code Snippet

```python
import ssl, urllib.request, urllib.parse, re, html as html_lib

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE  # HNX uses untrusted CA

_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,*/*",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://hnx.vn",
    "Referer": "https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html",  # /vi-vn/ prefix required
}

HNX_NY_ENDPOINT = "https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH"
HNX_FILE_ENDPOINT = "https://hnx.vn/ModuleArticles/ArticlesCPEtfs/ArticlesFileAttach"

def _post(url: str, data: dict, referer: str, timeout: int = 15) -> str:
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=encoded, headers={
        **_BROWSER_HEADERS, "Referer": referer
    })
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as r:
        return r.read().decode("utf-8", errors="replace")

def fetch_hnx_bctc(code: str, year: int, quarter: str) -> dict | None:
    """
    Fetch BCTC PDF URL for an HNX-listed ticker.
    Returns {"url": "https://owa.hnx.vn/ftp/...", "source": "HNX"} or None.
    """
    # Q1 window: filed Apr-Jun same year
    from_date = f"01/04/{year}" if quarter == "Q1" else ""
    to_date = f"30/06/{year}" if quarter == "Q1" else ""
    # (add other quarters analogously)

    html = _post(HNX_NY_ENDPOINT, {
        "pNumPage": "1",
        "pAction": "1",
        "pNhomTin": "",            # 2026-05-13: empty (FIN_REPORT wrapper removed)
        "pTieuDeTin": "",
        "pMaChungKhoan": code.upper(),
        "pFromDate": from_date,
        "pToDate": to_date,
        "pOrderBy": "",
        "pNumRecord": "20",
    }, referer="https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html")

    if "Không tìm thấy" in html or "funcShowFileAttach" not in html:
        return None  # ticker not on HNX, or no results in window

    # Extract article ID and title
    row_re = re.compile(
        r"chi-tiet-chung-khoan-(?:ny|up)-([a-z0-9]+)\.html"
        r".*?funcShowFileAttach\((\d+)"
        r".*?hrefViewDetail[^>]+>(.*?)</a",
        re.DOTALL | re.IGNORECASE,
    )
    q_num = quarter[-1]  # "Q1" -> "1"
    for m in row_re.finditer(html):
        row_code = m.group(1).lower()
        article_id = int(m.group(2))
        title = html_lib.unescape(m.group(3)).strip().lower()
        if row_code != code.lower():
            continue
        if str(year) in title and (f"quý {q_num}" in title or f"q{q_num}" in title or f"{q_num}/{year}" in title):
            # Resolve PDF URL
            attach_html = _post(HNX_FILE_ENDPOINT, {"pArticlesID": str(article_id)},
                                referer="https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html")
            pdf_m = re.search(r'href="(https?://[^"]+\.pdf[^"]*)"', attach_html, re.IGNORECASE)
            if pdf_m:
                return {"url": pdf_m.group(1), "source": "HNX"}
    return None
```

## Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| RuntimeError "Homepage fallback detected" | POST params wrong or missing | Check pAction, pNhomTin, Referer header |
| Returns homepage HTML (~40 KB, `<title>Trang chủ</title>`) | Silent fallback — wrong params without guard | Scraper now detects this and raises; see homepage detection above |
| Returns 1831-byte scaffold with empty `<tbody>` | Filter returns 0 results | Ticker is HOSE-listed or wrong date window |
| `ssl.SSLCertVerificationError` | HNX self-signed cert | Use `ctx.verify_mode = ssl.CERT_NONE` |
| `Không tìm thấy dữ liệu` | Ticker not on this exchange OR filing not yet published | Try UPCOM endpoint, or wait |
| Ticker matched but row skipped | Slug is `ticker+listingcode` (e.g. `shb125017`) | Use `slug.startswith(ticker)` not `slug == ticker` |
| 302 redirect on Referer | Missing `/vi-vn/` language prefix in Referer header | Use `https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html` |

## Known Limits

- HOSE-listed tickers will always return empty — route them to SSC (currently broken — see `hsx-bctc` triage).
- SSL bypass (`CERT_NONE`) is permanently required — HNX certificate chain has not been updated to a trusted CA as of 2026-05-13.
- `pNhomTin` must be empty string (not `'FIN_REPORT'`) as of 2026-05-13 contract update.
- Referer must use `/vi-vn/` language prefix — server 302s without it (added 2026-05-13).
- Ticker slugs in response contain listing suffix (`shb125017`) — match with `startswith`, not equality.
- Date window server-side filtering works. Empty dates returns all records for ticker sorted newest-first.
- Pagination is newest-first on page 1. Large result sets need multi-page iteration.

## Sources Served

- `hsx-bctc` (HNX-listed and UPCOM-listed tickers only)

## References

- [HNX disclosure portal live probe 2026-05-13](ssh root@125.212.251.27)
- [hsx-bctc recon doc](docs/vps-sources/hsx-bctc/recon.md)
- [discover-bctc-urls-browser.py](ssh root@125.212.251.27:/root/discover-bctc-urls-browser.py)
- [Scraping legacy ASP.Net sites — Trickster Dev](https://www.trickster.dev/post/scraping-legacy-asp-net-site-with-scrapy-a-real-example/)
