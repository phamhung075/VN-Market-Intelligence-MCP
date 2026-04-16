# TASK REPORT 1306 — Weekly Portfolio Report: migrate lock to schedulerLockStore

| Field        | Value                                               |
|--------------|-----------------------------------------------------|
| Task         | 1306                                                |
| Branch       | task/1305-1306-tool-count-lock-contract             |
| Reviewer     | QA Agent                                           |
| Date         | 2026-04-15                                         |
| Verdict      | CHANGES_REQUESTED                                  |

---

## Summary

Task 1306 migrates the duplicate-run guard in `weeklyPortfolioReportJob.ts` from the old `cron_job_runs` table check (6-hour window) to `isSchedulerLockFresh` / `acquireSchedulerLock` from `schedulerLockStore.ts` (60-minute window). The new implementation is correct and `schedulerLockStore.ts` is the canonical lock mechanism.

## Checks

| Check                                               | Result  |
|-----------------------------------------------------|---------|
| `weeklyPortfolioReportJob.ts` uses `isSchedulerLockFresh` | PASS    |
| `weeklyPortfolioReportJob.ts` uses `acquireSchedulerLock` | PASS    |
| Source of lock: `schedulerLockStore.ts` (not `cron_job_runs`) | PASS    |
| Lock window preserved (60 min = within spec "6h or 60min") | PASS    |
| `bun test 1221-weekly-report-db-lock.test.ts` (14 tests) | PASS — 14/14 |
| `bun test 1221-weekly-portfolio-db-lock.test.ts` (5 tests) | **FAIL — 4/5** |
| `bun tsc --noEmit`                                  | PASS — 0 errors |
| DDD compliance (scheduler imports infrastructure only) | PASS    |
| Security scan (no `process.env`)                    | PASS    |

## Failing Test

**File:** `src/__tests__/1221-weekly-portfolio-db-lock.test.ts`

**Test:** `skips execution when a 'running' row exists in cron_job_runs within the last 6 hours`

**Root cause:** This test file (written for the original task 1221 `cron_job_runs` implementation) inserts a row into `cron_job_runs` and expects the job to skip. After the migration to `schedulerLockStore`, the job no longer checks `cron_job_runs`, so the skip does not occur and `sendCallCount` is 1 (expected 0).

This is a **legacy test targeting a replaced implementation contract**. The new contract is covered by `1221-weekly-report-db-lock.test.ts` (14/14 pass).

## Required Fix

The test `1221-weekly-portfolio-db-lock.test.ts` must be updated to match the new `schedulerLockStore` contract. Specifically, the failing test case ("skips execution when a 'running' row exists in cron_job_runs") must either:

1. Be deleted (the `cron_job_runs` lock path no longer exists), or
2. Be rewritten to insert a fresh `scheduler_locks` row instead (aligning with the new implementation).

The other 4 passing tests in that file test the "proceeds" path (stale / different job / empty table) and would also benefit from being updated to use `scheduler_locks`, but they pass incidentally because the scheduler_locks table does not block them.

## Files Changed (1306)

- `src/scheduler/weeklyPortfolioReportJob.ts` — lock check migrated from inline `cron_job_runs` SQL to `isSchedulerLockFresh` + `acquireSchedulerLock` + `ensureSchedulerLocksTable` from `schedulerLockStore.ts`

## Action Required

Developer must update `src/__tests__/1221-weekly-portfolio-db-lock.test.ts`:
- Replace the `cron_job_runs`-based skip test with a `scheduler_locks`-based equivalent (insert via `acquireSchedulerLock` or raw INSERT, then assert `sendCallCount === 0`).
- Update or remove the `buildDb()` helper — `cron_job_runs` table is no longer needed for the lock check in this job.

---

### Fix — 2026-04-15
- **Issue**: `1221-weekly-portfolio-db-lock.test.ts` test "skips execution when a 'running' row exists in cron_job_runs within the last 6 hours" fails because production code no longer checks `cron_job_runs` — it uses `scheduler_locks` via `schedulerLockStore.ts`.
- **Root cause**: The test was written against the original `cron_job_runs` implementation contract. After task 1306 migrated the lock to `scheduler_locks` (60-minute window, job name `"weeklyPortfolioReport"`), inserting into `cron_job_runs` no longer prevents execution, so `sendCallCount` was 1 instead of 0.
- **Fix**: Rewrote all 5 tests in `src/__tests__/1221-weekly-portfolio-db-lock.test.ts` to use `scheduler_locks` via `ensureSchedulerLocksTable` / `acquireSchedulerLock` from `schedulerLockStore.ts`. Replaced `buildDb()` helper to call `ensureSchedulerLocksTable(db)` instead of creating `cron_job_runs`. Updated lock window references from "6 hours" to "60 minutes" to match the production contract.
- **Tests added**: None (rewrote existing tests in the same file).
- **Verified**: `bun test src/__tests__/1221-weekly-portfolio-db-lock.test.ts` PASS (5/5) | `bun test src/__tests__/1221-weekly-report-db-lock.test.ts` PASS (14/14) | `bun tsc --noEmit` PASS
