# Task Report: 1791 — assembleAlertDigest intra-digest identical message dedup
date: 2026-04-30
outcome: APPROVED (with QA fix applied)

## Test Results
- Unit tests (188-alert-digest.test.ts — 26 total, 3 new for 1791): 26 passed / 0 failed
- Full suite (on task/1790-alert-digest-dedup after TS fix): 8345 passed / 30 failed (baseline 8330/30 — +15 pass, 0 new failures)
- TypeScript: 0 errors (after QA fix)

## DDD Compliance: PASS
- `assembleAlertDigest.ts` in `application/usecases` — imports from `infrastructure/db/schema.js` and `infrastructure/logger.js` permitted (application → infrastructure allowed)
- No domain layer violations

## Security: PASS
- No hardcoded credentials
- No `process.env` usage
- SQL queries parameterized (existing pattern unchanged)

## Issues Found
### Blocking
1. **TypeScript error** — `188-alert-digest.test.ts` lines 658+666: `msgs[0]` and `msgs[j]` typed as `string | undefined` due to `noUncheckedIndexedAccess: true`; `seedAlert` requires `message: string`. Caused `bun tsc --noEmit` to exit with code 2.
   - Fixed by QA: replaced array index access with const destructuring + for-of loop.
   - Commit: `df550ba6` on branch `task/1790-alert-digest-dedup` before merge.
   - Test semantics preserved: 10× msgA + 1× each of msgB/msgC/msgD = 13 raw, 4 unique.

### Non-Blocking
- Branch naming inconsistency: 1791 code was committed to `task/1790-alert-digest-dedup` rather than `task/1791-alert-digest-intra-dedup` (which was empty at main). `task/1791-alert-digest-intra-dedup` deleted (was at main, nothing to merge).

## Changes Verified
- `apps/mcp-server/src/application/usecases/assembleAlertDigest.ts`:
  - `Set<string>` dedup on `message` string before `top3` slice (lines ~307-318)
  - `overflow = deduplicated.length - top3.length` (unique-based, not raw)
  - Raw `count` preserved unchanged
- `apps/mcp-server/src/__tests__/188-alert-digest.test.ts`: 3 new tests (TC: 24 identical → 1 unique; mixed unique+dupe; overflow unique-based)

## Merge Status
Merged to main via `merge(1791+1792)` commit `b76c3c19` on 2026-04-30.
Branch `task/1790-alert-digest-dedup` deleted. Branch `task/1791-alert-digest-intra-dedup` deleted.
