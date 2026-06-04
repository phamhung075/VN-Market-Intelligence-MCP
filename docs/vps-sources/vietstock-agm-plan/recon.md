# Recon — vietstock-agm-plan

**Date:** 2026-06-04 08:10 UTC
**Agent:** ops-vps-fetch
**Source URL:** https://finance.vietstock.vn/Data/GetData_PlannedTarget
**Trigger:** new_source_needed (RECON-AGM-1 from docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md)
**Task:** P0 spike — find fetchable source for AGM business plan figures (planned revenue + planned profit per ticker per year) for management-track-record / plan-vs-actual feature (FIX-G gate)

---

## Working Request Recipe

```bash
# Step 1: GET the ke-hoach page to obtain session cookie + CSRF token
curl -s -c /tmp/vietstock-cookies.txt \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,*/*;q=0.8' \
  -H 'Accept-Language: vi-VN,vi;q=0.9' \
  'https://finance.vietstock.vn/VIC/ke-hoach-kinh-doanh.htm' \
  | grep -oE '__CHART_AjaxAntiForgeryForm[^>]*>.*?value=([A-Za-z0-9_\-]{60,})' 
  # → extract CSRF token from __CHART_AjaxAntiForgeryForm hidden input value

# Step 2: POST to GetData_PlannedTarget with stockCode + CSRF token
curl -s -X POST \
  -b /tmp/vietstock-cookies.txt \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' \
  -H 'Accept: application/json, text/javascript, */*; q=0.01' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Referer: https://finance.vietstock.vn/VIC/ke-hoach-kinh-doanh.htm' \
  --data "stockCode=VIC&__RequestVerificationToken=<TOKEN>" \
  'https://finance.vietstock.vn/Data/GetData_PlannedTarget'
```

**Python idiom (preferred — handles cookies automatically):**
```python
import urllib.request, urllib.parse, ssl, re, json, http.cookiejar
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), urllib.request.HTTPCookieProcessor(jar))
# Step 1: warm session
resp1 = opener.open(urllib.request.Request(
    'https://finance.vietstock.vn/VIC/ke-hoach-kinh-doanh.htm',
    headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept':'text/html,*/*;q=0.8','Accept-Language':'vi-VN,vi;q=0.9'}
), timeout=30)
body1 = resp1.read().decode('utf-8', errors='replace')
m = re.search(r'__CHART_AjaxAntiForgeryForm[^>]*>.*?value=([A-Za-z0-9_\-]{60,})', body1)
csrf_token = m.group(1)
# Step 2: query planned targets
data = urllib.parse.urlencode({'stockCode':'VIC','__RequestVerificationToken':csrf_token}).encode()
resp2 = opener.open(urllib.request.Request(
    'https://finance.vietstock.vn/Data/GetData_PlannedTarget', data=data,
    headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept':'application/json','X-Requested-With':'XMLHttpRequest','Content-Type':'application/x-www-form-urlencoded','Referer':'https://finance.vietstock.vn/VIC/ke-hoach-kinh-doanh.htm'}
), timeout=30)
result = json.loads(resp2.read().decode('utf-8'))
# result['data']['Data_Results'] = [{StockCode, PTID, PTName, YearPeriod, Value}, ...]
```

---

## HTTP Probe Results

- **Status:** 200 OK (both endpoints)
- **Final URL:** https://finance.vietstock.vn/Data/GetData_PlannedTarget (no redirect)
- **Content-Type:** application/json; charset=utf-8
- **Redirect chain:** none
- **VPS reachability:** confirmed from Vinahost VPS (125.212.251.27), response time ~0.25–0.97s
- **Session warm required:** yes — must GET ke-hoach page first to populate `ASP.NET_SessionId` cookie and extract `__RequestVerificationToken` from `#__CHART_AjaxAntiForgeryForm` hidden input. Token and cookie must match (anti-forgery double-submit pattern).
- **No Cloudflare:** plain nginx, no cf-ray headers, no JS challenge detected

