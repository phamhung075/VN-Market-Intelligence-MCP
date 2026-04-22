# Task Report: 1290b — GREEN: Implement Foreign Flow Fallback Scheduler Job

**Date:** 2026-04-22
**Task:** 1290b (GREEN phase implementation)
**Sprint:** 1290 (Integrate Foreign Flow Fallback Fetcher)
**Status:** READY FOR QA REVIEW

---

## Summary

Implemented the scheduler job that integrates the foreign flow fallback fetcher (from Sprint 1288) into the cron loop. The job runs every 60 seconds, detects fallback activation, and logs diagnostics for circuit breaker state. All 8 RED test assertions from task 1290a now PASS.

**Key Achievement:** Completes the resilience loop. When VPS endpoint is unreachable, the job now automatically activates cache/SSE fallback to keep foreign flow data flowing without human intervention.

---

## Test Results

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| `1290a-foreign-flow-fallback-job.test.ts` | 8 | 0 | All 8 RED assertions now GREEN |
| Full suite (`bun test --timeout 30000`) | ✓ | 0 | No regressions detected |
| TypeScript (`bun tsc --noEmit`) | — | 0 | Zero errors |

### Test Details (1290a)
1. **Assertion 1a:** Primary endpoint success returns {source:primary, changes, timestamp, fallbackActivated:false} — PASS
2. **Assertion 2a:** Primary timeout (>5s) activates cache fallback with metadata — PASS
3. **Assertion 3a:** Circuit breaker open skips primary and uses cache — PASS
4. **Assertion 4a:** All fallbacks exhausted returns empty result with warning — PASS
5. **Assertion 5a:** Cache >2h old includes staleness warning — PASS
6. **Assertion 6a:** Circuit breaker closes on primary success after open state — PASS
7. **Assertion 7a:** Result contract always includes {source, changes, timestamp, warning?} — PASS
8. **Assertion 8a:** Error paths include contextual logging (error, source, cbState, timestamp) — PASS

---

## Files Created/Modified

| File | Change | Lines | Purpose |
|------|--------|-------|---------|
| `src/scheduler/market-data/foreignFlowFetcherJob.ts` | CREATE | 157 | New job: `runForeignFlowFetcherJob()` + `runForeignFlowFetcherJobCron()` wrapper |
| `src/scheduler/jobs.ts` | MODIFY | +6 | Add `foreignFlowFetch` cron definition, import job, register schedule |
| `src/infrastructure/fetchers/foreignFlowFetcher.ts` | MODIFY | +2 | Format timestamps without `.000Z` when milliseconds are zero |
| `src/__tests__/1290a-foreign-flow-fallback-job.test.ts` | MODIFY | +10 | Add `beforeAll()/afterAll()` with database initialization |

---

## Implementation Details

### foreignFlowFetcherJob.ts
- **`runForeignFlowFetcherJob(overrides?)`:** Main job logic
  - Calls `fetchForeignFlowWithFallback()` with optional overrides (for testing)
  - Reads circuit breaker state for observability
  - Returns `ForeignFlowFetcherJobResult` with source, changes, timestamp, fallbackActivated, cbState
  - Logs primary success at INFO level, fallback activation at WARN level
  - Catches unexpected errors (should not happen per design) and returns {source: 'none'}

- **`runForeignFlowFetcherJobCron()`:** Cron wrapper
  - Wraps main job in `recordJobRun()` for cron_job_runs observability
  - Logs fallback success/exhaustion for diagnostics
  - Called by scheduler every 60 seconds

### jobs.ts Integration
- Added `foreignFlowFetch: Bun.env.CRON_FOREIGN_FLOW_FETCH ?? '*/1 * * * *'` to CRONS
- Imported `runForeignFlowFetcherJobCron`
- Registered cron schedule in `startScheduler()` with UTC timezone

### Timestamp Formatting Fix
- Modified `fetchForeignFlowWithFallback()` to format timestamps without unnecessary `.000Z`
- Example: `"2026-04-22T10:00:00.000Z"` → `"2026-04-22T10:00:00Z"`
- Preserves ISO 8601 compliance while matching test expectations

### Test Setup Fix
- Added `beforeAll()`: calls `initDatabase()` to initialize :memory: database schema
- Added `afterAll()`: calls `closeDb()` to clean up connection
- Enables `writeForeignFlowToOhlcv()` to execute without "no such table" errors

---

## DDD Compliance: PASS

- `src/scheduler/market-data/foreignFlowFetcherJob.ts` imports only from:
  - `../../infrastructure/logger.js` (logger)
  - `../../infrastructure/db/cronJobRunStore.js` (recordJobRun)
  - `../../infrastructure/fetchers/foreignFlowFetcher.js` (fetchForeignFlowWithFallback)
  - `../../infrastructure/db/schema.js` (getDb)
  - `../../infrastructure/circuitBreakerRegistry.js` (breakers)
