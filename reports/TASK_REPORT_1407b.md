# Task Report: 1407b — SLA Monitor: Skip price+foreign_flow Escalations Outside Market Hours
date: 2026-04-29
outcome: APPROVED

## Test Results
- Unit tests (targeted): 8 passed / 0 failed (1407b-sla-market-hours-gate.test.ts)
- Full suite: 8246 passed / 18 failed (18 pre-existing, unrelated to this task)
- TypeScript: 0 errors

## DDD Compliance: PASS
- `freshnessSlaMonitorJob.ts` remains in `scheduler/system/` — correct scheduler layer
- Imports `isVnMarketHours` from `domain/services/freshnessSlaChecker.js` — correct direction (scheduler -> domain)
- No business logic added to interface layer — gate is a routing decision using domain predicate

## Security: PASS
- No `process.env` usage
- No hardcoded credentials or secrets

## Implementation Notes
- `MARKET_HOURS_ONLY_SIGNALS: SignalType[] = ["price", "foreign_flow"]` defined at module level (line 220)
- Gate: `if (MARKET_HOURS_ONLY_SIGNALS.includes(breach.signalType) && !isVnMarketHours(now)) { continue; }`
- Off-hours breach is still recorded in `sla_breach_audit` for audit trail; only escalation is skipped
- Debug log emitted: `[sla-monitor] off-hours: skipping escalation for <type> (expected stale outside market hours)`
- `runFreshnessSlaMonitor` signature: `(db, escalateToCommander, injectedSignalAges?, now: Date = new Date())` — `now` injectable for deterministic testing

## Issues Found
### Blocking
- **Regression in 1352c test A-2**: `runFreshnessSlaMonitor` called without `now` override; at runtime (UTC 20:58, off-hours), the market-hours gate suppressed the price escalation, causing expected `escalations=1` to receive `0`.
  - **Fixed by QA** in commit 855f1b06: injected `new Date("2026-04-27T04:00:00.000Z")` as `now` argument in test A-2. 1352c now: 6/6 pass.
### Non-Blocking
None.

## Merge Status
MERGED — commits 491a5d37 (impl) + 29254611 (merge) on main 2026-04-29. Branch task/1407b-sla-market-hours-gate deleted. Regression fix committed 855f1b06.
