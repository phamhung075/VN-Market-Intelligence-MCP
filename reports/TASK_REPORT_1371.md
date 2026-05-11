# TASK REPORT 1371

| Field | Value |
|---|---|
| Task ID | 1371 |
| Title | feat(france-watchlist-movers-impl): fetchTopMovers INNER JOIN watchlist, source market_prices_history |
| Branch | task/1371-france-watchlist-movers-impl |
| Date | 2026-04-17 |
| QA verdict | PASS |
| Merged | Yes — main @ merge(1371) |

---

## Test Results

| Suite | Pass | Fail | Skip |
|---|---|---|---|
| src/__tests__/1370-france-watchlist-movers.test.ts | 4 | 0 | 0 |
| Full regression | 4982 | 17 | 20 |

Task-specific: 4/4 GREEN.

Regression delta vs main baseline: main had 4 failures (2 x task-1370 RED tests + 1 OCR e2e + 1 cron-registry count). Post-merge: those 2 RED tests are now GREEN. Net: regression failure count reduced by 2. The remaining 17 failures are all pre-existing across tasks 1348, 1316/1317, 1344, 1364, 1290, 296.

---

## TypeScript

`bun tsc --noEmit` — clean, no errors.

---

## DDD Compliance

`grep -r "from.*infrastructure" src/domain/` — comments only, no actual imports. PASS.
`grep -r "from.*application" src/domain/` — comments only, no actual imports. PASS.

---

## Security

`grep -r "process.env" src/` — zero results. All env access via `Bun.env`. PASS.

---

## Implementation Review

File: `src/scheduler/franceSummaryJob.ts`

`fetchTopMovers` rewritten: replaced `SELECT code, price, change_pct FROM market_prices` with a window-function query on `market_prices_history`. Uses two CTEs (current row rn=1, previous row rn=2) partitioned by code ordered by `fetched_at DESC`, computes `change_pct` inline as `(cur.price - prev.price) / prev.price * 100.0`, and applies `INNER JOIN watchlist w ON w.code = cur.code` to filter to watchlist-only tickers.

Correctness: non-watchlist tickers excluded at SQL level; tickers with only one price row produce NULL change_pct and are filtered by the WHERE clause; LIMIT 3 cap retained; try/catch isolation preserved; logger.warn message updated to reference `market_prices_history`.

No regressions introduced. No new dependencies. No layer violations. No SQL injection risk (parameterized query, no user input).

---

## Acceptance Criteria

| AC | Description | Result |
|---|---|---|
| AC-1 | Non-watchlist ticker excluded; watchlist ticker appears in movers | PASS |
| AC-2 | Empty watchlist → moverCount = 0, no crash | PASS |
| AC-3 | Watchlist ticker with no price row handled gracefully, excluded from movers | PASS |
| AC-4 | 5 watchlist tickers → movers capped at top 3 by abs(change%) | PASS |
