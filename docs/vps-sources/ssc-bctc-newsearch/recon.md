# Recon — ssc-bctc-newsearch

**Date:** 2026-06-06 16:45 UTC
**Agent:** ops-vps-fetch
**Source URL:** https://congbothongtin.ssc.gov.vn/faces/NewsSearch
**Trigger:** SPIKE-VPS-SSC-CURL-RECIPE — replace Playwright/Chromium path with curl-based HTTP scraper
**Task ref:** c006 notebook; Playwright pthread_create exhaustion blocks SSC on every 6h cycle

---

## Summary

The SSC NewsSearch portal (`congbothongtin.ssc.gov.vn/faces/NewsSearch`) is an Oracle ADF
(Application Development Framework) JSF application. Plain HTTP GET returns a 6.8 KB JS-only
ADF loopback redirect script. A proper browser-simulated 3-step handshake delivers the full
84 KB rendered page including a searchable BCTC disclosure table. The complete discovery and
download flow was proven via curl/python (no Chromium) from the VPS.

**VERDICT: VIABLE-CURL** — the Playwright path can be fully replaced by stateful plain HTTP.

---

## HTTP Probe Results

- **Status:** 200 OK (both loopback step and ADF rendered page)
- **Final URL:** https://congbothongtin.ssc.gov.vn/faces/NewsSearch (no redirect for downloads)
- **Content-Type (search):** text/xml;charset=utf-8 (ADF PPR partial-response XML)
- **Content-Type (download):** application/octet-stream; charset=utf-8
- **Redirect chain:** none (TLS direct to 103.3.252.107)
- **TLS:** TLSv1.3 / GlobalSign RSA OV SSL CA 2018 — cert valid (*.ssc.gov.vn, expires Nov 2026)

---

## Anti-Bot Assessment

- **Type:** none — no Cloudflare, no WAF, no rate-limit observed
- **Evidence:** No `cf-ray`, no `__cf_bm`, no challenge body. Headers: only Oracle DMS
  (`x-oracle-dms-ecid`, `x-oracle-dms-rid`). Requests from VPS Vietnam IP (103.x.x.x) identical
  to browser — no IP discrimination observed.
- **Anti-bot posture:** Oracle ADF session management only. JSESSIONID cookie required (set on
  first GET). ViewState token required (from page render). Both are stateless tokens —
  no JS challenge, no CAPTCHA, no fingerprinting.
- **Rate limit:** None observed in testing. No 429 encountered across ~20 sequential requests.
- **Recommendation:** Plain python `urllib` / `requests` with cookie jar. No curl_cffi or
  cloudscraper needed.

---

## Working Request Recipe (Proven on VPS)

### Step 1 — Loopback GET (acquire JSESSIONID + ADF params)

```bash
curl -s -c /tmp/ssc-jar.txt \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,*/*" \
  "https://congbothongtin.ssc.gov.vn/faces/NewsSearch" > /tmp/ssc-loopback.html

# Extract params from response:
JSESS=$(grep -i JSESSIONID /tmp/ssc-jar.txt | tail -1 | awk '{print $NF}')
LOOP=$(grep -o '26[0-9]\{14,16\}' /tmp/ssc-loopback.html | head -1)
WIN=$(python3 -c "import re; m=re.search(r\"'(w[a-z0-9]{5,15})'\", open('/tmp/ssc-loopback.html').read()); print(m.group(1) if m else 'w0')")
```

**Why:** The loopback page is an Oracle ADF JS redirect script that computes browser metrics
(screen size, font size, touch) and redirects to the real ADF page URL with `_afrLoop`,
`_afrWindowMode=2`, and `Adf-Window-Id` params. We extract these from the JS without executing it
(the _afrLoop value and win_id are embedded literally in `AdfLoopbackUtils.runLoopback(...)` call).

### Step 2 — ADF page GET (acquire ViewState + rendered table)

