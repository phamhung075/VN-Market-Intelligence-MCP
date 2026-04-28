# Task Report: 1408 — startup-catchup report guard
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (targeted): 6 passed / 0 failed
- Full suite (branch): 7855 passed / 36 failed
- Full suite (main baseline): 7849 passed / 36 failed
- Net delta: +6 pass, 0 new failures
- TypeScript: pre-existing 4 errors on main (1383/1397c/server.ts) — none introduced by 1408

## DDD Compliance: PASS
- jobs.ts is scheduler (interface) layer — fs/path reads for report guard are acceptable per task brief
- New imports: node:fs, node:path, domain/services/timeConstants.js (VN_OFFSET_MS) — all clean
- No domain← infrastructure violations introduced

## Security: PASS
- No process.env (Bun.env only pattern respected — scheduler uses Bun.env for CRON_* vars)
- No hardcoded secrets or credentials
- No SQL in new code (pure file-system read)
- File path constructed from date string only — no user input, no traversal risk

## Changes
- `apps/mcp-server/src/scheduler/jobs.ts`
  - `eveningReportIsValid(reportsDir, nowMs)` — reads today-VN-date evening.json, checks vnIndex.fetchedAt < 25h AND newsCount > 0; fail-open on any IO/parse error
  - `shouldRunCatchup()` — new optional `reportCheckFn?: () => boolean` param; when supplied and returns true, catchup is suppressed after the cron-row check passes
  - Production wiring: eveningSummaryJob catchup setTimeout passes `() => eveningReportIsValid()`

- `apps/mcp-server/src/__tests__/1408-startup-catchup-report-guard.test.ts`
  - AC-1a: valid report → skips
  - AC-1b: stale/missing report → runs
  - AC-2: pre-market window not reached → skips (window check wins)
  - AC-3: no reportCheckFn → runs (backward compat)
  - AC-4: cron row exists + valid report → skips (cron-row guard wins)
  - AC-5: weekend + stale report → skips (weekdayOnly wins)

## Merge Status
Merged to main via no-ff merge commit. Branch fix/1408-startup-catchup deleted.
