---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1974-p1-mcp-2-coordinationstore
size: M
zone: apps/mcp-server/
depends_on: ["TASK_1973"]
blocks: ["TASK_1980"]
---

## TLDR

Extend `coordinationStore.ts` to thread `owner_client_session` through `claimTask`, `heartbeatTask`, `releaseTask`, and `releaseOrphanTask`. Implement matching-ladder logic: prefer `owner_client_session` if provided; fall through to `owner_agent` (legacy) then `owner_session` (deepest legacy). Change `releaseTask` return shape from `{ok:boolean}` to `{ok:true, released:0|1}` to make wrong-owner release a clean no-op.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria:**
  - [ ] `claimTask` (lines 334-417) adds `owner_client_session` to INSERT column list, stale-steal UPDATE column list, and `current_holder` SELECT
  - [ ] `heartbeatTask` (lines 439-490) implements matching-ladder: (1) if `owner_client_session` provided, match on it; (2) else `owner_agent`; (3) else `owner_session`
  - [ ] `releaseTask` (lines 512-545) implements matching-ladder (same order) and returns `{ok:true, released:0|1}` (0 = wrong owner no-op, 1 = actually released)
  - [ ] `releaseOrphanTask` (lines 614-694) matches on `owner_client_session` OR heartbeat-age-only; refuses release if `heartbeat_age ≤ 120s` (live lock guard unchanged)
  - [ ] All changes are backward-compatible: NULL `owner_client_session` values fall through to `owner_agent` matching (pre-P1 rows unaffected)
  - [ ] RAW-verify against LIVE coordination.db: claim two concurrent requests with distinct `owner_client_session` values, verify only one gets `{claimed:true}`, the other gets `{claimed:false, current_holder.owner_client_session}` of the winner
  - [ ] RAW-verify: Session A calls `releaseTask` with wrong `owner_client_session`, gets `{ok:true, released:0}`; Session A's own release gets `{ok:true, released:1}`
  - [ ] Commit message references the sprint brief and lists file line ranges

- **Files to read first:**
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts (entire file, focus on lines 334-417, 439-490, 512-545, 614-694)
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §8 P1-MCP-2 spec
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §4 (heartbeat + stale reclaim semantics)
  - project memory feedback_task_release_owner_agent_mismatch_orphans_lock.md
  - project memory feedback_lock_orphaned_by_rebuild.md

- **Files to create:** None
- **Files to modify:**
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts — claimTask, heartbeatTask, releaseTask, releaseOrphanTask functions
  
- **Dependencies:** TASK_1973 (migration SQL must land first so the column exists)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §4 (heartbeat + stale reclaim matching-ladder logic), §8 P1-MCP-2 spec
  - SQL matching-ladder pattern: `WHERE task_id=? AND (owner_client_session=? OR (owner_client_session IS NULL AND owner_agent=?))`
  - Return shape change rationale: feedback_task_release_owner_agent_mismatch_orphans_lock.md

## [Developer] Implementation Notes

1. **claimTask (lines 334-417):**
   - Existing INSERT: `INSERT OR IGNORE INTO task_locks (task_id, task_kind, owner_agent, owner_session, expires_at, payload, claimed_at, heartbeat_at) VALUES (...)`
   - Change to: add `owner_client_session` to both column list and VALUES
   - Stale-steal UPDATE: `UPDATE task_locks SET owner_agent=?, owner_session=?, expires_at=?, heartbeat_at=? WHERE task_id=? AND expires_at < unixepoch('now')`
   - Change to: also SET `owner_client_session=?` (caller-supplied value)
   - current_holder SELECT: extend to include `owner_client_session` in the returned object

2. **heartbeatTask (lines 439-490):**
   - Matching-ladder pattern:
     ```sql
     WHERE task_id=?
       AND (
         (owner_client_session=? AND owner_client_session IS NOT NULL)
         OR (owner_client_session IS NULL AND owner_agent=?)
         OR (owner_client_session IS NULL AND owner_agent IS NULL AND owner_session=?)
       )
     ```
   - Update: SET `expires_at`, `heartbeat_at` to renew the lock TTL
   - Preserve the "cannot heartbeat a dead lock" check: `expires_at >= now` (stale lock reject)

3. **releaseTask (lines 512-545):**
   - Same matching-ladder as heartbeatTask
   - Change return: instead of `{ok:false}` when WHERE doesn't match, return `{ok:true, released:0}`
   - When DELETE succeeds (1 row affected): `{ok:true, released:1}`
   - When DELETE matches 0 rows (wrong owner): `{ok:true, released:0}`
   - Special: on DB error, still return `{ok:false, error}` (fail-loud for actual failures, not ownership mismatches)

4. **releaseOrphanTask (lines 614-694):**
   - Matching-ladder: match on `owner_client_session` OR heartbeat-age-only
   - Syntax: `WHERE task_id=? AND ((owner_client_session=? AND owner_client_session IS NOT NULL) OR (heartbeat_at < unixepoch('now') - 120))`
   - Preserve: refuse DELETE if `heartbeat_age ≤ 120s` (live lock guard)

