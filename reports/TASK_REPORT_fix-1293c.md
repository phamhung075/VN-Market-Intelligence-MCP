# Task Report: fix-1293c — Signal Rejection Time-Filtering
date: 2026-04-25
outcome: APPROVED

## Summary

Bug: `getSignalRejectionSummary()` and `getSignalRejectionDetails()` in
`signalRejectionStore.ts` computed an ISO timestamp cutoff in JS, then compared
it against `created_at` values stored by SQLite's `datetime('now')` function.
SQLite `datetime()` produces `"YYYY-MM-DD HH:MM:SS"` (space separator), while
`new Date().toISOString()` produces `"YYYY-MM-DDTHH:MM:SS.mmmZ"` (T separator).
Lexicographic comparison between the two formats is unreliable — rows that should
fall inside the window were excluded.

Fix: replaced JS cutoff with inline SQLite expression
`datetime('now', '-' || ? || ' hours')` with `hours` passed as a bound parameter.
Both comparison operands are now produced by the same SQLite function, eliminating
the format mismatch entirely.

## Changed File

`apps/mcp-server/src/infrastructure/db/signalRejectionStore.ts` lines 111–162

- `getSignalRejectionSummary()`: WHERE clause now uses `datetime('now', '-' || ? || ' hours')`
- `getSignalRejectionDetails()`: same pattern, both `from_agent` and `hours` remain bound parameters

## Test Results

- Unit tests (1293c suite): 14 pass / 0 fail
- Full regression: 6863 pass / 9 fail
- Baseline on main before fix: 15 fail (includes 3 × 1293c time-filter tests + others)
- Net delta: -6 failures vs main baseline (3 × 1293c restored + 3 collateral)
- TypeScript: 0 errors

## DDD Compliance: PASS

File is in `infrastructure/db/` — correct layer. Zero imports from `domain/` or `application/`.

## Security: PASS

- No `process.env` usage
- No hardcoded credentials
- All SQL uses `?` parameterized placeholders — `hours` is bound, never interpolated
- `|| ? ||` pattern confirmed: the numeric `hours` value is passed via `.all(hours)`, not concatenated into the query string

## Merge Status

Merged to main: commit `244fb870`
Branch `task/fix-1293c-rejection-filter` deleted.
