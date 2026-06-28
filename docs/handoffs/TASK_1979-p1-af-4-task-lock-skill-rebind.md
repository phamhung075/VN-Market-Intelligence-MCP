---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1979-p1-af-4-task-lock-skill-rebind
size: M
zone: .claude/skills/
depends_on: ["TASK_1973", "TASK_1974"]
blocks: ["TASK_1980"]
---

## TLDR

Edit `.claude/skills/task-lock/SKILL.md` to declare `owner_client_session` as the authoritative ownership key for all ownership probes. Remove `owner_agent` from the "is-it-mine?" check logic entirely. Retain `owner_agent` as a human-readable role label only (for logs, dashboards, diagnostics), never as a match predicate in ownership decisions.

## [PM] Planning Context

- **Zone:** .claude/skills/
- **Acceptance Criteria:**
  - [ ] `.claude/skills/task-lock/SKILL.md` declares at the top (or in a summary section) that `owner_client_session` is the sole authoritative key for ownership
  - [ ] All "is-it-mine?" logic (heartbeat, release, force-release checks) uses ONLY `owner_client_session` for ownership comparison
  - [ ] All examples in the SKILL show `owner_client_session=$CLAUDE_CODE_SESSION_ID` (never `owner_agent=$some_role`)
  - [ ] `owner_agent` is still documented and used as a human-readable role label (e.g., for filtering logs, routing work to role-based teams), but is explicitly noted as NON-AUTHORITATIVE
  - [ ] Any legacy backward-compat fallback to `owner_agent` (matching-ladder rung) is clearly marked as TRANSITIONAL and noted to be removed in step 5 (P1-FINAL, TASK_1980)
  - [ ] The SKILL cites the brief §2 (session identity scheme) and §4 (heartbeat + stale reclaim logic)
  - [ ] Commit message references the sprint brief and notes the rebind

- **Files to read first:**
  - .claude/skills/task-lock/SKILL.md (current version)
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §2 (session identity scheme), §4 (heartbeat + stale reclaim), §1.3 (modeling assumption)
  - docs/handoffs/TASK_1974-p1-mcp-2-coordinationstore.md (to understand matching-ladder order and transitional nature)

- **Files to create:** None
- **Files to modify:**
  - .claude/skills/task-lock/SKILL.md
  
- **Dependencies:** TASK_1973 (migration SQL), TASK_1974 (coordinationStore matching-ladder implemented)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §2 (session identity scheme) — why caller-supplied UUID is authoritative
  - Hard constraint from user: "Two sessions running the same role (two dev teams, two analysis teams) share `owner_agent`. Therefore the authoritative ownership key MUST be the per-session UUID (`owner_client_session = CLAUDE_CODE_SESSION_ID`). **Never `owner_agent`.**"

## [Developer] Implementation Notes

1. **SKILL structure (current likely state):**
   - Probably contains sections on:
     - heartbeat semantics
     - release semantics
     - force_release semantics
     - ownership check logic
   - Uses `owner_agent` in the ownership checks (the thing to rebind)

2. **Rewrite ownership sections:**
   - For heartbeat: "To renew a lock, the agent must provide its own `owner_client_session` (the per-session UUID from $CLAUDE_CODE_SESSION_ID). The server matches on this session UUID, not on agent role."
   - For release: "To release a lock, the agent must provide its `owner_client_session`. The server matches on this, and returns `{ok:true, released:0}` if the session doesn't match (clean no-op, not an error)."
   - For force_release: "A peer can only force-release a lock if it's truly stale (heartbeat_age > 120s) AND the holding session is dead. The lock's `owner_client_session` is used to verify this — `owner_agent` is informational only."

3. **Mark legacy fallback as TRANSITIONAL:**
   - If the SKILL still mentions a fallback to `owner_agent` (e.g., "if owner_client_session is NULL, match on owner_agent"), clearly mark it as:
     ```
     TRANSITIONAL (rollout window only):
     During migration (TASK_1973-1979), existing pre-P1 locks have NULL in owner_client_session.
     For backward-compat, the matching-ladder falls through to owner_agent.
     This rung is REMOVED at step 5 (TASK_1980 / P1-FINAL).
     ```

4. **Examples:**
   - Heartbeat example:
     ```
     task_heartbeat(
       task_id="sprint-task:TASK_1974",
       owner_client_session=$CLAUDE_CODE_SESSION_ID  # required, session UUID
     )
     ```
   - Release example:
     ```
     task_release(
       task_id="sprint-task:TASK_1974",
       owner_client_session=$CLAUDE_CODE_SESSION_ID  # required, session UUID
     )
     # Returns: {ok:true, released:1} if released, {ok:true, released:0} if wrong owner
     ```

5. **Testing:**
   - Re-read the SKILL and verify no example shows `owner_agent` as an ownership key
   - Spot-check the heartbeat section: verify it keys on session UUID, not role
   - Check force_release section: verify it checks `owner_client_session` for staleness, not `owner_agent`

---

## AC: Inspect SKILL

After code lands:
```bash
# Verify owner_client_session is the authoritative key
grep -i "authoritative.*owner_client_session" .claude/skills/task-lock/SKILL.md

# Verify no "is-it-mine" logic keys on owner_agent alone
grep -E "(is.*mine|ownership.*check)" .claude/skills/task-lock/SKILL.md | grep -v "client_session"

# Verify legacy fallback is marked TRANSITIONAL
grep -i "transitional\|rollout window" .claude/skills/task-lock/SKILL.md
```

## RETURN to PM

Once this task is DONE:
- Confirm ownership is solely keyed on `owner_client_session`
- Confirm `owner_agent` is retained only as a human-readable label
- Confirm legacy fallback is marked TRANSITIONAL
- Unblock TASK_1980 (P1-FINAL)
