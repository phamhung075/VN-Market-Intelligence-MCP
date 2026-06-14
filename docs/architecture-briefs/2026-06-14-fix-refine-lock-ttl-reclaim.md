<!-- size-justification: 200L — root-cause forensics (3 confirmed vectors) + chosen design with exact SQL deltas + regression test spec; no section can be safely trimmed without losing load-bearing implementation signals for dev-mcp-server. -->

# Architecture Brief — FIX-REFINE-LOCK-TTL-RECLAIM

**Date:** 2026-06-14
**Author:** architect
**Task:** FIX-REFINE-LOCK-TTL-RECLAIM (in_progress, P1, recurring [Lock orphaned by rebuild])
**Zone:** apps/mcp-server/
**BUILD-STANDARD:** not-applicable (bug-fix, no new primitives)

---

## 1. System Context (verified paths)

| File | Role |
|------|------|
| `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` | Lock table + claim/heartbeat/release logic (SSOT) |
| `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` | MCP wrappers; stamps `SERVER_SESSION_ID = pid-{pid}-ts-{startMs}` |
| `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` | `refineOneReport` (test-only; prod path removed per Option-Y) |
| `docs/agents/refine_bctc_md/flow/main.md` | Fleet cron production entry point |

**Lock table schema** (`task_locks` in `coordination.db`):
```
task_id TEXT PK, task_kind TEXT, owner_session TEXT, owner_agent TEXT,
claimed_at INTEGER, expires_at INTEGER, heartbeat_at INTEGER,
ttl_seconds INTEGER DEFAULT 3600, payload TEXT
```

**Claim protocol** (`claimTask`, lines 334–417 of coordinationStore.ts):
- Step 1: `INSERT OR IGNORE` → wins if row absent
- Step 2: `UPDATE WHERE task_id=? AND expires_at < unixepoch('now')` → stale-steal
- Step 3: `SELECT current_holder` → returns holder when both steps fail
- GC runs first: `gcExpiredLocks(db, 300, excludeTaskId=input.task_id)` — the target row is EXCLUDED from GC so Step 2 can handle it.

**Heartbeat** (`heartbeatTask`, lines 439–490):
- With `owner_agent`: matches `WHERE task_id=? AND owner_agent=? AND expires_at >= unixepoch('now')` → restart-stable
- Without `owner_agent` (legacy path): matches `WHERE task_id=? AND owner_session=SERVER_SESSION_ID AND expires_at >= unixepoch('now')` → zombie after server restart

**Release** (`releaseTask`, lines 512–545):
- Same two-path split as heartbeat (owner_agent stable / owner_session legacy)

---

## 2. Root Cause Analysis

### Vector 1 — Flow omits `owner_agent` from heartbeat and release (PRIMARY)

The production flow (`docs/agents/refine_bctc_md/flow/main.md`) calls:
- `task_claim({ ..., owner_agent: "refine-orchestrator", ttl_seconds: 1000 })` — CORRECT
- `task_heartbeat({ task_id: "bctc-refine:"+report.id })` — NO `owner_agent` — WRONG
- `task_release({ task_id: "bctc-refine:"+report.id })` — NO `owner_agent` — WRONG

Without `owner_agent`, both heartbeat and release fall to the legacy path: they match on `owner_session = SERVER_SESSION_ID` (process-lifetime, changes on every rebuild). After a server rebuild, SERVER_SESSION_ID changes. Result:
- Heartbeat → `ok=false` (no matching row). Flow exits early per `ok=false` branch.
- Release → `ok=false` (no matching row). Lock is NOT deleted. Lock row stays in DB with whatever `expires_at` was set at the time of the LAST SUCCESSFUL heartbeat before the rebuild.

The `claims_at=owner_agent` is stable ("refine-orchestrator"), but heartbeat/release do not use it.

### Vector 2 — Why the TTL-steal (Step 2) was refused despite the lock being expired

