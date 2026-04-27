# TASK_1346a — FIX: test stub running in production scheduler

## Status: impl complete, awaiting QA

## Branch
`task/1346a-remove-test-stub-prod`

## Problem
`assembleEveningSummary` was logging `"simulated getRecentPredictionSignals failure for AC-3"` in production. Report ID: 1323.

Root cause: `assembleEveningSummary.ts` used `await import("../../infrastructure/db/predictionStore.js")` inside `_assembleEveningSummaryImpl` to get `getRecentPredictionSignals` at runtime. Bun's `mock.module()` (used in test 1318) permanently replaces the module registry entry for `predictionStore.js` in the same Bun process. Any subsequent dynamic import resolves to the test stub — including when the scheduler fires in a server process that previously ran tests (e.g. CI artefact reuse or a dev-mode server with test imports loaded).

## Fix

**File changed**: `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts`

- Added static top-level import: `import { getRecentPredictionSignals as _getRecentPredictionSignals } from "../../infrastructure/db/predictionStore.js"`
- Removed the `await import(...)` dynamic call at Step 5 (line ~661); replaced with `_getRecentPredictionSignals`
- The `getPredictionSignalsFn` injection point in `AssembleEveningSummaryOptions` is unchanged — tests that need to override behaviour still use it

**Test added**: `apps/mcp-server/src/__tests__/1346a-no-simulated-in-prod-scheduler.test.ts`

- AC-1: runs `assembleEveningSummary` without `getPredictionSignalsFn` after test 1318 has run; asserts no "simulated" string in any logger call
- AC-2: confirms production path returns `predictionSignals: []` and `predictionDiag.stored: 0` from an empty DB (real implementation, not stub)

## Test Results

| Suite | Pass | Fail |
|-------|------|------|
| 1346a (new) | 3 | 0 |
| 1318-prediction-signals-evening | 10 | 0 |
| 1354-prediction-signals-fallback | 7 | 0 |
| 1356-ta-diag | 3 | 0 |
| **Total** | **23** | **0** |

Pre-existing failures in `105-job-evening-summary.test.ts` (14 tests, ENOENT on worktree path `data/__test-evening-105__`) are unrelated to this fix and were present before the change.

## DDD Compliance
- `assembleEveningSummary.ts` is in `application/usecases` — importing from `infrastructure/db` is permitted at this layer.
- No domain layer changes.

## QA Checklist
- [ ] Run `bun test src/__tests__/1318-prediction-signals-evening.test.ts src/__tests__/1346a-no-simulated-in-prod-scheduler.test.ts` — must be 13 pass, 0 fail
- [ ] Confirm no "simulated" string appears in combined test run logs
- [ ] Full regression: `bun test` — zero new failures beyond the 14 pre-existing `105` failures
- [ ] TypeScript: `bun run tsc --noEmit` — zero errors
