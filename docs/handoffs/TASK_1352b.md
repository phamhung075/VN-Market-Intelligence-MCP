# TASK 1352b — Scheduler Job Wrapper Tests: foreignFlowFetcherJob (runForeignFlowFetcherJob)

## Sprint
1352 — Scheduler Test Coverage Phase 2

## Status
RED (tests to write, no implementation changes needed)

## Brownfield Audit Summary

### foreignFlowFetcherJob.ts
- Existing coverage: `1290a-foreign-flow-fallback-job.test.ts` exhaustively tests `fetchForeignFlowWithFallback()` (the infrastructure fetcher) — 8 test cases covering primary success, cache fallback, circuit breaker, stale cache, all-exhausted, CB recovery, result contract, error logging.
- Gap: `runForeignFlowFetcherJob()` (the job layer function in `foreignFlowFetcherJob.ts`) is NEVER tested directly. This function:
  1. Reads `breakers.foreignFlow.stats.state` from `circuitBreakerRegistry` and attaches it to the result as `cbState`
  2. Sets `fallbackActivated: fetchResult.source !== 'primary'` (a computed field not tested)
  3. Handles the unexpected-error catch path (returns `{ source: 'none', fallbackActivated: true, cbState, warning }`)
  4. The `runForeignFlowFetcherJobCron()` cron wrapper (calls `recordJobRun` + conditional logging for `source !== 'primary'` and `source === 'none'`) is completely untested

## Files to Read Before Writing Tests

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/scheduler/market-data/foreignFlowFetcherJob.ts`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` (fetchForeignFlowWithFallback signature + overrides shape)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/infrastructure/circuitBreakerRegistry.ts` (breakers.foreignFlow.stats.state)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/__tests__/1290a-foreign-flow-fallback-job.test.ts` (reference for helper patterns)

## Test File to Create

`apps/mcp-server/src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts`

## Test Cases (5 cases)

**Case 1: Primary success — fallbackActivated is false, cbState is 'closed'**
- Call `runForeignFlowFetcherJob()` with an `overrides.fetchFn` that returns valid foreign flow data
- Assert `result.source === 'primary'`
- Assert `result.fallbackActivated === false`
- Assert `result.cbState === 'closed'`
- Assert `result.timestamp` is an ISO 8601 string
- Assert `result.changes >= 0`
- Assert `result.warning` is `undefined`

**Case 2: Cache fallback — fallbackActivated is true, source is 'cache'**
- Use overrides: `fetchFn` that throws (AbortError), inject `cacheStore` with valid cache entry
- Call `runForeignFlowFetcherJob()` via `fetchForeignFlowWithFallback` overrides — note: `runForeignFlowFetcherJob` only accepts `now` and `fetchFn` overrides, it calls `fetchForeignFlowWithFallback(overrides)` internally
- Assert `result.source === 'cache'`
- Assert `result.fallbackActivated === true`
- Assert `result.cbState` is one of `['closed', 'open', 'half-open']`

**Case 3: All fallbacks exhausted — source is 'none', warning present**
- `fetchFn` throws, no cache, no SSE
- Assert `result.source === 'none'`
- Assert `result.fallbackActivated === true`
- Assert `result.warning` contains "all fallbacks unavailable"

**Case 4: Unexpected error in fetchForeignFlowWithFallback — catch path returns structured result**
- Mock `fetchForeignFlowWithFallback` to throw an unexpected error (`new Error("registry corrupted")`)
- Since `runForeignFlowFetcherJob` does a dynamic `import` of `circuitBreakerRegistry` inside the catch block, verify that:
  - The function does NOT throw
  - `result.source === 'none'`
  - `result.fallbackActivated === true`
  - `result.warning` contains "unexpected error" and "registry corrupted"
  - `result.changes === 0`

  Implementation: use `mock.module` to replace the fetcher import, or test via a spy that overrides `fetchForeignFlowWithFallback`.

**Case 5: runForeignFlowFetcherJobCron() — recordJobRun receives rowsWritten from result.changes**
- Use an in-memory DB with `cron_job_runs` table
- Mock `fetchForeignFlowWithFallback` to return `{ source: 'primary', changes: 7, timestamp: '...', warning: undefined }`
- Call `runForeignFlowFetcherJobCron()` (the cron wrapper)
- Query `cron_job_runs WHERE job_name='foreignFlowFetcherJob'`
- Assert row exists with `status='success'` and `rows_written=7`

## Injection Strategy

`runForeignFlowFetcherJob` accepts an optional `overrides` object with `now` and `fetchFn`. These can be used for Cases 1-3 since `fetchForeignFlowWithFallback` already accepts those overrides and forwards them.

For Case 4 (unexpected error from `fetchForeignFlowWithFallback` itself), use `mock.module` to replace the fetcher module before importing the job module:
```typescript
mock.module("../infrastructure/fetchers/foreignFlowFetcher.js", () => ({
  fetchForeignFlowWithFallback: async () => { throw new Error("registry corrupted"); },
}));
```

For Case 5, the cron wrapper uses `getDb()` — set `Bun.env.DB_PATH = ":memory:"` before `initDatabase()`.

## DDD Layer Check
- `foreignFlowFetcherJob.ts` is `interface/scheduler` — imports from `infrastructure/fetchers`, `infrastructure/db`, `infrastructure/logger`. No domain imports (correct, the fetcher handles all logic).
- `runForeignFlowFetcherJob` does a dynamic import of `circuitBreakerRegistry` for state reporting — this is acceptable in the interface layer.

## Risk Flag
The dynamic `import("../../infrastructure/circuitBreakerRegistry.js")` inside `runForeignFlowFetcherJob` is done twice (once in the try block, once in the catch block). This is slightly unusual and could cause issues if the registry module has side effects on re-import. The test for Case 4 will incidentally exercise this double-import path.

## Acceptance Criteria
- All 5 new test cases pass (GREEN)
- No changes to source files required
- Test file name: `1352b-foreign-flow-fetcher-job-wrapper.test.ts`

## Commit Format
```
task(1352b): add wrapper-level tests for runForeignFlowFetcherJob (fallbackActivated, cbState, cron wrapper)
```

---

## [QA] Review Record — 2026-04-27

**QA verdict: CHANGES_REQUESTED** (round 1)
**Commit reviewed:** 132d035f

| Check | Result |
|-------|--------|
| `bun test 1352b-*.test.ts` | 5/5 PASS (151ms) |
| `bun tsc --noEmit` (1352b lines) | 4 ERRORS — BLOCKING |
| Full suite | 6918 pass / 664 fail (pre-existing, not from 1352b) |
| DDD | PASS |
| Security | PASS |

### Blocking Issues

**B-1: TS2353 (lines 145, 167)** — `cacheStore` not in `runForeignFlowFetcherJob` overrides type.
- Fix in production file: `src/scheduler/market-data/foreignFlowFetcherJob.ts` — add `cacheStore?` to overrides parameter type.

**B-2: TS2307 (lines 200, 247)** — `?test=C4` and `?test=C5` query-string imports.
- Same pattern as 1352a B-1. Fix in test file: remove `?test=XX` suffix, use plain `.js` import.

Full fixer instructions: `docs/handoffs/TASK_1352b_fixer.md`