```bash
curl -s -b /tmp/ssc-jar.txt -c /tmp/ssc-jar.txt \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,*/*" \
  -H "Referer: https://congbothongtin.ssc.gov.vn/faces/NewsSearch" \
  "https://congbothongtin.ssc.gov.vn/faces/NewsSearch;jsessionid=${JSESS}?_afrLoop=${LOOP}&_afrWindowMode=2&Adf-Window-Id=${WIN}" \
  > /tmp/ssc-adf.html

VS=$(python3 -c "import re; m=re.search(r'name=\"javax\.faces\.ViewState\" value=\"([^\"]+)\"', open('/tmp/ssc-adf.html').read()); print(m.group(1) if m else '!')")
FORM=$(python3 -c "import re; m=re.search(r'name=\"org\.apache\.myfaces\.trinidad\.faces\.FORM\" value=\"([^\"]+)\"', open('/tmp/ssc-adf.html').read()); print(m.group(1) if m else 'f1')")
```

**Response:** 84 KB rendered page containing:
- `<input id="pt9:it8112::content" name="pt9:it8112">` — ticker search input
- `<select id="pt9:soc3::content" name="pt9:soc3">` — exchange filter (0=HNX, 1=HOSE, 2=UPCOM)
- `<button/a id="pt9:b1">Tìm kiếm</button>` — search trigger
- `<div id="pt9:t1">` — result table (15 rows, fetchSize=15, scrollPolicy=page)
- `javax.faces.ViewState` value (e.g. `!-jb8r9nbl3`) — required for all subsequent POSTs
- `org.apache.myfaces.trinidad.faces.FORM` = `f1`

### Step 3 — PPR Search POST (Oracle ADF Partial Page Rendering)

```bash
curl -s -b /tmp/ssc-jar.txt -c /tmp/ssc-jar.txt \
  -X POST \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  -H "Accept: application/xml, text/xml, */*; q=0.01" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Faces-Request: partial/ajax" \
  -H "Referer: https://congbothongtin.ssc.gov.vn/faces/NewsSearch" \
  --data-urlencode "javax.faces.partial.ajax=true" \
  --data-urlencode "javax.faces.source=pt9:b1" \
  --data-urlencode "javax.faces.partial.execute=@all" \
  --data-urlencode "javax.faces.partial.render=@all" \
  --data-urlencode "javax.faces.ViewState=${VS}" \
  --data-urlencode "org.apache.myfaces.trinidad.faces.FORM=${FORM}" \
  --data-urlencode "Adf-Window-Id=${WIN}" \
  --data-urlencode "pt9:it8112=GAS" \
  --data-urlencode "pt9:soc3=1" \
  "https://congbothongtin.ssc.gov.vn/faces/NewsSearch" > /tmp/ssc-search.xml
```

**Response:** ADF PPR XML (`<partial-response>` with CDATA containing full updated page HTML).
The `<update id="javax.faces.ViewState">` element contains the new ViewState.

Result table rows are at DOM indices 15..N (offset by 15 from the initial page render).
Each row cell:
- `pt9:t1:{N}:c2` — Exchange (HOSE/HNX/UPCOM)
- `pt9:t1:{N}:c5` — Ticker (e.g. GAS)
- `pt9:t1:{N}:c3` — Report type (`Báo cáo tài chính Hợp nhất - Quý`, etc.)
- `pt9:t1:{N}:c8` — Company name
- `pt9:t1:{N}:c111` — Document summary / filename hint (e.g. `Công bố thông tin BCTC hợp nhất Quý 1 năm 2026`)
- `pt9:t1:{N}:c7` — Submission date (dd/MM/yyyy, e.g. `24/04/2026`)
- `pt9:t1:{N}:cil4z` — Download icon link (triggers file download)

### Step 4 — File Download (Full Form POST — NOT PPR/AJAX)

**Critical:** The download icon `cil4z` uses `AdfDhtmlPage.__setNonHtmlResponse` which calls
`forceFullSubmit()` — a full non-AJAX form POST, NOT a PPR request. Using `Faces-Request: partial/ajax`
returns empty body (0 bytes chunked). Omitting the AJAX header delivers the PDF directly:

