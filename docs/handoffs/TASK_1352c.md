# TASK 1352c — Scheduler Job Wrapper Tests: freshnessSlaMonitorJob end-to-end + sscCheckerJob concurrency guard

## Sprint
1352 — Scheduler Test Coverage Phase 2

## Status
RED (tests to write, no implementation changes needed)

## Brownfield Audit Summary

### freshnessSlaMonitorJob.ts
- Existing coverage: `234-vps-health-sla.test.ts` covers domain functions `checkDataFreshnessSla`, `checkSignalSla`, `classifySeverity`, `isEscalationCooldownActive` (via direct import). AC-11 tests `isEscalationCooldownActive` with a real in-memory DB. AC-12 tests `checkDataFreshnessSla` for partial-breach selectivity.
- Gap: `runFreshnessSlaMonitor(db, escalateToCommander)` is the orchestrator that:
  1. Calls `querySignalAges(db)` → real DB queries across 5 tables (`market_prices`, `financial_reports`, `rag_analyses`, `sbv_rates`, `daily_ohlcv`)
  2. Calls `getPriorBreaches(db)` for recovery detection
  3. Calls `recordSlaBreach(db, ...)` for each breach
  4. Checks `isEscalationCooldownActive` and conditionally calls `escalateToCommander`
  5. Calls `markEscalationSent` after successful escalation
  6. Calls `recordSlaRecovery` for recoveries
  - This orchestration loop has ZERO end-to-end test coverage. The injectable `escalateToCommander` parameter (designed specifically for testing) is never used in any test.
- `querySignalAges(db)` DB queries are untested — NULL values (empty tables) cause SQLite division behavior that should be explicitly verified.

### sscCheckerJob.ts
- Existing coverage: `104-job-ssc-check.test.ts` tests `checkSscReports` use-case. `FIX-1281-bctc-vps-only.test.ts` AC-4 tests the VPS guard by checking config value — it does NOT call `runSscCheck()`.
- Gap: `runSscCheck()` is never called in any test. The module-level `isRunning` concurrency guard is completely untested.