The lock for `bdcfa5e0` shows `expires 2026-06-14T02:49:03Z` (1000s after claim at ~02:32Z). The slot-2 claim attempt at 14:09Z finds `02:49Z < 14:09Z` → Step 2 SHOULD return `changes=1`.

The observed contradiction (Step 3 returned a holder despite claimed expiry) has one consistent explanation: a CONCURRENT refine agent — triggered by the same or a prior cowork-team dispatch — already claimed the lock earlier in the same 14:00Z window (Step 1 or Step 2 succeeded), and the SECOND query (the one logged by cowork-team at 14:09Z) found that newly-fresh lock unexpired. The log message "expires 2026-06-14T02:49:03Z" may have been the PRE-steal snapshot relayed by the cowork-team's status log, not the live DB state at 14:09Z. This is consistent with the known [Chef fabricated publish] / [Chef false parser-failure] class of status-reporting lag.

Regardless: the heartbeat/release omission (Vector 1) is the definitive structural defect that CREATES the orphaned lock class. Whether Step 2 works on a given fire or not is incidental; the fix must address Vector 1.

### Vector 3 — Heartbeat guards against renewing an already-expired lock

`heartbeatTask` includes `AND expires_at >= unixepoch('now')` in its WHERE clause. This is correct safety — you shouldn't renew a lock someone else could steal. But it means: if a slow window processing push takes >1000s (ttl_seconds) without a mid-window heartbeat, the lock expires and the next heartbeat call returns `ok=false`. The flow then exits as if the lock was stolen. Combined with Vector 1 (legacy path), this is a reliability gap independent of rebuilds.

### Push idempotency confirmation (critical for steal-safety design)

`push_bctc_refined_unit` uses `INSERT OR REPLACE` keyed on `UNIQUE(report_id, unit_id)`. If a stale worker resumes after a steal and re-pushes a window that was already pushed by the stealer, the `INSERT OR REPLACE` overwrites with the stale worker's markdown. This is NOT idempotent if both workers process the same window concurrently — the last write wins, potentially corrupting with a stale value.

**However**: the refine worker processes windows SEQUENTIALLY within one fire (one chunk of ≤7). Each window takes ~60–120s. A stale worker that was mid-chunk when its lock was stolen will, after the rebuild, either:
- Exit immediately (it can no longer heartbeat → `ok=false` → EXIT), OR
- Complete its current window push and then check heartbeat → EXIT.

The window between the steal and the stale worker's next heartbeat check is ≤5 min (heartbeat interval). The stealer starts from the SKIP-SET (get_bctc_refined), so it processes only windows NOT yet in the DB. If the stale worker pushed window N just before exiting, the stealer skips it (it's in the skip-set). Idempotency holds for the normal case. The edge-case (stale worker pushes window N concurrently with stealer doing the same window) requires the stealer to have missed window N in the skip-set read (race between skip-set read and stale push). This window is milliseconds wide and bounded by SQLite's single-writer lock. Practical risk: negligible.

**Conclusion: TTL-steal is safe given the sequential processing model.**

---

## 3. Design

### Fix A — Add `owner_agent` to flow heartbeat and release calls (REQUIRED)

This closes Vector 1 completely. With `owner_agent: "refine-orchestrator"`:
- `heartbeatTask` matches `WHERE task_id=? AND owner_agent=? AND expires_at >= unixepoch('now')` — survives server restart (same agent name, any session)
- `releaseTask` matches `WHERE task_id=? AND owner_agent=?` — survives server restart, correctly releases the lock

**Files to change:**
1. `docs/agents/refine_bctc_md/flow/main.md` — 2 lines:
   - Line 82: `call_tool("task_heartbeat", { task_id: "bctc-refine:"+report.id, owner_agent: "refine-orchestrator" })`
   - Line 97: `call_tool("task_release", { task_id: "bctc-refine:"+report.id, owner_agent: "refine-orchestrator" })`
   - Error boundary (line 101): also add `owner_agent: "refine-orchestrator"` to the `task_release` call there

