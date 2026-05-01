# Task Report: 1377 — alert-digest DB-backed dedup guard
date: 2026-04-28
outcome: APPROVED

## Test Results
- Targeted tests (188-alert-digest + 1137-observability): 23 passed / 0 failed
- Full suite on main after cherry-pick: 7907 passed / 6 failed (baseline was 7905/6 — net +2 from 2 new dedup tests)
- TypeScript: 2 pre-existing errors in 1383-macro-alert-dispatch.test.ts — zero new errors introduced by 1377

## DDD Compliance: PASS
- `alertDigestJob.ts` is interface/scheduler layer
- Imports: `application/usecases/assembleAlertDigest.js` (correct), `infrastructure/logger.js` (correct)
- No domain layer imports from infrastructure

## Security: PASS
- No `process.env` usage
- No hardcoded credentials
- SQL in `alreadySentToday()` uses parameterized query with no user input (fully static)
- Fail-open: catch block returns `false` — guard cannot silently suppress the digest on DB error

## Issues Found
### Blocking
None.

### Non-Blocking
- TSC errors in `1383-macro-alert-dispatch.test.ts` are pre-existing (present on main before this commit). Not introduced by 1377.
- Full suite failures (6) are pre-existing on main.

## Fix Summary
Root cause: `_lastDigestSentDate` was a module-level `let` variable — reset to `""` on every container restart. A Docker rolling restart after 21:00 cleared the guard, allowing a second digest send when the cron re-registered.

Fix: `alreadySentToday(db: Database): boolean` queries `cron_job_runs` for a `status='success'` row for `alertDigestJob` since `date('now')`. `recordJobRun` already writes the success row after the callback completes, so a restarted container finds the row and skips. Guard is fail-open (returns `false` on DB error).

## Merge Status
Merged to main via cherry-pick: commit `8bc0af98`
Worktree removed: pending
