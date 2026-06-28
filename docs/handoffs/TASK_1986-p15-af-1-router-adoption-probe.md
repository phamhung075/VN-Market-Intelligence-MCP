---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P1.5
branch: task/1986-p15-af-1-router-adoption-probe
size: M
zone: .claude/skills/
depends_on: [TASK_1980, TASK_1981, TASK_1985]
blocks: [TASK_1988]
---

## TLDR

Extend the router step 2.5 PRE-CLAIM gate (created in TASK_1976 P1-AF-1) with an orphan-adoption probe BEFORE dispatching new work. Query `task_list_held(kind="orphan-signal", owner_agent=<current_dispatcher_role>)`. For each matching signal, check `redispatch_count < N_MAX=3` and attempt to re-claim the original `task_id` (stale-steal succeeds since the original row was deleted by the reaper). If successful, read the checkpoint from the signal's `last_payload`, resume the work, and emit a BUG telegram if escalated to `status=ESCALATED`.

## [PM] Planning Context

**Architect Brief Section:** §6.5.3 + §6.5.4 + §6.5.6 + §8 (Concrete Follow-On Tasks: P1.5-AF-1)

**Zone:** .claude/skills/ (adoption probe SKILL or inline in dispatch-claim SKILL)

**Acceptance Criteria:**

- [ ] Router step 2.5 adoption probe (BEFORE claiming new work from backlog or cron arms):
  - Call `task_list_held(kind="orphan-signal", owner_agent=$CLAUDE_CODE_SESSION_ID_DISPATCHER_ROLE)`
  - For each returned signal where `payload.redispatch_count < N_MAX=3`:
    - Attempt `task_claim(task_id=$original_task_id, owner_client_session=$CLAUDE_CODE_SESSION_ID, ...)`
    - If claimed, read checkpoint from `signal.payload.last_payload`
    - Resume work per §6.5.5 table (resume contract for the `original_task_kind`)
    - Call `task_release("orphan-signal:<task_id>")` after successful re-dispatch
  - For each signal where `payload.redispatch_count >= N_MAX=3`:
    - Check if `payload.status == "ESCALATED"` (idempotent check)
    - If NOT yet escalated, send `send_telegram(channel="bug", message="[orch] Orphan task <task_id> exceeded N_MAX=3 re-dispatches — ESCALATED. Last owner: <owner_client_session>. Manual intervention required.")`
    - Mark escalated: call `task_heartbeat(task_id="orphan-signal:<task_id>")` to extend TTL to +86400 and update `payload.status="ESCALATED"`
    - Do NOT re-dispatch
- [ ] **DoD-P15-1:** Router step 2.5 (P1.5-AF-1) NEVER reverts an uncommitted live-effect tree — it only DEFERS to dev-team Step 0a (P1.5-AF-2) for the actual tree-hygiene check before resuming. Router routes, never implements. (dev-team adopter MUST revert; see TASK_1987 AC)
- [ ] **DoD-P15-2:** Adopter MUST use read-only `task_list_held` to probe for published artifacts (NOT `task_heartbeat`/`task_claim` create-if-absent). Applied at adoption time for cowork-slot / cron-tick resume contracts.
- [ ] **DoD-P15-3:** Adopter reads `signal.payload.redispatch_count` and carries it forward into the re-claim call (adopter's responsibility; P1.5-AF-1 passes it to P1.5-AF-2 via the checkpoint data)
- [ ] **DoD-P15-6:** Every doc/flow text that describes the adoption path MUST include the honest-bound line verbatim: "zero live sessions = zero execution; the reaper only makes work ADOPTABLE, it never self-heals execution" (scoped to mcp-server, an always-on tool server, not an agent runtime)
- [ ] Escalation idempotency: BUG telegram fires ONCE per escalation (checked via `payload.status`); later adopters or the same adopter seeing status==ESCALATED skip the telegram silently
- [ ] No abandonment of router duty: router delegates tree-hygiene (P1.5-AF-2) but still owns the adoption probe logic (it must fire before EVERY new dispatch, not just re-dispatches)

**DoD Locks Baked (PO-S7/S8/S9):**
- DoD-P15-1 — router P1.5-AF-1 DEFERS tree-hygiene to dev-team P1.5-AF-2; router never reverts uncommitted live-effect edits
- DoD-P15-2 — read-only `task_list_held` probe for published artifacts (not task_heartbeat/claim)
- DoD-P15-3 — adopter carries-forward redispatch_count from signal payload
- DoD-P15-6 — honest-bound line in the skill/flow doc

**Files to read first:**
- `docs/agents/agent-father/flow/main.md` (Step 2.5 PRE-CLAIM gate — created in TASK_1976)
- `.claude/skills/dispatch-claim/SKILL.md` (current dispatch-claim logic; adoption probe extends or lives nearby)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§6.5.3..§6.5.6` (adoption contract + resume specs)
- Project memory: `feedback_guaranteed_slot_week_key_double_post` (published artifact dedup rationale)

**Files to modify:**
- `docs/agents/agent-father/flow/main.md` or `.claude/skills/dispatch-claim/SKILL.md` (adoption probe logic)
- `.claude/skills/task-lock/SKILL.md` or new `.claude/skills/orphan-adoption/SKILL.md` (reusable adoption flow)

**Dependencies:**
- TASK_1981 (P1 regression must pass to prove claim semantics before adopting)
- TASK_1985 (listHeldTasks filter must exist to query orphan-signals)

**Knowledge needed:**
- Brief §6.5.4 poison-task logic (N_MAX=3, escalation idempotency)
- Brief §6.5.5 resume-contract table (different checkpoints per task_kind)
- Honest-bound constraint (always-on reaper, not an agent, so no execution — only adoption readiness)

## Context

The router is the sole entry point for new work. Before spawning any agent, it now checks: are there orphaned tasks for this role that should be resumed first? If yes, it routes them for adoption (via a spawn of agent-father + dev-team pipeline). This ensures crashed work is not abandoned.

Escalation ensures a broken task (crashes every adopter) does not loop forever. The BUG channel alerts the human.

## Success Signal

- Acceptance test: inject an orphan-signal row with `redispatch_count=2`, confirm router step 2.5 reads it and attempts to re-claim
- Acceptance test: inject an orphan-signal with `redispatch_count=3`, confirm router emits BUG telegram and marks ESCALATED, then skips re-dispatch
- Acceptance test: same signal re-read by the router later, confirm no redundant BUG telegram (idempotent)
- Manual verification: kill a dev-team session mid-sprint-task, wait for reaper, new dev-team session comes online and reads the orphan-signal before picking new work
