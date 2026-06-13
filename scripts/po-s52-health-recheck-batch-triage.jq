# po-s52-health-recheck-batch-triage.jq — promote health-recheck findings to .task_board.backlog
# Owner: PO triage (detect->task bridge, project_anomaly_task_bridge).
# Idempotent + GLOBAL dedup: skips any $tasks entry whose id already exists in ANY task_board array
#   (backlog/ready/in_progress/review/done/done_verified/active_sprints tasks/archive).
# Reusable for ANY batched PLAN-ONLY backlog append from a detector report.
# Usage:
#   jq --arg now "$NOW" --slurpfile batch scripts/<payload>.json \
#      -f scripts/po-s52-health-recheck-batch-triage.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp \
#   && [ -s /tmp/orch.tmp ] && mv /tmp/orch.tmp docs/data/orch/orch-state.json
# Flow-doc pointer: docs/agents/po/flow/main.md (Reusable triage scripts)
. as $root
# collect every id already known anywhere on the board (incl. nested active_sprints[].tasks[])
| [ .task_board
    | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.archive)[]?.id?,
      (.active_sprints[]?.tasks[]?.id?)
  ] as $known
| ($batch[0]) as $tasks
| ($tasks | map(select(.id as $id | ($known | index($id)) | not))) as $new
| if ($new | length) == 0
  then .                                    # nothing to add — fully deduped
  else .task_board.backlog += $new
       | .task_board._updated_at = $now
       | .task_board._updated_by = "po-s52-health-triage"
       | ._updated_at = $now
       | ._updated_by = "po-s52-health-triage"
  end
