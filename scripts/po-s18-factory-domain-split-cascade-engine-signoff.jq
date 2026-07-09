# =============================================================================
# scripts/po-s18-factory-domain-split-cascade-engine-signoff.jq
# =============================================================================
# PO Step-6 Close Gate sign-off — ATOMIC review[] -> done_verified[] flip
# + top-level .head sync + tracking backlog-row mint, in ONE jq expression
# through scripts/orch-apply.sh (single Zod/coherence/CAS-guarded write).
#
# WHY ONE EXPRESSION (load-bearing): the Docker Microservice Code-Change Close
# Gate had 2 router-caught .head/board desyncs at Step-4 for this exact task_id
# (f4afa0e03 2026-07-08, b907a8ea6 2026-07-09), permanently fixed via
# docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md +
# scripts/ops-closegate-handoff.jq. Step-6 must NOT reintroduce the gap: the
# board-row move and the .head reset happen together here, never in two writes.
#
# GENERALIZED (no hardcoded task-id / lane / prose literals — grep-verifiable),
# following the precedent of scripts/router-d1-claim.jq /
# scripts/devteam-backlog-claim-bounded1.jq / scripts/ops-closegate-handoff.jq.
#
# INPUTS:
#   --arg       tid       the REVIEW-lane task id to close
#   --arg       now       UTC ISO-8601 timestamp (single value, reused everywhere)
#   --slurpfile closeout  [ { verdict, evidence, process_note, residual_advisory } ]
#   --slurpfile backlog   [ { the tracking backlog row (BACKLOG lane), sans created_at } ]
#
# BEHAVIOR (single pipeline):
#   1. Gate-guard: refuse (error) if $tid is absent from .task_board.review[].
#   2. Move that row review[] -> done_verified[]; status -> DONE_VERIFIED;
#      stamp moved_to_done_verified_at/closed_at/po_closeout. Row's own
#      next_agent is LEFT as-is ("po") — task-row schema next_agent is
#      z.string().optional() and rejects raw null; top-level .head is the
#      authoritative router (feedback_orchstate_dual_head_keys_toplevel_authoritative).
#   3. CONDITIONALLY reset top-level .head to terminal-idle ONLY when it is
#      actually pointing at $tid (never stomp an unrelated in-flight pointer) —
#      status=done / active_task_id=null / next_agent=router so the next
#      BOUNDED-1 idle-capacity pickup is unblocked.
#   4. Mint the tracking backlog row (BACKLOG lane; created_at stamped from $now).
# =============================================================================

($closeout[0]) as $co
| ($backlog[0]) as $br
| (.task_board.review | map(select(.id == $tid))) as $matches
| if ($matches | length) == 0
  then error("po-signoff gate-guard: task \($tid) not found in .task_board.review[] — refusing (no silent no-op)")
  else . end
| ($matches[0] + {
      status: "DONE_VERIFIED",
      moved_to_done_verified_at: $now,
      closed_at: $now,
      po_closeout: ({ by: "po", at: $now } + $co)
   }) as $closed_row
| .task_board.review        |= map(select(.id != $tid))
| .task_board.done_verified += [$closed_row]
| .task_board.backlog       += [ ($br + { created_at: $now }) ]
| if (.head.active_task_id == $tid)
  then .head = {
      status:         "done",
      active_task_id: null,
      next_agent:     "router",
      updated_at:     $now,
      updated_by:     "po"
    }
  else . end
