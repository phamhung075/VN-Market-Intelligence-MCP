# Task Report: stale-tickers — Remove 5 Invalid Watchlist Tickers
date: 2026-04-28
outcome: APPROVED

## Summary

Removed VDC, BDI, DLC, JSH, SIS from WATCHLIST_SEED (delisted/inactive or non-VN index seed error).
Added `validateSeedTickers()` export for startup validation.
Purged 5 rows from live `market.db` watchlist table.

## Test Results

- Unit tests (1343a): 15/15 pass (246 expect() calls)
- Full suite: 7880 pass / 5 fail (5 pre-existing in 1289c, 1349b, 1551 — unrelated)
- Baseline: 7877 (developer reported 7906 total; 7880 pass matches net count)
- TypeScript: 0 errors (bun tsc --noEmit clean)

## DDD Compliance: PASS

Changed files are infrastructure (`seedWatchlist.ts`) and test files only.
No domain layer touched. No new cross-layer imports introduced.

## Security: PASS

- No `process.env` usage (file uses `bun:sqlite` only)
- No hardcoded credentials or secrets
- SQL in `validateSeedTickers()` uses parameterized placeholders (`?`) — no injection risk
- No HTTP fetchers added

## Files Changed

- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — 5 tickers removed, validateSeedTickers() added
- `apps/mcp-server/src/__tests__/1343a-watchlist-restore.test.ts` — counts updated 30→25, 3 new validateSeedTickers tests
- `apps/mcp-server/src/__tests__/1314-ta-alert-notifier.test.ts` — incidental (1382b wiring from same branch)
- `apps/mcp-server/src/scheduler/market-data/taAlertNotifierJob.ts` — incidental (1382b wiring from same branch)

## Live DB Purge

Executed against `apps/mcp-server/data/market.db`:
```sql
DELETE FROM watchlist WHERE code IN ('VDC', 'BDI', 'DLC', 'JSH', 'SIS');
```
Result: 5 rows deleted. Eliminates ~7,200 WARN log lines/day from push-prices cycle.

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged to main via `git merge --no-ff task/stale-tickers-fix`.
Branch `task/stale-tickers-fix` deleted.
