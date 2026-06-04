# Recon — officer-start-date

**Date:** 2026-06-04
**Agent:** ops-vps-fetch
**Trigger:** FU-FIX-I-SOURCE-RECON — gate check for FIX-I (CEO tenure feature), RAPID-DATA-LAYER sprint
**Task:** Determine whether any fetchable source returns a CEO / officer / board-member appointment start_date for Vietnamese listed tickers. Three sample tickers: VNM (HOSE consumer), FPT (HOSE tech), VCB (HOSE bank).

---

## Verdict

**PARTIALLY FETCHABLE — year-only, not full date.**

**Source:** `https://finance.vietstock.vn/data/boarddetails` (same Vietstock server as the working AGM plan source)
**Date field:** `FromDate` — carries appointment year as a zero-padded string (e.g., `"2022      "`, `"1988      "`, `"2021      "`). Precision is year-only. Full day/month is NOT available.
**Coverage confirmed:** VNM, FPT, VCB — all three tickers return structured JSON with named officers, positions, and year-of-appointment. `"N/A       "` is returned when data is not available for an individual.
**Auth:** No Cloudflare, no bot challenge. ASP.NET double-submit CSRF (same as AGM plan source). VPS reachable.

**For FIX-I:** A year-precision start_date (`FromDate`) IS fetchable. Whether this is sufficient for CEO tenure computation depends on product spec. Year-level precision is adequate for tenure-in-years calculation (e.g., VCB CEO Nguyễn Thanh Tùng, FromDate 2021 → ~3 years tenure in 2024). It is NOT adequate for precise month-level tenure start.

---

## Working Request Recipe

```python
import urllib.request, urllib.parse, ssl, re, json, http.cookiejar

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=ctx),
    urllib.request.HTTPCookieProcessor(jar)
)

def fetch_board_details(ticker: str, pages: int = 1) -> list[dict]:
    """
    Returns list of term-period groups, each containing a list of officer records.
    Each record has: Name, Position (ID code), PositionText (human-readable),
    FromDate (year string), ClosedDate (ISO), YearOfBirth, TotalShares, Independence.
    """
    referer = f'https://finance.vietstock.vn/{ticker}/board-of-management.htm'
    
    # Step 1: Warm session — get CSRF token
    resp = opener.open(urllib.request.Request(
        referer,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9',
        }
    ), timeout=20)
    page_html = resp.read().decode('utf-8', errors='replace')
    
    # Extract CSRF token (ASP.NET anti-forgery, same pattern as AGM plan source)
    m = re.search(r'type=hidden value=([A-Za-z0-9_\-]{60,})', page_html)
    csrf = m.group(1) if m else ''
    
    # Extract total pages from embedded JS
    m2 = re.search(r'var totalPage=(\d+)', page_html)
    total_pages = int(m2.group(1)) if m2 else 1
    
    all_groups = []
    for page_num in range(1, min(total_pages, pages) + 1):
        data = urllib.parse.urlencode({
            'code': ticker,
            'page': page_num,
            '__RequestVerificationToken': csrf,
        }).encode()
        req = urllib.request.Request(
            'https://finance.vietstock.vn/data/boarddetails',
            data=data,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Referer': referer,
                'Origin': 'https://finance.vietstock.vn',
            }
        )
        r = opener.open(req, timeout=15)
        body = r.read().decode('utf-8', errors='replace')
        if body:
            groups = json.loads(body)
            all_groups.extend(groups)
    
    return all_groups

# Usage:
results = fetch_board_details('VNM', pages=1)
# results[0]['Details'][i] = one officer, fields include:
#   Name, PositionText, FromDate, ClosedDate, YearOfBirth, Independence
#   TimeSticking (same as FromDate for non-independent; "Độc lập" for independent members)
```

---

## HTTP Probe Results

- **Endpoint:** `POST https://finance.vietstock.vn/data/boarddetails`
- **Status:** 200 OK
- **Content-Type:** application/json
- **VPS reachability:** confirmed from Vinahost VPS (125.212.251.27)
- **Session warm required:** YES — same double-submit CSRF pattern as AGM plan source
  - GET `https://finance.vietstock.vn/{TICKER}/board-of-management.htm` → extract CSRF token
  - POST `code={TICKER}&page={N}&__RequestVerificationToken={TOKEN}` to `/data/boarddetails`
- **No Cloudflare:** plain nginx, no cf-ray headers
- **Correct parameter name:** `code` (NOT `stockCode`) — `stockCode` returns empty body

---

## Field Set (confirmed live, 2026-06-04)

All three sample tickers confirmed. Fields per officer record:

