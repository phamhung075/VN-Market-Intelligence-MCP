# po-s50-origin-lag-triage.jq — append PLAN-ONLY origin-lag task to .task_board.backlog
# Owner: PO triage. Idempotent: skips if id already present in backlog.
# Usage: jq -f scripts/po-s50-origin-lag-triage.jq docs/data/orch/orch-state.json > tmp && [ -s tmp ] && mv tmp orch-state.json
# Flow-doc pointer: docs/agents/po/flow/main.md (PLAN-ONLY triage append)
. as $root
| ($newtask) as $t
| if ([.task_board.backlog[]? | select(.id == $t.id)] | length) > 0
  then .                                   # idempotent: already triaged
  else .task_board.backlog += [$t]
       | .task_board._updated_at = $now
       | .task_board._updated_by = "po"
       | ._updated_at = $now
       | ._updated_by = "po"
  end
