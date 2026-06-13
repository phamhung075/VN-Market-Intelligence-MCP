# Handoff — FIX-MCP-CRASH-LOOP-WRITEWAL

**Created:** 2026-06-14  
**Sprint:** FIX-MCP-CRASH-LOOP-WRITEWAL  
**Zone:** apps/mcp-server/

---

## Task Summary

RECURRING mcp-server crash-loop, root = SQLite WAL accumulation. Three restarts on 2026-06-13 at 08:07Z / 18:31Z / 20:24Z. Force-recreate is a symptom-patch (~2 h window). Design splits into 3 sequenced tasks.

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/`
  - Single zone; serialized — only one mcp-server task in flight.
- **Verified paths:**
  - `apps/mcp-server/src/infrastructure/db/schema.ts:106-113` — DB singleton open; PRAGMA block (wal_autocheckpoint=4000, busy_timeout=5000)
  - `apps/mcp-server/src/infrastructure/db/checkpoint.ts` — `runWalCheckpoint()`, `checkWalFileSize()`, `registerShutdownHook()`, `runIntegrityCheck()`
  - `apps/mcp-server/src/scheduler/startScheduler.ts:199-212` — 30-min WAL cron (FULL live / TRUNCATE off-hours)
  - `apps/mcp-server/src/scheduler/walCheckpointAlert.ts` — frame-count alert helper
  - `apps/mcp-server/src/composition-root.ts:28-32` — startup TRUNCATE replay
  - Existing tests: `1329a`, `1329b`, `1476`, `1464`, `1447`
- **Root cause:** `wal_autocheckpoint=4000` (16 MB threshold) + FULL-only checkpoint during live hours. Passive autocheckpoint is blocked by long-lived concurrent readers (40+ cron jobs hold read snapshots). WAL accumulates to 4000 frames then wedges; FULL mode does not reset WAL file size.
- **Reuse patterns:**
  - Extend `runWalCheckpoint()` / `checkWalFileSize()` via their existing injectable deps — do NOT duplicate.
  - Reuse `cron_job_runs` table for restart-sentinel (task A) — no migration.
  - Extend `walCheckpointAlert.ts` pattern for restart-cadence alert (task A).
- **Design decisions:**
  - B/C: Lower `wal_autocheckpoint` to 1000; add `runForcedTruncateCheckpoint()` = `BEGIN IMMEDIATE; COMMIT` then `PRAGMA wal_checkpoint(TRUNCATE)` every 30 min unconditionally.
  - A: Startup sentinel written to `cron_job_runs`; new 30-min cron queries count in 4 h window; alert on count >= 2.
  - D: Optional `escalateFn` injected into `checkWalFileSize()`; concrete closure in `startScheduler.ts` writes atomic orch-state escalation signal.
  - DDD: infrastructure (`checkpoint.ts`) + interface/scheduler. No domain layer changes. No new MCP tools.
- **Risk flags:**
  - `BEGIN IMMEDIATE` may stall writes up to 5 s (bounded by busy_timeout); acceptable.
  - Orch-state write (D) MUST use temp-rename atomic pattern — never direct write to target.
- **Scan clean:** true (no DDD violations, no new tables, no new domain primitives)
- **BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new primitives)

---

## Task Breakdown (for pm)

### Task BC-1 — ROOT FIX: WAL checkpoint policy

**Priority:** 1 (ships first, load-bearing)  
**Owner:** dev-mcp-server

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/schema.ts` — change `wal_autocheckpoint` PRAGMA from 4000 to 1000
- `apps/mcp-server/src/infrastructure/db/checkpoint.ts` — add `runForcedTruncateCheckpoint(deps?)` function: `BEGIN IMMEDIATE; COMMIT` then `PRAGMA wal_checkpoint(TRUNCATE)`; injectable deps; returns `{ walSize, checkpointed }`
- `apps/mcp-server/src/scheduler/startScheduler.ts` — replace FULL/TRUNCATE split in 30-min cron with unconditional call to `runForcedTruncateCheckpoint()`; keep backup call in off-hours block only

