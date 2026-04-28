# Task Report: 1391 — FIX: bbAlertScanJob stale-candle guard
date: 2026-04-28
outcome: APPROVED

## Summary

`bbAlertScanJob.ts` was embedding the most recent candle's close price into the
alert message string at INSERT time. When the latest candle came from a previous
session (yesterday or older — pre-open window, VPS lag), the embedded price was
stale and the direction in the message appeared inverted at dispatch time (FPT
message id 335: 73,100 -0.41% sent when live price was 74,400 +1.36%).

Fix: 6-line stale-candle guard inserted after `lastCandle` is extracted. Compares
`lastCandle.day` against `new Date().toISOString().slice(0, 10)` (real wall clock,
matching how `datetime('now')` stores candles). Stale candles skip via `continue`.

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts` | +6 lines stale-candle guard at step c |
| `apps/mcp-server/src/__tests__/1391-bb-stale-candle-skip.test.ts` | new — 3 tests (AC-1/2/3) |

## Test Results

- Targeted (1391-bb-stale-candle-skip.test.ts + 1309-bb-alert-scan-job.test.ts): 13 / 13 pass (0 fail)
- Full suite (worktree, 669 files): 7541 pass / 120 fail — no regression vs pre-fix worktree baseline
- Full suite on main: Bun OOM crash (pre-existing, not caused by this change — same crash hash as before merge)
- Range test 1350-1399 on main: 490 / 490 pass, 0 fail
- TypeScript: 2 pre-existing errors in `1383-macro-alert-dispatch.test.ts` only (unchanged)

## DDD Compliance: PASS

- Changed file (`bbAlertScanJob.ts`) is in `src/scheduler/alerts/` — interface/scheduler layer
- No domain imports from infrastructure introduced
- Guard uses only `new Date()` (stdlib) and existing `lastCandle` row already in scope
- No imports added

## Security: PASS

- No `process.env` — file uses `Bun.env` pattern (no env access needed for this guard)
- All SQL uses parameterized queries (unchanged)
- No hardcoded credentials or secrets
- No new `any` types

## Issues Found

### Blocking
None.

### Non-Blocking
- Bun full-suite OOM crash (RSS 1.33GB / 691 files) is pre-existing; same crash hash
  observed before and after this change. Not caused by 1391.

## Merge Status

APPROVED — cherry-picked commit `0b2e6004` onto main on 2026-04-28.
Worktree `.claude/worktrees/agent-a0296161` and branch `worktree-agent-a0296161` to be deleted.
