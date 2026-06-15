# Router dev-team — Step 3 execute-tier: dispatch F-BOP-ENCODING -> dev-macro-indicators (FIRST of serialized accuracy pair).
# PO BATCH (commit c75398a3) RAW-verified by router: F-BOP-ENCODING READY, sequence_after=null, owner dev-macro-indicators,
#   zone apps/macro-indicators/, no recon. F-NSO-SELECTOR HELD sequence_after=F-BOP-ENCODING (serialize, same owner/zone).
#   dev-macro in_progress=[] (0 contention, WIP ok). PO head-write clobbered by SSOT race -> live head still next_agent=po (correct dispatch precondition).
# This write (ONE atomic temp->rename): F-BOP-ENCODING READY->in_progress + dispatch markers; head po->dev. 0 new id-lines (status flip only). Commit explicit path only.
# GUARD: refuse unless head.next_agent=="po" AND F-BOP-ENCODING status=="READY".
# Usage: jq --arg now "$NOW" --arg agent "$AGENTID" -f scripts/router-d39-fbop-encoding-dispatch-20260615.jq docs/data/orch/orch-state.json
def BOP: "F-BOP-ENCODING";
($ARGS.named.now) as $now
| ($ARGS.named.agent) as $agent
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==BOP))][0]) as $bop
| if (.head.next_agent != "po") then error("head.next_agent != po (\(.head.next_agent)) — refuse")
  elif ($bop == null) then error("F-BOP-ENCODING not found — refuse")
  elif (($bop.status // "") != "READY") then error("F-BOP-ENCODING status != READY (\($bop.status)) — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]?
    | if (type=="object" and ((.id // "")==BOP))
        then (. + {status:"in_progress", dispatched_at:$now, dispatched_to:"dev-macro-indicators", dispatch_agent_id:$agent})
        else . end ]
| .task_board.backlog = [ .task_board.backlog[]?
    | if (type=="object" and ((.id // "")==BOP))
        then (. + {status:"in_progress", dispatched_at:$now, dispatched_to:"dev-macro-indicators", dispatch_agent_id:$agent})
        else . end ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: BOP,
    next_agent: "dev",
    note: "F-BOP-ENCODING DISPATCHED -> dev-macro-indicators (agent \($agent)). FIRST of serialized ACCURACY pair (size S, /goal#1 'best result' real-data layer for bop, after RELIABILITY layer F-MACRO-FETCH-DEADLINE+VMT-8 done_verified). ROOT: get_vn_bop degrades blocked_reason='context deadline exceeded' = FetchBudgetSec=8s bound firing on a MALFORMED (un-URL-encoded) SBV Liferay OData filter — spaces in the $filter query reach SBV un-encoded -> request never resolves -> 8s ctx deadline. FIX (generic): URL-encode the OData filter (url.Values/url.QueryEscape) in usecases_vmt_bop.go so the SBV request is well-formed -> real bop data returns within budget. No recon (proxy UP, NSO index 85867 bytes; this is pure encoding). Rebase 94b49f44 BEFORE editing usecases_vmt_bop.go. GATE: unit test asserting filter spaces are %20/+-encoded in the built URL; build/vet/test green; do NOT touch VMT-8 degrade builders or FetchBudgetSec const. SEQUENCED-AFTER (HELD, same owner/zone, serialize): F-NSO-SELECTOR (recon-first via ops-vps-fetch on new NSO WordPress HTML, then dev-macro-indicators). WIP: dev-macro in_progress=1 (this), budget<=2 OK. On dev return -> router RAW-verify gates GREEN (on-main; files all apps/macro-indicators/**; foreign-capture NONE; independent uncached go build/vet/test) -> head dev->ops REBUILD macro-indicators (force-recreate single svc, NEVER compose down) -> LIVE re-probe get_vn_bop across >=2 timing windows: must return REAL bop data (is_estimate=false OR honest degraded if SBV genuinely down) within gateway deadline -> done_verified -> release F-NSO-SELECTOR. Commit explicit path only."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
