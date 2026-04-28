# Task Report: 1393 — volume_spike dedup fix (push-prices re-send guard)
date: 2026-04-28
outcome: APPROVED

## Summary

Push-prices handler in `server.ts` re-sent every generated alert to Telegram
on every VPS push (~65 s cadence) regardless of `notified_telegram` state.
Fix: new `shouldSkipAlreadyNotifiedAlert()` in `alertStore.ts` returns `true`
when the alert row already has `notified_telegram=1`, causing the push-prices
loop to `continue` without re-sending.

## Test Results

- Task 1393 tests: **5 pass / 0 fail**
- Full suite: **7913 pass / 7 fail**
- Baseline: 7907 — net +6 tests (5 task tests + 1 from concurrent merges)
- TypeScript: 2 pre-existing errors in `1383-macro-alert-dispatch.test.ts`
  (confirmed on main before merge — not introduced by this task)

## DDD Compliance: PASS

- `shouldSkipAlreadyNotifiedAlert` lives in `infrastructure/db/alertStore.ts` — correct layer
- No domain/ imports from infrastructure
- `server.ts` (interface layer) imports from infrastructure — permitted

## Security: PASS

- SQL: `SELECT notified_telegram FROM alerts WHERE id = ? LIMIT 1` — parameterized
- No `process.env` usage — uses `Bun.env` convention via existing `getDb()`
- No hardcoded credentials or secrets

## QA Checklist

- [x] `shouldSkipAlreadyNotifiedAlert` returns `false` for fresh alert (not in DB)
- [x] Returns `false` when row exists with `notified_telegram=0`
- [x] Returns `true` when row exists with `notified_telegram=1`
- [x] Returns `true` on second push with same deterministic 4h-bucket ID
- [x] Does not cross-contaminate across different tickers
- [x] Intelligence cycle step E path unaffected (uses `readUnnotifiedAlerts`)

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/db/alertStore.ts` | +28 lines — `shouldSkipAlreadyNotifiedAlert()` |
| `apps/mcp-server/src/interface/mcp/server.ts` | +5 lines — import guard + skip check |
| `apps/mcp-server/src/__tests__/1393-volume-spike-dedup.test.ts` | +102 lines — 5 unit tests |

## Merge Status

Merged to main via `merge(1393)` commit.
Branch `task/1393-volume-spike-dedup-fix` deleted.
TASKS.md: DONE 2026-04-28.
