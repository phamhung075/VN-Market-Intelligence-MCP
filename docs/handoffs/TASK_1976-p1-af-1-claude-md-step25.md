---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1976-p1-af-1-claude-md-step25
size: S
zone: .claude/
depends_on: ["TASK_1973"]
blocks: ["TASK_1980"]
---

## TLDR

Insert a mandatory step 2.5 ("PRE-CLAIM gate") into `CLAUDE.md` lines 4-10 (before spawning any agent). The gate calls `task_claim(task_id="intent:<agent>:<intent-key>", owner_client_session=$CLAUDE_CODE_SESSION_ID, …)` and DEFERs if `claimed:false` and `current_holder.owner_client_session != $CLAUDE_CODE_SESSION_ID`. This prevents two same-role sessions from both spawning agents for the same intent.

## [PM] Planning Context

- **Zone:** .claude/
- **Acceptance Criteria:**
  - [ ] CLAUDE.md "BEFORE spawning any agent — MANDATORY" section (lines 4-10) is extended to insert step 2.5 between "Match intent → agent" (step 2) and "Spawn" (step 3)
  - [ ] Step 2.5 PRE-CLAIM gate as specified in the brief §3.2 (verbatim block or equivalent)
  - [ ] The gate uses the dispatch-claim SKILL (lifted in TASK_1977) to normalize the `task_id` namespace
  - [ ] On `claimed:false` + `current_holder.owner_client_session != $CLAUDE_CODE_SESSION_ID`, the router logs "[router] PRE-CLAIM collision <task_id> — held by peer session" and sends a one-line Telegram to WORK channel, then EXIT (no spawn)
  - [ ] On `claimed:true`, the router continues to step 3 (spawn) wrapped in try/finally that releases the claim after the agent completes
  - [ ] Updated via agent-md-factory discipline (route through `.claude/skills/agent-md-factory/SKILL.md`)
  - [ ] Commit message references the sprint brief and cites the new step location

- **Files to read first:**
  - CLAUDE.md (current lines 4-10) — top-of-file mandatory checklist
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §3.2 (router gate — step 2.5 verbatim block)
  - .claude/skills/agent-md-factory/SKILL.md — discipline for CLAUDE.md updates
  - .claude/skills/dispatch-claim/SKILL.md (will be lifted in TASK_1977; read it to understand the gate)

- **Files to create:** None (CLAUDE.md update only)
- **Files to modify:**
  - CLAUDE.md lines 4-10 — insert step 2.5 between step 2 and step 3
  
- **Dependencies:** TASK_1973 (migration SQL exists), TASK_1977 (dispatch-claim SKILL lifted — but this task can start drafting while 1977 is in flight)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §3.2 (gate spec)
  - Brief memory: feedback_router_cowork_defer_to_live_leader.md, feedback_router_manual_drive_overlaps_devteam_loop.md — the conventions this gate replaces
  - `.claude/skills/agent-md-factory/SKILL.md` — the discipline for this edit

## [Developer] Implementation Notes

1. **Locate CLAUDE.md:** `/Users/admin/.claude/CLAUDE.md` or `$PROJECT/.claude/CLAUDE.md` (check which one is the active copy for this project)

2. **Current structure (lines 4-10):**
   ```
   BEFORE spawning any agent — MANDATORY
   1. Read `.claude/skills/dispatch/SKILL.md` dispatch table
   2. Match intent → correct agent type
   3. Spawn that agent with `run docs/agents/<agent>/flow/main.md`
   ```

3. **Insert step 2.5:**
   ```
   BEFORE spawning any agent — MANDATORY
   1. Read `.claude/skills/dispatch/SKILL.md` dispatch table
   2. Match intent → correct agent type
   2.5 PRE-CLAIM:
        task_claim(task_id="intent:<agent>:<intent-key>",
                   task_kind="intent",
                   owner_agent="<agent>",
                   owner_client_session=$CLAUDE_CODE_SESSION_ID,
                   ttl_seconds=600,
                   payload='{"site":"router","intent":"<intent-key>"}')
        claimed:true  → continue to step 3 (spawn inside try/finally → task_release)
        claimed:false + peer (owner_client_session ≠ $CLAUDE_CODE_SESSION_ID) → log to WORK, EXIT
   3. Spawn that agent with `run docs/agents/<agent>/flow/main.md`
        (pass $CLAUDE_CODE_SESSION_ID in spawn prompt as coordination parameter)
        finally: task_release("intent:<agent>:<intent-key>")
   ```

4. **Formatting:** Follow the existing CLAUDE.md style. Use markdown code blocks or bullet points as appropriate.

5. **agent-md-factory discipline:** This file is part of the router's Constitution, so use the agent-md-factory skill to validate + commit (ensures the edit is well-formed, idempotent, and correctly references the sprint).

---

## AC: Inspect CLAUDE.md

After code lands:
```bash
# Verify step 2.5 is present and readable
grep -A 10 "2.5 PRE-CLAIM" CLAUDE.md
# Should show the PRE-CLAIM gate logic
```

## RETURN to PM

Once this task is DONE:
- Confirm step 2.5 is inserted and references dispatch-claim SKILL
- Confirm the gate defers when peer session holds the claim
- Unblock TASK_1980 (P1-FINAL) — but only after all four AF-* tasks land and callers are actually passing $CLAUDE_CODE_SESSION_ID
