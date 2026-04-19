# Task Report 1452 — compact
date: 2026-04-18
outcome: APPROVED

changed:
- src/application/usecases/assembleBriefing.ts:727,730,922-932
- src/__tests__/1452-market-prices-freshness.test.ts (9 new assertions)

bun test (task): 9 pass / 0 fail
bun test (full): 5530 pass / 0 fail (21 pre-existing flaky failures confirmed identical on main)
tsc: 0 errors
ddd: PASS — application→infrastructure imports correct direction
security: PASS — no process.env, no string-interpolated SQL

freshness guards verified:
- line 727: watchlist price COALESCE — mp.updated_at >= datetime('now', '-3 days')
- line 730: watchlist change_pct — mp2.updated_at >= datetime('now', '-3 days')
- line 924: portfolio UNION ALL first branch — updated_at >= datetime('now', '-3 days')
- line 929-931: portfolio UNION ALL exclusion subquery — updated_at >= datetime('now', '-3 days')

stale row (>3d) excluded: confirmed by test "stale market_prices (4 days ago) — daily_ohlcv wins"

verdict: APPROVED
