<!-- size-justification: 170L — spike findings doc, complete evidence trail, single read-path. -->

# SPIKE-BCTC-CTG-ATTACHMENT-FETCH — Findings

**Date:** 2026-06-03  
**Timebox:** 120 min  
**Verdict:** FULL STATEMENT EXISTS — WRONG ATTACHMENT PULLED (cover letter selected instead of full B02-TCTD statement)  
**Recommendation:** DEV-FIXABLE — see fix spec below.

---

## 1. Discovery API Called

Production strategy for HOSE-listed tickers (CTG = HOSE, numeric ID **2351**):

**Strategy 0 — hsx.vn mediafiles API (primary)**  
`GET https://api.hsx.vn/l/api/v1/1/securities/stock?code=CTG`  
→ resolves CTG → numeric ID `2351` (confirmed live, HTTP 200 from France)

`GET https://api.hsx.vn/m/api/v1/1/mediafiles/5/2351?pageIndex=1&pageSize=100&year=<YEAR>`  
→ returns all BCTC PDF items for CTG for the given year (280 total across 3 pages, 2019–2026)  
Headers required: `type: HJ2HNS3SKICV4FNE`, `Origin: https://www.hsx.vn`

**Strategy 1 — VPS Playwright (fallback, via `BCTC_DISCOVER_URL`)**  
`GET {BCTC_DISCOVER_URL}/CTG?year=<Y>&quarter=<Q>`  
→ runs `discover-bctc-urls-browser.py CTG <Y> <Q>` on VPS  
→ tries HNX POST API first, then UPCOM, then SSC Playwright

---

## 2. Full Attachment List — CTG Latest Quarters (hsx.vn, confirmed live)

All URLs = `https://staticfile.hsx.vn/<filePath with `~` replaced by base>`

| Period | Type | Filename (truncated) | Size | URL prefix |
|--------|------|----------------------|------|------------|
| Q1 2026 | Hợp nhất (consolidated) | `20260428 - CTG - BCTC hop nhat Quy I.2026...signed.pdf` | **6.34 MB** | `Uploads/UploadDocuments/2457879/` |
| Q1 2026 | Riêng lẻ (standalone) | `20260428 - CTG - BCTC rieng le Quy I.2026...signed.pdf` | — | same dir |
| Năm 2025 | Hợp nhất kiem toán | `20260331 - CTG - BCTC hop nhat kiem toan nam 2025...signed.pdf` | — | `Uploads/UploadDocuments/2448737/` |
| Q4 2025 | Hợp nhất | `20260130 - CTG - BCTC hop nhat Quy IV.2025...signed.pdf` | **6.46 MB** | `Uploads/UploadDocuments/2436209/` |
| Q3 2025 | Hợp nhất | `20251030 - CTG - BCTC hop nhat Quy 3.2025...signed.pdf` | **3.87 MB** | `Uploads/UploadDocuments/2414988/` |
| Q2 2025 | Hợp nhất | `20250730 - CTG - BCTC hop nhat Quy II.2025...signed.pdf` | **6.04 MB** | `Uploads/UploadDocuments/2393586/` |
| Q1 2025 | Hợp nhất | `20250429_20250429 - CTG - BCTC hop nhat Quy 1.2025_signed.pdf` | **6.54 MB** | `Uploads/FinancialReport/192/` |
| Q4 2024 | Hợp nhất | `20250124_20250124 - CTG - BCTC hop nhat Quy IV.2024...Signed.pdf` | — | same |

Sizes verified via HTTP HEAD. All return `HTTP/1.1 200 OK`. Full-statement PDFs range **3.87–6.54 MB**.

Historical pattern (2019–2021): some quarters also published a **cover letter** "CBTT link BCTC" (`CV_CBTT_BCTC_...`) at ~350 KB alongside the full statement. Recent quarters (2022+) publish the full statement directly with no separate cover letter on hsx.vn.

---

## 3. What Was Actually Pulled for CTG

**Live DB state** (queried from `mcp-server` container, `bctc_vps_queue`):

| period_year | period_quarter | status | source_url | size |
|-------------|---------------|--------|-----------|------|
| 2026 | Q1 | **done** | `https://owa.hnx.vn/ftp///cims/2026/4_W5/000000016289487_CV_CBTT_BCTC_Quy_I.2026_VI.pdf` | **524 KB** |
| 2025 | Q4 | url_not_found | null | — |
| 2025 | Q3 | pending | `https://staticfile.hsx.vn/.../20260428 - CTG - BCTC hop nhat Quy I.2026...` (**wrong period**) | — |
| 2025 | Q2 | pending | same wrong Q1 2026 URL | — |
| 2025 | Q1 | pending | null | — |
| 2024 | Q4..Q1 | pending | null | — |

