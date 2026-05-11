# Task Report: 1330+1331 — fix defaultComputeTa reads daily_ohlcv
date: 2026-04-17
outcome: APPROVED

## Tasks
| ID | Title | Layer |
|----|-------|-------|
| 1331 | test(ta): TDD test 1330-ta-daily-ohlcv.test.ts — written FIRST | test |
| 1330 | fix(ta): rewrite defaultComputeTa to use daily_ohlcv.close | application/usecases |

## Branch
`task/1330-1331-ta-daily-ohlcv` — 1 unique commit: `fix(1330-1331): defaultComputeTa reads daily_ohlcv instead of market_prices_history`

## Test Results

| Check | Result |
|-------|--------|
| Unit tests (1330-ta-daily-ohlcv.test.ts) | 4 pass / 0 fail |
| Full suite (excl. OCR e2e) | 4895 pass / 4 fail (all pre-existing on main) |
| TypeScript `bun tsc --noEmit` | 0 errors |

## DDD Compliance: PASS
- Zero actual imports from `infrastructure/` in `src/domain/` (comments only).
- Fix is in `application/usecases/assembleBriefing.ts` — correct layer.

## Security: PASS
- No `process.env` in production code.
- SQL query uses parameterized binding (`WHERE code = ?`).

## Fix Verified

`defaultComputeTa()` at `assembleBriefing.ts:504` now queries:

```sql
SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT 60
```

Previously queried `market_prices_history` with `AVG(price) GROUP BY date(fetched_at)` — incorrect for official daily close prices.

## Test File
`src/__tests__/1330-ta-daily-ohlcv.test.ts` line 1: `process.env["DB_PATH"] = ":memory:";` — confirmed.

4 test cases:
- TC-1: 0 rows → null
- TC-2: 14 rows (<15) → null
- TC-3: 20 rows → non-null TaSignal with all fields defined
- TC-4: last close > MA20 → priceVsMa20 === "above"

## Issues Found
### Blocking
None.
### Non-Blocking
- Full suite Bun crash: Bun v1.3.11 runtime bug (C++ exception in teardown after heavy OCR test memory use — pre-existing, unrelated).
- 2 pre-existing failures: test 1227 (source health) exists on main before this branch.

## Merge Status
MERGED to main via `merge(1330): fix defaultComputeTa reads daily_ohlcv instead of market_prices_history`
Branch deleted local + remote. Server restarted via launchctl. Health: OK (98 tools).
Sprint 107 archived to `docs/archive/sprints-064-080.md`. TASKS.md updated. project-stats.json: sprint 108, totalTasksDone=286.
