# Task Report 043 — Income Statement Extractor

## Task Info

| Field | Value |
|-------|-------|
| Task # | 043 |
| Title | Income statement extractor |
| Branch | `task/043-bctc-income-stmt` |
| Layer | Domain |
| Depends on | 041 (Vietnamese number parser) |
| Merged to main | 2026-03-26 |

## Summary

Pure domain service that parses raw Vietnamese BCTC text (Bao cao KQHDKD) into a typed `IncomeStatement` object. Follows the same pattern established by the balance sheet extractor (task 042): regex-based line matching with `parseVnNumber` for number extraction, defaulting missing fields to 0.

## Files Changed

| File | Change |
|------|--------|
| `src/domain/services/incomeStatementExtractor.ts` | New — main extractor (194 lines) |
| `src/__tests__/043-bctc-income-stmt.test.ts` | New — 7 tests, 87 assertions |
| `src/domain/services/index.ts` | Updated — added barrel export |

## QA Checklist

| Check | Result |
|-------|--------|
| `bun test src/__tests__/043-bctc-income-stmt.test.ts` | 7/7 pass, 87 assertions |
| `bun test` (full regression) | 118 pass, 1 pre-existing fail (task 001 missing fetchers dir) |
| `bun tsc --noEmit` | 0 errors |
| DDD compliance — no infrastructure imports | PASS |
| All 25 IncomeStatement fields mapped | PASS |
| Fallback logic for computed fields | PASS (grossProfit, otherProfit, totalIncomeTax) |
| Security scan (pure domain, no I/O) | PASS — no concerns |

## Architecture Notes

- **Pattern**: Same as `balanceSheetExtractor.ts` — `findValue(lines, regex)` with Vietnamese diacritics-tolerant patterns
- **25 regex patterns** cover all income statement line items including: revenue, COGS, financial items, operating expenses, other income/expenses, tax, net profit, minority interest, EPS
- **Computed fields**: `ebit` approximated as `operatingProfit`; `ebitda` set to 0 (requires depreciation from cash flow statement, to be addressed in task 045)
- **Fallback logic**: `grossProfit = netRevenue - cogs` when not explicitly stated; similar for `otherProfit` and `totalIncomeTax`

## Test Coverage

| File | Functions | Lines |
|------|-----------|-------|
| `incomeStatementExtractor.ts` | 100% | 98.08% |

Uncovered: line 107 (grossProfit fallback when netRevenue > 0 but grossProfit line missing — edge case where all samples have explicit grossProfit lines).

## Verdict

**APPROVED** — no blocking issues. Clean implementation consistent with established patterns.

## Pre-existing Issues (not blocking)

- Task 001 test failure: `src/infrastructure/fetchers` directory does not exist. This is a known issue present on main before this merge.