---

## Anti-Bot Assessment

- **Type:** none (for the JSON API endpoint itself)
- **Evidence:** HTTP 200, nginx server header, no cf-ray, no __cf_bm cookie. Session warm step is ASP.NET anti-forgery, not bot protection.
- **CSRF requirement:** double-submit pattern — session cookie + matching CSRF token in POST body. Token rotates per session, must be parsed from page HTML. Stable within session lifetime.
- **Recommendation:** use Python CookieJar opener (keeps session across requests automatically). No special bypass needed.

---

## Page Structure

### JSON Response — /Data/GetData_PlannedTarget

```json
{
  "data": {
    "Data_Results": [
      {
        "StockCode": "VIC",
        "PTID": 5,
        "PTName": "Doanh thu kế hoạch",
        "YearPeriod": 2025,
        "Value": 300000000000000.0
      },
      {
        "StockCode": "VIC",
        "PTID": 9,
        "PTName": "Lợi nhuận sau thuế kế hoạch",
        "YearPeriod": 2025,
        "Value": 10000000000000.0
      }
    ],
    "Year_Results": [
      {"Year": 2022}, {"Year": 2023}, {"Year": 2024}, {"Year": 2025}, {"Year": 2026}
    ]
  }
}
```

### PTID Codes (confirmed from live data)
| PTID | Meaning |
|------|---------|
| 5 | Doanh thu kế hoạch (planned revenue) |
| 8 | Lợi nhuận trước thuế kế hoạch (planned pre-tax profit) — present for some tickers |
| 9 | Lợi nhuận sau thuế kế hoạch (planned after-tax profit) |

Note: PTID availability varies by ticker/sector. Banks (ACB) report LNTT+LNST but no revenue plan. Non-bank tickers (FPT, VIC, NVL) report revenue + LNTT or LNST. Filter by PTName, not PTID alone.

### JSON Response — /Data/GetData_PlannedTarget_ImplementStatus

Returns quarterly actual values alongside the plan for plan-vs-actual compute:
```json
{
  "data": {
    "Data_Results": [
      {"StockCode":"VIC","YearPeriod":2025,"ReportTermID":1,"ReportNormID":2206,"Value":331874704000000.0,"PTID":5}
    ],
    "Year_Results": [...]
  }
}
```
ReportTermID: 1=full-year, 2=Q1, 3=Q2, 4=Q3, 5=H1 (varies). ReportNormID: 2206=revenue, 2211=pre-tax profit, 2212=after-tax profit.

### Document listing (AGM PDFs) — /data/getrptfile

Secondary endpoint that returns PDF download URLs keyed by ticker + year:
```
POST https://finance.vietstock.vn/data/getrptfile
Body: stockCode=VIC&documentTypeID=4&reportTermID=1&yearPeriod=2025&exchangeID=1&orderBy=PublicDate&orderDir=DESC&page=1&pageSize=10&__RequestVerificationToken=<TOKEN>
```
- **documentTypeID=4** → Nghị quyết ĐHĐCĐ (AGM Resolution documents — the PDFs that formally approve the plan)
- **documentTypeID=5** → Tài liệu ĐHĐCĐ (AGM Meeting Materials — more detailed planning documents)
- **exchangeID=1** works for all tickers tested (VIC HOSE, SHB HNX, FPT HOSE)
- Returns: `[{FileInfoID, StockCode, Url, Title, CatID, ...}]`
- PDF URL pattern: `https://static2.vietstock.vn/data/HOSE/{year}/NGHI QUYET DHCD/VN/{ticker}_Nghiquyet_DHDCD thuong nien_{year}.pdf`
- PDFs are accessible from VPS (HTTP 200, application/pdf, 5–14MB per file)

---

## Key Data Verified (live, 2026-06-04)

