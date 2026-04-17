# Task Report: 1311 — Fix cooldown nowFn binding in taAlertScanJob + bbAlertScanJob
date: 2026-04-16
outcome: APPROVED

## Test Results

| Suite | Pass | Fail |
|---|---|---|
| 1307-ta-alert-scan-job.test.ts | 9 | 0 |
| 1309-bb-alert-scan-job.test.ts | 10 | 0 |
| Full regression (branch) | 4810 | 6 |
| Full regression (main baseline) | 4792 | 24 |
| TypeScript | 0 errors | — |

Note: 6 branch failures are a subset of 24 pre-existing failures on main. Zero regressions introduced.

## Files Changed (branch vs main)

| File | Change |
|---|---|
| `src/scheduler/taAlertScanJob.ts` | COOLDOWN_SQL `?` param + `cooldownCutoff` from `nowFn()` |
| `src/scheduler/bbAlertScanJob.ts` | Same fix |

No test files modified (correct — tests were already written for tasks 1307/1309).

## Acceptance Criteria Verification

| AC | Description | Status |
|---|---|---|
| COOLDOWN_SQL uses `?` not `datetime('now', '-4 hours')` | Both files confirmed | PASS |
| `cooldownCutoff = new Date(nowFn().getTime() - 4 * 3_600_000).toISOString()` | Both files at line 132/133 | PASS |
| Query type updated to `[string, string, string]` | Both files confirmed | PASS |
| Only taAlertScanJob.ts and bbAlertScanJob.ts modified | `git diff --name-only` = 2 files only | PASS |
| 1307 cooldown tests pass | 9/9 | PASS |
| 1309 cooldown tests pass | 10/10 | PASS |

## DDD Compliance: PASS
No domain layer changes. Scheduler layer only. Pre-existing type imports in domain are unrelated to this task.

## Security: PASS
- No `process.env` in modified files
- Parameterized queries: COOLDOWN_SQL now correctly uses `?` — improves binding correctness
- No credentials or hardcoded values added

## Issues Found

### Blocking
None.

### Non-Blocking
- 24 pre-existing test failures on main (tracked separately, not in scope for this task).
- Bun v1.3.11 C++ crash at end of full suite (Bun runtime bug, filed upstream — not reproducible on targeted tests).

## Merge Status
MERGED — `git merge --no-ff task/1311-cooldown-nowfn-fix` to main.
