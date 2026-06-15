# Router 2026-06-15T11:3xZ — FIX-FB-POSTER-NOARG-MARKET-TOOLS: record CHANGES_REQUESTED (in-place, NO lane move).
#
# cowork-refactory-expert a272a9df returned commit 1219fa0f. Router RAW-verified:
#   GOOD (live-confirmed, NOT relayed):
#     * commit hygiene: 2 files both docs/agents/ zone, no -A/secret, orch-state untouched, linear on router-d69.
#     * get_market_foreign_flow({}) LIVE-VALID — returns net +1.01M, watchlist coverage, real top buyers/sellers (no code= needed). Correct market-wide variant.
#     * get_ticker_intelligence({"code":"VCB"}) LIVE-VALID — price 61,600 VND + evidence + foreign flow. Per-ticker iteration half correct.
#   DEFECT (router caught — fix introduced a NEW broken SSOT path, /goal#1 'not best result'):
#     * flow now instructs: query watchlist via jq '.watchlist[].ticker' on system-map.json. That path => NULL.
#       Real path = '.project.watchlist[].ticker' (33 tickers; .project.watchlist[]|select(.active==true) for active subset).
#       At runtime the poster's mover-extraction loop would iterate ZERO tickers => silent empty movers, not a crash but wrong output.
#
# DISPOSITION: KEEP in in_progress[] (NOT review). Re-dispatch cowork-refactory-expert for the single path correction.
#   Lock task:on-demand:cowork-refactory-expert:20260615 stays held (not released).
#
# GUARD: refuse unless task in in_progress[] AND not in review[]/done_verified[]. CONSERVATION: total UNCHANGED (in-place).
# Usage: jq --arg now "$NOW" -f scripts/router-d70-fbposter-changes-requested-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-FB-POSTER-NOARG-MARKET-TOOLS" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| if ([.task_board.in_progress[]? | select(.id==$tid)]|length==0) then error($tid + " not in in_progress[] — refuse")
  elif ([.task_board.review[]?,.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already past in_progress — refuse")
  else . end
| .task_board.in_progress = [ .task_board.in_progress[]?
    | if .id==$tid then . + {
        status:"IN_PROGRESS",
        review_round:1,
        changes_requested_ts:$now,
        attempt1_commit:"1219fa0f",
        attempt1_verified_good:"commit hygiene clean (2 files docs/agents/ zone, no -A/secret, orch-state untouched). get_market_foreign_flow({}) LIVE-VALID (net +1.01M, watchlist coverage, real buyers/sellers — correct no-arg market-wide variant). get_ticker_intelligence({code:VCB}) LIVE-VALID (61,600 VND + evidence + foreign flow — per-ticker iteration correct).",
        attempt1_defect:"flow queries watchlist via jq '.watchlist[].ticker' on system-map.json => resolves NULL. Correct path = '.project.watchlist[].ticker' (33 tickers; add select(.active==true) for the active subset). Runtime: mover-extraction loop iterates ZERO tickers => silently empty movers (wrong output, /goal#1 not-best-result).",
        changes_requested:"correct the SSOT watchlist jq path in docs/agents/fb-market-poster/flow/main.md from '.watchlist[].ticker' to '.project.watchlist[].ticker' (use select(.active==true) to match the 33 active tickers). Keep both already-correct tool calls. Prove the path live: jq -r '.project.watchlist[]|select(.active==true)|.ticker' docs/data/system-map.json returns >0 tickers. Commit by explicit path. No rebuild (agent .md only)."
      } else . end ]
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"cowork-refactory-expert",
    note:("ROUTER " + $now + " — FIX-FB-POSTER-NOARG-MARKET-TOOLS attempt1 (1219fa0f) CHANGES_REQUESTED (router RAW caught). GOOD: get_market_foreign_flow({}) + get_ticker_intelligence({code}) both LIVE-VALID; commit hygiene clean. DEFECT: flow's watchlist jq '.watchlist[].ticker' => NULL; correct = '.project.watchlist[].ticker' (33 active). KEPT in_progress, re-dispatched cowork-refactory-expert for the 1-line path fix (lock held). No rebuild (agent .md). Parallel: FIX-MARKET-HEXAGRAM-TOOL-MISSING in_progress (dev-mcp-server a385cdd3 running). review[]: FIX-VNSTOCK-TRADINGSTATS-CRASH + FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (2026-06-16 gates), ARCH-SHIP-WAVE-REAUDIT parked. Ready: FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2). Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). PUSH held (PO post-gates). Active coding lane=1 (FB-POSTER md) + HEXAGRAM dev.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on an in-place field update") else . end
