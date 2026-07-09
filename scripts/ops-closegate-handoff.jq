# scripts/ops-closegate-handoff.jq
#
# FIX-CLOSEGATE-STEP4-ATOMIC-HANDOFF-SCRIPT — atomic board-row + .head write for
# the Docker Close Gate Step-4 -> qa handoff. Fixes the recurring bug where ops's
# ad-hoc, hand-rolled inline jq one-liners updated the board row's `next_agent`
# but forgot `.head` (or vice versa), because the two writes were never combined
# into one jq expression run through one orch-apply.sh call (memory:
# feedback_close_gate_step4_head_sync_gap, 2 confirmed occurrences: f4afa0e03,
# b907a8ea6). Root cause + full design: architecture brief
# docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md §2.1.
#
# Generalizes the same "board write + .head sync in ONE jq expression, one
# orch-apply.sh call" pattern already used by scripts/router-d1-claim.jq and
# scripts/devteam-backlog-claim-bounded1.jq — but with NO hardcoded task-id or
# lane literal anywhere in the filter body (grep-verifiable, matching
# devteam-backlog-claim-bounded1.jq's own self-declared invariant). Every task
# this script ever touches is supplied entirely via --arg at call time.
#
# Inputs (all via --arg, all required):
#   task_id     — the board row's `.id` to forward (e.g. a REVIEW-lane task).
#   from_lane   — the task_board lane the row currently lives in (e.g. "review").
#                 Status is NOT changed — ops does not flip REVIEW/DONE, only
#                 the handoff pointer. If ops needs to relocate the row to a
#                 different lane too, that is a SEPARATE write (out of scope
#                 for this atomic-handoff-only script).
#   next_agent  — the agent the row is being forwarded to (e.g. "qa").
#   now         — ISO-8601 UTC timestamp for any .head fields this run touches.
#
# Behavior, in ONE jq expression (single candidate through orch-apply.sh's
# single-candidate CAS-gated write — see scripts/orch-apply.sh header):
#   1. Locate `.task_board[$from_lane][] | select(.id == $task_id)`.
#      If absent -> error() (refuse — gate-guard convention matching
#      scripts/router-d1-claim.jq) — NEVER a silent no-op.
#   2. Set that row's `.next_agent = $next_agent` only. Row status/lane
#      untouched.
#   3. CONDITIONALLY, in the same expression: sync `.head.next_agent` /
#      `.head.updated_at` / `.head.updated_by` ONLY IF
#      `.head.active_task_id == $task_id`. `.head` can legitimately be
#      pointing at a DIFFERENT in-flight task while this task's board row
#      gets forwarded (confirmed live at brief-authoring time: .head was
#      parked on an unrelated task while a different REVIEW-lane row needed
#      forwarding) — a blind/unconditional `.head =` overwrite would stomp a
#      correct, unrelated pointer. This script never does that.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg task_id "$TASK_ID" --arg from_lane "review" --arg next_agent "qa" --arg now "$NOW" \
#     -f scripts/ops-closegate-handoff.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/protocols/docker-deployment-runbook.md § Microservice Code-Change
# Close Gate, Step 4b (ops -> qa forward).

(.task_board[$from_lane] // []) as $lane
| ($lane | map(select(.id == $task_id)) | .[0]) as $row
| if $row == null then
    error("ops-closegate-handoff: task_id \($task_id) not found in task_board.\($from_lane)[] — refuse to write (no silent no-op)")
  else . end
| .task_board[$from_lane] = [
    $lane[] | if .id == $task_id then . + { next_agent: $next_agent } else . end
  ]
| if .head.active_task_id == $task_id then
    .head.next_agent = $next_agent
    | .head.updated_at = $now
    | .head.updated_by = "ops"
  else . end
