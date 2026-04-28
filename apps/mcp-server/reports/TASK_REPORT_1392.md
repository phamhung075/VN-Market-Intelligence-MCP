# Task Report: 1392 — foreignFlow CB stuck OPEN regression fix
date: 2026-04-28
outcome: APPROVED

## Summary

Removed `breakers.foreignFlow.execute()` wrapper from the GET fetcher path in
`foreignFlowFetcher.ts`. The VPS is push-only — the `/foreign-flow` GET endpoint
does not exist. Every half-open probe hit 404, called `_onFailure()` inside
`execute()`, and re-opened the circuit immediately, preventing it from ever
closing. The CB now guards DB writes in the push handler only (POST
`/api/push-foreign-flow`). The GET fetcher attempts primary directly and falls
through to cache → SSE → none on failure without touching CB state.

## Test Results

- New regression tests (1392): 4 / 4 pass
- Updated fallback tests (1288): 8 / 8 pass (including updated test 4: GET path always attempts primary)
- CB auto-reset tests (1388): 5 / 5 pass (halfOpenMaxAttempts:1 still governs push path)
- Full suite: 7904 pass / 7 fail / 7932 total
- Pre-existing failures: 7 (unchanged — unrelated to this task)
- TypeScript: 2 pre-existing errors in 1383-macro-alert-dispatch.test.ts only (unchanged)

## DDD Compliance: PASS

- No domain→infrastructure imports found in `src/domain/`
- Changed file (`foreignFlowFetcher.ts`) is correctly in `src/infrastructure/fetchers/`
- Domain model import (`shared-types.ts`) is a domain→domain reference — valid

## Security: PASS

- No `process.env` usage — `Bun.env` used throughout
- No hardcoded credentials or secrets
- No SQL in changed files (fetcher-only change)
- No new `any` types introduced (existing `any` casts in SSE helpers are pre-existing)

## Regression Verification

- CB in half-open: 404 probe does NOT re-open circuit (failures counter unchanged)
- CB in half-open: ECONNREFUSED does NOT re-open circuit
- CB closed: 10 consecutive GET failures do NOT open circuit (stays closed, failures=0)
- result.source is "cache" or "none" when GET path fails — CB state untouched

## Issues Found

### Blocking
None.

### Non-Blocking
- `lastLoggedOpenState` module-level variable remains in code but is now only
  used for Strategy 4 log-spam guard (not CB state guard). Harmless, but could
  be cleaned up in a future janitor pass.

## Merge Status

APPROVED — merged to main (commit b691b6cb already on main branch, cherry-picked
from task/1390-volume-decimal-fix).
