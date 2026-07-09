# =============================================================================
# scripts/architect-arch-headless-gateway-cowork-nopost-closure.jq
# =============================================================================
# One-off closure write for ARCH-HEADLESS-GATEWAY-COWORK-NOPOST: task premise
# (cloud RemoteTrigger-fired cowork slots silently no-posting) is superseded —
# the RemoteTrigger backstop layer itself is retired (STANDING
# feedback_no_remote_trigger_all_local, ALL-LOCAL CUTOVER 2026-06-23T17:22Z),
# and the "detect gateway-missing, don't silently drop" principle the task
# asked for has already shipped multiple times against the CURRENT (local
# subagent gateway-blind) mechanism. See:
# docs/architecture-briefs/2026-07-09-arch-headless-gateway-cowork-nopost-closure.md
#
# Modeled on scripts/po-s18-factory-domain-split-cascade-engine-signoff.jq
# (atomic row-move + conditional .head sync, single orch-apply.sh write) and
# the task_board.archive[] "zombie task formally closed" precedent (BPE-ARCH-1).
#
# GENERALIZED SHAPE but this file is intentionally task-id-specific (one-off
# closure, not a reusable close-gate step) — the task id is a literal by
# design, matching the "one-off verification script" class in
# docs/policies/dev-standards.md § Script Persistence, not the "reusable
# close-gate helper" class (which stays generalized/no-literal, e.g.
# scripts/ops-closegate-handoff.jq).
#
# INPUTS:
#   --arg tid  "ARCH-HEADLESS-GATEWAY-COWORK-NOPOST"  (literal, this task only)
#   --arg now  UTC ISO-8601 timestamp (single value, reused everywhere)
#
# BEHAVIOR (single pipeline):
#   1. Gate-guard: refuse (error) if $tid is absent from .task_board.in_progress[].
#   2. Move that row in_progress[] -> archive[]; status -> DONE (objective
#      fulfilled by other, more current shipped work — not CANCELLED, nothing
#      was abandoned); stamp closed_at/closed_by/note.
#   3. CONDITIONALLY reset top-level .head to terminal ONLY when it is
#      actually pointing at $tid (never stomp an unrelated in-flight
#      pointer) — status=done / active_task_id=null / next_agent=router,
#      per the established Close-Gate convention (feedback_close_gate_step4_
#      head_sync_gap; dev-team/flow/main.md "head-idle fall-through").
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg tid "ARCH-HEADLESS-GATEWAY-COWORK-NOPOST" --arg now "$NOW" \
#     -f scripts/architect-arch-headless-gateway-cowork-nopost-closure.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# =============================================================================

(.task_board.in_progress | map(select(.id == $tid))) as $matches
| if ($matches | length) == 0
  then error("architect-closure gate-guard: task \($tid) not found in .task_board.in_progress[] — refusing (no silent no-op)")
  else . end
| ($matches[0] + {
      status:    "DONE",
      closed_at: $now,
      closed_by: "agents-architect",
      note: ("Superseded/closed — RemoteTrigger Layer A retired (all-local cutover 2026-06-23T17:22Z, "
             + "reconfirmed enabled:false live 2026-07-08T20:35Z); detect-missing-gateway/don't-silently-drop "
             + "principle already shipped against the current local-subagent gateway-blind mechanism "
             + "(blind-guard.md Step 0c, spawn-fanout.md Step 5.0, cycle-bootstrap CONFIRMED-BLIND fallback, "
             + "gateway-call-contract.md §6 Degraded Mode). See "
             + "docs/architecture-briefs/2026-07-09-arch-headless-gateway-cowork-nopost-closure.md")
   }) as $closed_row
| .task_board.in_progress |= map(select(.id != $tid))
| .task_board.archive     += [$closed_row]
| if (.head.active_task_id == $tid)
  then .head = {
      status:         "done",
      active_task_id: null,
      next_agent:     "router",
      updated_at:     $now,
      updated_by:     "agents-architect"
    }
  else . end
