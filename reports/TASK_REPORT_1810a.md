# Task Report: 1810a — BCTC Income Statement Extractor Hardening
date: 2026-05-01
outcome: APPROVED

## Test Results
- Targeted (041 + 043): 33 passed / 0 failed
- Full suite: 8519 passed / 24 failed (baseline was 8501/25 — net improvement: +18 pass, -1 fail)
- TypeScript: 0 errors (`bun tsc --noEmit`)

## Scope Check: PASS
Exactly 5 files modified between `main` and task branch:
- `apps/mcp-server/src/domain/services/vnNumberParser.ts`
- `apps/mcp-server/src/domain/services/financial-reports/extractorGuards.ts`
- `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`
- `apps/mcp-server/src/__tests__/041-vn-number-parser.test.ts`
- `apps/mcp-server/src/__tests__/043-bctc-income-stmt.test.ts`

No unrelated files touched.

## DDD Compliance: PASS
- Zero `infrastructure/` imports in any `domain/` file.
- All three domain files are pure functions (zero I/O, zero external imports beyond domain-internal).
- `extractorGuards.ts` imports only from `bctc-schema` (type only).
- `incomeStatementExtractor.ts` imports `parseVnNumber` (domain) and `guardFinancialField` (domain) — no layer violation.

## Security: PASS
- No `process.env` usage — all three domain files have zero env references.
- No hardcoded credentials or API keys.
- No SQL (pure domain functions — not applicable).
- No `any` type annotations (comment text "if netRevenue" matched as false positive; confirmed not a type annotation).

## Changes Verified

### vnNumberParser.ts
Scientific notation guard inserted before Vietnamese/English format detection. Regex `/^[\d.]+[eE][+-]?\d+$/` correctly handles positive/negative sci-notation tokens from OCR output. Negative sign handled by the existing pre-strip logic. Three new test cases cover positive, negative, and explicit `+` exponent forms.

### extractorGuards.ts
`GUARD_MAX` reduced from 500T triệu to 2T triệu. Comment updated to "10× VCB annual revenue ceiling". Existing `guardBalanceSheet` function unchanged. The tighter bound correctly rejects values exceeding any physically plausible VN listed company ceiling.

### incomeStatementExtractor.ts
Token regex in both `extractNumber` and `extractColumnNumber` extended with `(?:[eE][+-]?\d+)?` to capture sci-notation tokens from OCR. Multi-field magnitude sentinel (`allRawFields` = max of 6 core fields instead of `netRevenue` alone) correctly handles cases where only one field's OCR produces a sci-notation explosion. Sentinel logic: if `sentinel * m > 1e14` → `m = 0.000001`; else if `sentinel > 1_000_000_000` → `m = 0.000001`.

### GUARD_MAX fixture impact
Existing fixtures in `043-bctc-income-stmt.test.ts` all use values in the low millions of triệu (max ~20,000,000). None approach the new 2T ceiling. No regressions from GUARD_MAX tightening.

## Issues Found

### Blocking
None.

### Non-Blocking
- `extractorGuards.ts` line coverage is 16.39% — `guardBalanceSheet` function has no dedicated test. Pre-existing gap, not introduced by this task. Tracked as JANITOR-014/015 backlog.
- `detectUnitMultiplier` in `incomeStatementExtractor.ts` diverges from the balance sheet version (50-line scan vs 400-line, missing bank BCTC patterns). Tracked as JANITOR-015 backlog.

## Merge Status
Merged to main via no-ff merge commit:
`feat(bctc): income statement extractor hardening — sci-notation parsing, GUARD_MAX 500T→2T, multi-field magnitude sentinel, HPG short-pattern`
Branch `task/1810a-income-stmt-guards` deleted.
