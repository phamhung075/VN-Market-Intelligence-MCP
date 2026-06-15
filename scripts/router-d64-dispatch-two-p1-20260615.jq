# Router dev-team Step-3 dispatch 2026-06-15T10:4xZ — move TWO P1s ready->in_progress
# per PO triage return (agentId ad17266f, board mint 68fe98ff). recon-first, disjoint zones.
#
# DISPATCHED (WIP<=2 active coding lanes — exactly the 2 PO-recommended disjoint zones):
#   1. FIX-HNX-UPCOM-PRICE-SOURCES-DEAD  -> dev-stock-price (apps/stock-price/)
#      Router RAW-corroborated: get_market_snapshot(codes=[DLC,SHS,VND]) 10:41Z => DLC
#      (a PO-listed dead ticker) returns NO price row while SHS/VND return live prices.
#      Confirms the dead-source class is real (not all-HNX; specific small-cap HNX/UPCOM).
#   2. FIX-VNSTOCK-TRADINGSTATS-CRASH    -> dev-mcp-server (apps/mcp-server/)
#      PO NEW mint; ~50% crash on vnstock trading-stats sync; syncVnstockData.ts timeout
#      guard (fundamentals-fix family). recon-first: dev reproduces + reads live job first.
#
# HELD in ready[] (NOT dispatched — WIP<=2): FIX-FB-POSTER-NOARG-MARKET-TOOLS (P1,
#   cowork-refactory-expert), FIX-MARKET-HEXAGRAM-TOOL-MISSING (P2, dev-kinh-dich).
#   Next dev-team :07 tick picks them up. FIX-ALERT-ENGINE-RSI-SINGLEDIGIT stays review[]
#   (06-16 behavioral gate) — NOT displaced.
#
# WIP accounting: in_progress goes 2->4 but ACTIVE coding lanes = 2 after this. The 2
#   existing in_progress consume NO coding lane (ARCH-CRON-SCHEDULER-RELIABILITY=QA-observe,
#   BA-VN-MACRO-TOOLING=design). Invariant WIP<=2 active-coding HOLDS.
#
# GUARD: refuse unless BOTH tasks in ready[] AND neither already in in_progress[].
# CONSERVATION: total task count UNCHANGED (pure move ready->in_progress).
# Usage: jq --arg now "$NOW" -f scripts/router-d64-dispatch-two-p1-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| . as $root
| ["FIX-HNX-UPCOM-PRICE-SOURCES-DEAD","FIX-VNSTOCK-TRADINGSTATS-CRASH"] as $tids
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([$tids[] | . as $id | ($root.task_board.ready | map(select(.id==$id)) | length)] | add) as $found_ready
| ([$tids[] | . as $id | ($root.task_board.in_progress | map(select(.id==$id)) | length)] | add) as $found_inprog
| if ($found_ready != 2) then error("not both in ready[] — refuse (found " + ($found_ready|tostring) + ")")
  elif ($found_inprog > 0)
    then error("one already in in_progress[] — refuse")
  else . end
| {"FIX-HNX-UPCOM-PRICE-SOURCES-DEAD":{route:"dev-stock-price",zone:"apps/stock-price/",
     note:"router RAW-corroborated 10:41Z: get_market_snapshot(codes=[DLC,SHS,VND]) => DLC no price row while SHS/VND live. dead small-cap HNX/UPCOM source class. recon-first: read live tier-fallback + source before patch; generic across all dead tickers (/goal#2), no per-ticker allowlist."},
   "FIX-VNSTOCK-TRADINGSTATS-CRASH":{route:"dev-mcp-server",zone:"apps/mcp-server/",
     note:"PO NEW mint; ~50% crash vnstock trading-stats sync; syncVnstockData.ts timeout guard (fundamentals-fix family). recon-first: reproduce crash + read live job before patch."}} as $meta
| reduce $tids[] as $id (.;
    ([.task_board.ready[]? | select(.id==$id)][0]) as $t
    | .task_board.ready = [ .task_board.ready[]? | select(.id!=$id) ]
    | .task_board.in_progress = (.task_board.in_progress + [ $t + {
        status:"IN_PROGRESS",
        route_to:($meta[$id].route),
        mode:"recon-first",
        zone:($meta[$id].zone),
        dispatched_ts:$now,
        dispatched_by:"dev-team",
        dispatch_note:($meta[$id].note)
      } ]) )
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", next_agent:null,
    note:("DEV-TEAM TICK 2026-06-15T10:4xZ — dispatched TWO P1s ready->in_progress per PO triage (ad17266f, mint 68fe98ff drained 36 stale reports): FIX-HNX-UPCOM-PRICE-SOURCES-DEAD->dev-stock-price (router RAW-corroborated DLC no-row vs SHS/VND live), FIX-VNSTOCK-TRADINGSTATS-CRASH->dev-mcp-server (~50% crash, syncVnstockData timeout guard). Both recon-first, disjoint zones, bg. WIP=2 active coding lanes (ARCH-CRON=observe, BA-MACRO=design consume none). HELD ready: FIX-FB-POSTER-NOARG-MARKET-TOOLS (P1 cowork-refactory-expert), FIX-MARKET-HEXAGRAM-TOOL-MISSING (P2 dev-kinh-dich) — next tick. FIX-ALERT-ENGINE-RSI-SINGLEDIGIT stays review (06-16 gate, NOT displaced). PUSH held (PO post-RSI-gate). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (design).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
