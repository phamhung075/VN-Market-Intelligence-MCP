# Generic router board-claim: move one READY task -> in_progress[] (READY->IN_PROGRESS) + set .head.status=in_progress.
# Replaces the hardcoded one-off scripts/router-d1-claim.jq. Parameterized — works for ANY ready task.
# Invariant: router is the dev-dispatch board-writer ONLY when no other board-writer (PO) is active (lost-update guard).
#   The dev-dispatch lock (task_claim <taskid> task_kind sprint-task owner dev-team) MUST be held before running this.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router claim before dev spawn).
# Usage: jq --arg taskid "<ID>" --arg agent "<dev-zone>" --arg now "$NOW" --arg note "<dispatch note>" \
#          -f scripts/router-claim-ready-to-inprogress.jq docs/data/orch/orch-state.json > tmp && [ -s tmp ] && mv tmp ...
(.task_board.ready | map(select((.id // .task_id) == $taskid))[0]) as $t
| if $t == null then error("\($taskid) not in ready[] — refuse to claim")
  else . end
| .task_board.in_progress += [
    ($t + {
        status: "IN_PROGRESS",
        owner: $agent,
        next_agent: $agent,
        claimed_at: $now,
        claimed_by: "router",
        dispatch_note: $note
      })
  ]
| .task_board.ready |= map(select((.id // .task_id) != $taskid))
| .head = (.head + {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: $taskid,
    next_agent: $agent,
    note: $note
  })
| ._updated_at = $now
| ._updated_by = "dev-team"