| Field | Type | Notes |
|-------|------|-------|
| `IDNO` | string | Vietstock internal officer ID |
| `Name` | string | Full Vietnamese name |
| `PositionText` | string | Human-readable position (e.g., "CTHĐQT", "TVHĐQT", "TGĐ") |
| `Position` | string | Coded position IDs (space-padded) |
| `YearOfBirth` | int | Birth year |
| `FromDate` | string | **Appointment year, space-padded** (e.g., `"2022      "`, `"1988      "`, `"N/A       "`) — YEAR ONLY |
| `TimeSticking` | string | Mirrors `FromDate` for non-independent; `"Độc lập"` for independent board members |
| `ClosedDate` | string | ISO datetime when the term period expires (e.g., `"2025-12-31T00:00:00"`) |
| `Independence` | int | 1=independent, 0=non-independent |
| `TotalShares` | int | Total shareholding |
| `PersonalShares` | int | Personal shares |
| `NationalShares` | int | State-owned shares |
| `PositionInfo` | nested JSON | `{Root:{Position:[{Position_ID, Vietnamese, English}]}}` |
| `GradeInfo` | nested JSON | Academic/professional qualification |
| `TitleInfo` | nested JSON | Gender title (Ông/Bà) |
| `CompanyID` | string | Vietstock internal company ID |
| `IsPublic` | string | "1" = public |

**Response structure:** Array of term-period groups, each group has `ClosedDate` (term end) and a `Details` array of officer records. VNM has 12 pages of historical data (term groups).

---

## FromDate Precision Analysis

| Ticker | Sample Officer | FromDate value | Assessment |
|--------|---------------|----------------|------------|
| VNM | Nguyễn Hạnh Phúc (Chairman) | `"2022      "` | Year only |
| VNM | Đặng Thị Thu Hà (Board Member) | `"2017      "` | Year only |
| VNM | Tiêu Yến Trinh (Board Member) | `"N/A       "` | Missing |
| FPT | Trương Gia Bình (Chairman) | `"1988      "` | Year only (founding year) |
| FPT | Đỗ Cao Bảo (Board Member) | `"1994      "` | Year only |
| VCB | Nguyễn Thanh Tùng (Chairman) | `"2021      "` | Year only |
| VCB | Hoàng Thanh Nhàn (Board Member) | `"2025      "` | Year only |

**Conclusion:** `FromDate` is consistently year-only. No nested field (PositionInfo, GradeInfo) provides a more granular date. The underlying database appears to store only the appointment year, not a full calendar date.

---

## Sources Probed and Rejected

### 1. vnstock VCI source — re-inspected

- Python script in `vnstockBridge.ts` maps: `officer_name`, `officer_position`, `officer_own_percent`, `quantity` from `stock.company.officers()`.
- VCI library source confirmed at `/Users/admin/Library/Python/3.13/lib/python/site-packages/vnstock/explorer/vci/company.py`.
- VCI GraphQL schema for `OrganizationManagers`: `{id, ticker, fullName, positionName, positionShortName, en_PositionName, en_PositionShortName, updateDate, percentage, quantity}`.
- **No `startDate` or `appointmentDate` field.** The `updateDate` field is record-update timestamp, NOT appointment date.
- VCI GraphQL endpoint `https://api.vietcap.com.vn/data-mt/graphql` returned HTTP 403 from VPS (requires auth token).
- **RESULT:** Confirmed no appointment date in VCI source. `vnstock_officers` gap is real.

### 2. HOSE (hsx.vn) — React SPA, probed JS + API

- hsx.vn renders a React SPA. All company info paths return 1793-byte shell HTML (SPA skeleton, no data).
- Only one API path in the full 2.4MB main JS: `https://api.hsx.vn/q/api/v1/search`.
- HOSE uses microservice architecture with prefixes `c/n/s/a/l/m/i/mk`. All company-related endpoint guesses returned 404.
- The `Director` and `management` strings in the JS are UI translation labels, not API paths.
- **RESULT:** HOSE has no publicly accessible API for company officer data without an authenticated session token.

### 3. HNX (hnx.vn)

- All HNX API guesses returned 404. No HNX-specific JS was retrieved to identify actual endpoints.
- **RESULT:** No accessible endpoint found.

### 4. SSC CBTT portal (congbothongtin.ssc.gov.vn)

- Portal is an Oracle ADF JSF application — stateful JS-driven forms, no REST API.
- Same assessment as AGM plan recon (see `/docs/vps-sources/vietstock-agm-plan/recon.md` note 6).
- **RESULT:** Not viable without a stateful browser session.

### 5. TCBS (apipubaws.tcbs.com.vn)

- All company/officer endpoints guessed returned HTTP 404 ("Service not found").
- TCBS appears to have changed API structure; the known public endpoints no longer exist.
- **RESULT:** No accessible endpoint found.

### 6. SSI (iboard-query.ssi.com.vn, fc-data.ssi.com.vn)

- iboard-query: all v2 paths returned 404.
- fc-data: 404 for company paths.
- SSI premium APIs (fiin-deep) require paid authentication.
- **RESULT:** No accessible endpoint found.

### 7. CafeF (cafef.vn)

- `/co-phieu/ban-lanh-dao-VNM.chn` returned 404 (URL structure changed).
- Multiple AJAX endpoint guesses returned 404.
- api.cafef.vn and api2.cafef.vn: connection refused (services not running).
- **RESULT:** No accessible endpoint found.