- No domain layer imports
- Scheduler layer respects dependency inversion (imports only infrastructure/db services)

---

## Security Checks: PASS

- No hardcoded URLs, API keys, or credentials
- All environment variables accessed via `Bun.env` with fallbacks
- No `eval()` or dynamic code generation
- SQL queries use parameterized binding (via SQLite prepared statements)
- Error messages sanitized (error names + messages only, no stack traces)
- Circuit breaker state readable for diagnostics only (no reset/manipulation)

---

## Acceptance Criteria

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | `src/scheduler/market-data/foreignFlowFetcherJob.ts` exists | PASS |
| AC-2 | Exports `runForeignFlowFetcherJob()` and `runForeignFlowFetcherJobCron()` | PASS |
| AC-3 | `runForeignFlowFetcherJob()` returns `ForeignFlowFetcherJobResult` with all fields | PASS |
| AC-4 | Job calls `fetchForeignFlowWithFallback()` with fallback detection | PASS |
| AC-5 | Circuit breaker state observable via `cbState` field | PASS |
| AC-6 | All error paths logged with context (timestamp, cbState, error message) | PASS |
| AC-7 | Cron schedule registered in `jobs.ts` with UTC timezone | PASS |
| AC-8 | Wrapped in `recordJobRun()` for cron_job_runs observability | PASS |
| AC-9 | All 8 RED assertions from 1290a now PASS | PASS |
| AC-10 | TypeScript clean (0 errors) | PASS |
| AC-11 | No regressions in full test suite | PASS |

---

## Issues Found

### Blocking
None.

### Non-Blocking
- Test timeout behavior: Individual tests with 6000ms mock delays require `--timeout 30000` (bunfig.toml already configured with this, but explicit flag needed when running single test file via CLI)

---

## Key Design Decisions

1. **Timestamp formatting fix:** Modified `fetchForeignFlowWithFallback()` to strip unnecessary `.000Z` milliseconds. This is cosmetic (both formats are valid ISO 8601) and allows test assertions to match expected format.

2. **Database initialization in test setup:** Added `beforeAll()/afterAll()` to test file. This is not modifying test assertions but rather enabling test infrastructure to work correctly.

3. **cbState as required field:** Made `cbState: 'closed'|'open'|'half-open'` required (not optional) in `ForeignFlowFetcherJobResult` interface. It's always computed from circuit breaker state and never undefined.

4. **Fallback detection as simple boolean:** `fallbackActivated = (source !== 'primary')` is simple, clear, and matches test expectations.

---

## Observability

### Logging Pattern
```
[foreign-flow-job] primary endpoint success | fallback activated | all fallbacks exhausted | unexpected error
  {
    source: 'primary|cache|sse|none',
    changes: <number>,
    warning?: '<message>',
    cbState: '<closed|open|half-open>',
    timestamp: '<ISO-8601>'
  }
```

### Cron Job Runs Table
- **job_name:** `'foreignFlowFetcherJob'`
- **status:** success/failure (determined by exception)
- **result_json:** `{ rowsWritten: <number> }`
- **started_at / ended_at:** Auto-recorded by `recordJobRun()`

---

## Resilience Loop Completion

This task completes the fallback resilience mechanism:

**Sprint 1288:** Implemented `fetchForeignFlowWithFallback()` with 4-source strategy
- Primary: VPS endpoint (5s timeout, circuit breaker wrapped)
- Fallback: In-memory cache from last successful run
- Fallback: SSE message bus recent broadcasts
- Fallback: Return empty with warning

**Sprint 1290:** Integrated into scheduler for continuous operation
- Job runs every 60 seconds automatically
- Detects when primary is unavailable and activates fallback
- Logs all state transitions for diagnostics
- Records job execution in cron_job_runs for observability

**Result:** VPS outages no longer block foreign flow data collection. When endpoint is down, cache/SSE keeps daily_ohlcv populated automatically. Alert Commander can analyze with staleness warnings until primary recovers.

---

## Commit History

```
a14f2c0a docs(1290b): Add implementation record and mark task Review status
bbd7a051 fix(1290b): TypeScript errors and JSDoc comment syntax
57ad9466 feat(1290b): GREEN — implement foreign flow fallback scheduler job
```

---

## Ready for QA

All tests passing, TypeScript clean, DDD compliant, security checked.

**QA Checklist:**
- [ ] Run `bun test --timeout 30000 src/__tests__/1290a-*` — confirm 8/8 PASS
- [ ] Run `bun tsc --noEmit` — confirm 0 errors
- [ ] Verify `foreignFlowFetcherJob.ts` logic matches handoff specification
- [ ] Verify `jobs.ts` integration (CRONS definition, import, schedule registration)
- [ ] Check DDD layer compliance (scheduler imports only infrastructure)
- [ ] Verify timestamp format in test results (ISO 8601 without `.000Z`)
- [ ] Confirm circuit breaker state is observable (not reset/manipulated)
