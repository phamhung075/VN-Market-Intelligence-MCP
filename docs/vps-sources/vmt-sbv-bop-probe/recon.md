---
source_name: vmt-sbv-bop-probe
sprint: VN-MACRO-TOOLING
probe: PROBE-2
recon_date: 2026-06-14
verdict: PASS
unblocks: VMT-2
---

# Recon: SBV Balance of Payments — Liferay JSON API

## Source URL
`https://www.sbv.gov.vn/vi/can-can-thanh-toan-quoc-te`

## Working Request Recipe (JSON API — CONFIRMED)
```bash
# Fetch all BOP records with date field set
FILTER="status eq 0 and Date48362898 gt ''"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${FILTER}'))")
curl -s --cacert /etc/ssl/certs/ca-certificates.crt -L \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: application/json" \
  -H "Referer: https://www.sbv.gov.vn/vi/can-can-thanh-toan-quoc-te" \
  "https://www.sbv.gov.vn/o/article/v1.0/articles?scopeKey=20117&contentStructureId=10063168&pageSize=100&filter=${ENCODED}"
```

## HTTP Probe Results
- HTTP status: 200
- Format: JSON (Liferay headless API, `vn.gov.sbv.article.headless`)
- TLS: Valid, system cacert works
- Anti-bot: None
- Scope Key: `20117` (SBV portal scope)
- Content Structure ID: `10063168` (BOP data structure)
- Date field name in API: `Date48362898` (quarter date, stored as ISO date)

## Anti-Bot Assessment
**Type:** None
**Technique:** Standard REST API with OData filter support

## Page/API Structure

The SBV BOP page is a Liferay DXP portal. All BOP data is stored in a Liferay content structure and served via the headless article API. The JS on the page reveals the exact API URL and field names.

**API URL pattern:**
```
GET https://www.sbv.gov.vn/o/article/v1.0/articles
  ?scopeKey=20117
  &contentStructureId=10063168
  &pageSize=100
  &filter=<OData filter>
```

**OData filter for latest quarter:**
```
status eq 0 and Date48362898 gt ''
```

**OData filter for date range (e.g. Q4 2025):**
```
status eq 0 and Date48362898 gt '' and Date48362898 ge '2025-10-01' and Date48362898 le '2026-03-31'
```

## BOP Field Map (All 10+ Components)

| JSON field | English label | Unit |
|---|---|---|
| `Date48362898` | Quarter date (e.g. "2025-12-25") | ISO date |
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
| `loiVaSaiSot` | **Errors & Omissions** | M USD |
| `canCanTongThe` | Overall balance | M USD |
| `duTruVaCacHangMucLien` | Reserve assets & related | M USD |
| `taiSanDuTru` | Reserve assets | M USD |

## E&O Sign Convention — CONFIRMED IMF BPM6

**Q4 2025 E&O value:** `loiVaSaiSot = "-12.375"` → -12,375 M USD

Sign interpretation: **negative = unexplained outflows** (residual absorbed by E&O after netting current account + capital account + financial account vs. reserve change).

**Conclusion: Standard IMF BPM6 convention confirmed.**
- positive loiVaSaiSot = unexplained inflows
- negative loiVaSaiSot = unexplained outflows
- FX-incidence discriminator threshold: `FDI_BENIGN when loiVaSaiSot_bn_usd < -1.0` is CORRECT (no sign flip needed)

## Number Format
Vietnamese convention: period = thousands separator, comma = decimal separator.
- `"7.654"` = 7,654 M USD
- `"-12.375"` = -12,375 M USD
- Parse: `str.replace('.','').replace(',','.')` then `parseFloat`

## Sample Response Excerpt (Q4 2025)
```json
{
  "articleId": "10133276",
  "datePublished": "2026-03-27T04:55:00+07:00",
  "fields": {
    "Date48362898": "2025-12-25",
    "Select02257401": "quyIV",
    "canCanVangLai": "7.654",
    "hangHoaRong": "9.135",
    "dichVuRong": "-2.287",
    "canCanTaiChinh": "7.076",
    "dauTuTrucTiepRong": "6.850",
    "loiVaSaiSot": "-12.375",
    "canCanTongThe": "2.355",
    "duTruVaCacHangMucLien": "-2.355"
  }
}
```

## Files
- Script: `scripts/probes/vmt-probe-2.sh`
- Sample: `scripts/probes/vmt-2-sample.json`
