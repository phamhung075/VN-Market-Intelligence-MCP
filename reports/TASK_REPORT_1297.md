# Task Report: 1297 — Fix pipeline-watchdog test drift (schedulerFileCount 28→29)
date: 2026-04-15
outcome: APPROVED

## Test Results
- Unit tests (1190-pipeline-watchdog.test.ts): 16 passed / 0 failed
- Full suite: 4701 passed / 22 failed (all failures pre-existing or test-isolation artifacts — see note)
- TypeScript: 0 errors

## DDD Compliance: PASS
## Security: PASS

## Change Summary
| File | Change |
|---|---|
| `src/__tests__/1190-pipeline-watchdog.test.ts` | `schedulerFileCount` assertion updated 28→29 to match current production state (franceSummaryJob added sprint 085) |

## Issues Found
### Blocking
None.
### Non-Blocking
- Full suite shows 22 failures. Investigation confirmed all are pre-existing: 1282-sector-classification-dedup (fails on main too), and timeout-sensitive 137/278/1294 Step-E tests that fail due to shared SQLite state across parallel workers. All 3 targeted test files pass 0 failures in isolation.

## Merge Status
MERGED via task/1297-1298-1299-test-drift-batch batch merge.
