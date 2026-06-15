# Router 2026-06-15T11:3xZ — FIX-FB-POSTER-NOARG-MARKET-TOOLS in_progress -> done_verified.
#
# Round 2 (commit 3889ff51) RAW-verified by router — pure agent-.md contract fix, fully live-verifiable now
# (no rebuild, no deferred behavioral gate):
#   * commit hygiene: 1 file docs/agents/fb-market-poster/flow/main.md line 81, no -A/secret, linear on router-d70.
#   * diff: '.watchlist[].ticker' -> '.project.watchlist[] | select(.active==true) | .ticker'. grep confirms ZERO
#     remaining broken top-level '.watchlist[' refs in flow + tools-package doc.
#   * LIVE component proofs (router-run, NOT relayed):
#       - get_market_foreign_flow({}) => net +1.01M, watchlist coverage, real top buyers/sellers (correct no-arg market-wide).
#       - get_ticker_intelligence({"code":"VCB"}) => 61,600 VND + evidence + foreign flow (per-ticker iteration correct).
#       - jq '.project.watchlist[]|select(.active==true)|.ticker' system-map.json => 33 real tickers.
#   * GENERIC (/goal#2): SSOT-driven, any watchlist size, select(active) auto-skips future inactive; no hardcoded ticker.
#   Attempt 1 (1219fa0f) fixed the two tool calls but introduced the broken .watchlist path (router caught, round 1
#   CHANGES_REQUESTED router-d70); round 2 closes it. Both commits ship in the held bundle.
#
# REBUILD: NONE (agent .md only). PUSH: held (PO post-gates, bundle).
#
# GUARD: refuse unless task in in_progress[] AND not already in done_verified[]. CONSERVATION: total UNCHANGED (pure move).
# Usage: jq --arg now "$NOW" -f scripts/router-d71-fbposter-doneverified-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-FB-POSTER-NOARG-MARKET-TOOLS" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in in_progress[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already in done_verified[] — refuse")
  else . end
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!=$tid) ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"DONE_VERIFIED",
      done_verified_ts:$now,
      done_verified_by:"dev-team",
      fix_commits:["1219fa0f","3889ff51"],
      review_rounds:2,
      root_cause:"fb-market-poster flow called get_foreign_flow({}) + get_ticker_intelligence({}) with no code= arg => both fail schema (code required). Plus (round-1 regression) watchlist queried via '.watchlist[].ticker' => NULL.",
      fix_summary:"get_foreign_flow -> get_market_foreign_flow (correct no-arg market-wide variant); single get_ticker_intelligence({}) -> per-watchlist-ticker iteration with code=; watchlist jq path corrected to '.project.watchlist[]|select(.active==true)|.ticker'.",
      live_gate_evidence:"router-run LIVE: get_market_foreign_flow({}) => net +1.01M + real top buyers/sellers (schema-valid); get_ticker_intelligence({code:VCB}) => 61,600 VND + evidence + foreign flow (schema-valid); jq '.project.watchlist[]|select(.active==true)|.ticker' => 33 real tickers. All three flow contract components live-verified — no deferred behavioral gate (pure .md contract fix).",
      commit_hygiene_verified:"router git show --stat: 1219fa0f (2 files) + 3889ff51 (1 file) all docs/agents/ zone, no -A/secret; orch-state untouched by agent; linear history.",
      generic_verified:"/goal#2 PASS — SSOT-driven watchlist (any size), select(active==true) auto-skips inactive, no hardcoded ticker; market-wide foreign-flow tool needs no per-ticker arg.",
      rebuild_required:false,
      rebuild_note:"agent .md only — no container rebuild.",
      push_disposition:"HOLD — bundle; PO pushes after 2026-06-16 behavioral gates close."
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:null,
    note:("ROUTER " + $now + " — FIX-FB-POSTER-NOARG-MARKET-TOOLS PROMOTED in_progress->done_verified (2 rounds, commits 1219fa0f+3889ff51). Pure agent-.md contract fix, fully LIVE-verified (router-run): get_market_foreign_flow({}) net +1.01M schema-valid, get_ticker_intelligence({code:VCB}) 61,600 VND schema-valid, watchlist jq '.project.watchlist[]|select(.active==true)|.ticker' => 33 tickers. Round-1 (1219fa0f) introduced a broken .watchlist path — router CAUGHT (router-d70), round-2 (3889ff51) closed it. NO rebuild (agent .md). GENERIC /goal#2. cowork lock released. Parallel: FIX-MARKET-HEXAGRAM-TOOL-MISSING in_progress (dev-mcp-server a385cdd3 running). review[]: FIX-VNSTOCK-TRADINGSTATS-CRASH + FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (2026-06-16 gates), ARCH-SHIP-WAVE-REAUDIT parked. Ready: FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2). Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). PUSH held (PO post-gates). Active coding lane=1 (HEXAGRAM).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
