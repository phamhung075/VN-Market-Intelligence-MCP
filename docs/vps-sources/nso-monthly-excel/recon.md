---
<!-- size-justification: ~120L — mandatory recon schema fields; root-cause diagnosis + new regex + CA recipe are all load-bearing for dev-macro-indicators -->
source: nso-monthly-excel
task_id: F-NSO-SELECTOR
recon_date: 2026-06-15
agent: ops-vps-fetch
status: PASS — full 3-step chain verified live
---

# Recon — NSO Monthly Excel (F-NSO-SELECTOR)

## Source URL (Step 1 — Index Page)

```
https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/
```

## Root Cause

The old regex in `cache_vmt_nso.go`:

```go
var reBaiTop = regexp.MustCompile(`href="(/bai-top/\d{4}/\d{2}/[^"]+)"`)
```

matched **relative** paths (starting with `/`). The NSO WordPress theme changed all article links to **absolute** URLs (`https://www.nso.gov.vn/bai-top/…`). The HTML now emits:

```html
<p><a href="https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/"></p>
```

The old pattern expects a bare `/bai-top/…` capture group — it returns zero matches against absolute URLs, so `extractLatestPressURL` errors, the 3-step chain aborts, `is_estimate=true` + `blocked_reason="NSO bai-top selector stale"` is returned.

## TLS Issue (Secondary — Also Broken)

The VPS's `/tmp/combined_ca.pem` does **not** include the GlobalSign RSA OV SSL CA 2018 **intermediate**. The server only sends its leaf cert (not the chain). Result: curl exits 60 (TLS verify fail) even before reaching the regex.

### Working CA bundle recipe

```bash
# On VPS — run once (or on each deploy if /tmp is wiped):
curl -s -o /tmp/globalsign_intermediate.crt \
  'http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt'
openssl x509 -in /tmp/globalsign_intermediate.crt -inform DER \
  -out /tmp/globalsign_intermediate.pem
cat /etc/ssl/certs/ca-certificates.crt /tmp/globalsign_intermediate.pem \
  > /tmp/nso_ca_bundle.pem
```

Use `--cacert /tmp/nso_ca_bundle.pem` for all nso.gov.vn requests. NEVER `-k`.

Intermediate cert info confirmed:
```
subject=C = BE, O = GlobalSign nv-sa, CN = GlobalSign RSA OV SSL CA 2018
issuer=OU = GlobalSign Root CA - R3, O = GlobalSign, CN = GlobalSign
```

## Working Request Recipe (all 3 steps)

```bash
# Step 1 — Index page
curl -s -o /tmp/nso-index.html -D /tmp/nso-headers.txt \
  --cacert /tmp/nso_ca_bundle.pem \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' \
  -H 'Accept-Encoding: identity' \
  -H 'Connection: keep-alive' \
  -L -w '%{http_code}|%{url_effective}|%{size_download}' \
  'https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/'
# Expected: 200|...|85868

# Step 2 — Press release page (use URL extracted in Step 1)
curl -s -o /tmp/nso-press.html \
  --cacert /tmp/nso_ca_bundle.pem \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...' \
  -H 'Referer: https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/' \
  -H 'Accept-Encoding: identity' \
  -L -w '%{http_code}|%{size_download}' \
  'https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/'
# Expected: 200|114711

# Step 3 — xlsx download (URL extracted from Step 2)
curl -s --cacert /tmp/nso_ca_bundle.pem \
  -H 'User-Agent: ...' \
  -H 'Referer: https://www.nso.gov.vn/bai-top/...' \
  -L -o /tmp/nso-monthly.xlsx \
  'https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx'
# Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
# Expected: HTTP 200, file > 100KB
```

Anti-bot: NONE detected. No Cloudflare headers, no captcha, no JS challenge. Apache server, plain WordPress. Standard browser UA sufficient.

## HTTP Probe Results

| Step | URL | HTTP | Size |
|------|-----|------|------|
| 1 — Index | `https://www.nso.gov.vn/bao-cao-tinh-hinh-kinh-te-xa-hoi-hang-thang/` | 200 | 85868 B |
| 2 — Press release | `https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/` | 200 | 114711 B |
| 3 — xlsx | `https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx` | 200 | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet confirmed |

Final URL after redirect: no redirect observed (clean 200 at target URL).
Server: Apache. Set-Cookie: `pll_language=vi` (language pref, not auth).

## Anti-Bot Assessment

**Type:** NONE

**Evidence:** No `cf-ray` header, no `__cf_bm`, no JS challenge body, no captcha. Apache server. Response includes WordPress `Link:` headers (standard WP). No login redirect.

**Recommendation:** No special technique needed. Browser UA + Referer sufficient.

## New Working Selector (Step 1 fix)

### Old (broken) regex

