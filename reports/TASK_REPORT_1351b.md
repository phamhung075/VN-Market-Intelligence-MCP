# Task Report: 1351b — vpsProxyWatchdogJob gap-fill tests
date: 2026-04-27
outcome: APPROVED

## Test Results
- Unit tests (targeted): 8 passed / 0 failed
- Full suite: 7598 passed / 0 new fail (baseline was 7568; +30 from 1351b + 1351c)
- TypeScript: 0 new errors (2 pre-existing errors in 1348a unrelated to this task)

## DDD Compliance: PASS
New file is in `src/__tests__/` only. No domain→infrastructure imports. No production source modified.

## Security: PASS
- No hardcoded credentials or secrets
- No `process.env` — `Bun.env["DB_PATH"] = ":memory:"` only
- No SQL; all reader functions injected
- No HTTP calls

## Issues Found

### Blocking
None.

### Non-Blocking
- Task 1378 TC-6 ("empty FAKE_DIFF → skipped") fails intermittently in the full suite due to mock-bleed from an upstream test but passes clean in isolation. Pre-existing before 1351b; not caused by this task. Tracked separately.
- Two tsc errors in `src/__tests__/1348a-cascade-brokerage-competitive.test.ts` (AnalysisLevel / DomainType type mismatch). Pre-existing since commit `3766079d`, predates 1351b.

## Merge Status
Already on main at commit `e8b752cb`. No separate branch — developer committed directly to main.

## Coverage
8 new assertions covering previously untested paths in `vpsProxyWatchdogJob.ts`:
1. Reuters stale (>90 min) → alert-sent, message contains `vn-reuters-fetch`
2. Reuters fresh (<90 min) → ok, notify not called
3. Reuters null → treated as stale, message contains "no data since boot"
4. TE stale (>90 min) → alert-sent, message contains `vn-tradingeconomics-fetch`
5. Reuters + TE both stale → single alert lists both services
6. Restored path: stale→fresh transition returns "restored", then "ok"
7. notify throws → returns "notify-failed", does not crash
8. `_resetWatchdogStaleFlag` resets `lastWasStale` independently of `lastAlertAt`
