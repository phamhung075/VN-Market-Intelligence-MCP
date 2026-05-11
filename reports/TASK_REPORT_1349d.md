# Task Report: 1349d — BCTC Validation Edge Cases
date: 2026-04-27
outcome: APPROVED (with QA fix)

## Test Results
- Unit tests: 10 passed / 0 failed (1345b-bctc-financial-validation.test.ts)
- Full suite: not re-run (scoped review)
- TypeScript: 0 errors in 1349d scope after QA fix (2 pre-existing errors in 1348a test file — out of scope)

## Acceptance Criteria
- 10+ edge case tests: **10 pass** PASS
- `bun tsc --noEmit` for 1349d files: **0 errors** PASS (after QA fix)

## DDD Compliance: PASS
- `financialFiguresValidator.ts` is pure domain — no infrastructure imports.

## Security: PASS
- No I/O, no env vars, no SQL.

## Issues Found
### Blocking
- TS2345 at `financialFiguresValidator.ts:66,73` — `parseInt()` called with `string | undefined` argument (regex capture groups typed as `string | undefined` in strict mode). Fixed by QA: `?? "0"` fallback on both capture groups. Tests remain 10/10 green after fix.

### Non-Blocking
- Pre-existing TS errors in `1348a-cascade-brokerage-competitive.test.ts` (lines 46, 54) — `AnalysisLevel` and `DomainType` type mismatches. Not introduced by 1349d. Logged as separate debt.

## QA Fix Applied
File: `apps/mcp-server/src/domain/services/financial-reports/financialFiguresValidator.ts`
Lines 66 + 73: `quarterMatch[1]` → `quarterMatch[1] ?? "0"`, `annualMatch[1]` → `annualMatch[1] ?? "0"`

## log_fix
"Added 7 BCTC validation edge case tests (VAL-07 through VAL-10), hard violation threshold at ratio > 5.0"

## Merge Status
Commit 827f42bc already on main. QA fix committed on main.
