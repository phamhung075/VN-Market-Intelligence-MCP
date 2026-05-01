# Task Report: 1401-dedup-guard — eveningSummaryJob quality-aware dedup guard
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (1401-dedup-guard-stale-retry.test.ts): 4 pass / 0 fail
- Full suite: 7930 pass / 17 fail
- Baseline: 7926 pass / 17 fail — delta +4 new tests, no new failures
- TypeScript: 0 errors in 1401 changed files; 4 pre-existing errors in 1383 + 1397c test files (unchanged)
- Bun crash at process exit after summary printed — known Bun v1.3.11 runtime bug, not a test failure

## DDD Compliance: PASS
- `eveningSummaryJob.ts` lives in `interface/scheduler/` — correct layer
- Imports from `application/usecases/`, `infrastructure/logger.js`, `infrastructure/notifiers/`, `domain/services/` — all allowed directions
- No `domain` importing `infrastructure` violations introduced
- Test file imports only from `scheduler/briefings/eveningSummaryJob.js` — no infrastructure imports from test

## Security: PASS
- No `process.env` usage (uses `Bun.env` or no env)
- No hardcoded credentials or API keys
- No SQL injection risk — `alreadySentTodayForTest` uses a `prepare()` with no user input
- No `any` types introduced

## Changes
- `apps/mcp-server/src/scheduler/briefings/eveningSummaryJob.ts`
  - `alreadySentTodayForTest()` rewritten: fetches `content` of latest today's evening-summary row
    instead of COUNT(*); returns `false` (allow retry) when content includes ` (cũ)` stale marker
  - Fail-open behaviour preserved: DB error → `false`
  - `resetEveningSummaryGuard()` exported for test isolation
- `apps/mcp-server/src/__tests__/1401-dedup-guard-stale-retry.test.ts` — 4 new tests:
  1. Stale row (content has ` (cũ)`) → returns false (retry allowed)
  2. Fresh row (no stale marker) → returns true (blocked)
  3. No row today → returns false (first run allowed)
  4. Wrong agent row (morning-briefing) → returns false (not counted)
- `docs/handoffs/TASK_1401.md` — created by developer with follow-up items (out of scope)

## Issues Found
### Blocking
None.

### Non-Blocking
- Pre-existing tsc errors in `1383-macro-alert-dispatch.test.ts` (PollNewsResult shape mismatch)
  and `1397c-vn-index-refresh.test.ts` (possibly undefined) — not introduced by this task.

## Merge Status
APPROVED — merged `fix/1401-dedup-guard` to `main` via no-ff merge. Branch deleted.
Full suite: 7930 pass >= 7926 baseline. 17 pre-existing env failures unchanged.
