---
source_name: vmt-sbv-bop-probe
sprint: VN-MACRO-TOOLING
probe: PROBE-2 + F-BOP-QUERY-RECON-STEP1
recon_date: 2026-06-15
verdict: PASS (query contract revised)
unblocks: VMT-2 / F-BOP-QUERY-RECON dev fix
---

# Recon: SBV Balance of Payments — Liferay JSON API

## Source URL
`https://www.sbv.gov.vn/vi/can-can-thanh-toan-quoc-te`

---

## F-BOP-QUERY-RECON STEP1 — Root Cause + Working Contract (2026-06-15)

### Root Cause: TWO bugs, not one

**Bug 1 — Wrong JSON root key (STRUCTURAL, blocks ALL parsing)**

The SBV Liferay API response uses `"articles"` as the root array key.
`parsers_vmt_bop.go` declares `sbvArticleResponse.Items` with `json:"items"`.
The `"items"` key is absent from the live response. Go's `json.Unmarshal` silently skips it → `Items` stays nil → `len(apiResp.Items) == 0` → `bop_parser: SBV API returned 0 items`.

Evidence from live VPS probe (2026-06-15):
```
items key present? False
articles key present? True
ALL keys: ['articles', 'lastPage', 'page', 'pageSize', 'totalCount', 'xClassName']
```

**Bug 2 — Date-range filter misses latest data (SEMANTIC, blocks date-range path)**

`CurrentQuarterWindow` and `PrevQuarterWindow` produce calendar quarter boundaries.
`Date48362898` in the live API is NOT a quarter-end date — it is a mid-quarter reference date set by SBV data entry. Evidence:

| Quarter label | Date48362898 value | Calendar quarter |
|---|---|---|
| quyI 2025  | 2025-03-26 | Q1: Jan–Mar ✓ falls inside |
| quyII 2025 | 2025-05-05 | Q2: Apr–Jun ✓ falls inside |
| quyIII 2025| 2025-08-12 | Q3: Jul–Sep ✓ falls inside |
| quyIV 2025 | 2025-12-25 | Q4: Oct–Dec ✓ falls inside |

The Go fallback uses Q1 2026 = `2026-01-01..2026-03-31`.
Q4 2025 data has `Date48362898 = 2025-12-25` → outside Q1 2026 window → 0 results.
Current quarter Q2 2026 = `2026-04-01..2026-06-30` also misses Q4 2025 → 0 results.

Both bugs independently produce 0 items. Bug 1 is the structural root (even the broad filter returns 0 parsed items); Bug 2 explains why the date-range fallback also fails even if Bug 1 were fixed.

---

### Working Request Recipe (GENERIC — quarter-agnostic)

```bash
# Run on VPS (SBV is geo-blocked outside Vietnam)
CACERT=/etc/ssl/certs/ca-certificates.crt
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
FILTER="status eq 0 and Date48362898 gt ''"
ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILTER")
curl -s --cacert "$CACERT" -L \
  -H "User-Agent: $UA" \
  -H "Accept: application/json" \
  -H "Referer: https://www.sbv.gov.vn/vi/can-can-thanh-toan-quoc-te" \
  "https://www.sbv.gov.vn/o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENC}&sort=datePublished%3Adesc"
```

**Parse: `response.articles[0]` (NOT `response.items[0]`)**
Deduplicate by `articleId` first (Liferay returns ~3-4 duplicate rows per article across locales).

---

### Live Probe Results (2026-06-15 from VPS)

- HTTP status: 200
- totalCount: 15 (all matching articles across all quarters)
- Unique articleIds: 4 (Q1–Q4 2025)
- Root key: `articles` (NOT `items`)
- pageSize param: effectively IGNORED — Liferay returns all matches regardless

Probe results by filter variant:

| Filter | totalCount | items parsed by Go |
|---|---|---|
| `status eq 0 and Date48362898 gt ''` | 15 | **0** (json:"items" maps nothing) |
| Q2 2026 date-range (current quarter) | 0 | 0 |
| Q1 2026 date-range (prev quarter) | 0 | 0 |
| Q4 2025 date-range (2025-10-01..2026-03-31) | 3 | **0** (same key bug) |
| broad filter + sort=datePublished:desc → articles[0] | 15 | **WORKS** after key fix |

---

### Generic OData Query Contract

**Endpoint:** `GET https://www.sbv.gov.vn/o/article/v1.0/articles`

**Required parameters:**
| Param | Value | Notes |
|---|---|---|
| `scopeKey` | `20117` | SBV portal scope — confirmed stable |
| `contentStructureId` | `10063168` | BOP data structure — confirmed stable |
| `pageSize` | `100` | Liferay ignores this for small result sets; keep for future-proofing |
| `filter` | `status eq 0 and Date48362898 gt ''` | No date-range — picks up any quarter SBV has published |
| `sort` | `datePublished:desc` | Puts latest-published quarter first |

**Required headers:**
- `Accept: application/json`
- `User-Agent: <browser-UA>`

**Response contract:**
```
{
  "articles": [ ... ],   // ROOT KEY — NOT "items"
  "totalCount": <int>,
  "page": <int>,
  "pageSize": <int>,
  "lastPage": <int>,
  "xClassName": "..."
}
```