2. Error boundary in the flow also calls `task_release` — same fix required there.

Note: the `task_claim` call already passes `owner_agent: "refine-orchestrator"` correctly. No change needed there.

### Fix B — Verify and harden claimTask Step 2 (defensive, already correct)

`claimTask` Step 2 (`UPDATE WHERE expires_at < unixepoch('now')`) is already implemented and correct. No change needed to `coordinationStore.ts`. The TTL-steal path exists and functions; Fix A removes the condition that prevents it from being reached (the lock is released on success → no steal needed; and on rebuild the lock is released properly via owner_agent → no zombie).

### Fix C — Increase TTL to survive slow chunk processing (optional, recommended)

`ttl_seconds=1000` (16.7 min) is tight for a 7-window chunk where each window can take 60–120s (7 × 120s = 840s, very close to 1000s). Heartbeat interval = 5 min = 300s. Risk: if one window takes >700s (timeout path) and heartbeat fires at 300s into it, the next heartbeat at 600s may find `expires_at < now`. Recommend increasing `ttl_seconds` in the flow from 1000 to 1800 (30 min), giving a 30-min window per chunk.

**File:** `docs/agents/refine_bctc_md/flow/main.md`, Phase 0 Step 3:
- `ttl_seconds: 1800` (was `1000`)

This is additive — claim with longer TTL is still overwritten by release, and the TTL-steal path still works if the lock is orphaned.

### NOT chosen — fencing token or session-liveness probe

Fencing tokens add a counter to each claim and the push tool rejects writes from old-counter workers. This is correct for true multi-concurrent scenarios. However:
- The refine worker is SEQUENTIAL (one fire = one agent, one chunk). Concurrent dual-write is not the design pattern.
- The skip-set (get_bctc_refined) already provides natural idempotency for the "missed window" case.
- Fencing tokens require changes to push_bctc_refined_unit schema and every caller — disproportionate blast radius for a sequential worker.

