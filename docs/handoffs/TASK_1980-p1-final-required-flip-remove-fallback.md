---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1980-p1-final-required-flip-remove-fallback
size: S
zone: apps/mcp-server/
depends_on: ["TASK_1974", "TASK_1975", "TASK_1976", "TASK_1977", "TASK_1978", "TASK_1979"]
blocks: ["TASK_1981"]
---

## TLDR

This is the LOCKED DoD gate (PO-mandated, non-negotiable). Step 5 of the migration: make `owner_client_session` REQUIRED in the tool schemas AND remove `owner_agent` from all "is-it-mine" ownership checks. `owner_agent` is retained ONLY as a stored human-readable label. After this task, the matching-ladder fallback to `owner_agent` is GONE — every ownership decision keys SOLELY on `owner_client_session`.

This is a ONE-WAY gate. If dropped, the same-role multi-team bug silently re-opens (two same-role sessions both fall through to role match). PM enforces this is the FINAL task in the P1 chain, after all callers are passing the field.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria (LOCKED, per PO decision):**
  - [ ] `owner_client_session: z.string()` (NOT `.optional()`) in the tool input schemas for `task_claim`, `task_heartbeat`, `task_release`, `task_force_release_orphan`
  - [ ] The is-it-mine PROCEED/EXIT path (all ownership probes) keys SOLELY on `owner_client_session`, with NO `owner_agent` comparison remaining
  - [ ] `heartbeatTask` matching-ladder: ONLY branch is `WHERE task_id=? AND owner_client_session=?` — the fallback to `owner_agent` is DELETED
  - [ ] `releaseTask` matching-ladder: same — only `owner_client_session` match, no fallback
  - [ ] `releaseOrphanTask` matching-ladder: only `owner_client_session` OR heartbeat-age-only, no fallback
  - [ ] `owner_agent` field is retained in the schema (for human-readable logging/filtering), but is NEVER used in a WHERE clause for ownership decisions
  - [ ] All pre-P1 rows (with NULL owner_client_session) become UNMATCHABLE by the new owners (they will be garbage-collected after TTL or manually cleaned if needed)
  - [ ] A caller that does NOT pass `owner_client_session` gets a validation error (Zod required)
  - [ ] Commit message explicitly cites this is P1 step 5 and that dropping this step re-opens the same-role multi-team bug
  - [ ] Code review must verify EVERY WHERE clause in claimTask/heartbeatTask/releaseTask/releaseOrphanTask: no `owner_agent` ownership predicates remain

- **Files to read first:**
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts — ALL functions that reference owner_agent in a WHERE clause
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §7 P1 (locked DoD gate spec)
  - PO decision: docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-po.md (reads po-S2, which locked this gate)
  - Feedback: project memory feedback_router_cowork_defer_to_live_leader.md + feedback_router_manual_drive_overlaps_devteam_loop.md — why this gate matters

- **Files to create:** None
- **Files to modify:**
  - apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts — make `owner_client_session` REQUIRED in schemas
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts — remove all fallback to `owner_agent` matching-ladders, verify WHERE clauses
  
- **Dependencies:** ALL of TASK_1974-1979 must be DONE and LIVE (callers passing owner_client_session, storage working, operator tooling updated)
- **Knowledge needed:**
  - Brief §7 P1 (locked DoD gate — PO-mandated)
  - PO decision journal: docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-po.md (po-S2, why this is non-negotiable)
  - Hard constraint: "A permanent owner_agent rung silently re-opens the same-role multi-team bug (two same-role teams both fall through to role-match)."

## [Developer] Implementation Notes

1. **Zod schema change (coordinationTools.ts):**
   - Change all four tool schemas from:
     ```typescript
     owner_client_session: z.string().optional()
     ```
   - To:
     ```typescript
     owner_client_session: z.string()  // REQUIRED
     ```
   - This is a breaking change. All callers MUST now pass the field.

