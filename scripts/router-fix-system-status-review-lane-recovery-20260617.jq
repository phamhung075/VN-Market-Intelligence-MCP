# Router 2026-06-17 — guarded recovery for FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD half-applied lane move.
#
# dev-mcp-server (background agent ac3e0493868839b95) finished the fix and committed orch board move
# 656c419a "READY -> REVIEW". RAW-verify (router, first-hand) of that commit showed the move was HALF-applied:
#   - .head correctly set: status=review, next_agent=qa, active_task_id=FIX-SYSTEM-STATUS, by=dev-mcp-server;
#   - the task ROW status set READY->REVIEW + review_note added;
#   - BUT the physical row was LEFT in .task_board.ready[0] (never relocated to .task_board.review[]),
#     and the row's own next_agent stayed "dev-mcp-server" (only .head.next_agent became "qa").
# Net defect: a status=REVIEW row living in ready[] with next_agent=dev-mcp-server — lane/status mismatch
# AND a re-dispatch hazard (a ready-lane scan keyed on row.next_agent could re-spawn dev-mcp-server on
# already-completed work). The agent's session has ended → router completes the move it intended
# (dead-agent recovery; status already decided by the agent = REVIEW, router invents no new status).
#
# Action: relocate the row ready[] -> review[] (prepend), normalize row next_agent/route_to = "qa" to match
# .head, stamp a router_recovery note. .head left UNTOUCHED (already correct). Code fix itself RAW-verified
# generic + honest: withSectionDeadline(label,work,3000ms) Promise.race over all 4 async sections of
# getSystemStatus (DB_STATUS/SOURCE_HEALTH/DATA_FRESHNESS/RECENT_ERRORS), timeout text
# "[LABEL] timeout/unknown — section exceeded 3000ms deadline" (no synthetic ok), no source allowlist.
# done_verified WITHHELD — REBUILD_REQUIRED:YES, live verify (bounded get_system_status with a stalled
# source) only confirmable AFTER ops rebuilds the mcp-server container.
#
# GUARD: refuse unless FIX-SYSTEM-STATUS uniquely in ready[] (count==1) AND its status == REVIEW.
# CONSERVATION: 6-lane total UNCHANGED (ready -1, review +1). Atomic temp->mv applied by caller.
# Usage: jq --arg now "$NOW" -f scripts/router-fix-system-status-review-lane-recovery-20260617.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD" as $id
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) as $before6
| ([ .task_board.ready[] | select((.id // .task_id // "")==$id) ] | length) as $cnt
| if ($cnt != 1) then error("GUARD: FIX-SYSTEM-STATUS not uniquely in ready[] — count=" + ($cnt|tostring)) else . end
| ( .task_board.ready[] | select((.id // .task_id // "")==$id) | .status ) as $st
| if (($st|ascii_upcase) != "REVIEW") then error("GUARD: ready row status not REVIEW — got " + ($st|tostring)) else . end
| ([ .task_board.ready[] | select((.id // .task_id // "")==$id)
      | . + {next_agent:"qa", route_to:"qa",
             router_recovery:("ROUTER " + $now + " — relocated ready[]->review[] to match dev-mcp-server-set status REVIEW (commit 656c419a updated .head + row.status but left the row physically in ready[] with next_agent=dev-mcp-server). Lane/status now consistent; row-based re-dispatch hazard removed. .head untouched (already status=review/next_agent=qa). done_verified WITHHELD — REBUILD_REQUIRED:YES, live verify pending ops rebuild.") } ]) as $moved
| .task_board.ready = [ .task_board.ready[] | select((.id // .task_id // "")!=$id) ]
| .task_board.review = ( $moved + .task_board.review )
| ._updated_at=$now | ._updated_by="router"
| .task_board._updated_at=$now | .task_board._updated_by="router"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on FIX-SYSTEM-STATUS review-lane recovery") else . end
