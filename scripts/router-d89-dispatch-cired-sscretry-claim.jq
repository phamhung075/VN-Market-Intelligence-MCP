# Router 2026-06-16 — dev-team tick Step 3: claim 2 ready[] FIX tasks -> in_progress[] for parallel dispatch.
#
# After PO BATCH (s88, committed b737fdb5+cad3af02) the router routes per Step 2/3. Two disjoint-zone FIX tasks
# go into execution this tick, honoring WIP<=2 CODING lanes:
#   - FIX-CI-RED-STANDING-1837A-1352A  -> dev-mcp-server  (LEAD, blocking:true; zone apps/mcp-server/; the standing
#       `bun test` RED on 1837a head.status enum + 1352a async-extraction-race — gates the fleet push + 4 ci_green tasks)
#   - FIX-BCTC-SSC-503-RETRY           -> dev-vps-crawls  (zone apps; file vps-scripts/discover-bctc-urls-browser.py —
#       a Python VPS scraper OUTSIDE the pnpm/bun CI path, so disjoint from the lead and the push-gate)
# Disjoint zones + disjoint files => parallel-safe. NO-branches directive (CLAUDE.md) => both work on main; commit-mutex
# (task:<id>, claimed separately by the router pre-spawn) + git index-lock retry serialize the two commits.
#
# AUDITOR-EMIT (review, next_agent=qa) is NOT touched here — qa reads it from review[] (verification, not a coding lane).
# FIX-ALERT-FINGERPRINT stays review-monitored for the market-open dedup-drain — NOT touched.
#
# .head points to the LEAD (CI-RED) for crash-resume; the parallel sibling (SSC-RETRY) is listed in head.note + carries
# its own in_progress[] row so a mid-tick crash resumes both. next_agent=dev-mcp-server (the lead's agent).
#
# GUARD: refuse unless BOTH tids are uniquely in ready[]. CONSERVATION: total UNCHANGED (ready -2, in_progress +2).
# Usage: jq --arg now "$NOW" -f scripts/router-d89-dispatch-cired-sscretry-claim.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-CI-RED-STANDING-1837A-1352A" as $lead
| "FIX-BCTC-SSC-503-RETRY" as $sib
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before
| ([.task_board.ready[]?|select(.id==$lead)]|length) as $nl
| ([.task_board.ready[]?|select(.id==$sib)]|length) as $ns
| if $nl != 1 then error("lead not uniquely in ready[] — refuse claim: " + ($nl|tostring)) else . end
| if $ns != 1 then error("sibling not uniquely in ready[] — refuse claim: " + ($ns|tostring)) else . end
| ([.task_board.ready[]?|select(.id==$lead)][0]) as $leadtask
| ([.task_board.ready[]?|select(.id==$sib)][0]) as $sibtask
| ($leadtask + {status:"IN_PROGRESS", dispatched_at:$now, dispatched_by:"dev-team", dispatched_to:"dev-mcp-server"}) as $leadp
| ($sibtask  + {status:"IN_PROGRESS", dispatched_at:$now, dispatched_by:"dev-team", dispatched_to:"dev-vps-crawls"}) as $sibp
| .task_board.ready = [ .task_board.ready[] | select(.id!=$lead and .id!=$sib) ]
| .task_board.in_progress = (.task_board.in_progress + [ $leadp, $sibp ])
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$lead, next_agent:"dev-mcp-server", rebuild_required:false,
    next_action:("PARALLEL DISPATCH (WIP=2 coding lanes): LEAD FIX-CI-RED-STANDING-1837A-1352A -> dev-mcp-server (make 1837a head.status enum + 1352a async-extraction-race GREEN; blocking — unblocks fleet push + 4 ci_green tasks) + SIBLING FIX-BCTC-SSC-503-RETRY -> dev-vps-crawls (1-retry+60s backoff in _ssc_curl_search step1; vps-scripts python, outside CI path). Both on main, commit-mutex serialized. On dev return: router RAW-verifies code+tests first-hand -> review -> qa. AUDITOR-EMIT in review awaits qa live-emit probe. FIX-ALERT-FINGERPRINT review-monitored for market-open dedup-drain (do NOT flip). PUSH held (PO out-of-band, gated on CI-RED green)."),
    note:("ROUTER " + $now + " — dev-team Step 3: claimed FIX-CI-RED-STANDING-1837A-1352A (lead, dev-mcp-server) + FIX-BCTC-SSC-503-RETRY (sibling, dev-vps-crawls) ready->in_progress for parallel background dispatch. Disjoint zones/files; commit-mutex per task. WIP=2 coding lanes (ARCH-CRON-SCHEDULER-RELIABILITY is architect blueprint, not a coding lane). AUDITOR-EMIT -> qa (verification, separate). PUSH held.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a ready->in_progress claim of 2 tasks") else . end
