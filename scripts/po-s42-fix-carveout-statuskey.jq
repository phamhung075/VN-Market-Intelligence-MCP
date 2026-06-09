# po-S42: fix carve_out status-key collision in FIX-CI-C7-ASSERTION-LOGIC
# Renames carve_outs[].status -> carve_outs[].triage_state (value preserved verbatim)
# to restore the single-status-key invariant (router raw-verify caught 2 status-ending
# paths in the C7 task object: .status + .carve_outs.0.status).
# Scoped to active_sprints[24].tasks only. All other carve_out fields unchanged.
# Pointer: docs/agents/po/flow/main.md (board-edit jq scripts) + docs/policies/dev-standards.md § Script Persistence
.task_board.active_sprints[24].tasks |= map(
  if .id == "FIX-CI-C7-ASSERTION-LOGIC" and (.carve_outs | type == "array")
  then .carve_outs |= map(
    if has("status")
    then . + {triage_state: .status} | del(.status)
    else . end
  )
  else . end
)
