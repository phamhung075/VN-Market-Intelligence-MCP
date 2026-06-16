# Router 2026-06-16 — dev-team tick: PO BATCH dispatch ready -> in_progress (BCTC pipeline durability brief).
#
# PO triage (agent aa935d51, dev-team cron tick 2026-06-16T11:21Z) RETURNED a 2-item FIX BATCH, both implementing
# docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md (Contract 1 + Contract 2), both single-zone apps/mcp-server/:
#   FIX-BCTC-ZERO-URL-ALERT  (S) — Contract 1: persist consecutive-zero-URL cycle counter; increment when urlsPopulated=0
#       AND itemsProcessed>0; reset on any urlsPopulated>0; skip itemsProcessed=0 (legit idle); ONE earnings-window-guarded
#       BUG telegram when counter>=2, dedup <=1/6h, aggregate across tickers. Closes the 34h+ silent BCTC-VPS outage gap.
#   FIX-BCTC-FRESHNESS-GATE  (S) — Contract 2: replace passive:true vn-bctc-fetch with active MAX(last_attempt WHERE
#       status='done') freshness, maxAgeMs=24h; earnings-window guard returns 'idle' (not 'unhealthy') on empty-queue+no-done-7d.
#
# DISPATCH: ONE dev-mcp-server agent implements BOTH sequentially (same zone/package/build — two concurrent same-zone
#   agents would race the shared working tree + .git/index per the concurrent-commit-race lesson). WIP = 2/2 coding lanes.
# NOT minting a new outage-fixer: the C4 paired P1 (HNX-SESSION-COOKIE + SSC-C111-EMPTY-FALLBACK, done_verified this tick)
#   already targets the outage root and owes a LIVE re-probe — re-triaging it now would be a false-rebuild trap.
# HEAD: status=in_progress (active dispatch) so the NEXT tick's Step 0b pipeline-resume re-attaches on crash; next_agent
#   dev-mcp-server; active_task_id = the first FIX (resume covers it; both are on the board in in_progress[] regardless).
#   rebuild_required=false at dispatch (no code committed yet) — ops force-recreate happens AFTER the fix lands.
#
# GUARD: refuse unless BOTH tids uniquely in ready[] AND neither already in in_progress[]. CONSERVATION: total UNCHANGED.
# Usage: jq --arg now "$NOW" -f scripts/router-d81-bctc-durability-dispatch-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ["FIX-BCTC-ZERO-URL-ALERT","FIX-BCTC-FRESHNESS-GATE"] as $tids
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ($tids | map(. as $id | ($root.task_board.ready        | map(select(.id==$id)) | length))) as $inready
| ($tids | map(. as $id | ($root.task_board.in_progress  | map(select(.id==$id)) | length))) as $inprog
| if ($inready | any(. != 1)) then error("a target tid not uniquely in ready[] — refuse: " + ($inready|tostring))
  elif ($inprog | any(. > 0)) then error("a target tid already in in_progress[] — refuse")
  else . end
| ([.task_board.ready[] | select(.id as $i | ($tids|index($i))!=null)]) as $moved
| .task_board.ready = [ .task_board.ready[] | select(.id as $i | ($tids|index($i))==null) ]
| .task_board.in_progress = ( .task_board.in_progress + [
      $moved[] | . + { status:"IN_PROGRESS", owner_agent:"dev-mcp-server", dispatched_ts:$now, dispatched_by:"dev-team" }
    ] )
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-BCTC-ZERO-URL-ALERT", next_agent:"dev-mcp-server", rebuild_required:false,
    next_action:"Implement BOTH BCTC pipeline-durability FIXes in apps/mcp-server/ per docs/architecture-briefs/2026-06-16-bctc-pipeline-durability.md: (1) FIX-BCTC-ZERO-URL-ALERT Contract 1 consecutive-zero-URL counter + earnings-guarded BUG alert in bctcQueueEnricherJob; (2) FIX-BCTC-FRESHNESS-GATE Contract 2 active last_success_age freshness in vpsHealthPoller DEFAULT_FRESHNESS_CONFIGS. RAW-verify the ALERT path and the STALE path, not steady-state green. Generic across all tickers (/goal#2). Then -> review with rebuild_required.",
    note:("ROUTER " + $now + " — dev-team tick: PO BATCH dispatched. FIX-BCTC-ZERO-URL-ALERT (Contract 1) + FIX-BCTC-FRESHNESS-GATE (Contract 2) -> dev-mcp-server (zone apps/mcp-server/, both S, brief 2026-06-16-bctc-pipeline-durability.md). One agent, both sequential (no same-zone concurrent race). WIP=2/2 coding lanes. rebuild pending post-fix. C4 paired P1 (HNX+SSC) NOT re-triaged (owes live re-probe). PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
