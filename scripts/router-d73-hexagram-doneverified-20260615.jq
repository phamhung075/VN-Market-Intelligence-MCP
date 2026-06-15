# Router 2026-06-15T11:5xZ — FIX-MARKET-HEXAGRAM-TOOL-MISSING review -> done_verified.
#
# Ops (a463639e) rebuilt mcp-server + ran the live gate => PASS. Router did NOT relay — RAW re-verified every
# component itself (honors feedback_router_verify_raw_not_badges + the named-volume/host-decoy trap, since the
# hexagram is DB-derived from local SQLite signals):
#   (1) docker inspect (router-run): image .Created 2026-06-15T11:48:24Z > commit a8711e35 11:43:11Z; health=healthy;
#       RestartCount=0; 13 peers Up. toolCount=164 (docker logs, router-run).
#   (2) call_tool get_market_hexagram({}) (router-run, NOT relayed): returned a FRESH recompute — timestamp advanced
#       11:48 (ops) -> 11:50 UTC (router), proving a genuine live compute, not a cached/relayed value.
#   (3) Plausibility per /goal#1: Que 63 Ky Te in [1,64]; Tin hieu TRUNG TINH in {TICH CUC,TIEU CUC,TRUNG TINH};
#       Do tin cay 52% in [0,100]; 6 hao [0.21,0.00,1.00,-1.00,1.00,-1.00] all in [-1,1], non-degenerate (mixed
#       +/-/0, not all-zero/identical); "3/6 duong" coherent with hao signs (hao1/hao3/hao5 strictly positive);
#       NOT "Loi khi tinh que". Signal label consistent with mixed hao => neutral.
#
# REBUILD: DONE (image 11:48:24Z, force-recreate, peers intact). PUSH: held (PO post-gates, bundle).
#
# GUARD: refuse unless task in review[] AND not already in done_verified[]. CONSERVATION: total UNCHANGED (pure move).
# Usage: jq --arg now "$NOW" -f scripts/router-d73-hexagram-doneverified-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-MARKET-HEXAGRAM-TOOL-MISSING" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.review[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in review[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already in done_verified[] — refuse")
  else . end
| .task_board.review = [ .task_board.review[]? | select(.id!=$tid) ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"DONE_VERIFIED",
      done_verified_ts:$now,
      done_verified_by:"dev-team",
      rebuild_done:true,
      rebuild_evidence:"mcp-server force-recreated: image .Created 2026-06-15T11:48:24Z > commit a8711e35 11:43:11Z; health=healthy; RestartCount=0; 13 peers Up (force-recreate, NEVER down). toolCount=164.",
      live_gate_evidence:"router-run (NOT relayed): call_tool get_market_hexagram({}) => Que 63 Ky Te, TRUNG TINH, do tin cay 52%, 6 hao [0.21,0.00,1.00,-1.00,1.00,-1.00] all in [-1,1] non-degenerate, 3/6 duong coherent with hao signs, NOT 'Loi khi tinh que'. FRESH recompute (ts 11:48->11:50 UTC across ops/router calls => genuine live compute, no cached relay). Plausibility per /goal#1 PASS.",
      generic_verified:"/goal#2 PASS — 6 market-wide hao dims from local SQLite (VN-Index z, USD/VND, brent, gold, foreign-flow breadth, macro composite); NO HTTP (sidesteps the Go /market 501); no hardcoded date/ticker; works every Sunday for all callers.",
      root_cause:"(a) registration gap — get_market_hexagram DEREGISTERED 2026-05-31 (TSH-1, kinh-dich-service /market returns 501) but still referenced by 3 agent bootstraps + the Sunday digest-predict flow.",
      fix_commits:["a8711e35","89a3aaad","5f79b5f0"],
      fix_summary:"re-register get_market_hexagram with LOCAL COMPUTE only (encodeHaos+resolveHexagram+computeMacroIndicatorScore/computeMacroScore); NO HTTP => does not re-introduce the 501. SSOT 163->164 across project-stats/tool-registry(+kinhdich 5->6)/system-map.",
      push_disposition:"HOLD — bundle; PO pushes after 2026-06-16 behavioral gates close."
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:null,
    note:("ROUTER " + $now + " — FIX-MARKET-HEXAGRAM-TOOL-MISSING PROMOTED review->done_verified. Ops (a463639e) rebuilt+gated PASS; router RAW RE-VERIFIED (not relayed): own docker inspect (image 11:48:24Z>commit 11:43:11Z, healthy, restarts=0, 13 peers), own toolCount=164, own call_tool get_market_hexagram({}) => Que 63 Ky Te / TRUNG TINH / 52% / 6 hao all in [-1,1] non-degenerate, FRESH recompute (ts 11:48->11:50 live). Root-cause (a) registration gap; fix = local-compute re-register (a8711e35), NO HTTP, no 501 reintro. GENERIC /goal#2. Remaining review[]: FIX-VNSTOCK-TRADINGSTATS-CRASH (2026-06-16 08:30Z sweep gate, probe 3b57017e), FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (2026-06-16 01:00Z/02:15Z gate, probe 09b8693f), ARCH-SHIP-WAVE-REAUDIT (PARKED). Ready: FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2 dev-stock-price). Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). FIX-FB-POSTER done_verified. Active coding lane=0. PUSH held (PO post-gates).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
