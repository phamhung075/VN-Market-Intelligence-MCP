# Recon — hsx-bctc

**Date:** 2026-05-13 09:17 UTC
**Agent:** ops-vps-fetch
**Source URL (primary):** `https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH` (POST)
**Source URL (secondary — file attachment):** `https://hnx.vn/ModuleArticles/ArticlesCPEtfs/ArticlesFileAttach` (POST)
**Source URL (HSX side):** `https://www.hsx.vn/Modules/Listed/Web/StockDocuments` (GET, SPA shell — unchanged)
**Trigger:** fetch_broken (re-recon 2026-05-13 — HNX endpoint contract broken)

---

## Contract Change 2026-05-13

### Root Cause

The previous scraper called the CBTCPH endpoint with old-style params `pageIndex` + `pageSize`. The endpoint **silently ignores unknown parameters and returns the full homepage HTML** (40,545 bytes, `<title>Trang chủ</title>`) instead of an error. The correct params are a different set entirely: `pNumPage`, `pAction`, `pNhomTin`, `pTieuDeTin`, `pMaChungKhoan`, `pFromDate`, `pToDate`, `pOrderBy`, `pNumRecord`.

### What Changed

| Dimension | Old (broken) | New (working) |
|-----------|-------------|---------------|
| Landing page URL | `https://hnx.vn/thong-tin-cong-bo-ny-tcph.html` | `https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html` (302 redirect added — language prefix) |
| POST endpoint | unchanged: `/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH` | same |
| POST params | `pageIndex=1&pageSize=10` | `pNumPage=1&pAction=0&pNhomTin=&pTieuDeTin=&pMaChungKhoan=&pFromDate=&pToDate=&pOrderBy=&pNumRecord=20` |
| Referer header | `https://hnx.vn/thong-tin-cong-bo-ny-tcph.html` | `https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html` |
| Response on wrong params | 200 + homepage (40,545 bytes) | same (still fails silently) |
| Response on correct params | N/A | 200 + HTML fragment (17–32KB) with `<table id="_tableDatas">` |

### Why It Broke

The original params (`pageIndex`/`pageSize`) appear to have been from an older API version or a different endpoint variant. The current JavaScript on the page uses a completely different param naming scheme (`pNumPage`, `pAction`, etc.) defined in `SearchAndNextTinNiemYet()` and `TCPHOnload()`. The server returns the homepage as a fallback when no valid action is recognised — not a structured error.

---

## Working Request Recipe

### Step 1 — CBTCPH Listing (returns HTML fragment with article IDs)

```python
import ssl, urllib.request, urllib.parse

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE  # HNX uses self-signed / untrusted CA chain

# Unfiltered (all recent HNX BCTC filings)
data = urllib.parse.urlencode({
    'pNumPage':       '1',
    'pAction':        '0',    # 0 = page navigation; 1 = filtered search
    'pNhomTin':       '',     # category filter — leave empty for all BCTC
    'pTieuDeTin':     '',     # title keyword filter
    'pMaChungKhoan':  '',     # ticker filter (uppercase, e.g. 'SHB')
    'pFromDate':      '',     # dd/MM/yyyy format, e.g. '01/01/2026'
    'pToDate':        '',     # dd/MM/yyyy format
    'pOrderBy':       '',
    'pNumRecord':     '20',
}).encode()

req = urllib.request.Request(
    'https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH',
    data=data,
    headers={
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer':         'https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html',
        'Content-Type':    'application/x-www-form-urlencoded',
        'X-Requested-With':'XMLHttpRequest',
        'Origin':          'https://hnx.vn',
        'Accept':          '*/*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    }
)
with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
    body = r.read().decode('utf-8', errors='replace')
```

**Per-ticker + date-range search** (pAction must be 1):

```python
data = urllib.parse.urlencode({
    'pNumPage':       '1',
    'pAction':        '1',    # 1 = filtered search
    'pNhomTin':       '',
    'pTieuDeTin':     '',
    'pMaChungKhoan':  'SHB',              # uppercase ticker
    'pFromDate':      '01/01/2026',       # dd/MM/yyyy
    'pToDate':        '13/05/2026',
    'pOrderBy':       '',
    'pNumRecord':     '20',
}).encode()
```

### Step 2 — Retrieve PDF links for an article (ArticlesFileAttach)

