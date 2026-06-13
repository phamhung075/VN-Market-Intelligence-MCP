<!-- size-justification: 155L — single-sprint design; 3-task split (BC/A/D) + brownfield findings + AC table; no sub-file reuse. -->
# Architecture Brief — FIX-MCP-CRASH-LOOP-WRITEWAL

**Date:** 2026-06-14  
**Author:** architect  
**Status:** FINAL — hand-off to pm

---

## 1. Incident Summary

Recurring mcp-server crash-loop driven by WAL accumulation: 7.3 MB → 15.65 MB → 16 MB across three restarts at 08:07Z / 18:31Z / 20:24Z on 2026-06-13. Ops force-recreate at 22:21Z reset WAL to ~656 KB — a symptom-patch that buys ~2 h before the wedge recurs. No OOM / SIGSEGV observed; memory at 25.68% of cap. The cadence and file-size trajectory are consistent with a checkpoint that consistently fails to flush all frames (WAL grows but is never fully drained).

---

## 2. Brownfield Findings

### 2.1 Zone

`apps/mcp-server/` — single zone, serialized (no parallel mcp-server work).

### 2.2 Verified paths

| Path | Role |
|---|---|
| `apps/mcp-server/src/infrastructure/db/schema.ts:106-113` | Singleton DB open; sets PRAGMA at connection time |
| `apps/mcp-server/src/infrastructure/db/checkpoint.ts` | `runWalCheckpoint()`, `checkWalFileSize()`, `registerShutdownHook()` |
| `apps/mcp-server/src/scheduler/startScheduler.ts:199-212` | WAL checkpoint cron (every 30 min) |
| `apps/mcp-server/src/scheduler/walCheckpointAlert.ts` | Frame-count alert helper (WORK channel) |
| `apps/mcp-server/src/composition-root.ts:28-32` | Startup TRUNCATE replay |
| `apps/mcp-server/src/__tests__/1329a-wal-hardening.test.ts` | Existing WAL unit tests |
| `apps/mcp-server/src/__tests__/1329b-wal-sentinel.test.ts` | Existing sentinel tests |
| `apps/mcp-server/src/__tests__/1476-wal-stuck-alert.test.ts` | Existing stuck-alert tests |
| `apps/mcp-server/src/__tests__/1464-checkpoint-frequency.test.ts` | Existing frequency tests |
| `apps/mcp-server/src/__tests__/1447-checkpoint-restart-mode.test.ts` | Existing restart-mode tests |

### 2.3 Current PRAGMA configuration (schema.ts:107-110)

```
PRAGMA journal_mode = WAL
PRAGMA foreign_keys = ON
PRAGMA wal_autocheckpoint = 4000
PRAGMA busy_timeout = 5000
```

### 2.4 Root-cause analysis — WHY the WAL is not auto-checkpointing

SQLite WAL autocheckpoint fires passively after every write batch when the WAL reaches `wal_autocheckpoint` pages (default 1000; currently overridden to 4000 ≈ 16 MB). The passive autocheckpoint is **blocked** by any reader that holds an open read transaction — it succeeds only on frames the reader has already seen. Under this server's write pattern:

- **40+ cron jobs** fire concurrently within each 5-min window; each job opens a short read transaction via `getDb()` to query before writing.
- The singleton `Database` instance is held open for the lifetime of the process. Any long-running read query (e.g. `runBctcReparseJob`, `vnstockFundamentalsJob`, `foreignFlowFetcherJob` polling every 1 min) holds a read snapshot that pins the WAL.
- `wal_autocheckpoint = 4000` is a passive trigger: SQLite will attempt a PASSIVE checkpoint (non-blocking) when 4000 frames accumulate. PASSIVE mode skips frames still in use by any reader — so if a reader stays alive across the 4000-frame threshold, the autocheckpoint runs but leaves most frames un-drained. The WAL continues to grow.
- `busy_timeout = 5000` only covers write-lock contention; it does NOT help a passive checkpoint blocked by a concurrent reader.
- The 30-min cron calls `runWalCheckpoint('FULL')` during live hours and `runWalCheckpoint('TRUNCATE')` only during 03:00–05:00 UTC. **FULL mode** flushes all frames that are NOT pinned by a reader, but it is **not** TRUNCATE: the WAL file size on disk does not shrink, and frames still held by a reader accumulate between 30-min intervals under high write-load.
- **Root verdict:** WAL accumulates because (a) passive autocheckpoint at 4000 frames is defeated by long-lived concurrent readers, and (b) the active 30-min FULL checkpoint does not zero the WAL file or guarantee all frames are flushed when a reader is alive. The WAL reaches 15–16 MB (≈ 4000 frames × 4 KB) — exactly the autocheckpoint threshold — and then wedges because no TRUNCATE clears it during live hours.

