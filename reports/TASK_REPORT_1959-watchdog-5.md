## Task Report 1959-watchdog-5
date: 2026-05-20
outcome: APPROVED
commit: edafce4f
changed: [apps/mcp-server/src/scheduler/diskUsageAlertJob.ts:237L, apps/mcp-server/src/__tests__/1959-watchdog-5-disk-usage-alert.test.ts:228L, apps/mcp-server/src/scheduler/cronConfig.ts (+5L), apps/mcp-server/src/scheduler/startScheduler.ts (+15L), docs/data/project-stats.json (cronJobCount 76→77), docs/TASKS.md]
tests: 9 pass / 0 fail [207ms] | tsc: 0 errors | ddd: PASS | security: PASS

## Test Results
- Task suite (1959-watchdog-5): 9/9 PASS [207ms]
- Recent-sprint regression (1959+1958+1955a): 34/34 PASS [417ms]
- TypeScript: 0 errors (bun tsc --noEmit)

## AC Matrix
| AC | Check | Result |
|----|-------|--------|
| AC-4-1 | diskUsageAlertJob registered in cronConfig.ts + wired in startScheduler.ts via jobRunRepo.wrapRun | PASS |
| AC-4-2 | BUG Telegram fires when usage > threshold (TC-2a, TC-2b, smoke threshold=1/usage=2) | PASS |
| AC-4-3 | Silent when usage <= threshold (TC-1a/1b, TC-5 12-tick = 0 Telegrams) | PASS |
| AC-4-4 | Zero false positives: TC-5 12 consecutive under-threshold ticks = 0 BUG msgs | PASS |

## DDD Compliance: PASS
- `diskUsageAlertJob.ts` lives in `src/scheduler/` (infrastructure layer) — correct DDD placement.
- Imports from `src/infrastructure/notifiers/telegram.js` and `src/infrastructure/logger.js` — scheduler importing infrastructure is the correct DDD pattern.
- No domain-layer files import infrastructure (grep confirmed).

## Security: PASS
- `Bun.env["DISK_ALERT_THRESHOLD_GB"]` — Bun.env used, not process.env.
- No hardcoded secrets, passwords, tokens.
- No SQL queries in this module (shell-out only via Bun.spawnSync).
- Path `/app/data/lancedb` is hardcoded constant but non-traversable (du argument, not user input).

## Spot-check Notes
- Cron `'47 * * * *'` — off-mark per handoff spec (task spec said `'0 * * * *'` but dev chose `'47 * * * *'` to avoid pile-up at minute=0/7/17 cluster; this is an intentional deviation, consistent with codebase policy, and noted in cronConfig.ts JSDoc comment. ACCEPTED.
- Alert-fires-immediately post-deploy at default 20GB threshold (lancedb ~29GB): EXPECTED, documented in handoff and signal. NOT a bug.
- Injectable deps pattern (getDiskUsageGb, notifyBug, now, state) provides clean test isolation without module-level mocking. Correct approach.
- TC-6 boundary math (ticks 7-11 within cooldown at base+6h to base+10h): loop `i=6..10` (5 ticks), alert fired at base+5h → elapsed at i=10 is 5h < 6h cooldown. Logic verified correct.
- `msgId === 0` check for delivery failure vs `msgId === -1` for dedup suppression: nuance is documented in code comment, cooldown advances on both paths to avoid retry storm. Sound design.

## Issues Found
### Blocking
(none)

### Non-Blocking
- NB-1: `runDiskUsageAlertJob` returns `"notify-failed"` on Telegram failure but does NOT advance `lastAlertAt` — correct behavior per code comment ("next run will retry"). This means if Telegram is down, the job will retry every hour. For a disk watchdog this is the right design (no silent suppression during Telegram outage). Acceptable.

## Merge Status
Commit edafce4f already on main (no task branch per project policy). No merge action required.
Signal: docs/signals/qa-1959-watchdog-5-approved.json emitted.
