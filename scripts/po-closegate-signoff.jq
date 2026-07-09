# =============================================================================
# scripts/po-closegate-signoff.jq
# =============================================================================
# PO Step-6 Close Gate sign-off — ATOMIC review[] -> done_verified[] flip
# + conditional top-level .head reset + optional tracking backlog-row mint,
# in ONE jq expression through scripts/orch-apply.sh (single Zod/coherence/
# CAS-guarded write).
#
# Role-named, fully-generalized permanent PO counterpart of
# scripts/ops-closegate-handoff.jq / scripts/qa-closegate-handoff.jq. Retires
# the task-named one-off anti-pattern (e.g.
# scripts/po-s18-factory-domain-split-cascade-engine-signoff.jq, whose body was
# already generic but whose FILENAME hardcoded a task id) — every task this
# script closes is supplied entirely via --arg/--slurpfile at call time, NO
# hardcoded task-id / lane / prose literal anywhere in the filter body
# (grep-verifiable, matching router-d1-claim.jq / ops-closegate-handoff.jq).
#
# WHY ONE EXPRESSION (load-bearing): the Docker Microservice Code-Change Close
# Gate had router-caught .head/board desyncs at Step-4 (f4afa0e03, b907a8ea6),
# permanently fixed via docs/architecture-briefs/2026-07-09-closegate-step4-
# atomic-handoff.md + scripts/ops-closegate-handoff.jq. Step-6 must NOT
# reintroduce the gap: the review->done_verified row move and the .head reset
# happen together here, never in two writes.
#
# INPUTS:
#   --arg       tid       the REVIEW-lane task id to close.
#   --arg       now       UTC ISO-8601 timestamp (single value, reused everywhere).
#   --slurpfile closeout  file holding ONE object { verdict, evidence,
#                         process_note, residual_advisory } -> $closeout[0].
#   --slurpfile backlog   file holding ONE array of 0..N tracking-row objects
#                         (BACKLOG lane, sans created_at) -> $backlog[0].
#                         Empty array [] mints nothing (optional mint).
#
# BEHAVIOR (single pipeline):
#   1. Gate-guard: error() if $tid is absent from .task_board.review[] (never a
#      silent no-op).
#   2. Move that row review[] -> done_verified[]; status -> DONE_VERIFIED;
#      stamp moved_to_done_verified_at/closed_at/po_closeout. Row's own
#      next_agent is LEFT as-is — task-row schema next_agent is
#      z.string().optional() and rejects raw null; top-level .head is the
#      authoritative router (feedback_orchstate_dual_head_keys_toplevel_authoritative).
#   3. CONDITIONALLY reset top-level .head to terminal-idle ONLY when it is
#      actually pointing at $tid (never stomp an unrelated in-flight pointer) —
#      status=done / active_task_id=null / next_agent=router so the next
#      BOUNDED-1 idle-capacity pickup is unblocked.
#   4. Mint each tracking backlog row (BACKLOG lane; created_at stamped from
#      $now). Empty $backlog[0] -> no-op.
#
# USAGE (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg tid "$TASK_ID" --arg now "$NOW" \
#      --slurpfile closeout /path/closeout.json \
#      --slurpfile backlog  /path/backlog.json \
#      -f scripts/po-closegate-signoff.jq docs/data/orch/orch-state.json \
#      | bash scripts/orch-apply.sh
#
# Pointer: docs/protocols/docker-deployment-runbook.md § Microservice
# Code-Change Close Gate, Step 6 (po final sign-off / DONE_VERIFIED close).
# =============================================================================

($closeout[0]) as $co
| ($backlog[0] // []) as $brs
| (.task_board.review | map(select(.id == $tid))) as $matches
| if ($matches | length) == 0
  then error("po-closegate-signoff gate-guard: task \($tid) not found in .task_board.review[] — refusing (no silent no-op)")
  else . end
| ($matches[0] + {
      status: "DONE_VERIFIED",
      moved_to_done_verified_at: $now,
      closed_at: $now,
      po_closeout: ({ by: "po", at: $now } + $co)
   }) as $closed_row
| .task_board.review        |= map(select(.id != $tid))
| .task_board.done_verified += [$closed_row]
| .task_board.backlog       += ($brs | map(. + { created_at: $now }))
| if (.head.active_task_id == $tid)
  then .head = {
      status:         "done",
      active_task_id: null,
      next_agent:     "router",
      updated_at:     $now,
      updated_by:     "po"
    }
  else . end
