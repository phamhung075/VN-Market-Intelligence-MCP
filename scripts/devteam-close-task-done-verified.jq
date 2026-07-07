# scripts/devteam-close-task-done-verified.jq
#
# Generic dispatcher-side close: remove a task_board row (by id) from whichever
# lane it currently sits in (backlog/ready/in_progress/review/qa) and append it
# to done_verified with a signoff note. Used when a live raw-verify (recon,
# health probe, code grep) proves the task's AC is already satisfied — no
# worker spawn needed. Generalizes the one-off pattern first used for
# FIX-SBV-FX-VPS-FETCHER-UNHEALTHY (BOUNDED-1 pre-verify, see memory
# project_bounded1_first_pickup_stale_backlog_hygiene_debt) to any lane.
#
# Usage:
#   jq --arg now "$NOW" --arg tid "$TID" --arg note "$NOTE" --arg by "$BY" \
#      -f scripts/devteam-close-task-done-verified.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Required --arg:
#   now   — current UTC ISO ("$(date -u +%Y-%m-%dT%H:%M:%SZ)")
#   tid   — task_board row id to close
#   note  — signoff_note text (the raw-verify evidence)
#   by    — verified_by / last_triaged_by attribution string

(["backlog","ready","in_progress","review","qa"]) as $lanes
| ([$lanes[] as $lane | .task_board[$lane][]? | select(.id == $tid)] | first) as $row
| reduce $lanes[] as $lane (.; .task_board[$lane] = (.task_board[$lane] | map(select(.id != $tid))))
| .task_board.done_verified = (.task_board.done_verified + [
    $row + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: $by,
      verified_at: $now,
      signoff_note: $note
    }
  ])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $by
| if (.head.active_task_id == $tid) then
    .head = {
      status: "idle",
      active_task_id: null,
      next_agent: null,
      next_action: "task closed done_verified by raw pre-verify — awaiting next dispatch",
      updated_at: $now,
      updated_by: $by
    }
  else . end
