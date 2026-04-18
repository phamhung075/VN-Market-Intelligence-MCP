# TASK_REPORT_1420 — cron_job_runs coverage for 6 invisible scheduler jobs

**Verdict: APPROVED — merged to main (b49aaa4)**

---

## Summary

| Item | Result |
|------|--------|
| Branch | `task/1420-cron-health-coverage` |
| Merge commit | `b49aaa4` |
| Task tests | 11/11 GREEN |
| Full suite | 5373 pass, 0 fail |
| tsc --noEmit | CLEAN |
| DDD compliance | PASS (scheduler imports infrastructure — correct direction) |
| Security | PASS (no `process.env`) |
| Scope discipline | PASS — minimum change confirmed |

---

## Checks

### 1. Task tests — 11/11 GREEN

All 11 assertions in `src/__tests__/1420-cron-health-coverage.test.ts` passed:
- 4 already-internally-wrapped jobs verified via `recordJobRun` directly
- 6 newly-wrapped jobs verified via exported wrappers
- 1 integration test: all 9 job names in `cron_job_runs` in single in-memory DB pass

### 2. Full regression — 5373 pass, 0 fail

Post-test Bun v1.3.11 C++ panic is a known Bun runtime GC crash unrelated to test results — all assertions completed before panic.

### 3. tsc --noEmit — CLEAN

No errors on branch or post-merge main.

### 4. jobs.ts scope — MINIMUM CHANGE CONFIRMED

Diff vs main shows:
- `+import type { Database } from 'bun:sqlite'` — type-only import
- 6 new exported wrapper functions (lines 153-198), each exactly: `recordJobRun(db, jobName, fn)`
- 6 cron callbacks updated: replaced bare `try/catch` blocks with `await runXxxWithDb(getDb())`
- 4 comment lines added (observability notes)
- Zero CRONS map changes, zero scheduling interval changes, zero business logic changes

### 5. Wrapper signatures — CORRECT

Each of the 6 exported wrappers:
- Takes `(db: Database, fn?: () => Promise<void>)`
- Default `fn` delegates to the corresponding job function
- Body: single `await recordJobRun(db, '<jobName>', fn)`

Job name strings:
- `dataAuditJob:weekly`
- `bctcReparseJob`
- `evidenceAccumulatorJob`
- `baseRateComputationJob`
- `predictionResolutionJob`
- `calibrationReportJob`

---

## Files Modified

| File | Change |
|------|--------|
| `src/scheduler/jobs.ts` | +63 lines: type import + 6 wrappers + 6 cron callback updates |
| `src/__tests__/1420-cron-health-coverage.test.ts` | NEW — 217 lines, 11 assertions |

---

## Non-blocking observations

- `[prediction-resolution] failed to fetch pending claims: no such table: prediction_claims` — expected error in test environment (in-memory DB has no schema), wrapper correctly records `error` status in `cron_job_runs`. Not a defect.
- `runBctcReparseJob` startup catch-up (line 325-332) still uses direct call — intentional, not part of cron registration path, no observability requirement on startup probe.
