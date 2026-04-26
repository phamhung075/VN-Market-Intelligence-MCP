# Task Report: 1282c/1285 — Missing Production DB Tables (Schema Invariant Regression Tests)
date: 2026-04-25
outcome: APPROVED

## Changed Files
- `apps/mcp-server/src/__tests__/FIX-1282-missing-tables.test.ts` (new, 128 lines, 8 tests)
- `apps/mcp-server/src/__tests__/FIX-1275-foreign-flow-unique.test.ts` (new, 232 lines, 9 tests — co-shipped on branch)

No production `src/` files modified. Test-only change.

## Test Results
- Unit (FIX-1282 file only): 8 pass / 0 fail
- Both new files combined: 17 pass / 0 fail
- Full suite (branch): 6934 pass / 0 fail — identical to main baseline
- TypeScript: 0 errors (confirmed by pre-push hook + `bun tsc --noEmit`)

Note: `bun test` exits with a Bun 1.3.11 C++ runtime panic after test completion. Pre-existing on main (identical fingerprint). All 6955 tests complete and report results before the crash — does not affect test validity.

## Test Coverage (FIX-1282, 8 tests)
- TC-1: `rag_analyses` created by `initDatabase()` — PASS
- TC-2: `evidence_scores` created by `initDatabase()` — PASS
- TC-3: `vnstock_trading_stats` created by `initDatabase()` — PASS
- TC-4: All three tables queryable via SELECT COUNT(*) — PASS
- TC-5: `franceSummaryJob` query path (SELECT from `rag_analyses`) does not throw — PASS
- TC-6: `assembleBriefing` query path (SELECT from `vnstock_trading_stats`) does not throw — PASS
- TC-7: `assembleBriefing` query path (SELECT from `evidence_scores`) does not throw — PASS
- TC-8: `initDatabase()` is idempotent — second call safe, no duplicate tables — PASS

## DDD Compliance: PASS
Test-only change. Smart-skip rule applied (no domain/infrastructure imports to scan).

## Security: PASS
Test-only change. Smart-skip rule applied. No SQL interpolation, no credentials, no `process.env`.

## Code Quality Notes
- Tests use `:memory:` DB via `initDatabase(dbArg)` overload — fully isolated, no file-system side effects
- `beforeEach`/`afterEach` correctly call `closeDb()` to reset singleton state
- TC-5/6/7 mirror actual production query shapes from `assembleBriefing.ts` and `assembleEveningSummary.ts` — high-fidelity regression coverage for the root cause path

## Issues Found
### Blocking
None.

### Non-Blocking
- Bun 1.3.11 post-run C++ panic (pre-existing, tracked separately, does not affect test results)

## Merge Status
Merged commit: `a729d67d` — `fix/missing-prod-tables` → `main`
Branch deleted: local + remote
