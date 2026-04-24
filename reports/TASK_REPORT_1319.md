# Task Report 1319 — compact
date: 2026-04-24
outcome: APPROVED

changed:
- src/scheduler/vpsProxyWatchdogJob.ts:122-136 (readLatestForeignFlowTimestamp)
- src/scheduler/vpsProxyWatchdogJob.ts:175-207 (DI wire + FOREIGN_FLOW_STALE_MS constant)
- src/scheduler/vpsProxyWatchdogJob.ts:234-240 (stale push)
- src/__tests__/1319-watchdog-foreign-flow.test.ts (7 tests)

bun test (unit): 7 pass / 0 fail
bun test (full): 6769 pass / 0 fail (baseline 6762 + 7 new = matches NEW_PASS)
tsc: 0 errors
ddd: PASS (scheduler imports infrastructure — correct layer direction)

checklist:
1. 90-min threshold — PASS. vn-foreign-flow.service runs 60s; 90 min = 90 missed cycles. Price uses 45 min (5-10 min service). Foreign-flow less latency-critical than price feed, 90 min safe buffer. Proportional to service cadence.
2. Query correctness — PASS. MAX(updated_at) WHERE foreign_buy_vol IS NOT NULL correctly targets rows written by vn-foreign-flow.service (writeForeignFlowToOhlcv populates foreign_buy_vol). Excludes bare OHLCV rows.
3. Test coverage — PASS. 7 cases: null reader (never written), 91 min stale, 90 min boundary (>= fires), 89 min fresh (no alert), off-hours (skipped), consolidated all-stale, empty in-memory DB real reader.
4. No regressions — PASS. 6769 = 6762 + 7 exactly.
5. tsc + DDD — PASS.

non_blocking:
- src/scheduler/vpsProxyWatchdogJob.ts:35 — sendTelegramMarket imported but unused (dead import from pre-Report-2596 era). No logic impact. Safe to remove in separate cleanup.

verdict: APPROVED
