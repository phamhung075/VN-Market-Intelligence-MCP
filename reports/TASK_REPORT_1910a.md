# Task Report: 1910a — ISM Sub-Components Tool

date: 2026-05-15
outcome: CHANGES_REQUESTED

## Test Results

- Targeted (35 new tests): 35 pass / 0 fail
- Full suite: 9349 pass / 36 fail (all 36 pre-existing — Task178/239/1343a/stale-tickers/cron-count/bootstrap-perf)
- TypeScript: 0 errors

## DDD Compliance: PASS

- `ismRegimeSignal.ts` — zero infrastructure imports confirmed
- No `from.*infrastructure` or `from.*application` in domain file

## Security: FAIL

- `apps/mcp-server/src/infrastructure/fetchers/fredIsmSubcomponents.ts:263` — `process.env["FRED_API_KEY"]` violates Bun.env-only policy (dev-standards.md § Coding Standards + qa-checklist.md § Security)

## Issues Found

### Blocking

1. `apps/mcp-server/src/infrastructure/fetchers/fredIsmSubcomponents.ts:263` — `process.env["FRED_API_KEY"]` must be removed. Policy: `Bun.env` only, never `process.env`. The line 262 already reads `Bun.env.FRED_API_KEY`; the fallback on line 263 must be deleted. If test-environment compatibility is the concern, the fix is to ensure tests set `Bun.env.FRED_API_KEY` directly (the test setup already uses `Bun.env`).

## Merge Status

BLOCKED — 1 blocking issue. Fixer required.
