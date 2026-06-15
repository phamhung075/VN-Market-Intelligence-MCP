# Router dev-team tick 2026-06-15T11:0xZ — promote FIX-HNX-UPCOM-PRICE-SOURCES-DEAD
# review -> done_verified (watchlist live-gate GREEN) AND mint follow-on
# FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL into ready[] (BDI false-green caught).
#
# ROUTER RAW LIVE VERIFY (ops aaf7c500 raw responses, router-judged NOT relayed-badge):
#   REBUILD: stock-price image 93b77a1ab101 Created 2026-06-15T11:03:25Z > commit af481e12
#     (2026-06-15T00:56:44Z UTC); new container 4371d3eaad7a healthy RestartCount=0; all 13
#     peers UP (no peer killed by force-recreate); market_prices 120 rows (named-vol intact).
#   WATCHLIST GATE (the task's actual DoD — service /price/fetch path, NOT get_market_snapshot):
#     * SHB (watchlist, HOSE) => {price:13900, source:"hose", vol:48,683,600, latencyMs:857,
#       staleness:"FRESH"} — plausible VND magnitude + correct source + genuine live fetch. PASS.
#     * HUT (watchlist, HNX)  => {price:15500, source:"hnx",  vol:2,125,100, latencyMs:241,
#       staleness:"FRESH"} — plausible + correct HNX source + live. PASS.
#   => /goal#1 plausibility PASS + /goal#2 generic PASS for the dead-source class on watchlist.
#
# BDI SUB-GATE FAILED AS SPECIFIED (router caught agent's false-PASS):
#   My dispatch gate: "dead ticker (BDI) => HONEST empty/absent (no fabricated zero, no crash)."
#   BDI raw => {price:2,729,000, source:"hose", vol:0, staleness:"FRESH"}. NOT honest-empty:
#   it is the Baltic Dry INDEX level (~2729) * 1000 served as a tradeable VND price labeled
#   FRESH. The agent rationalized it as "expected Tier-3 cache" — that overrides the gate I set.
#   This is a SEPARABLE GENERIC defect (not a regression in this fix; BDI is a non-watchlist
#   index that was a FALSE premise in the original report). The generic /goal#1 risk: ANY
#   watchlist ticker whose live source dies but has a stale market_prices cache row would be
#   served as FRESH with a possibly-implausible value => poison downstream. Carved into the
#   minted follow-on with the BDI raw evidence; does NOT block the watchlist-scope done_verified.
#
# PUSH: HELD (bundle with RSI/MA5/restart/routers; PO pushes after the FIX-ALERT-ENGINE-RSI-
#   SINGLEDIGIT behavioral gate closes 2026-06-16). Runtime already serves this fix.
#
# GUARDS: refuse unless FIX-HNX-UPCOM in review[] AND not in done_verified[]; follow-on id
#   absent from ALL lanes. CONSERVATION: total task count == before + 1 (one mint).
# Usage: jq --arg now "$NOW" -f scripts/router-d66-hnx-upcom-doneverified-mint-tier3-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| . as $root
| "FIX-HNX-UPCOM-PRICE-SOURCES-DEAD" as $tid
| "FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL" as $mid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.review[]? | select(.id==$tid)][0]) as $t
| ([$root.task_board | to_entries[] | select(.value|type=="array") | .value[] | select(.id==$mid)] | length) as $mid_exists
| if ($t==null) then error($tid + " not in review[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already in done_verified[] — refuse")
  elif ($mid_exists>0) then error($mid + " already present in a lane — refuse")
  else . end
# 1) move FIX-HNX-UPCOM review -> done_verified
| .task_board.review = [ .task_board.review[]? | select(.id!=$tid) ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"DONE_VERIFIED",
      done_verified_ts:$now,
      done_verified_by:"dev-team",
      rebuild_landed:"stock-price image 93b77a1ab101 Created 2026-06-15T11:03:25Z (>commit af481e12 00:56:44Z UTC); container 4371d3eaad7a healthy RestartCount=0; all 13 peers UP (force-recreate killed none); market_prices 120 rows named-vol intact",
      live_gate_evidence:"router-judged ops aaf7c500 raw service /price/fetch (NOT get_market_snapshot): SHB(watchlist,HOSE)=>price 13900 source hose vol 48,683,600 latency 857ms staleness FRESH (plausible+correct+live PASS); HUT(watchlist,HNX)=>price 15500 source hnx vol 2,125,100 latency 241ms FRESH (plausible+correct+live PASS). Endpoint+schema fix serves correct price+source for real watchlist HNX/UPCOM tickers.",
      bdi_subgate_carveout:"BDI dead-ticker honest-empty sub-gate FAILED AS SPECIFIED (router caught agent false-PASS): BDI=>price 2,729,000 source hose vol 0 staleness FRESH = Baltic Dry INDEX level *1000 served as FRESH VND price, NOT honest-empty. SEPARABLE generic defect (BDI non-watchlist index, false premise); does NOT block watchlist done_verified. Carved into minted FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL with raw evidence.",
      goal_alignment:"/goal#1 watchlist HNX/UPCOM dead-source fix LIVE plausibility-verified + /goal#2 generic (source from .floor, price*1000 thousands->VND, no per-ticker allowlist)",
      push_disposition:"HOLD — bundle; PO pushes the fast-forward after FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate closes 2026-06-16; runtime already serves this fix"
    } ])