**Selection rule for latest quarter:**
1. Read `response.articles` (not `response.items`)
2. Deduplicate by `articleId` (Liferay multi-locale rows create duplicates)
3. Take the first element after sorting by `datePublished desc` (already sorted by `sort=` param)
4. Parse `fields` map from that article

**DO NOT use date-range filter** — `Date48362898` is a mid-quarter reference date (not quarter-end), making quarter-window filtering structurally unreliable across SBV publishing cadences.

---

### Dev Fix Contract

`parsers_vmt_bop.go` change required (RECON-ONLY — dev-macro-indicators implements):

```
// BEFORE (broken):
type sbvArticleResponse struct {
    Items []sbvArticleItem `json:"items"`   // ← wrong key
    ...
}

// AFTER (working):
type sbvArticleResponse struct {
    Items []sbvArticleItem `json:"articles"` // ← actual SBV Liferay key
    ...
}
```

`usecases_vmt_bop.go` change required:
- Remove `CurrentQuarterWindow` / `PrevQuarterWindow` date-range filter path
- Replace `BuildBOPFetchURL(start, end)` with a single URL that uses the broad filter + sort
- The `fetchRecord` fallback quarter retry is no longer needed

---

## PROBE-2 Original Findings (2026-06-14) — still valid for field map / E&O convention

### Working Request Recipe (PROBE-2, broad filter)
```bash
FILTER="status eq 0 and Date48362898 gt ''"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${FILTER}'))")
curl -s --cacert /etc/ssl/certs/ca-certificates.crt -L \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: application/json" \
  -H "Referer: https://www.sbv.gov.vn/vi/can-can-thanh-toan-quoc-te" \
  "https://www.sbv.gov.vn/o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENCODED}"
```

### HTTP Probe Results (PROBE-2)
- HTTP status: 200
- Format: JSON (Liferay headless API, `vn.gov.sbv.article.headless`)
- TLS: Valid, system cacert works
- Anti-bot: None

### BOP Field Map (All 10+ Components)

| JSON field | English label | Unit |
|---|---|---|
| `Date48362898` | Quarter reference date (mid-quarter, e.g. "2025-12-25") | ISO date |
| `Select02257401` | Quarter label (e.g. "quyIV") | string |
| `canCanVangLai` | Current account total | M USD |
| `hangHoaXuatKhau` | Goods: exports f.o.b. | M USD |
| `hangHoaNhapKhau` | Goods: imports f.o.b. | M USD |
| `hangHoaRong` | Goods (net) | M USD |
| `dichVuXuatKhau` | Services: exports | M USD |
| `dichVuNhapKhau` | Services: imports | M USD |
| `dichVuRong` | Services (net) | M USD |
| `thuNhapDauTuRong` | Primary income (net) | M USD |
| `chuyenGiaoVangLai` | Secondary income (net) | M USD |
| `canCanVon` | Capital account | M USD |
| `canCanTaiChinh` | Financial account | M USD |
| `dauTuTrucTiepRong` | FDI (net) | M USD |
| `dauTuGianTiepRong` | Portfolio investment (net) | M USD |
| `dauTuKhacRong` | Other investment (net) | M USD |
| `loiVaSaiSot` | Errors & Omissions | M USD |
| `canCanTongThe` | Overall balance | M USD |
| `duTruVaCacHangMucLien` | Reserve assets & related | M USD |
| `taiSanDuTru` | Reserve assets | M USD |

### E&O Sign Convention — CONFIRMED IMF BPM6

Q4 2025 E&O value: `loiVaSaiSot = "-12.375"` → -12,375 M USD (negative = unexplained outflows).

### Number Format
Vietnamese convention: period = thousands separator, comma = decimal separator.
- `"7.654"` = 7,654 M USD
- `"-12.375"` = -12,375 M USD

### Sample Response Excerpt (Q4 2025, latest as of 2026-06-15)
```json
{
  "articleId": "10133276",
  "datePublished": "2026-03-27T04:55:00+07:00",
  "fields": {
    "Date48362898": "2025-12-25",
    "Select02257401": "quyIV",
    "canCanVangLai": "7.654",
    "hangHoaXuatKhau": "126.318",
    "hangHoaNhapKhau": "117.183",
    "hangHoaRong": "9.135",
    "dichVuXuatKhau": "8.260",
    "dichVuNhapKhau": "10.547",
    "dichVuRong": "-2.287",
    "thuNhapDauTuRong": "-2.975",
    "chuyenGiaoVangLai": "3.781",
    "canCanVon": "0",
    "canCanTaiChinh": "7.076",
    "dauTuTrucTiepRong": "6.850",
    "dauTuGianTiepRong": "-850",
    "dauTuKhacRong": "1.076",
    "loiVaSaiSot": "-12.375",
    "canCanTongThe": "2.355",
    "duTruVaCacHangMucLien": "-2.355",
    "taiSanDuTru": "-2.355"
  }
}
```

## Anti-Bot Assessment
**Type:** None
**Technique:** Standard REST API with OData filter support

## Files
- Probe script (STEP1): `scripts/probes/vmt-bop-step1-recon.sh`
- Probe script (PROBE-2): `scripts/probes/vmt-probe-2.sh`
- Sample payload: `scripts/probes/vmt-2-sample.json`
