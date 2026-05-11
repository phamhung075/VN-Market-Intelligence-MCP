# Task Report: 1421 — ohlcv-health-digest-fix
date: 2026-04-18
outcome: APPROVED

## Test Results

| Suite | Pass | Fail | Skip |
|-------|------|------|------|
| 1421-ohlcv-health-and-digest-diacritics.test.ts | 6 | 0 | 0 |
| Full regression (5400 tests) | 5379 | 0 | 21 |
| TypeScript (`bun tsc --noEmit`) | clean | — | — |

## FIX A — ohlcv-daily-aggregator recordJobRun wrapper

`src/scheduler/jobs.ts` line 541: cron callback wraps `runOhlcvDailyAggregator()` with `recordJobRun(getDb(), 'ohlcv-daily-aggregator', ...)`. Change is minimum-scope — no other logic altered.

## FIX B — alertDigestTools.ts diacritics

`src/interface/mcp/tools/alertDigestTools.ts`: three accented strings confirmed present:
- `[Telegram: đã gửi thành công]`
- `(Telegram chưa được cấu hình)` (two occurrences)

Unaccented variants absent from source.

## DDD Compliance: PASS

- `jobs.ts` (scheduler layer) imports infra — permitted (top of stack).
- `alertDigestTools.ts` (interface layer) imports application + infra — permitted (inward only).
- No domain layer violations.

## Security: PASS

- No `process.env` in modified files.
- No hardcoded credentials.
- All SQL via parameterized queries (unmodified paths).

## Issues Found

### Blocking
none

### Non-Blocking
- Bun runtime panic after full suite completes (post-exit GC crash, not a test failure). Known Bun 1.3.11 issue unrelated to this task.

## Merge Status

merge commit: f1a2a82
branch `task/1421-ohlcv-health-digest-fix` deleted local + remote.
