# TASK_stale_tickers — Remove 5 invalid watchlist tickers

## Status: DONE — awaiting QA

## Branch
`task/stale-tickers-fix`

## What was done

Removed 5 invalid tickers from `WATCHLIST_SEED` in
`apps/mcp-server/src/infrastructure/db/seedWatchlist.ts`:

| Ticker | Exchange | Sector | Reason |
|--------|----------|--------|--------|
| VDC | UPCOM | securities | delisted/inactive |
| BDI | HNX | agriculture | Baltic Dry Index — not a VN stock, seed data error |
| DLC | UPCOM | agriculture | delisted/inactive |
| JSH | HNX | utilities | delisted/inactive |
| SIS | HOSE | tech | delisted/inactive |

Seed count reduced from 30 to 25. Agriculture sector now has 0 seed entries.
HNX exchange no longer represented (JSH and BDI were the only HNX entries).

## Additional: startup validation function

Added `validateSeedTickers(db: Database): void` to `seedWatchlist.ts`.
Call once at startup after `seedWatchlist()` to surface bad seeds early.
Emits a single `console.warn` listing missing tickers — non-fatal, no throw.

## Files changed

- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts`
  - Removed 5 invalid entries from `WATCHLIST_SEED`
  - Updated counts in JSDoc and file-header comments
  - Added `validateSeedTickers()` export
- `apps/mcp-server/src/__tests__/1343a-watchlist-restore.test.ts`
  - All count assertions: 30 → 25
  - Sector test: 10 domains → 9 (agriculture excluded)
  - Exchange test: HOSE + UPCOM only (HNX removed)
  - Spot-check: removed BDI reference, added DHG; added `not.toContain` for 5 removed codes
  - BackfillBctcQ4 counts: 30 → 25, 28 → 23
  - Added 3 new `validateSeedTickers` tests

## Test results

- Ran 7906 tests across 685 files (baseline was 7903 — +3 new tests)
- 5 failures: pre-existing in `1289c`, `1349b`, `1551` — unrelated to this fix
- `1343a-watchlist-restore.test.ts`: 15/15 pass

## Impact on live DB

The seed uses `ON CONFLICT(code) DO UPDATE` — it does not delete rows that were
previously inserted. To purge the 5 invalid tickers from the **live** SQLite DB,
run the following SQL (or call `remove_from_watchlist` MCP tool for each):

```sql
DELETE FROM watchlist WHERE code IN ('VDC', 'BDI', 'DLC', 'JSH', 'SIS');
```

This eliminates ~7,200 WARN log lines/day from the 60s push-prices cycle.

## QA checklist

- [ ] `bun test src/__tests__/1343a-watchlist-restore.test.ts` — 15 pass
- [ ] Confirm VDC, BDI, DLC, JSH, SIS are not in `WATCHLIST_SEED`
- [ ] Confirm `validateSeedTickers` is exported and testable
- [ ] Full suite >= 7903 pass, no new failures
- [ ] Merge to main, delete branch `task/stale-tickers-fix`
