# Task Report 044 — Cash Flow Extractor

**Branch**: `task/044-bctc-cashflow`
**Merged**: 2026-03-26
**Reviewer**: QA Agent (Claude)

---

## Summary

Implements `extractCashFlow(rawText)` — a pure domain function that parses raw Vietnamese BCTC cash flow statement text into a typed `CashFlowStatement` object. Follows the same pattern established by tasks 042 (balance sheet) and 043 (income statement).

## Files Changed

| File | Change |
|------|--------|
| `src/domain/services/cashFlowExtractor.ts` | New — main extractor (143 lines) |
| `src/__tests__/044-bctc-cashflow.test.ts` | New — 6 tests, 56 assertions |
| `src/domain/services/index.ts` | Updated — barrel export for `extractCashFlow` |

## QA Checklist

| Check | Result |
|-------|--------|
| `bun test 044` — all pass | 6/6 pass |
| `bun test` — full regression | 131 pass, 2 fail (pre-existing task 001) |
| `bun tsc --noEmit` | Pre-existing TS errors from task 013 only |
| DDD compliance (domain only, no I/O) | PASS — imports only `parseVnNumber` (domain) and `CashFlowStatement` type |
| `endingCash = beginningCash + netCashFlow` invariant | PASS — tested across 3 samples |
| `FCF = operatingCF + capex` | PASS — tested with exact values |
| Empty input returns zeroed object | PASS |
| Vietnamese dot format (1.000.000) | PASS |
| English comma format (1,000,000) | PASS |
| Minimal input (only section totals) | PASS |
| 100% function + line coverage | PASS |

## Design Notes

- Regex patterns are diacritics-tolerant (e.g., `[ợo]` matches both `ợ` and `o`) for robustness against OCR/encoding variations
- Three sections extracted: Operating (6 fields), Investing (6 fields), Financing (5 fields), plus 3 summary fields and 1 computed field (FCF)
- `findValue()` returns 0 for missing lines — safe defaults for incomplete reports
- FCF computed as `operatingCF + capex` (capex is negative by convention)

## Blocking Issues

None.

## Verdict

**APPROVED** — merged to main.
