# Generic router board dispatch: promote ONE ready[] row -> in_progress[] + set .head.
# Guards: WIP<2 after promote is required (refuse at >=2), row must exist exactly once in ready[].
# Params (all --arg, injection-safe):
#   $tid   task id to promote          $now    UTC ISO timestamp
#   $agent next_agent to spawn         $note   dispatch_note appended to the row
#   $hnote .head note
# Usage:
#   jq --arg tid "<ID>" --arg now "$NOW" --arg agent "<agent>" --arg note "..." --arg hnote "..." \
#      -f scripts/dev-team-ready-dispatch.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
([.task_board.in_progress[]?] | length) as $wip
| if $wip >= 2 then error("WIP guard: in_progress already at " + ($wip|tostring) + " — refuse") else . end
| ([.task_board.ready[]? | select(.id==$tid)] | length) as $n
| if $n != 1 then error("ready-guard: expected exactly 1 ready row " + $tid + ", found " + ($n|tostring)) else . end
| ([.task_board.ready[] | select(.id==$tid)][0]) as $row
| .task_board.ready = [.task_board.ready[] | select(.id != $tid)]
| .task_board.in_progress += [$row + {
    status: "IN_PROGRESS",
    claimed_at: $now,
    claimed_by: "router",
    dispatched_at: $now,
    next_agent: $agent,
    dispatch_note: $note
  }]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: $tid,
    next_agent: $agent,
    note: $hnote
  }