## Files to Read Before Writing Tests

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/scheduler/news-analysis/sscCheckerJob.ts`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/domain/services/freshnessSlaChecker.ts` (SignalType, thresholds)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/__tests__/234-vps-health-sla.test.ts` (reference for DB setup patterns)

## Test File to Create

`apps/mcp-server/src/__tests__/1352c-freshness-sla-monitor-e2e-sscchecker-guard.test.ts`

## Test Cases

### Group A — runFreshnessSlaMonitor() end-to-end (5 cases)

The injectable `escalateToCommander` callback is the key injection point. Use an in-memory DB with `sla_breach_audit` table populated as needed.

**A-1: All signals fresh — no breaches, no escalations, returns {breaches:0, recoveries:0, escalations:0}**
- Initialize in-memory DB with all required tables
- Insert fresh data into `market_prices` (updated_at = now), `financial_reports` (parsed_at = now), `rag_analyses` (created_at = now), `sbv_rates` (fetched_at = now), `daily_ohlcv` (updated_at = now, foreign_buy_vol = 100)
- Mock `escalateToCommander` to capture calls
- Call `runFreshnessSlaMonitor(db, mockEscalate)`
- Assert `result = { breaches: 0, recoveries: 0, escalations: 0 }`
- Assert `mockEscalate` not called

**A-2: Price data stale (15 min old) — breach recorded, escalation fired**
- Insert `market_prices.updated_at` = 15 minutes ago (price SLA threshold = 10 min)
- Insert fresh data for all other tables
- Capture escalation calls in mock
- Call `runFreshnessSlaMonitor(db, mockEscalate)`
- Assert `result.breaches === 1`
- Assert `result.escalations === 1`
- Assert mock called with `('price', 15, 10, 'HIGH')`
- Assert `sla_breach_audit` has 1 row with `signal_type='price'`, `status='breach_open'`, `escalation_callback_sent=1`

**A-3: Cooldown active — second breach for same type does NOT re-escalate**
- Insert a prior `sla_breach_audit` row for `price` with `escalation_callback_sent=1` and `breached_at=datetime('now')`
- Insert stale `market_prices` (15 min old)
- Call `runFreshnessSlaMonitor(db, mockEscalate)`
- Assert `result.escalations === 0` (cooldown suppresses)
- Assert `result.breaches === 1` (breach still recorded)
- Assert `mockEscalate` NOT called

**A-4: Recovery detected — prior breach marked recovered**
- Insert a prior `sla_breach_audit` row: `signal_type='news'`, `status='breach_open'`
- Insert fresh `rag_analyses` (created_at = now) — news is now within threshold
- Call `runFreshnessSlaMonitor(db, mockEscalate)`
- Assert `result.recoveries === 1`
- Assert `sla_breach_audit` row for 'news' has `status='recovered'` and `recovered_at IS NOT NULL`

**A-5: querySignalAges — NULL tables return 0 age (empty table edge case)**
- Create minimal in-memory DB with all 5 source tables but NO rows inserted
- Call `querySignalAges(db)` directly
- Assert all values are 0 (SQLite `(now - NULL) = NULL` coerced to 0 by `Math.max(0, row.age_minutes)`)
- This validates the NULL-safety in the `Math.max(0, ...)` guard

### Group B — sscCheckerJob concurrency guard (1 case)

**B-1: runSscCheck() concurrency guard — second call while running logs warning and returns**

The `isRunning` flag is module-level state. Strategy: make the first call hang by injecting a slow `checkSscReports`, then fire the second call.

- Set `Bun.env.ENABLE_LOCAL_BCTC_FETCH = "true"` (to bypass the VPS guard)
- Mock `checkSscReports` to return a promise that resolves after a manual trigger
- Start `runSscCheck()` without awaiting — first call sets `isRunning = true`
- Immediately call `runSscCheck()` again — second call should see `isRunning = true`
- Assert logger.warn called with text matching `previous cycle still running`
- Trigger the first call to complete; await it
- Assert `isRunning` is false after completion

Implementation note: because `runSscCheck` uses `recordJobRun(db, ...)`, the test needs an in-memory DB with `cron_job_runs` table. Set `Bun.env.DB_PATH = ":memory:"` before `initDatabase()`.

Alternative simpler approach (if module state is hard to control): test that `runSscCheck` with `ENABLE_LOCAL_BCTC_FETCH=false` (the default) returns without calling `checkSscReports`, verifying the first guard. For the `isRunning` guard, verify the source file has the guard present (static assertion), which is a valid contract lock-in for a thin wrapper.

Choose whichever approach compiles and passes cleanly. Document the choice in the test.

## DB Schema Requirements

The in-memory DB for Group A tests must have:
- `market_prices` table with `updated_at TEXT` column
- `financial_reports` table with `parsed_at TEXT` column
- `rag_analyses` table with `created_at TEXT` column
- `sbv_rates` table with `fetched_at TEXT` column
- `daily_ohlcv` table with `updated_at TEXT` and `foreign_buy_vol REAL` columns
- `sla_breach_audit` table with full schema (see `recordSlaBreach` insert statement)

Use `initDatabase()` to create all tables in `:memory:` mode — the full schema migration already creates all these tables. Do not recreate them manually.

## DDD Layer Check
- `freshnessSlaMonitorJob.ts` is `interface/scheduler` — imports from `domain/services/freshnessSlaChecker` and uses injectable DB + callback. Clean separation confirmed.
- `sscCheckerJob.ts` is `interface/scheduler` — imports `checkSscReports` from `application/usecases`. No domain imports directly. Clean.

## Risk Flag
`querySignalAges` runs a single SQL query with `UNION ALL` across 5 tables. If any table is missing (schema not yet migrated), the entire query fails. The test for A-5 must use `initDatabase()` to ensure all tables exist before calling `querySignalAges`.

## Acceptance Criteria
- All 6 new test cases pass (GREEN)
- No changes to source files required
- Test file name: `1352c-freshness-sla-monitor-e2e-sscchecker-guard.test.ts`

## Commit Format
```
task(1352c): add end-to-end tests for runFreshnessSlaMonitor orchestration and sscCheckerJob concurrency guard
```