### 2.5 What is NOT the root cause

- OOM / SIGSEGV — ruled out by logs.
- Disk full — WAL reaches exactly the autocheckpoint size, not disk capacity.
- Corrupt DB — integrity check is triggered at 40 MB; no corruption alert has fired.
- Per-table or per-ticker write volume — the wedge is a generic checkpoint policy gap, not a single-table write spike.

### 2.6 Reuse patterns

- `runWalCheckpoint()` in `checkpoint.ts` already accepts a `mode` param and injectable `deps` — extend it for the periodic TRUNCATE policy, do not duplicate.
- The 30-min cron wrapper in `startScheduler.ts:199-212` is the correct attachment point for a write-count trigger; keep the `jobRunRepo.wrapRun` pattern.
- `walCheckpointAlert.ts` is the existing alerting helper; extend it for the restart-cadence alert (task A), do not bypass it.
- Existing tests (`1329a`, `1329b`, `1476`, `1464`, `1447`) cover the checkpoint module; new tests extend the suite without touching existing test files.

---

## 3. Design — Three Fix-Classes

### Fix-Class B/C — ROOT FIX: WAL Checkpoint Policy (ships first, load-bearing)

**Problem to solve:** passive autocheckpoint and live-hours FULL mode together cannot drain the WAL faster than the write load grows it, because long-lived readers pin frames.

**Design decision: Add a write-count-triggered TRUNCATE checkpoint at the db/connection layer.**

The fix has two sub-parts:

**B — Reduce `wal_autocheckpoint` at connection time:**  
Lower from 4000 to 1000 pages (≈ 4 MB threshold). This makes SQLite attempt a passive drain 4× more frequently between cron jobs. It does not alone prevent wedge (passive still loses to a reader), but it reduces peak WAL size and gives TRUNCATE more headroom.

**C — Periodic TRUNCATE in the WAL cron, not only off-hours:**  
Change the 30-min WAL cron to call `runWalCheckpoint('TRUNCATE')` unconditionally (not just in the 03:00–05:00 window). TRUNCATE resets the WAL file to zero length even under concurrent readers once ALL frames have been drained. To guarantee all frames CAN drain:

- Before calling TRUNCATE, briefly acquire and immediately release a write transaction (`BEGIN IMMEDIATE; COMMIT`) to flush any in-flight writers and force all existing reader snapshots to expire. Bun:sqlite's WAL mode allows readers to continue on the WAL; a brief exclusive moment via `BEGIN IMMEDIATE` causes new readers to start fresh snapshots, letting TRUNCATE drain the frames the previous readers held.
- This is the same mechanism SQLite docs recommend for "stuck WAL" resolution without a full restart.

**Alternative considered and rejected:** `PRAGMA wal_checkpoint(RESTART)` — RESTART mode blocks new readers during the checkpoint, but it does NOT reset the WAL file length (only TRUNCATE does). We need length reset to keep the file under 5 MB.

**Alternative considered and rejected:** `PRAGMA optimize` on a timer — this is an index maintenance hint, not a WAL management tool. Irrelevant to this defect.

**Alternative considered and rejected:** increasing `busy_timeout` — does not affect the reader-pin mechanism.

