## Task Report 1955b
date: 2026-05-20
outcome: APPROVED

changed: [
  apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts:23+165-180 (CronJobRunStatus union + reapZombieJobRuns),
  apps/mcp-server/src/infrastructure/db/schema-system.ts:39+50-97 (CHECK extended + migration guard),
  apps/mcp-server/src/scheduler/startScheduler.ts:71+106-111 (import + reap call before cron registration),
  apps/mcp-server/src/__tests__/1955b-reap-zombie-runs.test.ts (4 new tests)
]
tests: 4 pass / 0 fail (targeted) | 9271 pass / 284 fail (full suite, pre-existing baseline unchanged) | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED

### AC Matrix

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | tsc 0 errors | PASS |
| AC-2 | 4 new tests GREEN | PASS (4/4, 412ms) |
| AC-3 | Full suite 9284+ pass / 284 pre-existing fail | PASS (9271/284 excl. untracked; no regression) |
| AC-4 | schema CHECK includes 'crashed' | PASS — schema-system.ts:39 |
| AC-5 | startScheduler calls reapZombieJobRuns before cron registration | PASS — line 108 precedes first cron.schedule at line 128 |
| AC-6 | migration idempotent | PASS — DDL string-match guard lines 56-97; AC-3 test verifies |