2. **Remove matching-ladder fallback (coordinationStore.ts):**
   - OLD pattern (matching-ladder with fallback):
     ```sql
     WHERE task_id=?
       AND (
         (owner_client_session=? AND owner_client_session IS NOT NULL)
         OR (owner_client_session IS NULL AND owner_agent=?)
         OR (owner_client_session IS NULL AND owner_agent IS NULL AND owner_session=?)
       )
     ```
   - NEW pattern (owner_client_session ONLY):
     ```sql
     WHERE task_id=? AND owner_client_session=?
     ```
   - Apply this to: claimTask (stale-steal UPDATE), heartbeatTask, releaseTask, releaseOrphanTask

3. **Retain owner_agent for human-readable label only:**
   - Keep the field in the schema
   - Keep it in INSERT/SELECT (for diagnostics, logs, dashboards)
   - Remove it from WHERE clauses entirely (ownership checks)
   - Example: `SELECT owner_agent FROM task_locks LIMIT 1;` still works (shows role), but `WHERE owner_agent=?` for ownership is gone

4. **Testing locally:**
   ```bash
   docker compose up -d
   
   # Test 1: Call without owner_client_session → expect validation error
   curl -X POST http://localhost/gateway/call-tool \
     -d '{"server":"vn-market","tool":"task_claim","arguments":{"task_id":"test-final-1","task_kind":"sprint-task","owner_agent":"dev-team","ttl_seconds":3600}}'
   
   # Should return error: owner_client_session is required
   
   # Test 2: Call WITH owner_client_session → expect success
   curl -X POST http://localhost/gateway/call-tool \
     -d '{"server":"vn-market","tool":"task_claim","arguments":{"task_id":"test-final-1","task_kind":"sprint-task","owner_agent":"dev-team","owner_client_session":"uuid-aaa","ttl_seconds":3600}}'
   
   # Should return {claimed:true}
   
   # Test 3: Old pre-P1 locks (with NULL owner_client_session) become unreleasable
   # (They're garbage-collected naturally after TTL)
   ```

5. **Pre-P1 lock cleanup (if needed):**
   - Pre-P1 locks have NULL owner_client_session
   - After this task ships, they will not match any ownership WHERE clause
   - They'll expire naturally and be GC'd
   - If manual cleanup is needed: `DELETE FROM task_locks WHERE owner_client_session IS NULL AND expires_at < unixepoch('now')`
   - Document this in release notes

---

## AC: Code Review Checklist

After code lands:
```bash
# (1) Verify no "WHERE owner_agent" ownership checks remain
grep -n "WHERE.*owner_agent" apps/mcp-server/src/infrastructure/db/coordinationStore.ts
# Should return only non-ownership references (e.g., filtering for diagnostics)

# (2) Verify claimTask stale-steal UPDATE only uses owner_client_session
grep -A 5 "stale-steal UPDATE" apps/mcp-server/src/infrastructure/db/coordinationStore.ts | grep WHERE

# (3) Verify Zod schema requires owner_client_session
grep -A 10 "taskClaimSchema\|taskHeartbeatSchema" apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts | grep owner_client_session

# Should show no `.optional()`
```

## RETURN to PM

Once this task is DONE (code review + QA RAW-verify):
- Confirm all ownership checks key ONLY on owner_client_session
- Confirm REQUIRED gate in Zod (no more optional)
- Confirm callers cannot claim without passing the field
- Unblock TASK_1981 (P1-REGRESSION: acceptance tests)
- Mark P1 READY FOR TESTING (all FRs shipped)

---

## WARNING: Point of No Return

This task is the final, irreversible gate of P1. Dropping or weakening this acceptance criterion re-opens the same-role multi-team bug. Do NOT proceed unless:
1. All callers (TASK_1976-1979) are LIVE and passing owner_client_session
2. Pre-P1 locks are identified and cleanup plan is in place
3. Code review confirms NO owner_agent ownership logic remains
4. PO re-confirms this gate is locked (check docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-po.md po-S2)