| Ticker | Metric | 2022 | 2023 | 2024 | 2025 | 2026 |
|--------|--------|------|------|------|------|------|
| FPT | Rev plan (tỷ) | 42,420 | 52,289 | 61,850 | 75,400 | 58,580 |
| FPT | PBT plan (tỷ) | 7,618 | 9,055 | 10,875 | 13,395 | 11,629 |
| VIC | Rev plan (tỷ) | 140,000 | 190,000 | 200,000 | 300,000 | 485,000 |
| VIC | PAT plan (tỷ) | 6,000 | 2,000 | 4,500 | 10,000 | 35,000 |
| ACB | PBT plan (tỷ) | 15,018 | 20,058 | 22,000 | 23,000 | 22,338 |
| NVL | Rev plan (tỷ) | 35,974 | 9,531 | 32,587 | 13,411 | 22,715 |

5-year history available for all tickers tested. Values in VND (divide by 1e9 for tỷ đồng).

---

## Sample Response Excerpt

```json
{"data":{"Data_Results":[{"StockCode":"FPT","PTID":7,"PTName":"Doanh thu kế hoạch","YearPeriod":2026,"Value":58580000000000.00},{"StockCode":"FPT","PTID":8,"PTName":"Lợi nhuận trước thuế kế hoạch","YearPeriod":2026,"Value":11629000000000.00},...
```

---

## Notes

1. **PDF content is image-based, not text-selectable.** Both Nghị quyết and Tài liệu ĐHĐCĐ PDFs produced by `iLovePDF` and `Pdftools SDK` are scanned/image-layer only (1 Font object, XObject-heavy structure, BT/Tj strings are binary noise). OCR via dev-pdf-extractor would be required to extract figures from PDF raw text. However: **this is NOT needed** because the structured API (`GetData_PlannedTarget`) already provides the approved figures in clean JSON, making PDF parsing unnecessary for plan figures.

2. **Structured API is the primary path.** `GetData_PlannedTarget` returns AGM-approved plan figures directly as structured JSON (PTID+YearPeriod+Value), no PDF parsing required. This is the correct primary source.

3. **ImplementStatus API provides plan-vs-actual.** `GetData_PlannedTarget_ImplementStatus` returns quarterly/annual actual figures alongside the plan — Vietstock has already computed the data needed to assess management track record. This makes the management-track-record feature implementable without any new BCTC joins.

4. **Coverage:** tested on FPT (HOSE tech), VIC (HOSE conglomerate), ACB (HOSE bank), NVL (HOSE real estate). Coverage is broad — the API is not sector- or exchange-restricted.

5. **Rate limit:** none detected in testing. Single session can query multiple tickers sequentially without throttling.

6. **SSC UBCK portal:** Oracle ADF JSF app — no REST API, requires stateful JS-driven form submission. Not recommended as a source.

7. **HNX CBTT AJAX:** pMaChungKhoan filter with pAction=0 does not filter by ticker (returns all). pAction=1 filters but only finds documents matching a keyword — not reliable for structured discovery. The endpoint is good for PDF attachment discovery on HNX-listed tickers but does not yield structured plan figures.

8. **CafeF / FireAnt:** CafeF URLs tested all returned 404 for the DHCD-specific pages; FireAnt REST API returns 401 (auth required). Neither viable as primary source.

---

## Verdict

**FETCHABLE** — structured JSON API, no PDF parsing required, no Cloudflare, VPS accessible, multi-year history, multi-ticker confirmed.

**Primary:** `https://finance.vietstock.vn/Data/GetData_PlannedTarget` (session + CSRF warm-up required, ~2 HTTP calls per batch session)
**Fallback:** `https://finance.vietstock.vn/data/getrptfile` + PDF download → dev-pdf-extractor (PDF OCR) if structured API gaps a ticker
**dev-pdf-extractor needed:** NO for structured figures; YES only as fallback for tickers not covered by the API
