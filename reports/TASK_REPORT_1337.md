# Task Report: 1337 — infra-db-cb-fixes
date: 2026-04-26
outcome: APPROVED

## Changes Reviewed

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/db/schema-macro.ts` | Idempotent `ALTER TABLE tracked_indicators ADD COLUMN hour_bucket TEXT` migration guard (try/catch before CREATE TABLE IF NOT EXISTS) |
| `apps/mcp-server/src/infrastructure/circuitBreakerRegistry.ts` | `foreignFlow` breaker `resetTimeoutMs` raised 30 000 ms → 300 000 ms (5 min) to stop half-open probe thrash caused by repeated 422 failures |
| `apps/mcp-server/src/infrastructure/fetchers/polymarket.ts` | CLOB fetch now uses `resolvedClobFetch` (raw, no CB); Gamma path keeps `breakers.polymarket.execute()`. Prevents geo-blocked 403s from tripping the polymarket breaker. |
| `apps/mcp-server/src/__tests__/1337-infra-db-cb-fixes.test.ts` | 7 new tests covering all three issues |

## Test Results
- Unit tests (1337 file): 7 pass / 0 fail
- Full suite: 6527 pass / 213 fail (213 pre-existing; no regressions introduced)
- TypeScript: 0 errors

## DDD Compliance: PASS
No domain imports in infrastructure files. No upward layer violations. All modified files are in `infrastructure/` layer — correct placement.

## Security: PASS
- No `process.env` usage (all `Bun.env`)
- No hardcoded credentials or API keys
- All SQL uses parameterized bindings (no changes to query logic)

## Code Quality Notes
- Migration guard pattern (try/catch on ALTER TABLE) is consistent with existing patterns in `schema-macro.ts`
- `resolvedClobFetch` resolution logic is well-commented and handles three cases: explicit injection, production default, and legacy single-fetchFn test compatibility
- `foreignFlow` CB comment updated with task reference (1337) explaining the reason for the change

## Issues Found
### Blocking
(none)

### Non-Blocking
(none)

## Merge Status
- Merged to main: commit `798d1b7d`
- Branch `task/infra-db-cb-fixes` deleted (local)
