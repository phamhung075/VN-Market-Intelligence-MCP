# Task Report 1458 — compact

changed:
- src/infrastructure/db/checkpoint.ts:8,27-34,44 — RESTART → TRUNCATE, JSDoc updated
- src/scheduler/jobs.ts:320-324 — recordJobRun wrapper around runWalCheckpoint()
- src/__tests__/1447-checkpoint-restart-mode.test.ts:1-9,50,58-64 — describe title + TRUNCATE assertions

bun test: 5542 pass / 0 fail
tsc: 0 errors
ddd: PASS

verification:
- checkpoint.ts:44 → `PRAGMA wal_checkpoint(TRUNCATE)` confirmed, no RESTART/PASSIVE
- jobs.ts:322-325 → `recordJobRun(getDb(), 'walCheckpointJob', ...)` wraps `runWalCheckpoint()`
- test:58-64 → asserts TRUNCATE present, RESTART absent, PASSIVE absent
- post-merge regression: 5542 pass / 0 fail
- server restart: health OK (toolCount=98, uptime≈3s)

merge_commit: d4e8991

verdict: APPROVED
