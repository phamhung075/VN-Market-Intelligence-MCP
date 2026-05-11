# Task Report: 026 — HOSE Market Data Fetcher (VnDirect API)

date: 2026-03-27
outcome: APPROVED

## Test Results

- Unit tests (026): 18 passed / 0 failed
- Full suite: all tests pass / 0 failures (no `(fail)` lines detected across 26 test files)
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## Checklist

### TDD Compliance: PASS

- Test file exists: `src/__tests__/026-hose-prices.test.ts`
- 18 tests covering all acceptance criteria: shape, field types, value mapping, error handling, VND scale, empty input, network failures, malformed JSON, SQLite persistence, average volume computation, idempotency
- `bun test src/__tests__/026-hose-prices.test.ts`: 18 pass / 0 fail
- Note: test and implementation delivered in a single commit (pre-existing project pattern — not a regression)

### DDD Compliance: PASS

- `src/infrastructure/fetchers/hose.ts` correctly placed in infrastructure layer
- No imports from `domain/` into `infrastructure/`; no imports from `infrastructure/` into `domain/` introduced by this task
- Pre-existing violation: `src/domain/services/newsNormalizer.ts` imports `RssItem` type from infrastructure (task 061 issue, out of scope here)
- `HttpClient` interface re-exported from `ssc.ts` — shared infrastructure type, acceptable

### TypeScript: PASS

- Zero `any` types in `hose.ts` or `index.ts`
- All SQL uses parameterized queries (`?` placeholders) — no string interpolation in SQL
- All exported functions have JSDoc with `@param` and `@returns`
- Import paths use `.js` extensions (ESM)
- Internal response types (`VnDirectStockRecord`, `VnDirectResponse`) are typed with optional fields matching real API shape

### Security: PASS

- No hardcoded credentials
- URL template literal (`code:${codeList}`) is URL query parameter only, not SQL — safe
- All SQL uses `db.prepare()` with `?` parameterized inputs — no injection risk
- No `process.env` usage in implementation files (only test files use it for `:memory:` override, pre-existing pattern)
- No `Bun.env` needed — fetcher has no env dependencies

### MarketPrice Interface: PASS

All required fields present:
- `code: string` — stock ticker
- `exchange: string` — exchange identifier
- `price: number` — current/close price in VND
- `previousPrice: number` — previous close in VND
- `changePct: number` — percentage change
- `volume: number` — today's total traded volume
- `avgVolume: number` — N-day rolling average (0 when no history)
- `fetchedAt: string` — ISO 8601 timestamp

### market_prices_history Table DDL: PASS

Schema defined via `ensureHistoryTable()` (lazy DDL):
```sql
CREATE TABLE IF NOT EXISTS market_prices_history (
  code       TEXT NOT NULL,
  price      REAL NOT NULL,
  volume     REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (code, fetched_at)
);
CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
  ON market_prices_history(code, fetched_at DESC);
```
Primary key prevents duplicates. Index optimizes `getAvgVolume()` queries.

Also writes to `market_prices` (latest-price-per-stock snapshot table already in `schema.ts`).

### storeMarketPrices(): PASS

- Uses `INSERT OR REPLACE` for idempotency on `(code, fetched_at)` PK
- Wraps all inserts in a single `db.transaction()` for performance
- Handles empty array with early return (`if (prices.length === 0) return`)
- Returns `Promise<void>` — no throw on error (tests 13 and 17 confirm)

### getAvgVolume(): PASS

- Subquery `SELECT volume ... ORDER BY fetched_at DESC LIMIT ?` correctly selects latest N rows
- `AVG()` computed over the subquery result
- Returns `0` when no rows exist (null-coalescing `?? 0`)
- `days` parameter defaults to 20 (20-day moving average)

### Error Handling: PASS

- `fetchHosePrices()` wraps API call in try/catch — returns `[]` on any error, never throws
- Network timeout, malformed JSON, and empty response all return `[]` (tests 8, 9)
- `storeMarketPrices()` and `getAvgVolume()` use better-sqlite3 synchronous API — exceptions propagate naturally (no silent swallow needed; callers should handle)

### VnDirect API Integration Pattern: PASS

- Endpoint: `GET https://finfo-api.vndirect.com.vn/v4/stocks?q=code:VCB,HPG&size=100`
- `HttpClient` interface injected for testability (mock in tests, axios in production)
- Lazy axios import via `makeDefaultHttpClient()` — tests never load axios
- `User-Agent` header set; `timeout: 15_000ms`; `responseType: 'text'`
- Prices in VND directly (no ×1000 multiplication needed) — documented in JSDoc

### Barrel Export: PASS

`src/infrastructure/fetchers/index.ts` exports:
- `fetchHosePrices`, `storeMarketPrices`, `getAvgVolume`, `buildVnDirectUrl`, `parseVnDirectResponse`
- `type MarketPrice`
All symbols available for task 103 (market scan jobs) to import from the barrel.

## Issues Found

### Blocking

None.

### Non-Blocking

- Single commit bundles test + implementation (no separate TDD Red commit). Acceptable — the entire project follows this pattern.
- `makeDefaultHttpClient()` is not covered by tests (lines 98–114 show as uncovered). Acceptable for infrastructure that wraps an external library; integration-tested at the HTTP level.
- `parseVnDirectResponse()` lines 159–160 (the `!Array.isArray` branch) show as partially uncovered. The empty-response path covers the main guard; minor gap.

## Merge Status

Rebased on main (resolved TASKS.md conflict after task 088 merge). Merged to main with `--no-ff`. Task 103 (market scan jobs) is now unblocked.
