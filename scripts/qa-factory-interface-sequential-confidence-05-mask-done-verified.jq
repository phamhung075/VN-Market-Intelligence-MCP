# Board flip: FACTORY-INTERFACE-sequential-confidence-05-mask REVIEW -> DONE_VERIFIED
# Post-swap QA sanity check PASS (docker inspect image match, /health 200/toolCount
# 183 unchanged) + a NEW unrelated pre-existing bug discovered during the optional
# live-wire probe (sequential_market_analysis registerTool() handler-wiring defect,
# confirmed to predate this diff) filed as a separate backlog row
# FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER — does not block this task.
#
# GUARD: refuse unless FACTORY-INTERFACE-sequential-confidence-05-mask is in
# review[] with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note /path/to/review_note_append.txt \
#          -f scripts/qa-factory-interface-sequential-confidence-05-mask-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-INTERFACE-sequential-confidence-05-mask")][0]) as $t
| if $t == null then error("FACTORY-INTERFACE-sequential-confidence-05-mask not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-INTERFACE-sequential-confidence-05-mask status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-INTERFACE-sequential-confidence-05-mask") then
    error("head.active_task_id drifted away from FACTORY-INTERFACE-sequential-confidence-05-mask (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "post-swap sanity check PASS (qa, \($now)): docker inspect independently confirms image 180382145ee7 running+healthy; /health 200 toolCount=183 unchanged. Optional live-wire probe of sequential_market_analysis surfaced an unrelated PRE-EXISTING defect (registerTool() handler-wiring bug, confirmed to predate this diff via git show 1b1397025^) — filed as FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER, does not block this task. done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-INTERFACE-sequential-confidence-05-mask")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.backlog = ((.task_board.backlog // []) + [{
    id: "FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER",
    priority: "high",
    size: "S",
    status: "BACKLOG",
    title: "sequential_market_analysis MCP tool unreachable over the wire — registerTool() passes handler nested in config instead of the SDK's required 3rd positional callback arg, \"originalHandler is not a function\" on every real call (pre-existing, discovered during FACTORY-INTERFACE-sequential-confidence-05-mask post-swap QA sanity check, unrelated root cause)",
    type: "FIX",
    zone: "mcp-server-interface",
    detail_ref: "docs/data/orch/archive/backlog-detail.json#FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER"
  }])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "FACTORY-INTERFACE-sequential-confidence-05-mask DONE_VERIFIED (qa post-swap sanity check PASS \($now) — docker inspect image match + /health 200/toolCount 183 unchanged). NEW unrelated pre-existing bug discovered + filed during the optional live-wire probe: FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER (sequential_market_analysis registerTool() handler-wiring defect, confirmed pre-existing via git show 1b1397025^, zero relation to the confidence fix) — route to dev-mcp-server on a future dispatch cycle, not dispatched here."
| .head.updated_at = $now
| .head.updated_by = "qa"
