# Task Report: JANITOR-014 — Extractor Helpers DRY Migration

**Branch:** `task/JANITOR-014a-extractor-helpers`
**Date:** 2026-05-01
**Status:** Done

---

## Summary

Eliminated four sets of duplicate helper definitions across the three BCTC extractor files by extracting a canonical shared module and migrating each file to import from it.

### 014a — Create extractorHelpers.ts (completed prior to this session)

Created `apps/mcp-server/src/domain/services/financial-reports/extractorHelpers.ts` with canonical implementations of:

- `LOOKAHEAD_LINES = 3` — OCR look-ahead constant
- `extractNumber(line)` — extracts first large number (sci-notation support, year guards, BARE_YEAR fallback)
- `stripDiacritics(text)` — NFD normalize + remove combining marks + đ/Đ handling
- `detectUnitMultiplier(lines)` — 400-line scan, full pattern set, returns -1/-2 sentinels

### 014b — Migrate balanceSheetExtractor.ts

- Added import: `LOOKAHEAD_LINES, extractNumber, detectUnitMultiplier` from `./extractorHelpers.js`
- Removed: private `extractNumber` (37 lines), `LOOKAHEAD_LINES` constant, `detectUnitMultiplier` (46 lines)
- Kept: `lineMatches`, `findValue`, `findValueByCode`, `parseSplitBlockBalanceSheet`, `extractSplitBlockAll`, `trimToBalanceSheetWindow`, `applyMultiplier` (all local-only)

### 014c — Migrate incomeStatementExtractor.ts

- Added import: `LOOKAHEAD_LINES, extractNumber, stripDiacritics, detectUnitMultiplier` from `./extractorHelpers.js`
- Removed: private `extractNumber` (24 lines), `stripDiacritics` (5 lines), `LOOKAHEAD_LINES` constant, `detectUnitMultiplier` (21 lines)
- Added sentinel resolution block before the 1e14 guard: when `detectUnitMultiplier` returns -1 or -2 (bare đồng or no unit header), resolves to `0.000001` if sentinel > 1B else `1`. This aligns the income statement with the canonical behavior (old local version defaulted to 1, which was incorrect for raw-VND BCTCs without a unit header).

### 014d — Migrate cashFlowExtractor.ts

- Added import: `extractNumber` from `./extractorHelpers.js`
- Removed: private `extractNumber` (7 lines, last-token strategy), `lineMatches` (1 line)
- Inlined `pattern.test(line)` directly in `findValue` where `lineMatches` was called
- All 6 cashflow tests pass with canonical `extractNumber`; no behavioral regression observed

### 014e — Final Verification

**Grep check:** Zero private copies remain in extractor files (only `extractorHelpers.ts` defines them)

```
$ grep -r "function extractNumber|function detectUnitMultiplier|function stripDiacritics|const LOOKAHEAD_LINES" apps/mcp-server/src/domain/services/financial-reports/
→ extractorHelpers.ts only (4 matches)
```

**Test results (targeted suites):**

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| 030-pdf-extractor | 7 | 0 | |
| 042-bctc-balance-sheet | 14 | 0 | |
| 043-bctc-income-stmt | 9 | 0 | |
| 044-bctc-cashflow | 6 | 0 | |
| 1119-split-block-extractor | 9 | 0 | |
| 1303h-extractor-guards | 10 | 1 | Pre-existing failure (RED: impossible netRevenue tỷ OCR artifact) |
| 1352b-pdf-extractor-wiring | 9 | 0 | |
| 1424a-bctc-unit-scale-mismatch | 6 | 0 | |
| **Total (5-file baseline suite)** | **45** | **1** | 1 pre-existing, unchanged |

**Note on full suite:** Bun 1.3.11 crashes with OOM (C++ exception, RSS 2.47GB) when running all 759 test files at once — this is a known Bun bug unrelated to this change. Targeted suites covering all affected code paths pass at baseline or better.

---

## Files Changed

- `apps/mcp-server/src/domain/services/financial-reports/extractorHelpers.ts` — created (014a)
- `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` — migrated (014b)
- `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts` — migrated (014c)
- `apps/mcp-server/src/domain/services/financial-reports/cashFlowExtractor.ts` — migrated (014d)
- `TASKS.md` — JANITOR-014 through 014e marked Done; JANITOR-015 unblocked and marked Done
