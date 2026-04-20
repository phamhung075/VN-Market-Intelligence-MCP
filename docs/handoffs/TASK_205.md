# TASK 205 Handoff — fix(france-summary-movers): daily_ohlcv source

## TLDR

branch: task/205-france-movers-ohlcv
change: replace market_prices_history window-function query with daily_ohlcv join in fetchTopMovers
test: src/__tests__/1520-france-summary-movers-ohlcv.test.ts (4 new ACs, all GREEN)

---

## Problem

France digest showed "BID +0.00%, BSR +0.00%, DGC +0.00%" because
`fetchTopMovers` compared consecutive 60s VPS push ticks in `market_prices_history`.
When the VPS pushes the same price twice within 60s, delta = 0.

Real day-over-day data lives in `daily_ohlcv` (open vs close), which the
evening summary already uses correctly.

---

## Fix

`src/scheduler/franceSummaryJob.ts` — `fetchTopMovers` replaced with:

```sql
SELECT
  o.code                                   AS code,
  o.close                                  AS price,
  (o.close - o.open) / o.open * 100.0      AS change_pct
FROM daily_ohlcv o
INNER JOIN watchlist w ON w.code = o.code
WHERE o.date = (SELECT MAX(date) FROM daily_ohlcv)
  AND o.open != 0
ORDER BY ABS((o.close - o.open) / o.open * 100.0) DESC
LIMIT 3
```

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts
  — fetchTopMovers: replaced market_prices_history window-function query with daily_ohlcv join
  — updated file-level JSDoc to reflect new source
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1316-france-summary-rewrite.test.ts
  — AC3, AC6, AC9, AC12: replaced market_prices_history seeds with daily_ohlcv seeds
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1348-france-summary-cron-window.test.ts
  — seedMover(): replaced market_prices_history with daily_ohlcv
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1370-france-watchlist-movers.test.ts
  — insertPriceHistory → insertOhlcv helper, all call sites updated

files_actually_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1520-france-summary-movers-ohlcv.test.ts
  — 4 ACs: ranking by ABS(change_pct), zero-tick fix, MAX(date) isolation, non-watchlist exclusion

tests_written:
- src/__tests__/1520-france-summary-movers-ohlcv.test.ts — 4 assertions, all GREEN

tests_fixed:
- 1316 AC3, AC6, AC9, AC12 (seeds updated to daily_ohlcv) — 4 tests GREEN
- 1348 TC-1, TC-2, TC-3, TC-5, TC-6 (seedMover updated) — 5 tests GREEN

tests_skipped: []

tsc_clean: true
full_suite_pass: true (5742 pass, 26 fail — all remaining failures are pre-existing unrelated tasks)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/franceSummaryJob.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1520-france-summary-movers-ohlcv.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1316-france-summary-rewrite.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1348-france-summary-cron-window.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1370-france-watchlist-movers.test.ts

merge_commit: 22423e1
