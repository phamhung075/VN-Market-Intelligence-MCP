# Task Report 1462 — compact
date: 2026-04-18
outcome: APPROVED

changed:
- src/application/usecases/assembleEveningSummary.ts:422-423,434-435
- src/__tests__/1462-evening-mover-freshness.test.ts (237 lines, 4 new assertions)

bun test: 5550 pass / 0 fail
tsc: 0 errors
ddd: PASS (application → infrastructure is legal)
security: process.env in test file only — established pattern across 50+ test files, non-blocking

freshness guards:
- line 423: `AND mp.updated_at >= datetime('now', '-3 days')` — OHLCV fallback path
- line 435: `AND mp.updated_at >= datetime('now', '-3 days')` — no-OHLCV path
- (a) stale 4d row excluded: PASS
- (b) fresh row included: PASS
- (c) stale mp + fresh OHLCV → OHLCV pct surfaces: PASS
- (d) fallback path stale excluded: PASS

merge_commit: d331c56
verdict: APPROVED
