# Task Report: 1416c — HPG BCTC Disk-Scan Ticker Fix

date: 2026-04-29
outcome: APPROVED

---

## Test Results

- Targeted suite (1416c): **5 pass / 0 fail** — PASS
- Regression suite (1343a watchlist counts 25→26): **15 pass / 0 fail** — PASS
- Full suite: **8058 pass / 25 fail** — 25 failures are pre-existing (documented in TASK_REPORT_1415b.md, unchanged)
- TypeScript: 4 pre-existing errors in 1383-macro-alert-dispatch.test.ts + 1397c-vn-index-refresh.test.ts — not introduced by this task

## DB Verification

- Container rebuilt and restarted with new image (seed runs on startup)
- `SELECT code, exchange FROM watchlist WHERE code='HPG'` on market.db → `[{"code":"HPG","exchange":"HOSE"}]` — PASS
- Watchlist count: 31 rows (30 existing user additions + HPG via seed upsert)

## DDD Compliance: PASS

Changes confined to:
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — infrastructure layer (correct)
- `apps/mcp-server/src/__tests__/1416c-hpg-bctc-disk-scan.test.ts` — test only
- `apps/mcp-server/src/__tests__/1343a-watchlist-restore.test.ts` — test only

No domain/ imports from infrastructure/. No business logic changes.

## Security: PASS

- No hardcoded credentials or API keys
- All SQL uses parameterized queries (`ON CONFLICT(code) DO UPDATE`)
- No process.env usage — Bun.env only
- No new HTTP fetchers or external calls

## Issues Found

### Blocking
None.

### Non-Blocking
- 25 pre-existing test failures (Tasks 026, 027, 1168, FIX-1296, 1343e, 1398, FIX-VPS-HEALTH-FRESHN, Sprint docs invariant) — tracked, not regressed
- 4 pre-existing TSC errors in 1383 + 1397c test files — tracked, not introduced by this task

## Files Changed (commit 88313bf0)

- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — HPG added to WATCHLIST_SEED, comment updated 25→26
- `apps/mcp-server/src/__tests__/1416c-hpg-bctc-disk-scan.test.ts` — 5 new tests (HPG seed presence, disk-scan find, regression guard, filename format, already-filed exclusion)
- `apps/mcp-server/src/__tests__/1343a-watchlist-restore.test.ts` — hardcoded counts 25→26, backfill queue counts 25→26 and 23→24

## Merge Status

MERGED to main (commit 88313bf0). Container rebuilt and live DB updated.
