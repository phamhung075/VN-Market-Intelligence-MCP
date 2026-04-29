# Handoff: hotfix-vcb-parser — fixer pass 2

## Context

QA verified fixer's two commits (`c3e6715c`, `7070a52f`). B-1 (year guard) and B-2 (400-line window) are correctly implemented and all unit tests pass (10/10 hotfix, 34/34 on 287). Full suite: 8047/8072.

The live VCB reparse still produces wrong values. The year problem is fixed — `2017` and `2025` no longer appear. But a new source of wrong values was exposed: prose text contamination.

## Remaining Blocking Issue

### B-3: Prose contamination in split-block bank BCTCs

**File:** `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`

**Root cause:** VCB bank BCTCs are 3,964-line OCR texts. The balance-sheet table uses a split-block layout:
- Labels block: lines ~430–472 (NỢ PHẢI TRẢ, VỐN CHỦ SỞ HỮU, etc.)
- Value block: lines ~486+ (actual numbers, ~35 lines below labels)

The `findValue` function with `LOOKAHEAD_LINES=3` cannot bridge a 35-line gap. So when `findValue` fails on the labels block, it continues scanning the full text. It matches `"nợ phải trả"` again at line 1644 in the **narrative prose** section:

```
1644: ...được ghi nhận là khoản mục nợ phải trả trên báo cáo
1645: Nghị định số 93/2017/NĐ-CP do Chính phủ ban hành
1646: ngày 7 tháng 8 năm 2017 ("Nghị định 93").
```

Look-ahead from line 1644 returns `93` (the decree number). This is NOT a bare year (2-digit integer), so BARE_YEAR guard does not block it. Result: `total_liabilities=93`.

Similarly `equity_total=1` comes from prose elsewhere.

**Correct values in OCR text:**
- Total liabilities (TONG NO PHAI TRA): ~1,904,318,782 million VND — appears at line ~529
- Total equity (TONG VON CHU SO HUU): ~204,941,834 million VND — appears at lines ~533–543

**The value block section starts after the date+unit header:**
```
Line 486: 31/3/2025
Line 487: Triệu VND
Line 489: 125.298.467   ← first value
...
Line 529: 1.904.318.782  ← total liabilities (31/12/2024 column)
Line 543: 204.941.834    ← equity (31/12/2024 column)
```

## Required Fix

Add a section boundary guard to `findValue` (or create a bank-BCTC extraction path) so that the scan is restricted to lines **before** the prose section begins.

Recommended approach: detect the start of the value block (a line matching the date header pattern `\d{1,2}/\d{1,2}/\d{4}` immediately above a "Triệu VND" line) and a prose boundary marker (e.g., "Thuyết minh" sections or the first line beyond 600+ lines from the table start). Do not scan prose beyond that boundary for balance-sheet values.

Simpler alternative: if line count exceeds 1,000 lines and the pattern for NỢ PHẢI TRẢ has no number within 50 lines (not just 3), use `parseSplitBlockBalanceSheet` which already handles value-block mapping by position.

## Required Test Coverage

Add a test case in `hotfix-vcb-parser.test.ts` that:
1. Has a split-block layout (labels in one block, values 35+ lines later)
2. Includes a prose section with "nợ phải trả" and a decree number ("93/2017/NĐ-CP")
3. Asserts `totalLiabilities > 10_000` (not 93)
4. Asserts `equity.total > 10_000` (not 1 or 0)

## Acceptance Criteria (unchanged)

After fix:
1. `bun test hotfix-vcb-parser` — all pass
2. `bun test 287` — all pass (no regression)
3. Full suite >= 8025 pass
4. VCB Q1 2025 reparse: `total_liabilities > 1_000_000` AND `equity_total > 10_000`

## After Fix

1. Run `bun test src/__tests__/hotfix-vcb-parser.test.ts src/__tests__/287-balance-sheet-unit-header.test.ts`
2. Run full suite — must stay >= 8025
3. Re-trigger reparse:
   ```
   docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e \
     "const m = await import('./src/scheduler/financial-reports/bctcReparseJob.js'); await m.runBctcReparseJob();"
   ```
   (Delete the bad VCB 2025-Q1 row first so disk-scan picks it up — or QA will handle this.)
4. Verify in DB that `total_liabilities > 1_000_000` and `equity_total > 10_000`
5. Hand off back to QA