```bash
curl -s -b /tmp/ssc-jar.txt -c /tmp/ssc-jar.txt \
  -o /tmp/ssc-gas-q1.pdf \
  -X POST \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  -H "Accept: application/pdf,application/octet-stream,*/*" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Referer: https://congbothongtin.ssc.gov.vn/faces/NewsSearch" \
  --data-urlencode "javax.faces.source=pt9:t1:16:cil4z" \
  --data-urlencode "pt9:t1:16:cil4z=pt9:t1:16:cil4z" \
  --data-urlencode "javax.faces.ViewState=${VS}" \
  --data-urlencode "org.apache.myfaces.trinidad.faces.FORM=${FORM}" \
  --data-urlencode "Adf-Window-Id=${WIN}" \
  --data-urlencode "pt9:it8112=GAS" \
  --data-urlencode "pt9:soc3=1" \
  "https://congbothongtin.ssc.gov.vn/faces/NewsSearch"
```

**Response headers observed:**
```
HTTP/1.1 200 OK
Content-Type: application/octet-stream; charset=utf-8
Content-Disposition: attachment; filename*=utf-8''20260424%20-%20GAS%20-%20CBTT%20BCTC%20Hop%20nhat%20Quy%201%202026.pdf
transfer-encoding: chunked
x-oracle-dms-ecid: ...
```

**Body:** Raw PDF bytes (`%PDF-1.7...`). File delivered inline in the response body.

---

## Page Structure

### Table columns (result set)
| Column id | Header | Content |
|-----------|--------|---------|
| c12 | STT | Row number (1-based) |
| c2 | Sàn niêm yết | Exchange: HOSE / HNX / UPCOM |
| c5 | MCK | Ticker symbol |
| c3 | Tên báo cáo | Report type (ADF dropdown value label) |
| c8 | Đơn vị | Company full name |
| c111 | Trích yếu | Document summary / filename hint |
| c7 | Thời gian gửi | Submission date (dd/MM/yyyy) |
| c4 | Tải về | Download icon (cil4z link) |

### Search form fields
| Field | ADF id | Purpose |
|-------|--------|---------|
| Ticker | `pt9:it8112` | Stock symbol (e.g. `GAS`, `HPG`) |
| Exchange | `pt9:soc3` | 0=HNX, 1=HOSE, 2=UPCOM, 3=unlisted, 4=bond issuer |
| Report type | `pt9:smc2` | Multi-select checkboxes (0=consolidated-semi, 1=consolidated-quarterly, 5=standalone-quarterly, 11=consolidated-quarterly-annual) |
| Date from | `pt9:id1` | dd/MM/yyyy (optional) |
| Date to | `pt9:id2` | dd/MM/yyyy (optional) |
| Search button | `pt9:b1` | Triggers PPR search |

### Pagination
- Default fetchSize: 15 rows per page
- Total result count shown in `pt9:it4` span: "Tổng số tin: {N}"
- Row DOM indices start at 15 (offset from page init). First result page = DOM rows 15..29.
- Currently no pagination probed — 15 rows covers all recent quarters for a single ticker.
- To paginate: send `_afrPage` param (ADF table scroll) — not needed for Q1/Q4 recent use case.

---

## Sample Response Excerpt

Search response (PPR XML, first 300 chars of CDATA):
```
<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id__ctru1"><changes><update id="javax.faces.ViewRoot"><![CDATA[<!DOCTYPE HTML>
<html class="p_AFMaximized" dir="ltr" lang="en"><head>...
```

GAS Q1/2026 row (row 16 = consolidated quarterly, DOM idx 16):
```
c111: Công bố thông tin BCTC hợp nhất Quý 1 năm 2026  | date: 24/04/2026
Download: Content-Disposition: attachment; filename*=utf-8''20260424%20-%20GAS%20-%20CBTT%20BCTC%20Hop%20nhat%20Quy%201%202026.pdf
Size: 15,410,637 bytes | Magic: %PDF-1.7 (VALID)
```

---

## JS-Only Rendering Assessment

**PLAIN HTTP IS SUFFICIENT — not JS-only blocked.**

The loopback JS script (`AdfLoopbackUtils.runLoopback`) performs client-side detection
(screen metrics, cookies, window history) and redirects to the real ADF page URL with computed
params. However:
- The `_afrLoop` value is a literal timestamp/counter embedded in the JS (not computed)
- The `Adf-Window-Id` is a literal alphanum string embedded in the JS (not computed)
- `_afrWindowMode=2` is a constant for "normal window" mode