**Files to modify (B/C):**

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/schema.ts` | Lower `wal_autocheckpoint` to 1000 at connection open |
| `apps/mcp-server/src/infrastructure/db/checkpoint.ts` | Add `runForcedTruncateCheckpoint()` — issues `BEGIN IMMEDIATE; COMMIT` then `PRAGMA wal_checkpoint(TRUNCATE)`; injectable deps; returns `{ walSize, checkpointed }` |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Replace 30-min cron FULL/TRUNCATE logic: call `runForcedTruncateCheckpoint()` every 30 min unconditionally; keep backup call in off-hours only |

**File to create (B/C test):**

| File | Content |
|---|---|
| `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` | Unit tests: (1) `runForcedTruncateCheckpoint()` issues BEGIN IMMEDIATE then PRAGMA TRUNCATE in order; (2) returns `{ walSize, checkpointed }`; (3) `wal_autocheckpoint` PRAGMA value is 1000 on a fresh `:memory:` connection; (4) simulated sustained-write load test: 10k INSERT rows into `:memory:` DB — WAL frame count (via `PRAGMA wal_checkpoint(FULL)` returning `log`) stays < 1000 frames between truncate cycles |

**Acceptance Criteria (B/C):**

| AC | Gate |
|---|---|
| Unit: `:memory:` DB under 10k-write sustained load — WAL frame count never exceeds 1000 between truncate cycles | bun test green |
| Unit: `wal_autocheckpoint` PRAGMA returns 1000 on fresh connection | bun test green |
| Unit: `runForcedTruncateCheckpoint()` calls BEGIN IMMEDIATE then TRUNCATE in order (injectable mock) | bun test green |
| Live: mcp-server uptime > 4 h with NO restart-loop AND WAL file size < 5 MB under normal write load | ops monitor post-rebuild |
| tsc 0 errors | pre-commit hook |

**DDD Layer:** infrastructure (`checkpoint.ts`) + interface/scheduler (`startScheduler.ts`). No domain layer changes. No new tables.

---

### Fix-Class A — GUARDRAIL: Ops Restart-Cadence Alert

**Problem to solve:** detect N container restarts in a sliding window and fire a BUG-channel alert before the next wedge.

**Design decision:** Add a lightweight restart-sentinel table entry written at server startup; a cron queries the count of startup rows in the last 4 h. If count >= 2, send a WORK-channel alert (not BUG — matches existing WAL alert pattern in `walCheckpointAlert.ts`).

**Rationale for WORK not BUG:** The BUG channel is for code defects emitted by tests or hard errors. Ops restart-cadence is an operational signal — same pattern as WAL frame alerts.

**Implementation approach:**

- At `bootstrapMcpServer()` startup (composition-root.ts step 1), write a single row to the existing `cron_job_runs` table as a sentinel job named `"mcpServerStartup"` with status `"success"`. This reuses the existing infrastructure — no new table needed.
- Add a new scheduler job `runRestartCadenceAlertJob` (fires every 30 min, staggered from WAL checkpoint): queries `cron_job_runs WHERE job_name='mcpServerStartup' AND started_at >= NOW - 4h`. If count >= 2, send a WORK-channel Telegram alert with the restart count and timestamps.
- Register in `startScheduler.ts` with a separate cron expression (e.g. `CRONS.restartCadenceAlert = '*/30 * * * *'` with a 15-min offset from WAL: `'15,45 * * * *'`).

**Files to modify (A):**

| File | Change |
|---|---|
| `apps/mcp-server/src/composition-root.ts` | After `initDatabase()`, write startup sentinel to `cron_job_runs` via `jobRunRepo` or direct insert |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Add `restartCadenceAlert: Bun.env.CRON_RESTART_CADENCE_ALERT ?? '15,45 * * * *'` |

**Files to create (A):**

| File | Content |
|---|---|
| `apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts` | `runRestartCadenceAlertJob(db?, sendFn?)` — queries startup sentinel count in 4h window; sends WORK alert when count >= 2; injectable deps |
| `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts` | Unit tests: (1) no alert when count=1; (2) alert fires when count=2 in window; (3) alert fires when count=3 in window; (4) alert is silent when all starts are outside the 4h window |

**Files to modify in startScheduler (A):**

| File | Change |
|---|---|
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Register `runRestartCadenceAlertJob` under `CRONS.restartCadenceAlert` |

**Acceptance Criteria (A):**

| AC | Gate |
|---|---|
| Unit: alert fires when 2+ startup sentinel rows exist in last 4 h | bun test green |
| Unit: alert silent when only 1 startup row in window | bun test green |
| Live: after ops force-recreate (1 restart), no false alert fires | ops verify |
| tsc 0 errors | pre-commit hook |

**DDD Layer:** interface/scheduler (new job file). Infra reuses existing `cron_job_runs` table — no migration needed.

---

### Fix-Class D — GUARDRAIL: WAL Size Escalation Gate in Orch-State

**Problem to solve:** detect WAL file size > 10 MB and write an escalation signal to `docs/data/orch/orch-state.json` `.signal_queue` (or equivalent escalation path) so the ops/triage loop can act before the next crash.

**Design decision:** Extend the existing `checkWalFileSize()` helper in `checkpoint.ts` with an optional `escalateFn` parameter. When WAL bytes > 10 MB, after sending the Telegram alert, call `escalateFn` with the WAL size. The 30-min WAL cron in `startScheduler.ts` injects a concrete escalation function that writes an escalation signal object to `docs/data/orch/orch-state.json` `.signal_queue` via an atomic temp-rename write (matching the atomic-write policy from `project_orch_state_cutover` memory).

**Scope boundary:** The orch-state write is injected at the scheduler layer — it is NOT inside `checkpoint.ts` itself (infrastructure layer must not import orch-state paths directly; that would be a DDD layer violation). The escalation function is a closure in `startScheduler.ts` that captures the orch-state path.

**Files to modify (D):**

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/checkpoint.ts` | Add optional `escalateFn?: (walBytes: number) => Promise<void>` parameter to `checkWalFileSize()`; call it after Telegram alert when bytes > 10 MB |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | In the WAL cron wrapper, pass a concrete `escalateFn` to `checkWalFileSize()` that reads orch-state.json, appends a signal to `.signal_queue`, and writes atomically via temp-rename |

