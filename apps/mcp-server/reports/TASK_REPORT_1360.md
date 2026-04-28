# Task Report: 1360 — Morning Briefing Bug Fixes (title ellipsis + delta arrows)
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (targeted — 3 files): 30 passed / 0 failed
  - 1511-morning-briefing-global-snapshot.test.ts: AC-1–AC-9 (9 tests including 4 new arrow tests)
  - 1434-morning-briefing-commodity-values.test.ts: T1–T7 (7 tests including 3 new arrow tests)
  - 101-job-morning-briefing.test.ts: 14 tests
- Full suite: 7851 passed / 0 failed (7872 tests across 682 files)
- TypeScript: 0 errors after QA fix applied (see below)

## DDD Compliance: PASS
- `src/domain/` contains zero runtime imports from `infrastructure/` or `application/`
- All grep matches in domain/ were comments only
- Changed files: `assembleBriefing.ts` (application layer) and `morningBriefingJob.ts` (scheduler layer) — correct layers for DB access and formatting respectively

## Security: PASS
- No `process.env` usage in changed files (Bun.env standard maintained)
- No hardcoded credentials or API keys
- `getIndicatorHistory` uses parameterized SQL query (existing infra, not new code)
- No PDF path traversal vectors

## Implementation Verification
- `formatStoryTitle` used at `morningBriefingJob.ts:124` — confirmed
- `deltaArrow` helper defined at `morningBriefingJob.ts:35` — confirmed
- `prevVix`, `prevDxy`, `prevSp500`, `prevHangSeng` optional fields in `GlobalSnapshot` interface at `assembleBriefing.ts:56–62` — confirmed
- All 4 global metrics append delta arrow via `formatGlobalSnapshotSection` — confirmed
- `getIndicatorHistory` called for each tracked commodity, `previousValue` populated when >= 2 rows — confirmed

## Issues Found
### Blocking
- TS2532 `Object is possibly 'undefined'` at `assembleBriefing.ts:925` — introduced by the new `history[1].value` index access inside `history.length >= 2` guard. TypeScript `noUncheckedIndexedAccess` requires optional chaining even with length guard.

**QA Fix Applied**: Changed `history[1].value` to `history[1]?.value` at line 925. Semantically identical (the `?` short-circuits to `undefined` which the outer ternary already handles). TSC now exits clean.

### Non-Blocking
None.

## Merge Status
Approved. TSC fix committed to main.