**`/app/data/pdfs/CTG_2026_Q1.pdf`** = 524 KB = the `owa.hnx.vn` file  
`financial_reports` row: `extraction_confidence=0.0625`, all financial values = 0, `validation_status=low_confidence`, `net_profit=5` (junk)

**Root cause confirmed:** `owa.hnx.vn/ftp/.../CV_CBTT_BCTC_Quy_I.2026_VI.pdf` is a **Công Văn Công Bố Thông Tin** (disclosure cover letter), not the B02-TCTD financial statement. It is 1–2 pages and contains no balance-sheet or income-statement tables. The text parser extracted nothing meaningful (confidence 0.06).

---

## 4. How the Wrong File Was Selected — Root Cause Chain

Three compounding defects:

### Defect A — VPS Playwright path takes the first HNX article match regardless of document type
`discover-bctc-urls-browser.py` calls the HNX POST API first for **all** tickers (not only HNX-listed ones). The national HNX portal accepts CTG disclosures even though CTG is HOSE-listed. The `_parse_article_ids_and_titles` function matches any article whose title passes `matches_quarter_and_year(title, quarter, year)`. The cover letter title `"CV CBTT BCTC Quy I.2026"` passes because it contains `"2026"` and `"quy 1"`. The function returns the first match and stops — it does **not** check whether the matched article is a full financial statement vs a cover letter.

### Defect B — Enricher ignores period_year/period_quarter from queue row
`bctcQueueEnricherJob` selects only `(id, action_code, attempts)` from the queue. It calls `discoverHosePdfUrls(action_code, { ... })` with **no year/quarter context**. `discoverHosePdfUrls` defaults to `year = new Date().getFullYear()` (2026), `quarter = "Q4"`. The hsx.vn mediafiles API is called with `year=2026`, returning Q1 2026 files. The enricher writes the **first item** from the response (Q1 2026 consolidated) into `source_url` for whatever queue row it is processing — including Q3 2025 and Q2 2025 rows. Those rows now point to a wrong-period PDF. (Observed live: Q3 2025 and Q2 2025 rows both have the Q1 2026 hsx.vn URL.)

### Defect C — `matchesQuarterAndYear` in `discoverBctcPdfUrlDirectApi.ts` misses CTG filenames
`discoverBctcPdfUrlDirectApi.ts` (used only in tests, not the production pipeline) uses `matchesQuarterAndYear` which checks for `"quý N"` (with diacritic) but CTG filenames on hsx.vn use `"quy N"` (no diacritic), `"Quy IV"` (Roman numeral), or `"Quy 3"` (Arabic). This file is **dead code** for production — the enricher uses `discoverHosePdfUrls`/`fetchHsxBctcUrls` instead — but the same matching gap exists in the Python VPS script (where `"quy 1"` IS in the pattern list at line 139 in the `.py` file, so it does match in Python). This defect is not the proximate cause of the CTG failure but the PO's original hypothesis was partially correct about content discrimination.

---

## 5. Verdict

**FULL STATEMENT EXISTS BUT WRONG ATTACHMENT PULLED.**

- Full B02-TCTD consolidated statements exist on hsx.vn for every CTG quarter from Q1 2025 onward, all confirmed HTTP 200, sizes 3.87–6.54 MB.
- No cover-letter-only upstream situation: the full statements are present and fetchable without VPS.
- The system pulled a 524 KB cover letter (from HNX portal via VPS Playwright) instead of the 6.34 MB full consolidated statement (available directly from hsx.vn without VPS).
- The condition is **dev-fixable** through two independent fixes.

---

## 6. Fix Spec

### Fix 1 (HIGH, addresses Defect A): Content discrimination in VPS Playwright script

**File:** `vps-scripts/discover-bctc-urls-browser.py`, function `_parse_article_ids_and_titles`

Add a secondary filter after `matches_quarter_and_year` passes: **reject titles containing cover-letter keywords**. A title that is a full financial statement will contain `"bctc"` or `"báo cáo tài chính"`. A cover letter will contain `"cv cbtt"`, `"công văn"`, `"cbtt"` without `"bctc"` substance, or `"giải trình"` (explanation letter) alone.

Discriminator (add before `return article_id`):