None of the loopback params require actual JavaScript execution — they can all be extracted
with regex from the raw HTML. The PPR search and download are standard HTTP POST requests.

**Conclusion:** The Playwright path was used only because the initial probe (plain GET without
the loopback params) returned the 6.8 KB JS splash. Simulating the loopback step with curl
(extracting params via grep/regex) delivers the full 84 KB ADF page. No JavaScript engine needed.

---

## Q1/2026 Ticker Coverage Proof

Verified from VPS probes (2026-06-06):

| Ticker | Exchange | Q1/2026 row found? | Date filed | Filename hint |
|--------|----------|-------------------|-----------|---------------|
| GAS | HOSE | YES (DOM row 16, consolidated) | 24/04/2026 | CBTT BCTC hợp nhất Quý 1 năm 2026 |
| GAS | HOSE | YES (DOM row 15, standalone) | 24/04/2026 | CBTT BCTC công ty Quý 1 năm 2026 |
| HPG | HOSE | NO (Q1/2026 not filed as of 06 Jun 2026) | last: 27/03/2026 | Annual 2025 |
| HPG | HOSE | Download proven (annual 2025) | 27/03/2026 | Audited Separate Financial Statements... 2025 (6.15 MB) |

Note: Q1/2026 HPG report not filed by 2026-06-06. Expected filing window: late April 2026.
The cache has `/root/bctc-cache/HPG/20260130-HPG-Bao-cao-tai-chinh-rieng-...Q4.2025.pdf`
indicating HPG was previously discovered via this SSC path for Q4.

---

## Implementation Notes for dev-vps-crawls

### Algorithm (replaces `_ssc_newsearch_playwright`)

```python
def discover_from_ssc_curl(code: str, year: int, quarter: str):
    """
    3-step stateful HTTP session: loopback → ADF page → PPR search → full-form download.
    No Chromium / Playwright required.
    """
    import urllib.request, urllib.parse, ssl, re, http.cookiejar

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # SSC cert is valid (GlobalSign), but keep for robustness

    BASE = "https://congbothongtin.ssc.gov.vn"
    UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=ctx)
    )

    # Step 1: GET loopback → extract JSESSIONID, _afrLoop, Adf-Window-Id
    resp1, body1 = get(BASE + "/faces/NewsSearch")
    jsessionid = get_cookie(jar, "JSESSIONID")
    afr_loop = re.search(r"(26\d{14,16})", body1).group(1)  # 16-digit counter
    win_id = re.search(r"'(w[a-z0-9]{5,15})'", body1).group(1)

    # Step 2: GET ADF page → extract ViewState, form id
    adf_url = f"{BASE}/faces/NewsSearch;jsessionid={jsessionid}?_afrLoop={afr_loop}&_afrWindowMode=2&Adf-Window-Id={win_id}"
    _, body2 = get(adf_url)
    vs = re.search(r'name="javax\.faces\.ViewState" value="([^"]+)"', body2).group(1)
    form_id = re.search(r'name="org\.apache\.myfaces\.trinidad\.faces\.FORM" value="([^"]+)"', body2).group(1)

    # Step 3: PPR search (Faces-Request: partial/ajax) → result table HTML
    exchange_code = get_exchange_code(code)  # 0=HNX, 1=HOSE, 2=UPCOM
    search_body = ppr_post(BASE + "/faces/NewsSearch", {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": "pt9:b1",
        "javax.faces.partial.execute": "@all",
        "javax.faces.partial.render": "@all",
        "javax.faces.ViewState": vs,
        "org.apache.myfaces.trinidad.faces.FORM": form_id,
        "Adf-Window-Id": win_id,
        "pt9:it8112": code,    # ticker filter
        "pt9:soc3": exchange_code,  # exchange filter
    })

    # Parse rows (DOM indices 15..29 for first page)
    best_row_idx, best_filename = find_best_row(search_body, code, year, quarter)
    # Uses matches_quarter_and_year() + is_cover_letter_title() from existing code

    # Step 4: Full form POST download (NO Faces-Request header)
    pdf_bytes = full_post(BASE + "/faces/NewsSearch", {
        "javax.faces.source": f"pt9:t1:{best_row_idx}:cil4z",
        f"pt9:t1:{best_row_idx}:cil4z": f"pt9:t1:{best_row_idx}:cil4z",
        "javax.faces.ViewState": vs,  # ViewState from step 2 or updated from step 3
        "org.apache.myfaces.trinidad.faces.FORM": form_id,
        "Adf-Window-Id": win_id,
        "pt9:it8112": code,
        "pt9:soc3": exchange_code,
    })
    # pdf_bytes is the raw PDF, Content-Disposition gives the filename

    filename = get_cd_filename(response_headers)
    save_to_cache(pdf_bytes, code, filename)
    return proxy_url(code, filename)
```