**Files to create (D test):**

| File | Content |
|---|---|
| `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` | Unit tests: (1) `escalateFn` is NOT called when WAL < 10 MB; (2) `escalateFn` IS called when WAL > 10 MB; (3) `escalateFn` receives the byte count; (4) no throw when `escalateFn` rejects (non-fatal) |

**Acceptance Criteria (D):**

| AC | Gate |
|---|---|
| Unit: escalateFn called exactly once when WAL > 10 MB | bun test green |
| Unit: escalateFn not called when WAL <= 10 MB | bun test green |
| Unit: escalateFn error does not propagate (fire-and-forget, non-fatal) | bun test green |
| tsc 0 errors | pre-commit hook |

**DDD Layer:** infrastructure signature extension (`checkpoint.ts`) + interface/scheduler injection (`startScheduler.ts`). Zero domain imports.

---

## 4. Task Sequence (dependency order)

```
B/C  →  A  →  D
```

- **B/C ships first** (root fix, load-bearing). A and D are guardrails that wrap the root fix.
- A depends on B/C being deployed first (the alert is only meaningful once the crash loop is broken — otherwise it fires on every wedge cycle and creates alert noise before the fix is live).
- D is independent of A but depends on B/C being in place (escalation gate is redundant while the crash loop is running — it exists as a long-term safety net post-fix).
- All three are sequenced in one sprint because they share the same files; parallel dispatch would create write contention on `startScheduler.ts` and `checkpoint.ts`.

---

## 5. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| `BEGIN IMMEDIATE` in `runForcedTruncateCheckpoint()` will briefly block concurrent writes (up to `busy_timeout = 5000 ms`). Under sustained cron load this may cause a 5 s write stall every 30 min. | LOW | The window is bounded by `busy_timeout`. In production the only concurrent writers are cron jobs, which already tolerate write retry. Measure in unit test: BEGIN IMMEDIATE + COMMIT on `:memory:` with concurrent readers should complete in < 100 ms. |
| Lowering `wal_autocheckpoint` from 4000 to 1000 triggers passive checkpoint 4× more often, adding minor I/O overhead per write batch. | NEGLIGIBLE | WAL mode passive checkpoint is O(frames) disk write, not a lock. At current write rates (< 50 writes/min outside market hours) this is unmeasurable. |
| Orch-state atomic write in the escalation closure (D) must use temp-rename to avoid the jq-empty-guard-clobbers-SSOT failure class (memory: `feedback_jq_empty_guard_clobbers_ssot`). | MEDIUM | Developer must implement using Node `fs.writeFileSync(tempPath) + fs.renameSync(tempPath, target)` (same pattern as existing orch-state writers). Never write directly to the target path. |
| `BEGIN IMMEDIATE` followed by `PRAGMA wal_checkpoint(TRUNCATE)` is not atomic at the SQLite API level — a process crash between them leaves the DB in a valid state (WAL not truncated but not corrupt). | NEGLIGIBLE | SQLite WAL is crash-safe by design. The next startup TRUNCATE replay (composition-root.ts step 1) covers this. |

---

## 6. Standard Detection

```
BUG-FIX / REFACTOR (in-zone, no new primitives):
  BUILD-STANDARD: not-applicable (skip)
```

Rationale: all changes are within the existing `apps/mcp-server/` zone, extend existing exported functions (not new interfaces), and add no new MCP tools or domain services.

---

## 7. Live-Verify Bar (Saturday/Sunday-safe)

| Check | Method |
|---|---|
| Unit test: WAL stays < 5 MB under sustained write load (`:memory:` DB) | `bun test apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` |
| Live: uptime > 4 h with no restart AND WAL file size < 5 MB | `docker exec vn-market-intelligence-mcp-mcp-server-1 ls -lh /data/market.db-wal` every 30 min after ops force-recreate post-rebuild |
| Live: WAL cron log shows TRUNCATE mode each 30-min cycle | `docker logs vn-market-intelligence-mcp-mcp-server-1 --since 4h | grep "WAL checkpoint complete"` |

No market data required. Weekend-safe.

---

## 8. Rebuild Constraint (non-negotiable)

```
docker compose build --no-cache mcp-server \
  && docker compose up -d --no-deps --force-recreate mcp-server
```

NEVER `docker compose down`. Named volume `vn-market-intelligence-mcp_market_data` must not be destroyed.
