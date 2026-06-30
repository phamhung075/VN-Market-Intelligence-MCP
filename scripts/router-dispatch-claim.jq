# Generic router board claim: move a ready[] task -> in_progress[] (READY->IN_PROGRESS) and set head.
# Replaces the one-off router-d1-claim.jq for any PO-dispatched (head.status=="dispatch") handoff.
# Refuses if $id is not in ready[] (gate guard) — prevents double-claim / stale dispatch.
# Idempotent-ish: if already absent from ready[], it errors loudly rather than duplicating in_progress.
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b pipeline-resume / Step 3 router claim before spawn).
# Usage: jq --arg now "$NOW" --arg id "$ID" --arg agent "$AGENT" --arg note "$NOTE" \
#          -f scripts/router-dispatch-claim.jq docs/data/orch/orch-state.json
(.task_board.ready | map(select(.id==$id))[0]) as $task
| if $task == null then error("\($id) not in ready[] — refuse to claim (stale or already dispatched)")
  else . end
| .task_board.in_progress += [
    ($task + {
        status: "IN_PROGRESS",
        claimed_at: $now,
        claimed_by: "router",
        next_agent: $agent,
        dispatch_note: $note
       })
  ]
| .task_board.ready |= map(select(.id != $id))
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: $id,
    next_agent: $agent,
    note: $note
  }
