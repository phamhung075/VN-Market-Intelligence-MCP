# Task Report: 1413b — foreignFlow Circuit Breaker Self-Heal Fix
date: 2026-04-29
outcome: APPROVED

## Summary

Root cause: the early-return guard in `pushForeignFlowHandler.ts` checked `stats.state === "open"` **before** calling `execute()`. This bypassed the CB's internal `_checkTimeout()` / HALF_OPEN promotion mechanism, keeping the CB permanently OPEN even after the reset window elapsed. The VPS stopped retrying after repeated 503s and the circuit could never self-heal.

Fix (Option B): early-return guard removed. `execute()` now manages the state machine. `CircuitOpenError` is caught separately and returns 503 with a `Retry-After` header so the VPS knows exactly when to retry.

## Test Results

- **1413b suite**: 15 pass / 0 fail (39 expect() calls) — 162ms
- **1406b suite** (regression guard): 7 pass / 0 fail — 263ms
- **Full suite**: 8025 pass / 25 fail — 86s
  - Pass count: 8025 (threshold: ≥7913) — PASS
  - Failures: 25 (pre-existing, identical baseline — no new failures)
- **TypeScript**: 4 errors in unrelated pre-existing files (1383-macro-alert-dispatch.test.ts, 1397c-vn-index-refresh.test.ts) — both committed before this task, confirmed via `git log`. Zero new TS errors.

## Spot-Check: pushForeignFlowHandler.ts

- (a) No early-return `state === "open"` guard: CONFIRMED — line 170 comment explicitly documents removal.
- (b) `CircuitOpenError` caught separately: CONFIRMED — lines 194–218.
- (c) 503 response includes `Retry-After` header: CONFIRMED — `res.writeHead(503, { "Content-Type": "application/json", "Retry-After": String(retryAfterSec) })`.

## DDD Compliance: PASS

- Handler is in `src/interface/mcp/routes/` (interface layer).
- Imports: `infrastructure/` (db, logger, circuitBreaker), `domain/` (models, services/validator). No domain-from-infrastructure imports.

## Security: PASS

- Auth check via `Bun.env.VPS_PUSH_API_KEY` (no process.env).
- No hardcoded credentials.
- DB writes via existing parameterized `upsertForeignFlow()`.

## Issues Found

### Blocking
None.

### Non-Blocking
Pre-existing TSC errors in 1383 and 1397c test files (not introduced by this task).

## Merge Status

MERGED — commit `32464820 fix(1413b)` on main. No task branch to clean up (committed directly to main by developer).