# 2) mint follow-on into ready[]
| .task_board.ready = (.task_board.ready + [ {
      id:$mid,
      title:"Tier-3 price cache fallback labels stale rows staleness:FRESH + applies *1000 to non-stock-unit cached values (BDI=>2,729,000 FRESH)",
      priority:"P2",
      status:"READY",
      route_to:"dev-stock-price",
      zone:"apps/stock-price/",
      created_ts:$now,
      created_by:"dev-team",
      source:"router-d66 — surfaced by FIX-HNX-UPCOM-PRICE-SOURCES-DEAD live gate (ops aaf7c500). BDI dead-ticker probe returned price 2,729,000 source hose vol 0 staleness FRESH instead of honest-empty.",
      raw_evidence:"service /price/fetch {code:BDI} => {price:2729000, volume:0, change:0, changePercent:0, source:\"hose\", latencyMs:243, fetchedAt:2026-06-15T11:04:26Z, staleness:\"FRESH\"}",
      defect:"Tier-3 market_prices cache fallback (1) labels a STALE cached row staleness:FRESH (honesty bug — should mark STALE/CACHED when the row's updated_at age exceeds the freshness window AND/OR when no live tier succeeded), and (2) blindly multiplies Close*1000 (thousands-VND assumption) for cached entities that are not thousands-VND VN stocks (an index level 2729 -> 2,729,000 garbage 'price').",
      generic_requirement:"/goal#2 — fix GENERIC across ALL tickers/entities: staleness must reflect the served row's true age + tier provenance (no hardcoded ticker/date); implausible-magnitude or non-stock cached rows must fail honest (empty/flagged), never served as a FRESH tradeable price. /goal#1 — the real risk is a watchlist ticker whose live source dies being served a stale cache price labeled FRESH; poison-downstream.",
      depends_on:"none (independent of FIX-HNX-UPCOM endpoint fix, now done_verified)",
      recon_first:true
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", next_agent:null,
    note:("DEV-TEAM TICK " + $now + " — FIX-HNX-UPCOM-PRICE-SOURCES-DEAD PROMOTED review->done_verified (ops aaf7c500 rebuild LANDED: stock-price image 93b77a1ab101 Created 11:03:25Z>commit af481e12, healthy RestartCount=0, 13 peers up, market_prices 120 rows). WATCHLIST LIVE GATE GREEN (router-judged raw /price/fetch): SHB=>13900 hose FRESH live, HUT=>15500 hnx FRESH live — plausible+correct-source+genuine live fetch. BDI dead-ticker honest-empty sub-gate FAILED AS SPECIFIED (router caught agent false-PASS: BDI=>2,729,000 source hose staleness FRESH = Baltic Dry index*1000 as FRESH price); SEPARABLE generic defect, MINTED FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL (P2 dev-stock-price ready[], raw evidence + /goal#1+#2 reqs). PUSH held (bundle, PO post-RSI-gate 2026-06-16). PARALLEL: FIX-VNSTOCK-TRADINGSTATS-CRASH in_progress (dev-mcp-server a8448dee running); FIX-ALERT-ENGINE-RSI-SINGLEDIGIT review (behavioral gate 2026-06-16 briefing 01:00Z/scan 02:15Z). Ready: FIX-FB-POSTER-NOARG-MARKET-TOOLS(P1), FIX-MARKET-HEXAGRAM-TOOL-MISSING(P2), FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2, new). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (design). Active coding lane=1 (vnstock).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != ($before+1))
    then error("CONSERVATION FAIL: total != before+1 (expected one mint)") else . end
