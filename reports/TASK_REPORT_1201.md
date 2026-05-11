# Task Report: 1201 — BCTC Quarter-Detection Bug Fix + Q4-2025 Backfill
date: 2026-04-13
outcome: APPROVED

## Test Results
- Unit tests (1201-bctc-queue-quarter-detection.test.ts): 21 passed / 0 failed
- Full regression: Bun v1.3.11 C++ exception crash on full 292-file run (pre-existing Bun bug, reproducible on main). Recent-task batch (1190–1219, 5 files, 53 tests): 52 passed / 1 failed — failing test is `cron-registry.json integrity > schedulerFileCount === 28` which is pre-existing on main (JSON says 27, actual count is 28, not introduced by this task).
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## Acceptance Criteria Verification

1. **21 tests pass** — PASS. All 21 tests in `src/__tests__/1201-bctc-queue-quarter-detection.test.ts` pass with 0 failures and 49 expect() calls.

2. **April (month=4) maps to Q4 previous year** — PASS. `server.ts` boundary changed from `currentMonth <= 3` to `currentMonth <= 4`. `detectTargetQuarter(2026, 4)` returns `{ targetYear: 2025, targetQuarter: "Q4" }`. Explicit test asserts `targetQuarter !== "Q1"`.

3. **BACKFILL_079 has 6 Q4-2025 tickers + VCB Q1-2025** — PASS. Array in both `schema.ts` and test file contains: BID/EIB/SHB/VCB/FPT/HPG (Q4-2025) + VCB (Q1-2025) = 7 rows total.

4. **ON CONFLICT idempotent** — PASS. SQL uses `ON CONFLICT(action_code, period_year, period_quarter) DO UPDATE SET status = 'pending', attempts = 0, last_attempt = NULL WHERE status = 'failed' OR attempts >= 5`. Test confirms double-call still yields 7 rows, not 14. Test also confirms a pending row with attempts=2 is NOT reset (guard clause works).

## DDD Compliance: PASS
No domain files modified. Only `src/infrastructure/db/schema.ts` and `src/interface/mcp/server.ts` changed. No new cross-layer imports introduced.

## Security: PASS
- All SQL uses parameterized bindings (`db.prepare(...).run(entry.code, entry.year, entry.quarter)`)
- No hardcoded credentials
- `process.env["DB_PATH"]` usage in schema.ts is pre-existing test-harness pattern guarded with `?? Bun.env["DB_PATH"]`, not introduced by this task

## Issues Found
### Blocking
None.

### Non-Blocking
- `cron-registry.json` has `schedulerFileCount: 27` but 28 scheduler files exist on disk. Pre-existing on main, not caused by this task. Assigned to maintenance backlog.
- `import type` from infrastructure in several `src/domain/services/*.ts` files (intradayAnalyzer, supplyChainAnalyzer, climateImpactMapper, recencyWeighter, catalystCalendar). Pre-existing DDD type-import violations not introduced by this task.

## Merge Status
APPROVED — merged to main.
