---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1978-p1-af-3-leader-lock-delete-anti-pattern
size: S
zone: docs/agents/cowork-team/
depends_on: ["TASK_1973", "TASK_1974"]
blocks: ["TASK_1980"]
---

## TLDR

Delete the self-held-heartbeat anti-pattern in `docs/agents/cowork-team/flow/leader-lock.md:64-81`. Replace it with a session-id comparison branch: when `task_claim` returns `claimed:false`, compare `current_holder.owner_client_session` to the dispatcher's `$CLAUDE_CODE_SESSION_ID` (passed in the spawn prompt from TASK_1976). If equal, it's your own prior lock → renew + PROCEED. If different, it's a peer session → DEFER/EXIT.

## [PM] Planning Context

- **Zone:** docs/agents/cowork-team/
- **Acceptance Criteria:**
  - [ ] Lines 64-81 of leader-lock.md (the `claimed:false` → heartbeat probe shortcut) are DELETED
  - [ ] Replaced with: compare `current_holder.owner_client_session` == `$CLAUDE_CODE_SESSION_ID` (from spawn prompt)
  - [ ] If equal (self-held): log "[cowork-team] re-entry detected, renewing...", call `task_heartbeat(task_id, owner_client_session=$CLAUDE_CODE_SESSION_ID)`, then PROCEED
  - [ ] If different (peer session): log "[cowork-team] peer session holds lock, deferring", send WORK telegram, EXIT (do NOT spawn)
  - [ ] The `$CLAUDE_CODE_SESSION_ID` is extracted from the spawn prompt (passed by TASK_1976 via the router gate)
  - [ ] No heartbeat call on `claimed:false` for the ownership check (that anti-pattern is gone)
  - [ ] Commit message cites the brief and notes the deletion of lines 64-81

- **Files to read first:**
  - docs/agents/cowork-team/flow/leader-lock.md (current version, focus on lines 64-81)
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §1.2 (root cause of cowork double-fire), §3 (atomic claim protocol), §7 P1 (ships delete self-held-heartbeat shortcut)

- **Files to create:** None
- **Files to modify:**
  - docs/agents/cowork-team/flow/leader-lock.md — delete lines 64-81, insert session-id comparison
  
- **Dependencies:** TASK_1973 (migration SQL), TASK_1974 (coordinationStore matching-ladder + heartbeat return shape), TASK_1976 (spawn prompt passes $CLAUDE_CODE_SESSION_ID)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §1.2 (why heartbeat on `claimed:false` is an anti-pattern) — root cause explanation
  - Brief §3 (atomic claim protocol — why we trust `claimed:false` + session-id compare, not a heartbeat)
  - Cowork double-fire pattern: two same-role sessions claim at same tick, both get `claimed:false` (different reasons for each), both call heartbeat (wrong!), both see heartbeat succeeds (because heartbeat keys on owner_agent=role), both proceed → double-fire

## [Developer] Implementation Notes

1. **Locate the anti-pattern (leader-lock.md:64-81):**
   - Current code likely does:
     ```bash
     if [ "$claimed" = "false" ]; then
       # Ask: is this my own lock?
       heartbeat_result=$(task_heartbeat "$task_id" ...)
       if [ "$heartbeat_ok" = "true" ]; then
         # Assume: yes, it's mine (WRONG — could be peer's, heartbeat keys on role)
         proceed_with_leader_dispatch
       fi
     fi
     ```

2. **Replace with session-id comparison:**
   ```bash
   if [ "$claimed" = "false" ]; then
     owner_session=$(echo "$current_holder" | jq -r '.owner_client_session')
     if [ "$owner_session" = "$CLAUDE_CODE_SESSION_ID" ]; then
       # It's my own lock — renew it
       task_heartbeat "$task_id" --owner-client-session "$CLAUDE_CODE_SESSION_ID"
       proceed_with_leader_dispatch
     else
       # Peer session holds it — defer
       log "[cowork-team] peer session $owner_session holds lock, deferring"
       send_telegram "work" "[cowork-team] DEFER: peer session holds cowork-slot"
       exit 0
     fi
   fi
   ```

3. **Session UUID extraction:**
   - `$CLAUDE_CODE_SESSION_ID` should be passed to cowork-team via the spawn prompt (set by router in TASK_1976)
   - If not present, log a WARNING and fall back to minted value (same as in TASK_1977)

4. **Testing:**
   - Spin up two cowork-team sessions (simulate via two independent dispatch triggers)
   - First session claims the leader lock
   - Second session attempts to claim at the same tick
   - Verify: second sees `claimed:false`, compares session-id, sees mismatch, DEFERs
   - Verify: heartbeat is NOT called by the second session (anti-pattern deleted)

---

## AC: Inspect leader-lock.md

After code lands:
```bash
# Verify lines 64-81 are deleted
wc -l docs/agents/cowork-team/flow/leader-lock.md
# Should be reduced by ~18 lines

# Verify session-id comparison is present
grep -A 5 "owner_client_session" docs/agents/cowork-team/flow/leader-lock.md
```

## [Developer] Implementation Record

**Status:** REVIEW
**Implemented by:** agent-father (edit mode, CROSS-SESSION-MULTI-TEAM-ORCH sprint)
**Date:** 2026-06-28

**File modified:** `docs/agents/cowork-team/flow/leader-lock.md`

**Changes:**
1. Deleted the self-held-heartbeat anti-pattern (former lines 64-81): removed the
   `task_heartbeat` probe on `claimed:false` that used `owner_agent` to test self-ownership.
   The `claimed:false` → `task_heartbeat(owner_agent="cowork-dispatcher")` → "self-held" path
   is entirely gone. This path was the root cause of cowork double-fire (brief §1.2, Site 1).

2. Replaced with session-id comparison:
   ```
   else:
     owner_session = LEADER_CLAIM.current_holder.owner_client_session
     if owner_session == $CLAUDE_CODE_SESSION_ID: renew + PROCEED
     else: log + WORK telegram + EXIT
   ```

3. Updated `task_claim` call to include `owner_client_session: $CLAUDE_CODE_SESSION_ID`.

4. Updated SESSION-SINGLETON GUARD comment and inline protocol comment to reflect P1 protocol
   (no more heartbeat-probe OWN-HELD or ORPHAN-RECOVERY paths — these were the old protocol).

5. Updated size-justification comment (113L → 96L).

**AC verification:**
- No `task_heartbeat` call on `claimed:false` for ownership check (anti-pattern deleted)
- `owner_client_session` comparison is the sole discriminator for re-entrant vs peer
- `$CLAUDE_CODE_SESSION_ID` used in heartbeat renewal (re-entrant path only)
- WORK telegram sent on peer-held path
- File reduced from 113L to 96L

## RETURN to PM

Once this task is DONE:
- Confirm the anti-pattern is deleted
- Confirm session-id comparison is in place
- Confirm no heartbeat call on `claimed:false` for ownership check
- Unblock TASK_1980 (P1-FINAL)