```python
COVER_LETTER_KEYWORDS = ["cv cbtt", "công văn cbtt", "cbtt link bctc", "giải trình", "cong van cbtt"]
FULL_STATEMENT_KEYWORDS = ["bctc", "báo cáo tài chính", "bao cao tai chinh"]

title_lower = title.lower()
is_cover_letter = any(kw in title_lower for kw in COVER_LETTER_KEYWORDS) and \
                  not any(kw in title_lower for kw in FULL_STATEMENT_KEYWORDS)
if is_cover_letter:
    print(f"    SKIP cover-letter id={article_id} title={title[:80]}", file=sys.stderr)
    continue  # keep scanning for the actual full statement
```

For HOSE tickers: prefer the **hsx.vn Strategy 0** which returns the full statement directly. The VPS Playwright / HNX path should only be used as fallback for HNX/UPCOM tickers.

### Fix 2 (HIGH, addresses Defect B): Pass period_year/period_quarter to enricher discovery

**File:** `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`

Extend the SELECT to include `period_year` and `period_quarter`:

```sql
SELECT id, action_code, period_year, period_quarter, attempts
FROM bctc_vps_queue
WHERE ...
```

Pass them to `discoverHosePdfUrls`:

```typescript
const discovery = await discoverHosePdfUrls(item.action_code, {
  timeout: DISCOVERY_TIMEOUT_MS,
  year: item.period_year,          // ADD
  quarter: item.period_quarter,    // ADD
  _fetchHsx: fetchHsxBctcUrls,
  _fetchVpsPlaywright: bctcHttpFetch,
  ...opts.discoverOptions,
});
```

**Effect:** hsx.vn mediafiles API is called with the correct year (e.g. 2025 for Q3 2025 queue row), returning only PDFs for that year. The enricher then needs a secondary filter to select the matching quarter from the returned list (see Fix 3).

### Fix 3 (MEDIUM, new): Quarter discrimination in `fetchHsxBctcUrls`

**File:** `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts`

Currently `fetchMediafileUrls` returns ALL PDFs for the year. Add quarter filtering using the `time` field returned by the API (format: `"01.2025"` for Q1 2025, `"03.2025"` for Q3 2025, `"04.2025"` for Q4 2025) and/or the `fileName`.

The `time` field is the canonical discriminator. Map: `"01"→Q1`, `"02"→Q2`, `"03"→Q3`, `"04"→Q4`. Also prefer `type="Quý"` (quarterly) over `type="Năm"` (annual) or `type="Bán niên"` (semi-annual). Prefer `fileName` containing `"hop nhat"` (consolidated) over `"rieng le"` (standalone).

---

## 7. Correct URLs for CTG (for reference / manual backfill)

| Period | Correct URL |
|--------|------------|
| Q1 2026 hop nhat | `https://staticfile.hsx.vn/Uploads/UploadDocuments/2457879/20260428%20-%20CTG%20-%20BCTC%20hop%20nhat%20Quy%20I.2026%20va%20giai%20trinh%20bien%20dong%20loi%20nhuan_signed.pdf` |
| Q4 2025 hop nhat | `https://staticfile.hsx.vn/Uploads/UploadDocuments/2436209/20260130%20-%20CTG%20-%20BCTC%20hop%20nhat%20Quy%20IV.2025%20va%20giai%20trinh%20bien%20dong%20loi%20nhuan_signed.pdf` |
| Q3 2025 hop nhat | `https://staticfile.hsx.vn/Uploads/UploadDocuments/2414988/20251030%20-%20CTG%20-%20BCTC%20hop%20nhat%20Quy%203.2025%20va%20giai%20trinh%20bien%20dong%20loi%20nhuan_signed.pdf` |
| Q2 2025 hop nhat | `https://staticfile.hsx.vn/Uploads/UploadDocuments/2393586/20250730%20-%20CTG%20-%20BCTC%20hop%20nhat%20Quy%20II.2025%20va%20giai%20trinh%20bien%20dong%20loi%20nhuan_signed.pdf` |
| Q1 2025 hop nhat | `https://staticfile.hsx.vn/Uploads/FinancialReport/192/20250429_20250429%20-%20CTG%20-%20BCTC%20hop%20nhat%20Quy%201.2025_signed.pdf` |

All confirmed HTTP 200.

---

## 8. bctc-analyst Escalation Recommendation

Do NOT close as NOT-DEV-FIXABLE. The upstream data is present and accessible. Close the "8 consecutive blocked cycles" escalation with: **BLOCKED-PENDING-FIX** (Fixes 1–3 above). The correct Q1 2025 PDF exists at hsx.vn and is 6.54 MB.

The CTG Q1 2026 financial_reports row with `extraction_confidence=0.0625` should be **deleted and re-ingested** after Fix 2 + Fix 3 are deployed. The current row is garbage (all zeros, net_profit=5 from cover-letter junk text).