```python
data = urllib.parse.urlencode({'pArticlesID': '615286'}).encode()

req = urllib.request.Request(
    'https://hnx.vn/ModuleArticles/ArticlesCPEtfs/ArticlesFileAttach',
    data=data,
    headers={
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer':         'https://hnx.vn/vi-vn/thong-tin-cong-bo-ny-tcph.html',
        'Content-Type':    'application/x-www-form-urlencoded',
        'X-Requested-With':'XMLHttpRequest',
        'Origin':          'https://hnx.vn',
        'Accept':          '*/*',
    }
)
with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
    body = r.read().decode('utf-8', errors='replace')
# Parse: <a href="https://owa.hnx.vn/ftp/...pdf" ...>
```

### HSX StockDocuments (still SPA shell — no change)

```bash
curl -sk \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' \
  -H 'Accept: text/html,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9' \
  -H 'Referer: https://www.hsx.vn/' \
  -L \
  "https://www.hsx.vn/Modules/Listed/Web/StockDocuments?pageFieldValue=VNM&pageFieldName=Ticker&pageIndex=1&pageSize=10&locale=vi-VN"
```

---

## HTTP Probe Results

### HNX AJAX — New Working Params

- **Status:** 200 OK
- **Final URL:** `https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH` (no redirect on POST)
- **Response size:** ~17–32KB (HTML fragment)
- **Content-Type:** text/html (inferred — no explicit header on fragment)
- **Redirect chain:** Landing page 302 → `/vi-vn/thong-tin-cong-bo-ny-tcph.html` (language cookie prefix added by server). POST endpoint itself does NOT redirect.
- **SSL:** Certificate validation fails with curl (`unable to get local issuer certificate`). Python `urllib` with `ssl.CERT_NONE` works.
- **Session cookie:** `616a3745ee32423b8ef6bed543a12282` set on landing page. Not required for AJAX calls — tested without and works.

### HNX AJAX — Old Broken Params (reproduced)

- **Status:** 200 OK (misleading)
- **Response size:** 40,545 bytes
- **Body:** Full homepage HTML (`<title>Trang chủ</title>`)
- **Conclusion:** Server silently falls back to homepage when POST params are not recognised. No error code, no error body.

### ArticlesFileAttach

- **Status:** 200 OK
- **Response size:** ~1–2KB per article
- **Body:** HTML fragment with `<div class="divFileAttach"><p><a href="https://owa.hnx.vn/ftp/...pdf">...</a></p>`
- **Q1/2026 confirmed:** Article 615286 (CAN) returns 4 PDFs including `BaoCaoTaiChinhHopNhat_Q1_2026_signed.pdf`

### HSX StockDocuments (GET)

- **Status:** 200 OK (unchanged)
- **Response size:** 1,900 bytes
- **Body:** React SPA shell — no inline data. Data loaded client-side via XHR after init.
- **Set-Cookie:** `TS016df111` + `TS0d710d04` (F5 BigIP load balancer fingerprint cookies)
- **Status:** Still requires browser or session replication — no change since last recon.

---

## Anti-Bot Assessment

- **Type:** none (HNX) + none (HSX) — the previous failure was a **param contract mismatch**, not an anti-bot measure.
- **Evidence:**
  - No `cf-ray`, no `__cf_bm`, no JS challenge in any response.
  - HNX returns homepage silently when params are wrong — pure server-side routing behaviour.
  - HSX F5 BigIP cookies are load-balancer session affinity, not bot detection in practice (requests without cookies still return 200).
- **Recommendation:** Update scraper to use correct `p*` params. No bypass technique needed.

---

## Page Structure

### HNX CBTCPH Fragment — Table Row

```
table#_tableDatas
  thead > tr > th.STT | th.PUBLICTIME | th.SYMBOL | th.ISSUERNAME | th.TITLE | th.FILEATTACH
  tbody > tr
    td.STT              → row number
    td.tdCenterAlign    → date string "DD/MM/YYYY HH:MM"
    td.SYMBOL > a       → href="/cophieu-etfs/chi-tiet-chung-khoan-ny-<slug>.html", text = ticker
    td.ISSUERNAME > a   → company name (Vietnamese)
    td.TITLE > a.hrefViewDetail  → onclick="funcViewDetailArticlesByID(<ID>,1)" → article title
    td.clssFileAttath > a.icon-FileAttach → onclick="funcShowFileAttach(<ID>,1)" → triggers PDF popup
```

