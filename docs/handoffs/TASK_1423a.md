# TASK_1423a — Add US10Y yield to Yahoo Finance fetcher

## Status: DONE

## What was implemented

Added `^TNX` (US 10-year Treasury yield) as the 13th symbol fetched by the Yahoo Finance fetcher.

### Files changed

**`apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts`**
- Added `us10y: "^TNX"` to the `SYMBOLS` constant (was 12 symbols, now 13)
- Added `us10yYield: number` field to `CommoditySnapshot` interface
- Added `us10yResult` to the `Promise.allSettled` concurrent fetch array
- Added `us10yYield` variable extraction with 0-fallback on failure
- Updated all-zero guard to include `us10yYield === 0` (13-field check)
- Added `us10yYield` to the `snapshot` object and logger call
- Updated `upsertLatest` INSERT to include `us10y_yield` column (15 values)
- Updated `appendHistory` INSERT to include `us10y_yield` column (16 values including dedup WHERE bindings)

**`apps/mcp-server/src/infrastructure/db/schema-macro.ts`**
- Added idempotent migration at line ~123:
  ```ts
  try { db.exec(`ALTER TABLE commodity_prices ADD COLUMN us10y_yield REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE commodity_prices_history ADD COLUMN us10y_yield REAL NOT NULL DEFAULT 0`); } catch {}
  ```

**`apps/mcp-server/src/__tests__/1423a-us10y-yield.test.ts`** (new)
- 5 tests: T-1 through T-5 covering fetch, type, store, partial failure, all-fail

**`apps/mcp-server/src/__tests__/025-yahoo-finance.test.ts`** (updated)
- Added `us10y_yield` column to all 3 inline test DB schemas
- Added `us10yYield: 0` to all `CommoditySnapshot` literals

**`apps/mcp-server/src/__tests__/1487-yahoo-finance-extended.test.ts`** (updated)
- Added `us10y_yield` column to `makeTestDb()` schema
- Added `us10yYield: 0` to all `CommoditySnapshot` literals

**`apps/mcp-server/src/__tests__/1489-tracked-indicators-dedup.test.ts`** (updated)
- Added `us10yYield: 0` to `makeSnapshot()` default object

## Test results

- 36 tests pass across all 5 relevant files
- 0 failures
- `tsc --noEmit`: 0 new errors (2 pre-existing errors in unrelated files 1383, 1397c)

## QA checklist

- [x] `^TNX` in SYMBOLS map
- [x] `us10yYield: number` in `CommoditySnapshot` interface
- [x] `us10y_yield` column in migration (idempotent `try/catch`)
- [x] Column added to both `commodity_prices` and `commodity_prices_history`
- [x] Fetch loop handles the new column generically (same pattern as existing 12)
- [x] Test T-1: value populated from mock
- [x] Test T-4: failure → 0, result not null
- [x] Test T-5: all 13 fail → null
- [x] No regressions in 025, 1487, 1039, 1489
