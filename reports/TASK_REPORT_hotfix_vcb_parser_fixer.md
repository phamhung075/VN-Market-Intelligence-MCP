# Task Report: hotfix-vcb-parser-fixer
date: 2026-04-29
outcome: CHANGES_REQUESTED

## Test Results

- Unit tests (hotfix-vcb-parser): 10 passed / 0 failed
- Unit tests (287-balance-sheet-unit-header): 34 passed / 0 failed
- Full suite: 8047 passed / 25 failed (threshold: >= 8025 — PASS)
- TypeScript: 4 errors in `1383-macro-alert-dispatch.test.ts` and `1397c-vn-index-refresh.test.ts` — PRE-EXISTING, not introduced by this hotfix

## DDD Compliance: PASS

- `balanceSheetExtractor.ts` imports only from `domain/services/vnNumberParser.js`, `./extractorGuards.js`, and `bctc-schema` — zero infrastructure imports.

## Security: PASS

- No hardcoded credentials.
- No `process.env` usage.
- No SQL in changed files.

## Fixer Commits Verified

| Commit | Description | Status |
|--------|-------------|--------|
| `c3e6715c` | Year guard in extractNumber fallback (BARE_YEAR regex) + expand scan to 200 lines | Correct |
| `7070a52f` | Expand scan window 200 → 400 lines | Correct |

## B-1 / B-2 Fix Assessment

**B-1 (year guard in fallback):** CORRECTLY IMPLEMENTED. The `BARE_YEAR = /^\d{4}$/` guard on the fallback loop now skips bare 4-digit integers in 1990–2030. The required test case (year from legal reference "Nghị định 93/2017/NĐ-CP") was added to `287-balance-sheet-unit-header.test.ts` at the legal-reference guard section.

**B-2 (scan window to 400 lines):** CORRECTLY IMPLEMENTED. "Triệu VND" appears at line 311 of VCB OCR text — well within the 400-line window. Unit multiplier is correctly detected as 1 (triệu).

## Live VCB Reparse Result — FAIL

After deleting the stale row and triggering `runBctcReparseJob()`, the pipeline completed (examined=2, resolved=2). However the stored values are still wrong:

| Field | Expected | Actual |
|-------|----------|--------|
| total_assets | ~1,904,000+ (millions VND) | 35,202,546 |
| total_liabilities | ~1,800,000+ (millions VND) | **93** |
| equity_total | ~100,000+ (millions VND) | **1** |

The year values (2017/2025) confirmed fixed by B-1 are gone. But new wrong values persist.

## New Blocking Issue — B-3: Prose Contamination for Bank BCTCs

**Root cause:** VCB bank BCTC is a split-block layout (3,964 OCR lines). Labels appear on lines 430–472; actual financial values start at line 486+, approximately 30+ lines below the label lines. The `findValue` function with `LOOKAHEAD_LINES=3` cannot bridge this gap.

The pattern for `NỢ PHẢI TRẢ` (liabilities) matches line 1644 in the narrative prose section:
```
1644: ...khoản mục nợ phải trả trên báo cáo
1645: Nghị định số 93/2017/NĐ-CP do Chính phủ
1646: ban hành ngày 7 tháng 8 năm 2017 ("Nghị định 93").
```
The look-ahead returns `93` (the decree number) — not a year, so BARE_YEAR guard does not block it. It's a 2-digit decree ID.

For `VỐN CHỦ SỞ HỮU` (equity), a similar prose match returns `1`.

**Total liabilities correct value from OCR:** ~1,904,318,782 million VND (line 529 of OCR text). Total equity: ~204,941,834 million VND (line 543).

**Fix required:** For bank BCTCs (detected by "TCTD" in unit header or "Triệu VND" column format), the extractor must use `parseSplitBlockBalanceSheet` path OR restrict `findValue` scans to only the balance-sheet table section (lines up to the first appearance of the value block, identified by the date header "31/3/2025" or "Triệu VND" column header).

**File:** `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`

## Issues Found

### Blocking

**B-3** — `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`
VCB bank BCTC split-block layout: `findValue` matches `NỢ PHẢI TRẢ` in narrative prose (line 1644), returning decree number `93` instead of real liabilities (~1,904,318,782 million VND). Look-ahead gap is ~35 lines; `LOOKAHEAD_LINES=3` cannot bridge it.
DB result: `total_liabilities=93`, `equity_total=1`. Acceptance criterion (millions range) NOT met.

### Non-Blocking

- TS errors in `1383-macro-alert-dispatch.test.ts` and `1397c-vn-index-refresh.test.ts` are pre-existing, not in scope for this hotfix.

## Merge Status

CHANGES_REQUESTED — B-3 must be resolved before merge.
