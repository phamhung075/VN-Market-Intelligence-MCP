# Recon — hsx-bctc

**Date:** 2026-05-13 04:44 UTC
**Agent:** ops-vps-fetch
**Source URL (primary):** `https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH` (POST)
**Source URL (secondary):** `https://www.hsx.vn/Modules/Listed/Web/StockDocuments` (GET, SSC Playwright fallback)
**Trigger:** new_source_needed (bootstrap inventory)

## Working Request Recipe

### HNX AJAX POST (currently broken — see issue below)

```python
import ssl, urllib.request, urllib.parse
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE  # HNX uses self-signed / untrusted CA

data = urllib.parse.urlencode({'pageIndex': '1', 'pageSize': '10'}).encode()
req = urllib.request.Request(
    'https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinCPNY_CBTCPH',
    data=data,
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://hnx.vn/thong-tin-cong-bo-ny-tcph.html',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://hnx.vn',
    }
)
with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
    body = r.read().decode('utf-8', errors='replace')
```

### HSX StockDocuments (currently working, returns SPA shell)

```bash
curl -s -k \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' \
  -H 'Accept: text/html,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9' \
  -H 'Referer: https://www.hsx.vn/' \
  -L \
  "https://www.hsx.vn/Modules/Listed/Web/StockDocuments?pageFieldValue=VNM&pageFieldName=Ticker&pageIndex=1&pageSize=10&locale=vi-VN"
```

## HTTP Probe Results

### HNX AJAX POST endpoint

- **Status:** 200 (HTTP level) but returns **homepage HTML** (~40KB) instead of article fragment
- **Expected response:** HTML fragment with article rows containing PDF links to `owa.hnx.vn/ftp/*.pdf`
- **Actual response:** Full homepage (`<title>Trang chủ</title>`, 40,545 bytes)
- **Redirect chain:** None (direct 200 with wrong content)
- **SSL:** Certificate validation fails with curl (`unable to get local issuer certificate`). Python `urllib` works with `ctx.verify_mode = ssl.CERT_NONE`.
- **Conclusion:** HNX AJAX endpoint has been restructured — POST to `NextPageTinCPNY_CBTCPH` now silently returns the homepage instead of the BCTC article list fragment.

### HSX StockDocuments (GET)

- **Status:** 200 OK
- **Content-Type:** text/html
- **Response time:** 226ms
- **Server:** (IIS, no explicit header)
- **Set-Cookie:** Two `TS016df111` and `TS0d710d04` cookies (F5 BigIP load balancer fingerprinting)
- **Body:** React SPA shell — data is loaded client-side. No inline article data. curl alone cannot extract document URLs.

### SSC Playwright fallback

- **Status:** FAILING — `BrowserType.launch: Target page, context or browser has been closed`
- **Root cause:** `pthread_create: Resource temporarily unavailable (11)` — VPS thread limit (`TasksMax=32` in systemd) is being hit when Playwright/Chromium tries to spawn threads. The headless Chromium process is killed by SIGTRAP immediately after launch.
- **Frequency:** Every cycle where HNX POST returns no results (which is now every cycle for newer tickers).

## Anti-Bot Assessment

- **Type:** page_restructure (HNX) + resource_constraint (Playwright/SSC)
- **Evidence:**
  - HNX: `NextPageTinCPNY_CBTCPH` POST returns homepage HTML — endpoint contract broken. No anti-bot signals (no CF headers, no captcha). This is a server-side routing change on hnx.vn.
  - SSC/Playwright: `pthread_create` error is a VPS resource limit, not an anti-bot measure. Chromium cannot spawn enough threads on the constrained VPS (16-task systemd limit inherited by `vn-bctc-fetch.service`).
- **Recommendation:**
  - HNX: Re-inspect `hnx.vn/thong-tin-cong-bo-ny-tcph.html` to find current AJAX endpoint (may have been renamed or moved to a different route). Check XHR calls in browser DevTools on that page.
  - Playwright/SSC: Either increase `TasksMax` for `vn-bctc-fetch.service` (requires ops) OR replace Playwright with `requests` + session-cookie approach for SSC. See `docs/vps-crawl-techniques/` for alternatives.

## Page Structure

### HNX (when endpoint was working — expected structure per discover script comments)

```
<div class="..."> 
  <a href="https://owa.hnx.vn/ftp/...BCTC...pdf">report title</a>
  <span>VNM</span> <span>2024</span> <span>Q4</span>
```

- PDF URLs pattern: `https://owa.hnx.vn/ftp/<PATH>/<FILENAME>.pdf`
- Article IDs extracted via `ArticlesFileAttach` sub-endpoint for multi-attachment items

### HSX StockDocuments (SPA — no server-side DOM)

- Data loaded via client-side XHR after page init
- Cannot extract with curl alone; requires browser or session replication

## Sample Response Excerpt

HNX POST (current broken state — homepage returned):
```html
<!DOCTYPE html>
<html>
<script>
    var _languagecodeInPortal = 'VI_VN';
    ...
</script>
<head>
    <title>Trang chủ</title>
    ...
```

HSX GET (SPA shell):
```html
<!doctype html><html lang="vi"><head><meta charset="utf-8"/>
<meta name="theme-color" content="#000000"/>
<meta name="description" content="HOSE - Sở Giao dịch Chứng khoán Thành phố Hồ Chí Minh"/>
<title>HOSE - ...</title>
```

## Notes

- **Active service log confirms failure**: `MWG Q1/2026: SKIP -- no PDF found. HNX/UPCOM POST API returned no match. SSC NewsSearch Playwright: either not found or download failed.` (2026-05-13 03:24 UTC)
- The BCTC service is currently not acquiring Q1/2026 reports for HOSE-listed tickers (those on UPCOM/HNX subsets may also be failing).
- bctc-cache directories were last updated for most tickers on 2026-05-13 04:23 — but these appear to be empty directories (created by the loop script) with no PDFs inside.
- The VPS proxy (port 8765) is healthy and would serve any PDFs that do get cached.
- `discover-bctc-urls-browser.py` has three tiers: HNX POST, UPCOM POST, SSC Playwright. All three are currently failing for at least some tickers.
- **This source requires immediate dev-vps-crawls attention** — no Q1/2026 BCTC PDFs are being acquired.