### Key implementation details

1. **DOM row offset:** First search result is at DOM row index 15. Row N in the result set
   corresponds to `pt9:t1:{N+15}:cil4z`. This offset is constant and comes from the page
   initialization rendering 15 empty rows before the result table.

2. **Row matching:** The `c111` cell contains the filename hint (document summary). Use the
   existing `matches_quarter_and_year()` function. Also decode HTML entities (`&aacute;` etc.)
   before matching. Pattern "Quý 1 năm 2026" and "Quý I.2026" and "BCTC hợp nhất Quý 1.2026"
   all match Q1/2026. Prefer consolidated (`c3` = "Hợp nhất - Quý") over standalone.

3. **ViewState:** Stays the same after search in most cases (`!-jb8r9nbl3` pattern).
   Always re-extract from search PPR response if `<update id="javax.faces.ViewState">` present.

4. **Session validity:** JSESSIONID timeout is 36,000,000ms (10 hours) per JS config.
   Cookie jar persists across all 4 steps.

5. **Exchange mapping:** HOSE = 1, HNX = 0, UPCOM = 2. Can also pass `pt9:soc3=""` (empty)
   to search all exchanges simultaneously.

6. **No ticker filter needed for HNX/UPCOM stocks:** The existing curl POST path (HNX AJAX)
   already handles HNX and UPCOM. SSC is only needed as fallback for HOSE-listed stocks not
   served by hsx.vn (or as universal alternative).

7. **Filename:** The `Content-Disposition` header contains the canonical filename
   (URL-encoded UTF-8). Decode with `urllib.parse.unquote()`. No sanitization needed for storage.

8. **Q1/2026 for target tickers** (as of 2026-06-06):
   - GAS: filed 24/04/2026 → DOM row 16 (consolidated), row 15 (standalone)
   - HPG: NOT filed Q1/2026 — only annual 2025 available (27/03/2026)
   - ACV, BDI, D2D, DAG, DLC, HCM, HSG, HVN: probe individually — follow same pattern
   - Expected filing window for Q1/2026: 30-60 days after quarter end (April–May 2026)

### URL signature for cache naming

Follow existing pattern: `YYYYMMDD-{CODE}-{title-slug}.pdf`
Derive from `Content-Disposition filename*=utf-8''...` (already URL-encoded by SSC).

---

## Notes

- **No CSRF token / viewstate invalidation on page reload.** The same session can run
  multiple sequential searches (different tickers) without re-acquiring the ADF page.
  Only re-acquire if JSESSIONID expires (10h timeout) or HTTP 500 is received.

- **Sessions are server-side.** The ViewState token `!-{alphanum}` maps to server-stored
  component state. A new session (different JSESSIONID) gets a different ViewState.

- **Page fetchSize = 15.** If a ticker has more than 15 disclosures, only the 15 most recent
  appear on the first page. For Q1/Q4 matching, the most recent is always on page 1.

- **The `pt9:smc2` report-type filter** (checkbox group) can narrow results by type:
  - value=1 → Consolidated quarterly (Tổng hợp - Quý)
  - value=11 → Consolidated quarterly (Hợp nhất - Quý)
  Setting this reduces rows but is optional — client-side title matching is sufficient.

- **`pt9:it1` hidden field** (visible in rendered page as `value="0100100008"`) appears to be
  an entity/org identifier. Do NOT include in search POST — not required.

- **The `_afrRedirect` task-flow navigation** (seen when clicking `cl1` row links) leads to
  a 404 because it requires live ADF session state. Do NOT follow cl1 redirect —
  the cil4z download POST is the correct single-step file acquisition path.