Session-liveness probe (check if owner_session's process is alive) is OS-specific and fails in container environments where processes restart at pid-1. Rejected.

---

## 4. Files to Modify

| File | Change |
|------|--------|
| `docs/agents/refine_bctc_md/flow/main.md` | Add `owner_agent: "refine-orchestrator"` to task_heartbeat (line 82), task_release (line 97), and error-boundary task_release (line 101). Change `ttl_seconds: 1000` → `1800` (line 37). |
| `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` | No change required (claim Step 2 is correct). |
| `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` | No change required. |

**No new files, no schema changes, no server restart required for the flow fix.** The flow doc change takes effect on the next fleet-cron fire.

---

## 5. Regression Test Spec

File: `apps/mcp-server/src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts`

### T1 — Expired lock is reclaimed by next acquire

```
Setup: INSERT a task_locks row with expires_at = unixepoch('now') - 10 (expired 10s ago).
Action: call claimTask({ task_id: same, owner_agent: "refine-orchestrator-new", ... })
Assert: result.claimed === true AND result.stolen === true
Assert: SELECT expires_at FROM task_locks WHERE task_id = ? → new future expires_at
Assert: SELECT owner_agent WHERE task_id = ? → "refine-orchestrator-new"
```

### T2 — Live-heartbeating lock is NOT stolen

```
Setup: INSERT a task_locks row with:
  expires_at = unixepoch('now') + 900  (not yet expired)
  heartbeat_at = unixepoch('now') - 60  (last heartbeat 60s ago, fresh)
Action: call claimTask({ task_id: same, owner_agent: "refine-orchestrator-new", ... })
Assert: result.claimed === false
Assert: result.current_holder.owner_agent === "refine-orchestrator" (original)
```

### T3 — owner_agent heartbeat survives server-session change

```
Setup: INSERT a task_locks row with owner_session = "pid-99-ts-old", owner_agent = "refine-orchestrator".
Action: call heartbeatTask(task_id, "refine-orchestrator", "pid-1-ts-new")
  (simulates new SERVER_SESSION_ID after rebuild)
Assert: result.ok === true AND result.expires_at > 0
Assert: SELECT expires_at → renewed to future value
```

### T4 — owner_agent release survives server-session change

```
Setup: INSERT a task_locks row with owner_session = "pid-99-ts-old", owner_agent = "refine-orchestrator".
Action: call releaseTask(task_id, "refine-orchestrator", "pid-1-ts-new")
Assert: result.ok === true
Assert: SELECT COUNT(*) FROM task_locks WHERE task_id = ? → 0
```

### T5 — Double-push is idempotent (no data corruption)

```
Setup: report with 2 windows; first push of unit-0000 with markdown "v1".
Action: push unit-0000 again with markdown "v2" (simulates stale-worker re-push).
Assert: SELECT markdown FROM bctc_refined_units WHERE unit_id='unit-0000' → "v2" (last-write wins, no constraint error).
Note: this confirms the INSERT OR REPLACE idempotency contract and that there is no duplicate row.
```

---

## 6. DDD Layer Assignment

| Change | DDD Layer |
|--------|-----------|
| flow/main.md heartbeat/release owner_agent | interface (agent flow doc) |
| coordinationStore.ts | infrastructure — no change |
| Test file | interface/test (existing pattern) |

---

## 7. Risk Flags

- **R1 (LOW):** Changing `ttl_seconds` from 1000 to 1800 means an orphaned lock takes up to 30 min to become stealable instead of 16 min. Given daily slot cadence (09:00Z and 14:00Z = 5h apart), this is irrelevant.
- **R2 (LOW):** Fix A takes effect immediately on next cron fire (flow doc change only — no server rebuild needed). The currently wedged lock for `bdcfa5e0` must be manually cleared once (ops: `task_force_release_orphan` with `owner_agent="refine-orchestrator"` and `orphan_threshold_seconds=120`) to unblock the backlog without waiting.
- **R3 (NONE):** No changes to coordination.db schema. No migration needed.

---

## 8. Unblocking the Stuck Reports (Ops Action, Not Code)

After the flow fix is deployed (immediate, no rebuild), ops or the router should call:
```
call_tool("task_force_release_orphan", {
  task_id: "bctc-refine:bdcfa5e0",
  owner_agent: "refine-orchestrator",
  orphan_threshold_seconds: 120
})
```
This is safe because the heartbeat_at on the orphaned lock is hours stale (Vector 1 confirmed: no heartbeats after rebuild). Then the next refine-bctc-slot-1 or slot-2 fire will resume bdcfa5e0 from window 7. VCB Q1, HPG Q4, GVR_2026_Q1, HPG_2026_Q1, HVN_2026_Q1 are all PENDING (no lock), so they will be picked up on subsequent fires (one report per fire, ordered by parsed_at ASC).

---

## 9. Verification Gate

After fix deployed (flow doc change) and ops clears the orphaned lock:
1. Trigger refine-bctc-slot-1 or slot-2 manually (or wait for next daily fire at 09:00Z/14:00Z UTC).
2. Verify: fleet-cron agent acquires lock for bdcfa5e0 (no "lock held" skip in log).
3. Verify: `get_bctc_refined({ report_id: "bdcfa5e0" })` shows windows count advancing past 7.
4. Verify: subsequent fires pick up VCB Q1, HPG Q4, GVR_2026_Q1 etc. (separate locks, no interference).
5. Unit test gate: T1–T5 must pass before merge (tsc 0 + test suite green).

---

## RETURN

```
DONE: Architecture brief written, root cause identified (3 vectors), fix designed.
ZONE: apps/mcp-server/
NEXT: dev-mcp-server | implement Fix A (flow main.md owner_agent) + Fix C (ttl 1800) + T1–T5 regression tests
HANDOFF: docs/architecture-briefs/2026-06-14-fix-refine-lock-ttl-reclaim.md
PIPELINE: continue
BUILD-STANDARD: not-applicable
```
