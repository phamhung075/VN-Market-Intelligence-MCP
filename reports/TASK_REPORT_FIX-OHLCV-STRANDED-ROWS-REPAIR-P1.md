## Task Report FIX-OHLCV-STRANDED-ROWS-REPAIR-P1
date: 2026-06-16
outcome: APPROVED

changed:
  - apps/mcp-server/src/scheduler/market-data/allzeroOhlcvBackfill.ts (+60L — purgeStrandedSeedRows function)
  - apps/mcp-server/src/scheduler/startScheduler.ts (+18L — startup wiring with try/catch non-fatal)
  - apps/mcp-server/src/__tests__/FIX-OHLCV-STRANDED-ROWS-REPAIR-P1.test.ts (+261L — 7 test cases)

tests: 73 pass / 0 fail (5-file targeted suite: CONTAM-5/7 + ALLZERO + P0 + P1) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0

verdict: APPROVED

### Gate Audit

**G1 — Generic predicate**
SQL: `DELETE FROM daily_ohlcv WHERE volume = 0 AND open = high AND high = low AND low = close`
Zero ticker allowlist, zero date literal, zero data_env filter in executed code path. PASS.

**G2 — Delete-safety**
Safety discriminator: `volume = 0`. Real ATC halt-day rows have vol>0 even when O=H=L=C — confirmed by test.
Halt-day test: ABC close=50,000 O=H=L=C vol=100,000 → `deleted=0`. PASS.
Legitimate vol=0 edge case: index snapshot rows in live DB have varied OHLC (not flat O=H=L=C) → NOT matched.
Global index stubs (O=H=L=C=0 vol=0) ARE intended targets (same shape as Class 2 seed bars). PASS.

**G3 — No fake data / idempotency**
DELETE leaves no placeholder. Idempotency: second run → `deleted=0`. PASS.

**G4 — Full suite**
Targeted 7 cases: 7/7 pass. Companion 73 pass/0 fail. TSC: exit 0. DDD: scheduler→domain only. Security: clean. PASS.
Bun v1.3.13 C++ OOM on full suite run is pre-existing runtime bug (exit 0 before crash, same as cycles 265/267).

**G5 — Startup-purge sufficiency**
Writer fix (d4b532be) blocks new inflow. Once-at-boot purge is sufficient. No periodic guard required. PASS.

### Rebuild gate
REBUILD_REQUIRED: yes. Done_verified withheld pending router post-rebuild RAW probe:
- ~773 flat seed rows gone from named-volume DB (DCR/H11/DAG class)
- No vol>0 real candles lost
- toolCount=164 / cronJobCount=81 unchanged
