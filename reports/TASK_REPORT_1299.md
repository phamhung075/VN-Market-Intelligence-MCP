# Task Report: 1299 — Fix alert pipeline test drift (Step E unconditional after Task 1255)
date: 2026-04-15
outcome: APPROVED

## Test Results
- Unit tests (137-fix-alert-pipeline.test.ts): 19 passed / 0 failed (3 consecutive isolated runs)
- Full suite: 4701 passed / 22 failed (all failures pre-existing or test-isolation artifacts)
- TypeScript: 0 errors

## DDD Compliance: PASS
## Security: PASS

## Change Summary
| File | Change |
|---|---|
| `src/__tests__/137-fix-alert-pipeline.test.ts` | Step E "runs unconditionally" test: `readCalled` flipped `toBe(false)→toBe(true)` after Task 1255 moved Step E outside the market-hours guard. Fixes 6 pre-existing Step-E timeout failures on main. |

## Issues Found
### Blocking
None.
### Non-Blocking
- On main, 137 had 6 pre-existing Step-E failures. This branch resolves all 6. Isolated runs on branch: consistently 19/0.

## Merge Status
MERGED via task/1297-1298-1299-test-drift-batch batch merge.
