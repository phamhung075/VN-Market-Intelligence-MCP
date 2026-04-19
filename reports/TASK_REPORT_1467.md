# Task Report 1467 — compact

changed:
- src/scheduler/bctcOverdueCheckJob.ts:227-228 — alertId key W{weekEpoch} replaces utcDay
- src/__tests__/316-bctc-overdue-check.test.ts:186-211 — weekly dedup regression (day1/day2/day8)

bun test: 5569 pass / 0 fail (baseline 5568, +1 new test)
tsc: 0 errors
ddd: PASS (scheduler->infrastructure imports expected, no domain violations)
security: PASS (process.env in test line 10 = in-memory DB setup, not prod code)

weekly dedup logic verified:
- alertId = `bctc-overdue:batch:${year}:Q${quarter}:W${weekEpoch}` ✓
- weekEpoch = Math.floor(now.getTime() / (7 * 24 * 3600 * 1000)) ✓
- day1 fires (alertsInserted=1) ✓
- day2 same window suppressed (alertsInserted=0) ✓
- day8 next epoch fires again (alertsInserted=1) ✓

verdict: APPROVED
