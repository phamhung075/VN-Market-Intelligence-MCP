# Task Report 205 — compact
date: 2026-04-20
outcome: APPROVED

changed:
- src/scheduler/franceSummaryJob.ts:154-201 (daily_ohlcv query replacing market_prices_history)
- src/__tests__/1316-france-summary-rewrite.test.ts (4 seeds updated)
- src/__tests__/1348-france-summary-cron-window.test.ts (seedMover updated)
- src/__tests__/1370-france-watchlist-movers.test.ts (insertPriceHistory→insertOhlcv)
- src/__tests__/1520-france-summary-movers-ohlcv.test.ts (NEW, 4 ACs)

bun test (targeted): 4+23 pass / 0 fail (1520=4, 1316+1348+1370=23)
bun test (full): 5742 pass / 26 fail (main baseline: 5734/30 — branch is +8/−4 vs main)
tsc: 0 errors
ddd: PASS (scheduler imports infra+application types — allowed at interface layer)
security: PASS (no process.env, no raw SQL interpolation)

verdict: APPROVED