**Files to create:**
- `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` — tests: BEGIN IMMEDIATE before TRUNCATE; returns walSize/checkpointed; wal_autocheckpoint=1000 on fresh connection; 10k-write load test WAL frames < 1000 between truncate cycles

**Acceptance Criteria:**
- Unit: `:memory:` DB 10k writes — WAL frames < 1000 per cycle
- Unit: `wal_autocheckpoint` = 1000 on new connection
- Unit: `runForcedTruncateCheckpoint()` issues BEGIN IMMEDIATE then TRUNCATE in order
- Live: uptime > 4 h, WAL file < 5 MB, no restart
- tsc 0 errors

**Dependency:** none (head of sequence)

---

### Task A-1 — GUARDRAIL: Restart-cadence alert

**Priority:** 2 (after BC-1 deployed)  
**Owner:** dev-mcp-server

**Files to modify:**
- `apps/mcp-server/src/composition-root.ts` — write startup sentinel row to `cron_job_runs` (job_name=`mcpServerStartup`, status=`success`) after `initDatabase()`
- `apps/mcp-server/src/scheduler/cronConfig.ts` — add `restartCadenceAlert: Bun.env.CRON_RESTART_CADENCE_ALERT ?? '15,45 * * * *'`
- `apps/mcp-server/src/scheduler/startScheduler.ts` — register `runRestartCadenceAlertJob` under `CRONS.restartCadenceAlert`

**Files to create:**
- `apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts` — `runRestartCadenceAlertJob(db?, sendFn?)`; queries `cron_job_runs` WHERE `job_name='mcpServerStartup'` AND `started_at >= NOW - 4h`; sends WORK alert when count >= 2; injectable deps
- `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts` — tests: no alert count=1; alert count=2; alert count=3; silent outside 4h window

**Acceptance Criteria:**
- Unit: alert fires when 2+ sentinel rows in last 4 h
- Unit: alert silent when 1 row
- Live: no false alert after single force-recreate
- tsc 0 errors

**Dependency:** BC-1 must be merged and deployed first

---

### Task D-1 — GUARDRAIL: WAL escalation gate

**Priority:** 3 (after BC-1 deployed)  
**Owner:** dev-mcp-server

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/checkpoint.ts` — add optional `escalateFn?: (walBytes: number) => Promise<void>` to `checkWalFileSize()` signature; call after Telegram alert when bytes > 10 MB
- `apps/mcp-server/src/scheduler/startScheduler.ts` — pass concrete `escalateFn` closure to `checkWalFileSize()` in WAL cron; closure reads orch-state.json, appends escalation signal to `.signal_queue`, writes atomically via temp-rename

**Files to create:**
- `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` — tests: escalateFn not called when < 10 MB; called when > 10 MB; receives byte count; error is non-fatal (no throw)

**Acceptance Criteria:**
- Unit: escalateFn called once when WAL > 10 MB
- Unit: escalateFn not called when WAL <= 10 MB
- Unit: escalateFn rejection does not propagate
- Orch-state write uses temp-rename (no direct overwrite)
- tsc 0 errors

**Dependency:** BC-1 must be merged and deployed first; A-1 can run in parallel with D-1

---

## Live-Verify Bar (Saturday/Sunday-safe)

```bash
# After ops rebuild:
docker exec vn-market-intelligence-mcp-mcp-server-1 ls -lh /data/market.db-wal
# Expected: < 5 MB after each 30-min WAL cron fires

docker logs vn-market-intelligence-mcp-mcp-server-1 --since 4h | grep "WAL checkpoint complete"
# Expected: TRUNCATE entries every 30 min

# 4h uptime check:
docker ps --filter name=mcp-server --format "{{.Status}}"
# Expected: Up X hours (healthy)
```

---

## Rebuild (non-negotiable)

```bash
docker compose build --no-cache mcp-server \
  && docker compose up -d --no-deps --force-recreate mcp-server
```

NEVER `docker compose down`.

---

## Full brief

`docs/architecture-briefs/2026-06-14-fix-mcp-crash-loop-writewal.md`
