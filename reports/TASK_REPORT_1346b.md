# Task Report: 1346b — Fix push-foreign-flow UNIQUE Constraint

**Status:** APPROVED
**Branch:** task/1346b-foreign-flow-upsert (merged to main)
**Date:** 2026-04-27
**QA:** PASS

---

## Summary

Fixed recurring `UNIQUE constraint failed: vnstock_trading_stats.code` crash in the `push-foreign-flow`
endpoint that fired every ~60s during market hours. The fix was shipped in commit `2c3fb9b3` as part of
the FIX pipeline preceding this formal task branch.

---

## Root Cause

Two compounding issues:

1. **Legacy schema path (`UNIQUE(code)` only):** Production DBs created before the `date` column
   migration had `UNIQUE(code)` as the sole constraint. When VPS sent duplicate stock codes in a
   single 60s batch, the second INSERT hit the constraint and threw.

2. **Circuit breaker not wired:** The DB upsert was wrapped in a bare `try/catch` that swallowed
   errors without calling `breakers.foreignFlow.execute()`, so the circuit breaker never accumulated
   failures and never tripped — meaning the error fired on every single scheduler cycle.

---

## Fix Applied

### `apps/mcp-server/src/interface/mcp/server.ts`

- DB upsert now called via `breakers.foreignFlow.execute(async () => upsertForeignFlow(validItems))`
  so failures increment the circuit breaker counter and eventually trip it.
- `ensureForeignFlowMigration()` guard runs once per process startup to ensure `UNIQUE(code, date)`
  index exists before the first write.

### `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` (prior fix)

- `upsertForeignFlow` uses `ON CONFLICT(code, date) DO UPDATE SET` on the primary path.
- Pre-deduplication by `(code, date)` key before the SQLite transaction prevents intra-batch
  UNIQUE violations when VPS sends duplicate ticker codes in the same payload.
- Legacy path (`UNIQUE(code)` only) uses `ON CONFLICT(code) DO UPDATE SET`.

### `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts` (prior fix)

- `reset_foreign_flow_circuit_breaker()` and `diagnose_foreign_flow_circuit_breaker()` MCP tools
  allow operators to recover from a stuck-OPEN circuit breaker after confirming the underlying fix.

---

## Tests

**File:** `apps/mcp-server/src/__tests__/FIX-foreign-flow-unique-constraint.test.ts`

| Test | Result |
|------|--------|
| TC-1: duplicate (code, date) does NOT throw UNIQUE error | PASS |
| TC-2: second push updates the row, not inserts | PASS |
| TC-1b: 100 consecutive same-key pushes — 1 row, last value wins | PASS |
| TC-3: execute() success increments CB success counter | PASS |
| TC-4: execute() failure increments CB failure counter | PASS |
| TC-4b: OPEN CB throws CircuitOpenError immediately | PASS |
| TC-5: reset_foreign_flow_circuit_breaker() closes OPEN CB | PASS |
| TC-5b: diagnose after reset confirms closed state | PASS |
| TC-6: after CB reset, execute() accepts new calls | PASS |

**Baseline:** 7355 pass / 73 pre-existing failures (unchanged) / 0 regression
**TSC:** 0 errors

---

## Acceptance Criteria

- [x] `push-foreign-flow` job runs without UNIQUE constraint errors
- [x] Can handle concurrent foreign flow updates for same `.code`
- [x] Circuit breaker properly counts and trips on sustained DB failures
- [x] `reset_foreign_flow_circuit_breaker()` tool available for operator recovery
- [x] All 7355 baseline tests pass (73 pre-existing unrelated failures)

---

## QA Review — 2026-04-27

### Test Results
- Targeted suite (9 tests): 9/9 pass — 0 fail
- Full suite: 7355 pass / 73 fail (pre-existing baseline, 0 regression)
- TypeScript: 0 errors (bun tsc --noEmit)

### DDD Compliance: PASS
- domain/models/shared-types.ts — no infrastructure imports
- foreignFlowTools.ts is interface layer — infrastructure imports permitted
- vnstockStore.ts is infrastructure layer — domain imports permitted

### Security: PASS
- No process.env usage in changed files
- All SQL uses parameterized queries (bun:sqlite prepared statements)
- No hardcoded secrets or credentials

### Issues Found
#### Blocking
None.

#### Non-Blocking
- Pre-existing `any` generics in vnstockStore.ts prepare<any,...> calls (lines 311, 343, 376, 607, 654, 707) — not introduced by this task, tracked separately.

### Merge Status
APPROVED — merged to main. Telegram reports 1310 and 1312 closed.
