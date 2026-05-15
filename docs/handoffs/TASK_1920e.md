# TASK 1920e — Wire BacktestResultRepo into cascadeBacktestJob

**Sprint:** 1920 | **Tier:** 3 | **Type:** FEATURE | **Zone:** apps/mcp-server/ | **Size:** S
**DDD Layer:** application + infrastructure | **Owner:** dev-mcp-server
**Status:** Ready for Dev

---

## Context

`BacktestResultRepo` (`infrastructure/db/backtestResultRepo.ts`) provides `saveRun(record: BacktestRunRecord): void`. The domain interface is `IBacktestResultRepository` (`domain/repositories/IBacktestResultRepository.ts`). The use-case `application/usecases/runBacktest.ts` already accepts the repo via injection and calls `saveRun` on manual MCP-triggered backtests.

`cascadeBacktestJob.ts` (`scheduler/macro/cascadeBacktestJob.ts`) runs daily at 20:30 UTC. It processes `cascade_rule_hits` where `outcome_correct IS NULL` and computes `price_impact_3d`, `price_impact_7d`, `outcome_correct` via `updateOutcome()`. It then sends a WORK telegram with `{processed, skipped, noData}`.

The gap: `cascadeBacktestJob` NEVER calls `saveRun`. The `backtest_runs` table stays at zero rows. `alert-commander` cannot query backtest performance history.

---

## Requirements

### FR-1 — Aggregate and persist backtest run record
**DDD layer:** application

After the processing loop completes (before the `sendWorkFn` call), compute a `BacktestRunRecord` from the job's aggregate metrics and call `repo.saveRun(record)`.

Record fields to populate:
- `id`: `crypto.randomUUID()` or `Date.now().toString(36)` — unique per run
- `strategy`: `"cascade-backtest"` (fixed string — this job tests cascade rules as a strategy)
- `startDate`: ISO date of the earliest `hit_at` in the processed batch, or `new Date().toISOString().slice(0,10)` if batch is empty
- `endDate`: ISO date of today (`new Date().toISOString().slice(0,10)`)
- `runAt`: `new Date().toISOString()`
- `totalReturn`: mean of all `priceImpact3d` values across processed hits (0.0 if processed=0)
- `benchmarkReturn`: `null` (no benchmark available at this layer)
- `maxDrawdown`: min of all `priceImpact3d` values (most negative), or 0.0 if empty
- `sharpeRatio`: `null` (insufficient data for Sharpe at daily granularity)
- `winRate`: fraction of processed hits where `outcomeCorrect === 1` divided by `processed` (0.0 if processed=0)
- `tradeCount`: `processed` count
- `resultJson`: `JSON.stringify({ processed, skipped, noData, mean3dImpact: totalReturn, minImpact: maxDrawdown })`

### FR-2 — Inject repo via deps (testability)
**DDD layer:** infrastructure

Extend `CascadeBacktestDeps` with an optional `backtestResultRepo?: IBacktestResultRepository`. When not injected, create a `SqliteBacktestResultRepository(db)` using the same db instance. This follows the existing `sendWorkFn` injection pattern in the job.

### FR-3 — Fail-silent on saveRun error
**DDD layer:** infrastructure

Wrap `repo.saveRun(record)` in a try/catch. A DB write failure here must NOT throw — the job must still call `sendWorkFn`. Log a `console.warn` on failure.

### NFR-1 — No new imports outside mcp-server zone
The `IBacktestResultRepository` interface is already in `domain/repositories/`. `SqliteBacktestResultRepository` is already in `infrastructure/db/backtestResultRepo.ts`. No new files required.

### NFR-2 — Idempotency note
`backtest_runs` has no UNIQUE constraint beyond `id`. Each daily job run produces a new row. This is correct — daily performance history is desired.

---

## Acceptance Criteria

- AC-1: After a real run with `processed >= 1`, `SELECT COUNT(*) FROM backtest_runs WHERE strategy='cascade-backtest'` returns a row count > 0.
- AC-2: `totalReturn` field in `backtest_runs` equals the mathematical mean of `price_impact_3d` values from the processed batch (round4 precision).
- AC-3: `winRate` = (count of rows where `outcomeCorrect=1`) / processed, bounded [0,1].
- AC-4: When `saveRun` throws, `sendWorkFn` is still called (error is swallowed with `console.warn`).
- AC-5: Test injection — `CascadeBacktestDeps.backtestResultRepo` can be satisfied with a mock that records calls to `saveRun`.
- AC-6: Test with `processed=0` — `saveRun` is still called with `tradeCount=0`, `totalReturn=0`, `winRate=0`.

---

## Edge Cases

- Empty batch (all hits are noData): `processed=0`, `winRate=0`, `totalReturn=0`. Still writes a run record (observability value).
- Single hit with `outcomeCorrect=null` (neutral outcome, 0.0 < impact < 1.0): `outcomeCorrect` is null in `cascade_rule_hits`, so `winRate` denominator counts only hits where `outcomeCorrect` is explicitly 1 or 0.
- VN locale: all dates are ISO 8601 UTC; no locale-specific date formatting.

---

## Files Changed (expected)

- `apps/mcp-server/src/scheduler/macro/cascadeBacktestJob.ts` — extend `CascadeBacktestDeps`, add aggregate accumulator in loop, call `saveRun` after loop
- `apps/mcp-server/src/__tests__/` — add or extend existing `cascade-backtest` test to cover AC-1 through AC-6

