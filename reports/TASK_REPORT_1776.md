# Task Report: 1776 — vnstock ANSI Escape Sequence Handling + Circuit Breaker
date: 2026-04-29
outcome: APPROVED

## Test Results
- Unit tests (targeted): 13 passed / 0 failed (1776-vnstock-ansi-circuit-breaker.test.ts)
- Full suite: 8246 passed / 18 failed (18 pre-existing, unrelated to this task)
- TypeScript: 0 errors

## DDD Compliance: PASS
- `vnstockBridge.ts` remains in `infrastructure/fetchers/` — correct layer
- `syncVnstockData.ts` remains in `application/usecases/` — correct layer
- `stripAnsiAndDetectJunk` and circuit breaker helpers exported for testability
- No domain layer imports from infrastructure

## Security: PASS
- No `process.env` usage — Bun.env only
- No hardcoded credentials or API keys
- ANSI regex is correct and bounded

## Implementation Notes
- `stripAnsiAndDetectJunk(raw, label): JunkCheckResult` exported from vnstockBridge.ts (line 167)
  - Strips ESC sequences + Unicode box-drawing chars (U+2500-U+257F, U+2800-U+28FF)
  - Returns `{ junk: true }` for non-JSON first char (e.g. "Error: rate limited")
  - Returns `{ isNull: true }` for empty or "null" string
- Circuit breaker in syncVnstockData.ts: 5 exported functions (`makeCbState`, `isCircuitOpen`, `recordFailure`, `recordSuccess`, `shouldFireBulkAlert`)
- Opens after 3 consecutive null returns per (code, type) key
- Auto-resets after 2h (checked in `isCircuitOpen` via `openedAt` timestamp)
- Telegram WORK alert fires when >= 10 codes have open circuits; 60-min cooldown enforced

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
MERGED — commits 533e6d6a (impl) + 29254611 (merge) on main 2026-04-29. Branch task/1776-vnstock-ansi-circuit-breaker deleted.
