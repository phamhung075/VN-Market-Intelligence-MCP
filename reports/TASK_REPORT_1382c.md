# Task Report: 1382c — signalOutcomeJob Cron Wiring
date: 2026-04-28
outcome: APPROVED

## Summary

Final slice of TASK-1382: registers `signalOutcomeJob` in `jobs.ts` so it fires daily at
08:30 UTC (30 min after VN market close at 08:00 UTC) on weekdays only. AC-9 integration
test asserts the CRONS key is present and a string. This closes the parent task 1382:
signal outcome tracking is now wired end-to-end (fired → confirmed / false_positive).

## Test Results

- Task suite (1382-signal-outcome-job.test.ts): 9/9 pass (AC-1 through AC-9)
- Full suite: 7915 total — 7889 pass / 5 fail / 21 skip
- 5 failures: pre-existing (1343e watchlist count, 1359a vps_service_health table,
  248/249 network-dependent tests) — 0 regressions introduced
- TypeScript: 0 errors (bun tsc --noEmit)

## Cron Schedule Verification

`'30 8 * * 1-5'` = 08:30 UTC, Monday–Friday.
VN market (HOSE/HNX/UPCOM) closes 15:00 VN = 08:00 UTC.
Job fires 30 min post-close — price history is settled for outcome resolution.
Env override: `CRON_SIGNAL_OUTCOME_JOB` respected via `Bun.env ?? fallback` pattern.

## DDD Compliance: PASS

signalOutcomeJob.ts is in `scheduler/alerts/` (interface layer). Imports from
`infrastructure/db/` are allowed at this layer. No domain/ violations.

## Security: PASS

- No process.env — uses Bun.env throughout
- No hardcoded secrets or credentials
- SQL uses parameterized queries (agentSignalStore.ts)
- No new MCP tools — no Zod validation surface

## Files Modified

- `apps/mcp-server/src/scheduler/jobs.ts` — +4 lines (import line 67, CRONS entry line 156, cron.schedule line 706)
- `apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts` — +6 lines (AC-9)

## Issues Found

### Blocking
(none)

### Non-Blocking
(none)

## Merge Status

Merged to main via commit 94c60def. TASK-1382 (parent) closed. Baseline: 7915.