### 8. Company IR pages

- Not probed (out of scope: unstructured, per-company, no uniform URL pattern).

---

## § 4 — Deployment Record

**Date:** 2026-06-04
**Developer:** dev-vps-crawls (FIX-I-A, RAPID-DATA-LAYER sprint)
**Status:** DEPLOYED

### Files committed to repo

| File | Purpose |
|------|---------|
| `vps-scripts/vietstock-board-details.py` | Python scraper — CSRF warmup + POST /data/boarddetails + FromDate→int parse |
| `vps-scripts/fetch-board-details.sh` | Shell driver — runs scraper, validates JSON, atomic file-drop + push |
| `vps-scripts/fetch-board-details-loop.sh` | Loop driver — daily 02:00 UTC + exponential backoff |
| `vps-scripts/vn-board-details.service` | systemd unit — MemoryMax=256M, Restart=always |
| `vps-scripts/vps-proxy-server.js` | Added `/proxy/board-details` route (GET ?ticker= or ?batch=) |
| `scripts/deploy-vinahost.sh` | Added step 12 — board-details deploy block |

### VPS state (smoke test results)

- `/root/vietstock-board-details.py` deployed to VPS
- `/root/fetch-board-details.sh`, `/root/fetch-board-details-loop.sh` deployed, chmod +x
- `vn-board-details.service`: enabled + active (running)
- `/root/data/board-details-latest.json`: present
- `http://125.212.251.27:8765/proxy/board-details?batch=FPT,VCB,VNM`: HTTP 200 OK

### Smoke test results (3 tickers)

| Ticker | Officer (Chairman/CTHĐQT) | FromDate raw | appointment_year parsed |
|--------|--------------------------|--------------|------------------------|
| VNM | Nguyễn Hạnh Phúc | `"2022      "` | 2022 |
| FPT | Trương Gia Bình | `"1988      "` | 1988 |
| VCB | Nguyễn Thanh Tùng | `"2021      "` | 2021 |

N/A handling: Tiêu Yến Trinh (VNM, FromDate `"N/A       "`) → appointment_year=null (confirmed no fabrication).

### Proxy route

The existing `:8765` service is Node.js (`vps-proxy-server.js`), not nginx with static routes.
The `/proxy/board-details` route was added directly to `vps-proxy-server.js` (mirroring `/proxy/agm-plan`).
No separate nginx config change required.

**Live proxy URL:** `http://125.212.251.27:8765/proxy/board-details?batch=<TICKERS>`

---

## Anti-Bot Assessment

- **Type:** None (same as AGM plan source)
- **Evidence:** HTTP 200, nginx server, no cf-ray, no __cf_bm
- **CSRF requirement:** ASP.NET double-submit (session cookie + matching token in POST body)
- **Recommendation:** Reuse the existing Vietstock session/CSRF warming logic from `vietstock-agm-plan.py` on the VPS — it is the identical auth pattern.

---

## Implications for FIX-I

**Can FIX-I be specced?** Yes, with a caveat on precision.

The `FromDate` year-string from Vietstock `/data/boarddetails` provides:
- Officer name + position + year of appointment for current AND historical board compositions
- Historical term groups (VNM has 12 pages of data going back years)
- Works for all three sample tickers across consumer, tech, and banking sectors

**What FIX-I can deliver:** CEO tenure in years (e.g., "Nguyễn Thanh Tùng, VCB Chairman since 2021 = ~3 years"). ROE before/after CEO transition is computable to year granularity.

**What FIX-I cannot deliver:** Precise month/day of appointment. If the product spec requires "appointed on 15 March 2021" level precision, this source does not support it. The underlying Vietstock data simply doesn't have sub-year precision for historical appointments.

**Recommendation:** Spec FIX-I as year-precision tenure (from `FromDate` year). If sub-year precision is eventually needed, it can only come from manually parsing CBTT/SSC officer-change disclosure PDFs — high effort, not machine-readable via any structured API.

---

## Notes

1. **Correct POST parameter is `code`**, not `stockCode` — `stockCode` returns 200 with empty body (silent failure).
2. **Pagination:** each page returns multiple term-period groups. First `page=1` returns the 2 most recent term groups (the embedded HTML already contains the data for the first group). Subsequent pages return older history.
3. **`ClosedDate` is term end date**, not resignation date — it is the formal end of the elected board term (e.g., December 31, 2025).
4. **`TimeSticking` field:** mirrors `FromDate` for non-independent members. For independent members, the value is `"Độc lập"` instead of the year. The `FromDate` field is the more reliable field for appointment year.
5. **N/A entries:** Some officers have `"N/A       "` in `FromDate` — this is a data quality issue in Vietstock's database, not a scraping artifact.
6. **Rate limit:** None detected. Single session handles multi-ticker sequential queries without throttling.
7. **Resignation history:** `filter_by='resigned'` pattern from the AGM plan recon's company.officers() call (VCI source) also applies here in concept — the term-period pagination provides historical board compositions, including members no longer serving.