```go
var reBaiTop = regexp.MustCompile(`href="(/bai-top/\d{4}/\d{2}/[^"]+)"`)
```

Matched relative paths only. Returns 0 matches against current HTML.

### New regex — absolute URL, bai-top only

```go
var reBaiTop = regexp.MustCompile(`href="(https://www\.nso\.gov\.vn/bai-top/(\d{4})/(\d{2})/[^"]+)"`)
```

This matches the current HTML pattern. First match is the most recent article (page lists newest-first).

**Period extraction change:** the old code extracted YYYY/MM from the relative path using a second regex on the captured group. With the new absolute-URL capture the YYYY and MM are now capture groups 2 and 3 directly (groups 1 = full URL, 2 = year, 3 = month).

Alternative single-regex for `extractLatestPressURL` in Go:

```go
// New reBaiTop — matches absolute URLs
var reBaiTop = regexp.MustCompile(
    `href="(https://www\.nso\.gov\.vn/bai-top/(\d{4})/(\d{2})/[^"]+)"`)

func extractLatestPressURL(body []byte) (pressURL, period string, err error) {
    m := reBaiTop.FindSubmatch(body)
    if m == nil {
        return "", "", fmt.Errorf("no bai-top link found in NSO index page (%d bytes)", len(body))
    }
    pressURL = string(m[1])   // full absolute URL
    period   = string(m[2]) + "-" + string(m[3])  // "2026-06"
    return pressURL, period, nil
}
```

No changes needed to Step 2 (xlsx regex) or Step 3 (GET xlsx). Both work as-is.

### Step 2 regex (xlsx) — UNCHANGED, still works

```go
var reXlsxLink = regexp.MustCompile(`href="(https?://[^"]+\.xlsx)"`)
```

Live evidence: `href="https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx"` — matches correctly.

## Page Structure (DOM, Step 1)

```
<div class="archive-container">
  <p><a href="https://www.nso.gov.vn/bai-top/YYYY/MM/slug/"></p>
  <section class="item">
    <h3>Báo cáo tình hình kinh tế - xã hội tháng Năm và 5 tháng đầu năm 2026</h3>
    <p>
      <span class="archive-issue-date">Ngày đăng: 03/06/2026</span>
      <span class="archive-reference-period">Kỳ tham chiếu: 5/2026</span>
      <span class="archive-next-release">Lần công bố sắp tới: 03/07/2026</span>
    </p>
  </section>
  <p></a></p>
  <!-- next article ... -->
</div>
```

Wrapper: `div.archive-container` (CSS class, stable WordPress theme element).
Article link: `<p><a href="ABSOLUTE_URL">` — href is now always an absolute URL.
Newest article is first in DOM order.

Note: one annual/quarterly entry (`/du-lieu-va-so-lieu-thong-ke/…`) appears in the list for Q4/annual reports — the `bai-top` path prefix is the correct filter to skip it.

## Sample Extracted Rows (proof real data is reachable)

From Step 1 live fetch (2026-06-15T01:36:28Z):

```
Article 1 (latest): Kỳ tham chiếu: 5/2026
  URL: https://www.nso.gov.vn/bai-top/2026/06/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-nam-va-5-thang-dau-nam-2025-2/
  Ngày đăng: 03/06/2026 | Lần công bố sắp tới: 03/07/2026

Article 2: Kỳ tham chiếu: 4/2026
  URL: https://www.nso.gov.vn/bai-top/2026/05/bao-cao-tinh-hinh-kinh-te-xa-hoi-thang-tu-va-4-thang-dau-nam-2026/

Article 3: Kỳ tham chiếu: 3/2026
  URL: https://www.nso.gov.vn/bai-top/2026/04/bao-cao-tinh-hinh-kinh-te-xa-hoi-quy-i-nam-2026/
```

From Step 2 live fetch — xlsx link confirmed:
```
href="https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx"
```

From Step 3 HEAD check — xlsx HTTP 200, Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

## Implementation Notes for dev-macro-indicators

1. **Fix `reBaiTop`** in `apps/macro-indicators/pkg/infrastructure/cache_vmt_nso.go`:
   - Old: `href="(/bai-top/\d{4}/\d{2}/[^"]+)"`
   - New: `href="(https://www\.nso\.gov\.vn/bai-top/(\d{4})/(\d{2})/[^"]+)"`
   - Update `extractLatestPressURL` to use `m[1]` (full absolute URL) as `pressURL`, and `m[2]+"-"+m[3]` as `period`. Remove the secondary `rePeriod` regex (it was extracting YYYY/MM from relative path — no longer needed).

2. **Fix CA bundle** — `VpsFetchAdapter` or the NSO fetch path must ensure the GlobalSign RSA OV SSL CA 2018 intermediate is in the PEM bundle. The VPS env var `VPS_CACERT_PATH_NSO` should point to `/tmp/nso_ca_bundle.pem` (built as above). The intermediate DER download from `http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt` is stable (GlobalSign AIA URL). Add a one-time bootstrap step (or Dockerfile RUN layer) to build this bundle; `/tmp` is wiped on VPS restart.

3. **No other changes needed** — Step 2 regex, Step 3 GET, Excel parser (`parsers_vmt_gso_indicators.go`) are all unaffected.
