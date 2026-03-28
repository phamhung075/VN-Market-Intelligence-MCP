# Task Report 042 — Balance Sheet Extractor

**Branch**: `task/042-bctc-balance-sheet`
**Merged to**: `main`
**Date**: 2026-03-25
**Status**: DONE

---

## Summary

Implements `extractBalanceSheet(rawText)` — a pure domain service that parses raw Vietnamese BCTC (balance sheet) text and returns a fully typed `BalanceSheet` object. All fields default to 0 when not found, ensuring safe downstream computation.

## Files Changed

| File | Change |
|------|--------|
| `src/domain/services/balanceSheetExtractor.ts` | New — 202 lines. Main extractor with Vietnamese regex patterns for all balance sheet line items |
| `src/domain/services/index.ts` | Updated — re-exports `extractBalanceSheet` |
| `src/__tests__/042-bctc-balance-sheet.test.ts` | New — 223 lines. 5 tests, 70 assertions |

## Test Results

| Test | Status |
|------|--------|
| Extracts all fields from a standard Vietnamese BCTC | PASS |
| Handles missing fields gracefully (defaults to 0) | PASS |
| Parses English comma-formatted numbers correctly | PASS |
| Maintains totalAssets = currentAssets + nonCurrentAssets invariant | PASS |
| Returns zeroed BalanceSheet for empty input | PASS |

**Coverage**: 100% functions, 90.47% lines (uncovered: line 148 — fallback totalAssets computation only triggered when explicit total is missing but sub-totals exist; all test samples include explicit totals)

## Type Check

`bun tsc --noEmit` — 0 errors

## DDD Compliance

- **Layer**: Domain (pure business logic)
- **Imports**: `./vnNumberParser` (same domain layer) + type-only imports from `bctc-schema`
- **No I/O**: Zero infrastructure imports. Pure function, deterministic output.
- **Verdict**: PASS

## Design Notes

- Uses 30+ Vietnamese regex patterns with diacritics-aware alternatives (e.g., `t[ai]i\s+s[ao]n` matches both `tai san` and `tai san` with diacritics)
- Delegates number parsing to `vnNumberParser` (task 041) — handles both Vietnamese dot-separator and English comma-separator formats
- Fallback logic: if `totalAssets` line not found, computes from `currentAssets.total + nonCurrentAssets.total`
- Same fallback for `totalLiabilities`

## Blocking Issues

None.

## Recommendations

- Task 043 (income statement) and 044 (cash flow) can follow the same pattern established here
- Line 148 fallback path should be covered in task 121 (BCTC edge case tests)
