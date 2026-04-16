# Task Report — 1252: Sync mcp.config.json::market.referenceStocks with SECTOR_PEERS

**Branch:** `task/1252-sync-reference-stocks`
**Status:** Review (re-submitted after fix)

---

## Issues Discovered During Review

### Issue 1252-01 (BLOCKING)
Test `185-data-freshness.test.ts` case "shows 'Cu' for market_prices updated 10 hours ago" (line 196–202) fails because commit `5481dc9` changed the "Gia co phieu" freshness query from `SELECT MAX(updated_at) FROM market_prices` to `SELECT MAX(pushed_at) FROM vps_push_log WHERE service='prices' AND status='ok'`. The test inserted into `market_prices` but not into `vps_push_log`, so the query returned null → "Chua co du lieu" instead of "Cu".

---

### Fix — 2026-04-15

- **Issue**: 1252-01
- **Root cause**: The freshness query for "Gia co phieu" was changed from `market_prices.updated_at` to `vps_push_log.pushed_at` in commit `5481dc9`, but the test `beforeEach` setup did not create the `vps_push_log` table and the "shows Cu" test case did not insert a row into it. The query returned null, causing the "Chua co du lieu" label instead of "Cu".
- **Fix**: Two changes in `src/__tests__/185-data-freshness.test.ts`:
  1. Added `CREATE TABLE IF NOT EXISTS vps_push_log (...)` to the `beforeEach` schema setup (lines 153–161).
  2. Added `INSERT INTO vps_push_log (service, items_count, status, pushed_at)` with `service='prices'`, `status='ok'`, `pushed_at` = 10 hours ago in the "shows Cu" test case (line 202).
- **Tests added**: None (fixed existing test)
- **Verified**: `bun test src/__tests__/185-data-freshness.test.ts` — 26/26 PASS | `bun test src/__tests__/1208-price-freshness-vps-push.test.ts` — 6/6 PASS | `bun tsc --noEmit` PASS
