# TASK 1352a — Scheduler Job Wrapper Tests: macroIndicatorRefreshJob + marketScanJob concurrency guard

## Sprint
1352 — Scheduler Test Coverage Phase 2

## Status
RED (tests to write, no implementation changes needed)

## Brownfield Audit Summary

### macroIndicatorRefreshJob.ts
- Existing coverage: `239-macro-indicator-refresh.test.ts` (AC-1..AC-10) tests the `fetchAndStoreMacroIndicators` use-case and `freshnessSlaChecker` domain service. `239c-macro-refresh-integration.test.ts` tests schema migration and cron registration.
- Gap: `macroIndicatorRefreshJob()` and `validateMacroFreshnessOnStartup()` are NEVER called in any test. The `telegramCallback` adapter (channel routing), `recordJobMetrics` call in `finally`, and the error catch path are all uncovered.

### marketScanJob.ts
- Existing coverage: `103-job-market-scan.test.ts` tests the `scanMarket` use-case exhaustively (10 cases). `1076-market-scan-noise-retirement.test.ts` validates no Telegram sends. `1420-cron-health-coverage.test.ts` verifies `recordJobRun` mechanism in isolation.
- Gap: `runMarketScan()` is never called in tests. The module-level `isRunning` concurrency guard and the `isTradingSession()` skip path are completely untested.

## Files to Read Before Writing Tests

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/scheduler/market-data/marketScanJob.ts`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/infrastructure/microservices/clients.ts` (getMacroSnapshot signature)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/infrastructure/fetchers/hose.ts` (isTradingSession signature)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/infrastructure/observability/jobMetrics.ts` (recordJobMetrics signature)

## Test File to Create

`apps/mcp-server/src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts`

## Test Cases

### Group A — macroIndicatorRefreshJob() wrapper (4 cases)

**A-1: Telegram WORK message sent on getMacroSnapshot success**
- Mock `getMacroSnapshot` to resolve with `{ vnIndex: 1250, brentPrice: 85.5, goldPrice: 2300 }`
- Mock `sendTelegramWork` to capture the message string
- Call `macroIndicatorRefreshJob()`
- Assert message contains "Macro refresh OK", "1250", "85.50", "2300", and "[Xms]" pattern
- Assert `sendTelegramWork` called exactly once

**A-2: recordJobMetrics called in finally block (success path)**
- Mock `getMacroSnapshot` to resolve (any value)
- Mock `recordJobMetrics` to capture calls
- Call `macroIndicatorRefreshJob()`
- Assert `recordJobMetrics` called with `("macroRefresh", expect.any(Number), 0, 1)`
- Rationale: `finally` block must always fire; `jobSuccessCount=1` on success

**A-3: recordJobMetrics called in finally block (error path)**
- Mock `getMacroSnapshot` to throw `new Error("microservice down")`
- Mock `sendTelegramWork` to capture messages
- Mock `recordJobMetrics` to capture calls
- Call `macroIndicatorRefreshJob()` — must not throw
- Assert `sendTelegramWork` called with message containing "Macro refresh FAILED" and "microservice down"
- Assert `recordJobMetrics` called with `("macroRefresh", expect.any(Number), 1, 0)`

**A-4: validateMacroFreshnessOnStartup() calls detectStartupStaleData without throwing**
- Mock `detectStartupStaleData` to resolve (or reject)
- Call `validateMacroFreshnessOnStartup()`
- Assert it never throws even when `detectStartupStaleData` rejects
- Assert error is logged to `console.error` (not re-thrown)

### Group B — runMarketScan() concurrency guard and session skip (3 cases)

**B-1: Concurrency guard — second call while running is skipped**

The `isRunning` flag is module-level state. This requires a trick: hold the first call pending while a second arrives.

- Mock `isTradingSession` to return `true`
- Mock `scanMarket` to return a promise that resolves only after `resolve()` is called manually
- Start `runMarketScan("open")` — do NOT await yet
- Immediately call `runMarketScan("open")` again (second call) — await this one
- Assert logger.warn was called with text matching `previous scan still running`
- Then resolve the first promise and await it

Implementation note: use a `Promise` + external `resolve` handle:
```typescript
let resolveFirst: () => void;
const firstDone = new Promise<void>(res => { resolveFirst = res; });
mockScanMarket.mockReturnValueOnce(firstDone.then(() => ({ scanned: 1, signals: 0, alerts: 0 })));
```

**B-2: isTradingSession returns false → scan skipped, no scanMarket call**
- Mock `isTradingSession` to return `false`
- Mock `scanMarket` to capture calls
- Call `runMarketScan("open")`
- Assert `scanMarket` was NOT called
- Assert logger.debug called with text matching `market closed`

**B-3: runMarketScan — isRunning flag resets to false after error**
- Mock `isTradingSession` to return `true`
- Mock `scanMarket` to throw `new Error("DB error")`
- Call `runMarketScan("open")` — must not throw
- Call `runMarketScan("open")` again immediately — should NOT be skipped (isRunning is false)
- Assert `scanMarket` called twice (both invocations attempted)

## Injection Strategy

`macroIndicatorRefreshJob` uses top-level module imports (`getMacroSnapshot`, `sendTelegramWork`, `recordJobMetrics`). The cleanest approach without rewriting the source is to mock at the module level using `bun:test` `mock.module()` before the import, or to use the dynamic import pattern with mocked globals. Check what pattern other test files in this repo use (see `1290a-foreign-flow-fallback-job.test.ts` for the `mock` import pattern).

`marketScanJob` has module-level `isRunning` state. To test the concurrency guard, both calls must share the same module instance — import the module once and call `runMarketScan` directly. The `isTradingSession` function can be swapped via `mock.module("../infrastructure/fetchers/hose.js", ...)` in Bun.

## DDD Layer Check
- `macroIndicatorRefreshJob` is `interface/scheduler` — may import from application and infrastructure. No domain-layer violations in source.
- `marketScanJob` is `interface/scheduler` — thin wrapper. All business logic in `scanMarket` use-case. Confirmed clean.

## Acceptance Criteria
- All 7 new test cases pass (GREEN)
- No changes to source files required (pure test additions)
- Test file name: `1352a-scheduler-job-wrappers-macro-marketscan.test.ts`

## Commit Format
```
task(1352a): add wrapper-level tests for macroIndicatorRefreshJob and marketScanJob concurrency guard
```
