# Router 2026-06-15T16:4xZ — dispatch OPS-BCTC-PIPELINE-RECON (P0) ready->in_progress -> ops-vps-fetch.
# P0 BCTC pipeline DEAD 34.3h, RAW-confirmed by PO :07 tick (get_bctc_full VCB empty / FPT stale 05-24 / VPS 0 pushes
# since 06-13 23:45 / enricher 0 URLs). ops lane = NOT a coding lane (bypasses WIP<=2 CODING cap). The 3 MEDIUM
# double-fire fixes (root A agents-architect, B+C dev-mcp-server) are DEFERRED to the next :07 tick (load mgmt — the
# codebase-analysis workflow wf_5b4cdead is running ~6 agents; do not pile coding agents on top -> host-starvation guard).
# GUARD: refuse unless task in ready[] AND not already past ready. CONSERVATION: total UNCHANGED (pure move).
# Usage: jq --arg now "$NOW" -f scripts/router-d78-dispatch-bctc-recon-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "OPS-BCTC-PIPELINE-RECON" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.ready[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in ready[] — refuse")
  elif ([.task_board.in_progress[]?,.task_board.review[]?,.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already past ready[] — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]? | select(.id!=$tid) ]
| .task_board.in_progress = (.task_board.in_progress + [ $t + {
      status:"IN_PROGRESS", lane:"ops", dispatched_ts:$now, dispatched_by:"dev-team", next_agent:"ops-vps-fetch",
      dispatch_note:"P0 BCTC pipeline DEAD 34.3h — ops-vps-fetch SSH recon FIRST to isolate {VPS-down | bctc-push-cron-stopped | geo-block/SSL regression (cf prior 13-day HNX TLS outage) | enricher 0-URL discovery stall}. RAW-confirmed: get_bctc_full(VCB)=empty, FPT stale 2026-05-24, VPS 0 pushes/24h since 06-13 23:45Z, 27 tickers filed-not-in-DB, enricher 0 URLs. 2nd recurrence of FIX-BCTC-VPS-PIPELINE-STALE-5D (recurring-bug-escalation class). Recon -> report root isolation -> PO routes structural fix to owning dev zone. Violates no-fake-data/real-fetch standing goal."
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops-vps-fetch",
    note:("DEV-TEAM DISPATCH " + $now + " — OPS-BCTC-PIPELINE-RECON(P0) ready->in_progress -> ops-vps-fetch (ops lane, NOT coding, bypasses WIP<=2). BCTC pipeline DEAD 34.3h RAW-confirmed (get_bctc_full VCB empty / FPT stale 05-24 / VPS 0 pushes since 06-13 23:45 / enricher 0 URLs). 2nd recurrence STALE-5D. 3 MEDIUM double-fire fixes (root A agents-architect, B+C dev-mcp-server) DEFERRED to next :07 tick (load mgmt — codebase-analysis workflow wf_5b4cdead running). FIX-SIGNAL-CONFIDENCE-DEFAULT-50 in review[] — router gate pending ORGANIC non-50 proof (monitor b2y31ggun armed; rebuild+code RAW-verified, only verify-* test-inserts non-50 so far). PUSH held (PO post-06-16-gates, 53 ahead).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
