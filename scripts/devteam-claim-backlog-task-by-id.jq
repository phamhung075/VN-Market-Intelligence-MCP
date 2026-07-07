# scripts/devteam-claim-backlog-task-by-id.jq
#
# Targeted backlog[]->in_progress[] claim for a SPECIFIC task id + sets
# .head, for the Step 2 "type FIX -> skip -> direct to Step 3" dispatch path
# (docs/agents/dev-team/flow/main.md Step 2 table) — distinct from the
# priority-rank+FIFO BOUNDED-1 idle-pickup lane
# (scripts/devteam-backlog-promote-bounded1.jq / -claim-bounded1.jq), which
# must NOT be used here: PO's explicit BATCH triage verdict on a specific
# task (e.g. a blocking CI-red fix) can rank behind an unrelated row on the
# generic priority+FIFO sort, so this script claims by id directly instead
# of re-deriving the pick.
#
# No-op (identity) if the id is not found in backlog[] (e.g. already
# claimed by a peer session) — safe to re-run.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   jq --arg now "$NOW" --arg tid "$TID" --arg agent "$AGENT" --arg by "$BY" \
#      -f scripts/devteam-claim-backlog-task-by-id.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Required --arg:
#   now    — current UTC ISO
#   tid    — task_board.backlog[] row id to claim
#   agent  — resolved specialist agent name (zone-detect skill output)
#   by     — claimed_by / updated_by attribution string

([ .task_board.backlog[] | select(.id == $tid) ] | first) as $picked
| if ($picked == null) then
    .   # not in backlog (peer already claimed, or bad id) — no-op
  else
    .task_board.backlog = [ .task_board.backlog[] | select(.id != $tid) ]
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: $by
          })
      ])
    | .head = {
        status: "in_progress",
        active_task_id: $tid,
        next_agent: $agent,
        next_action: ("PO-triaged FIX dispatch of " + $tid + " — dispatcher-wrap then JUMP TO execute."),
        updated_at: $now,
        updated_by: $by
      }
  end
