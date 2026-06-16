# Router 2026-06-16 — dev-team execute-tier (INLINE): dispatch the INFOCARD-EXPAND-FETCH epic to make the user's
# standing goal REAL (source-link + click-to-expand full-detail for re-check) — not just backlog-queued.
#
# Coding WIP is free (CI-RED in review = verification lane; SSC done_verified; ARCH-CRON = architect blueprint).
# Dispatch the 2 INDEPENDENT, disjoint-zone tasks in parallel (WIP=2 coding lanes):
#   - FIX-SIGNALS-STOCK-FULL-DETAIL  -> dev-mcp-server (BLOCKING; apps/mcp-server backend — expose full finding_data
#       for ALL signal types + normalize created_at to canonical ISO server-side)
#   - FIX-CASCADE-CARD-INVALID-DATE  -> dev-frontend   (apps/frontend FE-only date-parse helper; independent of the
#       backend fetch-gap, runs in parallel)
# FIX-INFOCARD-DROPDOWN-EXPAND STAYS in backlog, marked blocked_by FIX-SIGNALS-STOCK-FULL-DETAIL (the dropdown's REAL
# detail needs the backend exposed first) — dispatched once #1 lands.
#
# Disjoint zones (mcp-server vs frontend) + disjoint files => parallel-safe. NO-branches => both on main; commit-mutex
# (task:<id>, claimed by the router pre-spawn) + git index-lock retry serialize commits.
#
# GUARD: refuse unless BOTH dispatched tids uniquely in backlog[]. CONSERVATION: 6-lane total UNCHANGED
# (backlog -2, in_progress +2; the #3 in-place blocked_by annotation does not change counts). null-id backlog rows
# are null-safe (.id? // "").
# Usage: jq --arg now "$NOW" -f scripts/router-d94-infocard-dispatch-claim-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-SIGNALS-STOCK-FULL-DETAIL" as $lead
| "FIX-CASCADE-CARD-INVALID-DATE" as $fe
| "FIX-INFOCARD-DROPDOWN-EXPAND" as $drop
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before6
| ([.task_board.backlog[]?|select((.id? // "")==$lead)]|length) as $nl
| ([.task_board.backlog[]?|select((.id? // "")==$fe)]|length) as $nf
| if $nl != 1 then error("lead not uniquely in backlog[] — refuse: " + ($nl|tostring)) else . end
| if $nf != 1 then error("fe-date not uniquely in backlog[] — refuse: " + ($nf|tostring)) else . end
| ([.task_board.backlog[]?|select((.id? // "")==$lead)][0]) as $leadtask
| ([.task_board.backlog[]?|select((.id? // "")==$fe)][0]) as $fetask
| ($leadtask + {status:"IN_PROGRESS", next_agent:"dev-mcp-server", dispatched_at:$now, dispatched_by:"dev-team", dispatched_to:"dev-mcp-server"}) as $leadp
| ($fetask  + {status:"IN_PROGRESS", next_agent:"dev-frontend",   dispatched_at:$now, dispatched_by:"dev-team", dispatched_to:"dev-frontend"}) as $fep
# remove #1,#2 from backlog; annotate #3 blocked_by #1 in place
| .task_board.backlog = [ .task_board.backlog[]
    | if ((.id? // "")==$lead or (.id? // "")==$fe) then empty
      elif (.id? // "")==$drop then . + {blocked_by:[$lead], blocked_note:"dropdown REAL detail needs FIX-SIGNALS-STOCK-FULL-DETAIL exposed first; dispatch after #1 done_verified"}
      else . end ]
| .task_board.in_progress = (.task_board.in_progress + [ $leadp, $fep ])
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$lead, next_agent:"dev-mcp-server", rebuild_required:true,
    next_action:("INFOCARD-EXPAND-FETCH epic dispatched INLINE to ship the user standing-goal (source-link + click-to-expand full-detail for re-check). PARALLEL (WIP=2): FIX-SIGNALS-STOCK-FULL-DETAIL -> dev-mcp-server (backend: expose full finding_data for ALL signal types + ISO-normalize created_at; rebuild mcp-server after) ; FIX-CASCADE-CARD-INVALID-DATE -> dev-frontend (reusable ISO-aware date helper, never 'Invalid Date'). FIX-INFOCARD-DROPDOWN-EXPAND held in backlog blocked_by #1. On dev return: router RAW-verifies code+tests first-hand -> review -> qa -> live RAW verify (real fetched detail renders + source link + valid date). PUSH held (PO out-of-band)."),
    note:("ROUTER " + $now + " — dev-team execute-tier INLINE: claimed FIX-SIGNALS-STOCK-FULL-DETAIL (dev-mcp-server, blocking) + FIX-CASCADE-CARD-INVALID-DATE (dev-frontend) backlog->in_progress for parallel bg dispatch. Disjoint zones; commit-mutex per task; commit by pathspec form (git commit -m -- <paths>). #3 dropdown blocked_by #1.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on a backlog->in_progress dispatch of 2 tasks") else . end
