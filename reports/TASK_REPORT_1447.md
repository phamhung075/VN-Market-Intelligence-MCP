# Task Report 1447 — compact
date: 2026-04-18
outcome: CHANGES_REQUESTED

changed:
- src/infrastructure/db/checkpoint.ts (PASSIVE → RESTART, warn block, JSDoc)
- src/__tests__/1447-checkpoint-restart-mode.test.ts (5 new tests)

bun test (unit only): 5 pass / 0 fail
bun test (full suite): 5140 pass / 140 fail  ← REGRESSION (baseline 5477/0)
tsc: 0 errors
ddd: PASS (infrastructure layer, no domain import violations)

## Root Cause of 140 Failures

`src/__tests__/1447-checkpoint-restart-mode.test.ts` calls `mock.module("../infrastructure/db/schema.js", ...)` at module scope. Bun's `mock.module` is process-wide and NOT automatically reset between test files. The mock leaks into all subsequent test files that import `schema.js`, replacing real SQLite `getDb()` with a stub that returns a fake DB object. All downstream DB tests (Tasks 228, 231, 269, 283, 1108, 1201 and more) receive the mock instead of a real in-memory SQLite instance, causing "no such table" failures throughout.

## Blocking Issue

src/__tests__/1447-checkpoint-restart-mode.test.ts:29 — `mock.module("../infrastructure/db/schema.js", ...)` leaks into full suite; add `afterAll(() => mock.restore())` after the describe block, OR restructure to use `mock.module` inside a `beforeAll` + `afterAll` pair that calls `mock.restore()`.

Same applies to line 37: `mock.module("../infrastructure/logger.js", ...)` — same leak vector, lower severity since logger mock is less likely to break other tests, but must be restored too.

## Verified Correct

- checkpoint.ts:34 uses `PRAGMA wal_checkpoint(RESTART)` — PASS
- checkpoint.ts:47-52 logs WARN when remaining > 1000 — PASS
- checkpoint.ts does NOT use PASSIVE — PASS
- tsc: 0 errors — PASS
- DDD: infrastructure layer, no violations — PASS

verdict: CHANGES_REQUESTED(src/__tests__/1447-checkpoint-restart-mode.test.ts:29 — mock.module schema.js leaks into full suite; add afterAll mock.restore() to prevent 140 downstream DB test failures)

### Fix — 2026-04-18
- **Issue**: 1447-01 — mock.module schema.js/logger.js leak into full suite; 140 downstream DB tests fail
- **Root cause**: Bun v1.3 mock.module is process-wide and does not auto-reset between files even with afterAll. mock.restore() only prevents future mock lookups but cached module references in co-worker files are already bound. The only reliable fix is to avoid mock.module entirely by using dependency injection.
- **Fix**: (1) Added optional `CheckpointDeps` interface to `checkpoint.ts` with `getDb` + `log` fields defaulting to real implementations. (2) Rewrote test to pass fake deps directly to `runWalCheckpoint(deps)` — no mock.module, no process-wide side effect.
- **Files changed**: `src/infrastructure/db/checkpoint.ts` (optional deps param), `src/__tests__/1447-checkpoint-restart-mode.test.ts` (DI-based test, no mock.module)
- **Tests added**: None (reshaped existing 5 tests to use DI)
- **Verified**: `bun test` 5482 pass / 0 fail | `bun tsc --noEmit` 0 errors
