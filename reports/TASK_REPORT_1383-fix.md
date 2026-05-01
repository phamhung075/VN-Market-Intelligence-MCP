# Task Report: 1383-fix — MACRO critical alerts bypass step E cooldown suppression
date: 2026-04-28
outcome: APPROVED

## Context

Bug: MACRO/CRITICAL alerts were silently suppressed by step E cooldown (Rule 1) in
`intelligenceCycleJob.ts` because step A2.5 INSERT OR IGNORE wrote the same indicator
row into `recentAlertHistory` during the same cycle. Fix: MACRO action codes bypass
cooldown suppression in step E entirely — once-per-indicator-per-day dedup is already
handled by step A2.5 INSERT OR IGNORE.

Fixer round: 2nd pass. First QA pass blocked on 2 TSC type errors in test mocks
(alerts: [] → alerts: 0, plus missing duplicates/errors fields). Fixer corrected both.

## Test Results

- Task 1383 tests: 2 pass / 0 fail
- Full suite: 7888 pass / 6 fail / 21 skip — 7915 total (baseline: 7915)
- TypeScript: 0 errors (bun tsc --noEmit)

## Pre-existing Failures (not caused by this task)

- Task 1168: getMarketMessageDigest AC-1 (pre-existing)
- FIX-1296: taAlertNotifierJob AC-1, AC-4, AC-6 (pre-existing, agent_signals table missing in test isolation)
- 1343e: BCTC Pipeline Integration x2 (pre-existing, watchlist seed count)

## DDD Compliance: PASS

- Fix is in `src/scheduler/news-analysis/intelligenceCycleJob.ts` (infrastructure layer)
- No domain→infrastructure import violations introduced
- Test file in `src/__tests__/` with injected `CycleDeps` — no real DB calls

## Security: PASS

- No hardcoded credentials
- No process.env usage (Bun.env only)
- No SQL in changed files

## Merge Status

Already merged to main via fixer commit `741b9395`.
QA sign-off: 2026-04-28.