5. **Testing locally:**
   ```bash
   # Spin up containers
   docker compose up -d
   
   # Test 1: Double-claim race with distinct owner_client_session
   curl -X POST http://localhost/gateway/call-tool \
     -d '{"server":"vn-market","tool":"task_claim","arguments":{"task_id":"test-race-1","task_kind":"sprint-task","owner_agent":"dev-team","owner_client_session":"session-aaa-111","ttl_seconds":3600}}'
   
   curl -X POST http://localhost/gateway/call-tool \
     -d '{"server":"vn-market","tool":"task_claim","arguments":{"task_id":"test-race-1","task_kind":"sprint-task","owner_agent":"dev-team","owner_client_session":"session-bbb-222","ttl_seconds":3600}}'
   
   # Verify: first gets {claimed:true}, second gets {claimed:false, current_holder.owner_client_session:"session-aaa-111"}
   
   # Test 2: Wrong-owner release
   curl -X POST http://localhost/gateway/call-tool \
     -d '{"server":"vn-market","tool":"task_release","arguments":{"task_id":"test-race-1","owner_client_session":"session-bbb-222"}}'
   
   # Verify: {ok:true, released:0}
   ```

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Sprint:** CROSS-SESSION-MULTI-TEAM-ORCH
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` — ClaimInput, CurrentHolder, ReleaseResult, LockRow types; claimTask INSERT/UPDATE/SELECT; heartbeatTask matching-ladder; releaseTask matching-ladder + new return shape; releaseOrphanTask matching-ladder + ownership guard
  - `apps/mcp-server/src/__tests__/task-lock-coordination-store.test.ts` — updated AC-5/6/8/9 call sites for new param order; AC-6/8/9 assertion updates for {ok:true,released:0|1}; added AC-10 (8 new tests for P1-MCP-2 behavior)
  - `apps/mcp-server/src/__tests__/task-lock-coordination-tools.test.ts` — updated heartbeatTask/releaseTask call sites; updated releaseResult assertions
  - `apps/mcp-server/src/__tests__/commit-mutex-coordination.test.ts` — updated releaseTask call site
  - `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts` — updated releaseTask/releaseOrphanTask call sites; whitespace-tolerant ttl_seconds:1800 regex
- **Tests written:** AC-10 block in task-lock-coordination-store.test.ts — 8 new assertions (P1-MCP-2 matching-ladder), GREEN
- **Git commits:** see commit SHA in parent task report
- **Type check:** clean (`bun tsc --noEmit` exit 0; `pnpm check` exit 0)
- **bun test (coordination suite):** 88 pass / 0 fail (4 files: coordination-store, coordination-tools, commit-mutex, DWF-phase2)
- **Tool count:** 166 — matches pre-task baseline (no tool change)
- **Scheduler count:** 3 cron.schedule entries in startupHelpers.ts — unchanged (no scheduler files touched)
- **Docs updated:** NONE (store-layer change only)
- **Graphify:** skipped (no docs impacted)

**Key changes summary:**
1. `ClaimInput.owner_client_session?: string` — threads through INSERT + stale-steal UPDATE
2. `CurrentHolder.owner_client_session: string | null` — returned on collision detection
3. `ReleaseResult` type changed to `{ok:true; released:0|1} | {ok:false; error?:string}`
4. `heartbeatTask(task_id, owner_client_session?, owner_agent?, owner_session?)` — 3-rung matching-ladder
5. `releaseTask(task_id, owner_client_session?, owner_agent?, owner_session?)` — same ladder; wrong-owner = `{ok:true,released:0}` not error
6. `releaseOrphanTask(task_id, owner_client_session|undefined, owner_agent, threshold?)` — ownership guard with matching-ladder

**RAW-verify LIVE coordination.db (named-volume, 2026-06-28):**
- Column `owner_client_session` confirmed: `PRAGMA table_info` returns it
- First claim `session-aaa-111`: `{claimed:true}`
- Second claim `session-bbb-222` (same task): `{claimed:false, current_holder.owner_client_session:"session-aaa-111"}`
- Wrong-session release: `{ok:true, released:0}`
- Correct-session release: `{ok:true, released:1}`, row gone

---

## AC: RAW-Verify Against LIVE coordination.db

After code lands and container rebuilds:
```bash
# (1) Verify the matching-ladder logic via two concurrent claims
# (2) Verify release returns {ok:true, released:0|1}
# (3) Query coordination.db directly: SELECT owner_client_session FROM task_locks LIMIT 5; should show NULL for pre-P1 rows, UUIDs for new claims
```

## RETURN to PM

Once this task is DONE (QA verified on LIVE coordination.db):
- Confirm P1-MCP-2 logic works (matching-ladder, release return shape)
- Unblock TASK_1980 (P1-FINAL: make owner_client_session REQUIRED) — but only after TASK_1975 (P1-MCP-3) and all AF-* tasks land so callers are passing the field
