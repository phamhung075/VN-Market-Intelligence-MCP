---
source_name: vmt-customs-probe
sprint: VN-MACRO-TOOLING
probe: PROBE-1
recon_date: 2026-06-14
verdict: BLOCKED_JS_RENDER
unblocks: VMT-1b.bloc_split (FALLBACK — use NSO FDI sheet)
---

# Recon: Vietnam Customs (customs.gov.vn) — Trade Stats + Enterprise-Type Breakdown

## Source URL
`https://www.customs.gov.vn/`

## Working Request Recipe
```bash
curl -s --cacert /etc/ssl/certs/ca-certificates.crt -L \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
  -H "Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7" \
  -w '\nHTTP:%{http_code}\nFINAL:%{url_effective}' \
  "https://www.customs.gov.vn/"
```
Result: HTTP 200, ~12KB shell page.

## HTTP Probe Results
- HTTP status: 200
- Final URL: `https://www.customs.gov.vn/`
- Server: Apache Tomcat/8.0.32 (JSP)
- TLS: Valid, system cacert works
- Anti-bot: None detected (no Cloudflare, no captcha)
- Content: SPA shell — `<div id="main"></div>` (empty, JS-populated)

## Anti-Bot Assessment
**Type:** None (open access, no bot detection)
**Blocker:** JavaScript-rendered SPA. All content loaded via internal bridge proxy API.

## Page Structure

The site is a Java/JSP single-page application:
1. Shell page returned by curl (empty `<div id="main">`)
2. JS calls `bridge?url=<main_new>/api/GetListPage` with `site=tongcuc.customs.gov.vn`
3. `main_new` is a server-side JSP variable — not exposed in HTML
4. Backend `tongcuc.customs.gov.vn` is NOT DNS-resolvable externally (internal network only)

Bridge API test:
```bash
curl "https://www.customs.gov.vn/bridge?url=/api/GetListPage"
# → {"errorMessage":"Du lieu truy cap khong hop le!"}  (HTTP 400)
```

**Enterprise-type breakdown (FDI vs domestic) NOT found** as machine-readable endpoint.

## Sample Response Excerpt (500 chars)
```html
<!DOCTYPE html><html lang="vi"><head>
<title>Tổng cục Hải Quan Việt Nam</title>
...
<div id="main"></div>
<script>
  var getListPageUrl = 'bridge?url=' + main_new + '/api/GetListPage';
  shellService.ExecuteGetAction(getListPageUrl, {site: siteName})
  ...
</script>
```

## Verdict & Fallback Decision

**BLOCKED_JS_RENDER** — The enterprise-type breakdown (FDI vs domestic bloc) is NOT accessible via curl/httpx from the VPS. The Customs portal requires a browser session with JS execution to render content.

**Fallback for VMT-1b.bloc_split:**
Use NSO/GSO monthly Excel report (`nso.gov.vn`) sheet `12.FDI` which publishes FDI registered + disbursed capital by province and total. This provides the FDI bloc split at the national level.
- NSO FDI data URL: `https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx` (sheet 12.FDI)
- NSO publishes: total FDI registered (M USD), disbursed (M USD), project count
- Cross-reference with total export value from Customs press releases (also on NSO press release page) to derive FDI-bloc share estimate.

**Architect decision required:** Confirm fallback strategy (NSO FDI cross-join) for `bloc_split` before dev implements.

## Files
- Script: `scripts/probes/vmt-probe-1.sh`
- Sample: `scripts/probes/vmt-1-sample.json`
