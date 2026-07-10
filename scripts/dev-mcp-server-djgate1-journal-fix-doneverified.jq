# =============================================================================
# scripts/dev-mcp-server-djgate1-journal-fix-doneverified.jq
# =============================================================================
# DJ-GATE-1 hold fix — atomic review[] -> done_verified[] flip + top-level
# .head idle-reset, for a REVIEW-lane row that QA already RAW-verified and
# held ONLY on the missing decision-journal entry (no fresh QA pass needed
# per QA's own RETURN, docs/protocols/agent-chaining-protocol.md § Journal-
# before-DONE Gate). Executed by dev-mcp-server per explicit dev-team
# dispatcher instruction (row's own next_agent already pointed back at
# dev-mcp-server for exactly this action).
#
# Generalized (--arg-parameterized, NO hardcoded task-id/lane literal in the
# filter body — grep-verifiable), matching the scripts/*-closegate-*.jq /
# scripts/qa-factory-*-done-verified.jq gate-guard + single-jq-expression
# atomic board+.head write convention (feedback_close_gate_step4_head_sync_gap).
#
# INPUTS:
#   --arg tid    the REVIEW-lane task id to close.
#   --arg now    UTC ISO-8601 timestamp (single value, reused everywhere).
#   --arg by     closing agent id (e.g. "dev-mcp-server").
#   --arg note   status_note to stamp on the closed row (supersedes the
#                "journal-missing" note it was held on).
#
# BEHAVIOR (single pipeline):
#   1. Gate-guard: error() if $tid is absent from .task_board.review[], or its
#      current status is not "REVIEW" — never a silent no-op.
#   2. Move that row review[] -> done_verified[]; status -> DONE_VERIFIED;
#      stamp moved_to_done_verified_at/closed_at/closed_by/status_note; drop
#      the stale row-level next_agent key (TaskSchema.next_agent is
#      z.string().optional() — NOT nullable — so it is deleted, not nulled;
#      terminal rows route via top-level .head, not their own next_agent).
#   3. CONDITIONALLY reset top-level .head to idle ONLY when it is actually
#      pointing at $tid (never stomp an unrelated in-flight pointer):
#      status=idle / active_task_id=null / next_agent=null.
#
# USAGE (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg tid "$TASK_ID" --arg now "$NOW" --arg by "dev-mcp-server" \
#      --arg note "<resolution note>" \
#      -f scripts/dev-mcp-server-djgate1-journal-fix-doneverified.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate.
# =============================================================================

(.task_board.review // []) as $rv
| ([$rv[] | select(type == "object" and .id == $tid)][0]) as $t
| if $t == null then
    error("dev-mcp-server-djgate1-journal-fix: task \($tid) not found in .task_board.review[] — refuse")
  elif ($t.status != "REVIEW") then
    error("dev-mcp-server-djgate1-journal-fix: task \($tid) status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t
    + {
        status: "DONE_VERIFIED",
        moved_to_done_verified_at: $now,
        closed_at: $now,
        closed_by: $by,
        status_note: $note,
        updated_at: $now,
        updated_by: $by
      }
    | del(.next_agent)
  ) as $closed_row
| .task_board.review        = [$rv[] | select(.id != $tid)]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$closed_row])
| if (.head.active_task_id == $tid) then
    .head = {
      status:         "idle",
      active_task_id: null,
      next_agent:     null,
      updated_at:     $now,
      updated_by:     $by
    }
  else . end
