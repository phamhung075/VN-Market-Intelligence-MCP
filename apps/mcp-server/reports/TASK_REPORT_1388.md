# Task Report: 1388 — foreignFlow CB Auto-Reset (halfOpenMaxAttempts:1)
date: 2026-04-28
outcome: APPROVED

## Summary

Fixed the foreignFlow circuit breaker's half-open probe count from 2 (default) to 1, so the
circuit closes on the first successful probe after the underlying error is resolved. This
eliminates the "stuck OPEN" scenario that required manual `reset_foreign_flow_circuit_breaker`
MCP tool calls after the Sprint 1346b DB fix.

## Test Results

### Targeted (pre-merge verification)
- `1388-cb-auto-reset.test.ts`: 5 pass / 0 fail
- `136-circuit-breaker.test.ts`: 28 pass / 0 fail
- Total targeted: 33 pass / 0 fail

### Full Suite
- Tests: 7920 (+5 from baseline 7915)
- Pass: 7893 (+5 from baseline 7888)
- Fail: 6 (pre-existing, unchanged — minor run-to-run variance of ±1 due to timing flakiness in unrelated tests)
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS

- `circuitBreakerRegistry.ts` is correctly in `src/infrastructure/`
- `circuitBreaker.ts` (OPEN→HALF_OPEN→CLOSED logic) lives in `src/infrastructure/`
- No domain layer imports from infrastructure — golden rule maintained
- New test file `1388-cb-auto-reset.test.ts` follows `src/__tests__/` convention

## Security: PASS

- No hardcoded credentials or API keys
- No `process.env` usage (uses `Bun.env`)
- No SQL changes in this task
- Config change is a pure integer parameter (`halfOpenMaxAttempts: 1`)

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/circuitBreakerRegistry.ts` | Added `halfOpenMaxAttempts: 1` to `breakers.foreignFlow` config |
| `apps/mcp-server/src/__tests__/1388-cb-auto-reset.test.ts` | 5 new unit tests (new file) |

## Merge Status

Merged to main at commit `abc4b5ea`. Branch cleanup: commit was made directly to main (no task branch created). No worktree to remove.
