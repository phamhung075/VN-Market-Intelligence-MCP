# Task Report 1521b — compact
date: 2026-04-20
outcome: APPROVED

changed:
- src/__tests__/1290-france-summary-job.test.ts (daily_ohlcv seeds 3 tests)
- src/__tests__/1344-france-summary-stale-alerts.test.ts (daily_ohlcv seedMover + AC-5/AC-6)
- src/__tests__/1364-france-ta-detail.test.ts (daily_ohlcv AC-3/AC-4/AC-4b)
- src/__tests__/1450-france-summary-vnindex.test.ts (daily_ohlcv row)

targeted (4 files): 22 pass / 0 fail
full suite: 5763 pass / 5 fail (baseline 5757 → +6 new passes)
tsc: 0 errors
ddd: PASS (test-only, smart-skip applies)
security: PASS (no process.env)

failing 5 (pre-existing, not in scope):
- 1511 x3 — RED intentional (GlobalSnapshot interface not yet GREEN)
- 1513 x1 — RED intentional (formatFranceSummaryVI global section)
- 125 x1 — pre-existing E2E date assertion

verdict: APPROVED
