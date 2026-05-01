# Task Report: 1395a — alertBatchGrouper (group push-prices alerts by signal_type/severity)
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (1395): 11 passed / 0 failed (100% coverage on alertBatchGrouper.ts)
- Full suite: 7926 passed / 15 failed / 21 skip
- Pre-existing failures on main baseline: 15 (identical — no regression)
- New tests added: +11 (7915 → 7926)
- TypeScript: 4 errors (all pre-existing on main — 1383 x2, 1397c x2); 0 new errors

## DDD Compliance: PASS
- alertBatchGrouper.ts placed in `domain/services/` — correct layer
- Only import: `Alert` from `alertGenerator.ts` (domain → domain)
- Zero imports from `infrastructure/` or `application/`
- Pure function — no I/O, no DB, no side effects

## Security: PASS
- No hardcoded credentials or API keys
- SQL in server.ts send loop uses parameterized query: `UPDATE alerts SET notified_telegram = 1 WHERE id = ?`
- No `process.env` usage
- No `any` types in production code

## Issues Found

### Blocking (found and fixed by QA before merge)

1. `src/__tests__/317-telegram-routing-bugs.test.ts` line 111
   - Test anchor `src.indexOf("NGHIÊM TRỌNG")` returned -1 — severity labels
     moved from server.ts to alertBatchGrouper.ts (domain service) by this task
   - Fix: anchor updated to `src.indexOf("alertBatchGrouper.js")` — unique to the
     batch send block, all downstream assertions (`sendTelegramWork`, `"push-prices"`,
     `"system_alert"`) remain valid in the 1000-char window
   - Status: fixed, verified (7 pass / 0 fail on file)

2. `src/__tests__/1395-alert-batch-grouper.test.ts` lines 50–53, 87–89, 101
   - TS2532 "Object is possibly 'undefined'" on `groups[0]` direct index access
     (T1, T4, T6)
   - Fix: extracted `const g0 = groups[0] as AlertBatchGroup` after the length
     assertion; imported `AlertBatchGroup` type
   - Status: fixed, 0 new TS errors

### Non-Blocking
None.

## Merge Status
Merged to main via `merge(1395a): alertBatchGrouper — group push-prices alerts by (signal_type, severity)`
Branch `task/1395a-alert-batch-grouper` deleted.
docs/TASKS.md updated — Sprint 1395 / 1395a: done.

## QA Re-verification (2026-04-29)

Re-run requested after developer wired alertBatchGrouper into pushPricesHandler (feat commit 34598b48).

- bun test 1395: 11 pass / 0 fail (same as prior run)
- Full suite: 8008 pass / 26 fail (26 pre-existing, 0 new — baseline regression confirmed)
- TSC: 1 new error found and fixed by QA — import path `../../domain/services/alertBatchGrouper.js` corrected to `../../../domain/services/alertBatchGrouper.js` (handler is 3 levels deep from src/, not 2)
- Remaining 7 TSC errors: all pre-existing (1383 x2, 1397c x2, hotfix-bctc-integrity x3)
- Spot-check passed: import present, per-alert loop replaced by batch-group loop, stop-loss/take-profit section untouched
- root TASKS.md updated — 1395a moved to Done
