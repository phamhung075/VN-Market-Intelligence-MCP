## Task Report 1970
date: 2026-05-22
outcome: APPROVED

changed:
- apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts (NEW, 216L)
- apps/mcp-server/src/__tests__/1970-ta-ohlcv-backfill.test.ts (NEW, 313L)
- apps/mcp-server/src/scheduler/cronConfig.ts (taOhlcvBackfill entry added)
- apps/mcp-server/src/scheduler/startScheduler.ts (wired to jobRunRepo.wrapRun)
- docs/standards/cron-jobs.md (OHLCV Data Quality section added)

tests: 10 pass / 0 fail (targeted) | full suite: 9382 pass / 283 fail (283 = pre-existing BCTC freeze, zero regressions; baseline 9370 pass) | tsc: 0 errors | ddd: PASS | security: PASS

### AC Coverage
- AC-1a: ticker >= TA_MIN_ROWS clean rows → covered=1, no fetch — PASS
- AC-1b: ticker > TA_MIN_ROWS clean rows → covered, no fetch — PASS
- AC-2a: ticker 0 rows → fetched + INSERT OR REPLACE — PASS
- AC-2b: ticker TA_MIN_ROWS-1 rows → fetched (strict threshold) — PASS
- AC-2c: INSERT OR REPLACE overwrites corrupt low=0 row with clean value — PASS
- AC-3: ticker >= TA_MIN_ROWS but has low=0 → still fetched — PASS
- AC-4: fetch error one ticker isolated; others continue — PASS
- AC-5: API returns < TA_MIN_ROWS → sparse — PASS
- AC-5b: empty watchlist → all-zero summary, no fetch — PASS
- AC-5c: 3 covered + 2 backfilled + 1 sparse + 1 error → correct counts — PASS

### Issues Found
#### Blocking
None.

#### Non-Blocking
None.

## Merge Status
APPROVED. Merged to main via commit 870981a2 (already on main — no branch to merge; no-ff merge commit not needed).
