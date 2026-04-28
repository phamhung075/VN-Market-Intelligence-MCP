# Task Report: 1380 — change_pct pre-open phantom alert guard
date: 2026-04-28
outcome: APPROVED

## Summary

Fixed phantom `change_pct` alerts firing at 00:10 UTC (outside VN trading hours) due to stale `ref_price` from prior closed session. Root cause confirmed: GAS alert id 316 (+1.16% phantom vs actual -3.07% intraday). Fix: `isVnTradingWindowUtc()` guard suppresses all alert/signal generation outside 02:00–08:59 UTC Mon–Fri.

## Test Results

- Unit tests (1380 specific): 7 passed / 0 failed
- Full suite (bun test): 7877 passed / 0 failed / 21 skipped
- Baseline before: 7866 — baseline after: 7877 (+11, no regression)
- TypeScript: 0 errors (bun tsc --noEmit clean)

## DDD Compliance: PASS

- `isVnTradingWindowUtc` added to `src/interface/mcp/server.ts` (interface layer — appropriate)
- Guard placed before dynamic `import()` of domain services (detectSignals, generateAlerts)
- No domain layer imports infrastructure
- No business logic leaked to interface beyond thin time-window predicate

## Security: PASS

- No hardcoded credentials or API keys in changed files
- No `process.env` usage — Bun.env only
- No SQL queries introduced
- No HTTP calls introduced

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/interface/mcp/server.ts` | Export `isVnTradingWindowUtc()` (lines 55–62) + guard at line 684 |
| `apps/mcp-server/src/__tests__/1380-change-pct-pre-open-guard.test.ts` | 7 unit tests covering Mon–Fri window boundaries + weekend suppression |

## Guard Verification

- `isVnTradingWindowUtc` exported at line 57 — confirmed
- Guard `if (!isVnTradingWindowUtc()) return;` at line 684 — confirmed before `detectSignals` import at line 686
- Pre-open VPS pushes still write to `market_prices` and `market_prices_history` — only alert/signal generation is suppressed

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Committed directly to main (commit 525b2ca2). No branch to delete. TASKS.md updated: TASK-1380 status set to `done`.