---

---

## [PM] Planning Context

**Zone:** `apps/mcp-server/`

**Developer assigned:** dev-mcp-server

**Acceptance Criteria (from BA spec, to verify in implementation):**
- AC-1: After a real run with `processed >= 1`, `SELECT COUNT(*) FROM backtest_runs WHERE strategy='cascade-backtest'` returns a row count > 0.
- AC-2: `totalReturn` field in `backtest_runs` equals the mathematical mean of `price_impact_3d` values from the processed batch (round4 precision).
- AC-3: `winRate` = (count of rows where `outcomeCorrect=1`) / processed, bounded [0,1].
- AC-4: When `saveRun` throws, `sendWorkFn` is still called (error is swallowed with `console.warn`).
- AC-5: Test injection — `CascadeBacktestDeps.backtestResultRepo` can be satisfied with a mock that records calls to `saveRun`.
- AC-6: Test with `processed=0` — `saveRun` is still called with `tradeCount=0`, `totalReturn=0`, `winRate=0`.

**Files to read first:**
- `apps/mcp-server/src/scheduler/macro/cascadeBacktestJob.ts` — job loop structure, aggregate accumulators
- `apps/mcp-server/src/domain/repositories/IBacktestResultRepository.ts` — interface definition
- `apps/mcp-server/src/infrastructure/db/backtestResultRepo.ts` — implementation
- `apps/mcp-server/src/domain/models/BacktestRunRecord.ts` — shape definition (if exists)

**Files to create:**
- None (existing repo interface and implementation used)

**Files to modify:**
- `apps/mcp-server/src/scheduler/macro/cascadeBacktestJob.ts` — extend `CascadeBacktestDeps` with optional `backtestResultRepo`, add aggregate loop, call `saveRun` after loop
- `apps/mcp-server/src/__tests__/` — add or extend test file to cover AC-1 through AC-6

**Dependencies:** None (no blocking tasks, independent work)

**Knowledge needed:**
- DDD layer separation (application vs infrastructure)
- Dependency injection pattern in this codebase
- Test strategy: mock repo, verify saveRun called with correct shape

**Risk flags:**
- R-1920e-1: totalReturn mean computation must handle empty batch (zero processed) → default 0.0
- R-1920e-2: winRate denominator handling when outcomeCorrect is null (use explicitly 1 or 0 only)
- R-1920e-3: Error handling (fail-silent pattern) must NOT break job flow
- R-1920e-4: Repo injection defaults to SqliteBacktestResultRepository — ensure db instance available at job layer

---

## Blockers

None. No PO questions. No architect brief required (no new service boundary, no new schema).

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-1 | Integration | Row inserted to backtest_runs |
| AC-2 | Unit | mean3dImpact computed correctly from mock hits |
| AC-3 | Unit | winRate = 1/3 for 1 outcomeCorrect=1 out of 3 processed |
| AC-4 | Unit | sendWorkFn spy called even when saveRun throws |
| AC-5 | Unit | Mock repo.saveRun receives correct BacktestRunRecord shape |
| AC-6 | Unit | processed=0 → saveRun called with tradeCount=0 |

---

## [QA] Review Record — Round 1

**Date:** 2026-05-16
**Verdict:** CHANGES_REQUESTED
**Reviewer:** qa

### Pipeline Results
- Targeted tests (1920e, 5 tests): 5 pass / 0 fail
- Full suite: 9421 pass / 36 fail (36 pre-existing baseline, 0 regressions)
- tsc: 16 errors (blocking — see below)
- DDD: PASS (scheduler layer importing infrastructure is correct; no domain→infra violation)
- Security: PASS (no process.env, no hardcoded secrets, parameterized SQL)

### AC Verification
- AC-1 PASS: `saveRun` called once after loop with `strategy="cascade-backtest"`. TC-1 verifies.
- AC-2 PASS: `totalReturn` = mean of `[2.0, -4.0]` = `-1.0` — verified in TC-1.
- AC-3 PASS: `winRate` = `1/2` = `0.5` for 1 outcomeCorrect=1 out of 2 processed — TC-1 verifies.
- AC-4 PASS: `sendWorkFn` called after throwing `saveRun` — TC-3 verifies.
- AC-5 PASS: `CascadeBacktestDeps.backtestResultRepo` accepts mock — TC-4 verifies.
- AC-6 PASS: `processed=0` → `saveRun` called with `tradeCount=0, totalReturn=0, winRate=0` — TC-2 verifies.

### Blocking Issues
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:91` — TS18048: `rec` is possibly `undefined` (`noUncheckedIndexedAccess: true` in tsconfig; `savedRecords[0]` returns `BacktestRunRecord | undefined`)
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:92` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:95` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:98` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:101` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:103` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:104` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:105` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:106` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:107` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:136` — TS18048 same (TC-2 block)
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:137` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:138` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:139` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:140` — TS18048 same
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:227` — TS2532: Object is possibly `undefined`

**Fix:** Add `expect(savedRecords[0]).toBeDefined()` guard before dereferencing, then use `const rec = savedRecords[0]!;` (or `as BacktestRunRecord`). All 16 errors are in the test file only — no production code changes required.
