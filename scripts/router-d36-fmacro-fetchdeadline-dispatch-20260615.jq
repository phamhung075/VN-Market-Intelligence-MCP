# Router dev-team — Step 3 execute-tier: dispatch F-MACRO-FETCH-DEADLINE -> dev-macro-indicators (lead reliability FIX).
# PO BATCH (commit ff92c745) RAW-verified by router: task READY in apps/macro-indicators/, owner dev-macro-indicators,
#   sequence_after=null (lead); F-BOP-ENCODING + F-NSO-SELECTOR HELD-sequenced after it (same files, serialized);
#   dev-zone in_progress=[] (0 contention); 2 PO signals RESOLVED. Triage lock released.
# This write (ONE atomic temp->rename): F-MACRO-FETCH-DEADLINE READY->in_progress + dispatch markers; head po->dev.
#   0 new task id-lines (status flip only). Commit explicit path only.
# GUARD: refuse unless head.next_agent=="po" AND F-MACRO-FETCH-DEADLINE status=="READY".
# Usage: jq --arg now "$NOW" --arg agent "$AGENTID" -f scripts/router-d36-fmacro-fetchdeadline-dispatch-20260615.jq docs/data/orch/orch-state.json
def FM: "F-MACRO-FETCH-DEADLINE";
($ARGS.named.now) as $now
| ($ARGS.named.agent) as $agent
| ([.task_board.ready[]?,.task_board.backlog[]? | select(type=="object" and ((.id // "")==FM))][0]) as $fm
| if (.head.next_agent != "po") then error("head.next_agent != po (\(.head.next_agent)) — refuse")
  elif ($fm == null) then error("F-MACRO-FETCH-DEADLINE not found — refuse")
  elif (($fm.status // "") != "READY") then error("F-MACRO-FETCH-DEADLINE status != READY (\($fm.status)) — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]?
    | if (type=="object" and ((.id // "")==FM))
        then (. + {status:"in_progress", dispatched_at:$now, dispatched_to:"dev-macro-indicators", dispatch_agent_id:$agent})
        else . end ]
| .task_board.backlog = [ .task_board.backlog[]?
    | if (type=="object" and ((.id // "")==FM))
        then (. + {status:"in_progress", dispatched_at:$now, dispatched_to:"dev-macro-indicators", dispatch_agent_id:$agent})
        else . end ]
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: FM,
    next_agent: "dev",
    note: "F-MACRO-FETCH-DEADLINE DISPATCHED -> dev-macro-indicators (agent \($agent)). LEAD reliability FIX (size S, /goal#1 completion for the 4 fetch tools trade/macro/cpi/bop + /goal#2 generic). ROOT: vpsFetch.go adapter already honors http.Client{Timeout} from opts.TimeoutSec but callers set 30s >> gateway timeout (cache_vmt_nso discoverAndFetch 3-chain up to 90s; usecases_vmt_bop 30s); slow origin -> Fetch HANGS past gateway deadline -> timeout before VMT-8 degrade can emit. FIX (generic, all 5 use-cases): single bounded ~8s budget < gateway timeout (named const SSOT) on every uc.fetcher.Fetch + context.WithTimeout; NSO 3-fetch CHAIN budgeted as a whole (not 3x8s); do NOT touch VMT-8 degrade logic. GATE: unit hanging-fetcher -> ctx.DeadlineExceeded within budget + degraded-200; LIVE router re-probe all 5 Zone-A tools across timing -> 200 within gateway deadline, no raw timeout = UNBLOCKS VMT-8 done_verified. SEQUENCED-AFTER (HELD, same files, serialize): F-BOP-ENCODING + F-NSO-SELECTOR (accuracy). WIP: dev-zone in_progress=1 (this), budget<=2 OK. On dev return -> router RAW-verify gates GREEN -> head dev->ops REBUILD macro-indicators (force-recreate single svc, NEVER compose down) -> live re-probe -> done + release sequenced pair."
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