**Article ID extraction:**
```python
import re
ids = re.findall(r'funcShowFileAttach\((\d+),1\)', body)
```

### ArticlesFileAttach Response — PDF links

```
div.divFileAttach
  p > a[href="https://owa.hnx.vn/ftp///cims/<YEAR>/<WEEK>/000000<ID>_<LANG>_<TYPE>_<PERIOD>_signed.pdf"]
```

**PDF URL pattern:** `https://owa.hnx.vn/ftp///cims/2026/5_W3/000000016291275_En_ExplainationRelatingToFSs_Q1_2026_signed.pdf`
- `LANG`: `Vi` or `En`
- `TYPE`: `BaoCaoTaiChinhHopNhat`, `BaoCaoTaiChinhRiengLe`, `GiaiTrinhLienQuanBCTC`, `ExplainationRelatingToFSs`, `FinancialStatementsConsolidated`, etc.
- Period: `Q1_2026`, `Q2_2026`, etc. (embedded in filename)

**PDF link extraction:**
```python
pdf_urls = re.findall(r'href="(https://owa\.hnx\.vn/ftp/[^"]+\.pdf)"', body)
```

---

## Sample Response Excerpt

### CBTCPH listing fragment (first 500 chars):

```html
<input id="idCheckLoadTinTCPH" type="hidden"/>
<div class="_divShowHideOnReport">
  <div class="divDisplayNumberRecordOnPage">
    <select id="divNumberRecordOnPageTCPH" onchange="ChangeRecordOnpage()">
      <option value="10">10</option>
      <option selected="selected" value="20">20</option>
```

### ArticlesFileAttach response (article 615286, CAN, Q1/2026):

```html
<div class="divFileAttach">
  <p><a href="https://owa.hnx.vn/ftp///cims/2026/5_W3/000000016291275_En_ExplainationRelatingToFSs_Q1_2026_signed.pdf" title="Tải về" download="true" target="_blank">1.CAN_2026.5.13_0151e46_En_ExplainationRelatingToFSs_Q1_2026_signed.pdf</a></p>
  <p><a href="https://owa.hnx.vn/ftp///cims/2026/5_W3/000000016290260_Vi_GiaiTrinhLienQuanBCTC_Q1_2026_signed.pdf" ...>2.CAN_2026.5.13_...pdf</a></p>
  <p><a href="https://owa.hnx.vn/ftp///cims/2026/4_W5/000000016290252_Vi_BaoCaoTaiChinhHopNhat_Q1_2026_signed.pdf" ...>3.CAN_2026.5.13_...pdf</a></p>
  <p><a href="https://owa.hnx.vn/ftp///cims/2026/4_W5/000000016291274_En_FinancialStatementsConsolidated_Q1_2026_signed.pdf" ...>4.CAN_2026.5.13_...pdf</a></p>
</div>
```

---

## Notes

- **Technique classification:** `hnx-ajax-post` still applies — same endpoint, same request type. Only param names changed.
- **Parameter `pAction`:** Must be `0` for page navigation (browse all), `1` for filtered search. Sending `pAction=1` with all filters empty returns an empty result set on some requests — always pass `pAction=0` for unfiltered browsing.
- **No session/CSRF required:** Both endpoints accept POST without a pre-fetched session cookie or CSRF token. The landing page sets a session cookie but it is not validated server-side for AJAX calls.
- **Date format:** `dd/MM/yyyy` — must include slashes, not dashes. Vietnamese locale format.
- **Ticker filter:** `pMaChungKhoan` must be uppercase. Only returns results for HNX/UPCOM listed tickers — HOSE tickers return empty.
- **SSL:** Always use `ssl.CERT_NONE` — HNX TLS chain fails standard verification on the VPS (curl `-k` or Python urllib with custom ctx).
- **HSX side unchanged:** Still SPA, still no direct data via curl. Playwright/session replication still needed for HOSE tickers.
- **Q1/2026 BCTC confirmed available:** Article 615286 (CAN, 2026-05-13) contains `BaoCaoTaiChinhHopNhat_Q1_2026_signed.pdf` — pipeline can resume immediately once params are fixed.
