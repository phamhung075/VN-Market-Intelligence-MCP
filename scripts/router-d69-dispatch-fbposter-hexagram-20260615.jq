# Router dev-team tick 2026-06-15T11:2xZ — dispatch TWO ready tasks ready->in_progress.
# Active coding lane=0 (in_progress ARCH-CRON=QA-observe + BA-MACRO=design consume none); WIP<=2 HOLDS.
#
# DISPATCHED (disjoint zones, recon-first, background):
#   1. FIX-FB-POSTER-NOARG-MARKET-TOOLS (P1) -> cowork-refactory-expert (cross-service agent-md).
#      Defect: fb-market-poster calls get_foreign_flow({}) + get_ticker_intelligence({}) with no code= arg
#      => both fail schema (code required). cowork-refactory-expert reads live MCP tool surface + rewrites
#      the agent .md to call the correct variant (market-wide tool, or pass watchlist codes). COWORK-LANE =>
#      dev-team Team Boundary mutex-wrap REQUIRED (task:on-demand:cowork-refactory-expert:<date>).
#   2. FIX-MARKET-HEXAGRAM-TOOL-MISSING (P2) -> dev-mcp-server (apps/mcp-server/). Defect: get_market_hexagram
#      not in MCP tool list => Sunday digest-predict cycle fails. "Not in tool list" = tool-registration gap at
#      the mcp-server tool surface (toolCount SSOT owner). recon-first: dev confirms whether the gap is
#      registration (fix here in apps/mcp-server/src/interface/mcp/tools/kinhdich/) vs missing hexagram compute
#      (then signal dev-kinh-dich). Generic — register the tool for all callers, no per-cycle hack.
#
# HELD in ready[] (WIP<=2): FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL (P2, dev-stock-price) — next tick.
# review[] untouched: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT + FIX-VNSTOCK-TRADINGSTATS-CRASH (both 2026-06-16 gates),
#   ARCH-SHIP-WAVE-REAUDIT (PARKED).
#
# GUARD: refuse unless BOTH tasks in ready[] AND neither already in in_progress[].
# CONSERVATION: total task count UNCHANGED (pure move ready->in_progress).
# Usage: jq --arg now "$NOW" -f scripts/router-d69-dispatch-fbposter-hexagram-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| . as $root
| ["FIX-FB-POSTER-NOARG-MARKET-TOOLS","FIX-MARKET-HEXAGRAM-TOOL-MISSING"] as $tids
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([$tids[] | . as $id | ($root.task_board.ready | map(select(.id==$id)) | length)] | add) as $found_ready
| ([$tids[] | . as $id | ($root.task_board.in_progress | map(select(.id==$id)) | length)] | add) as $found_inprog
| if ($found_ready != 2) then error("not both in ready[] — refuse (found " + ($found_ready|tostring) + ")")
  elif ($found_inprog > 0) then error("one already in in_progress[] — refuse")
  else . end
| {"FIX-FB-POSTER-NOARG-MARKET-TOOLS":{route:"cowork-refactory-expert",zone:"cross-service/",lane:"cowork",
     note:"fb-market-poster calls get_foreign_flow({})+get_ticker_intelligence({}) with no code= => schema fail. cowork-refactory-expert reads live MCP tool surface + rewrites the poster .md to use the market-wide variant or pass watchlist codes. recon-first. COWORK-LANE => spawned under dev-team mutex-wrap (task:on-demand:cowork-refactory-expert:<date>)."},
   "FIX-MARKET-HEXAGRAM-TOOL-MISSING":{route:"dev-mcp-server",zone:"apps/mcp-server/",lane:"dev-zone",
     note:"get_market_hexagram absent from MCP tool list => Sunday digest-predict fails. recon-first: confirm registration gap (apps/mcp-server/src/interface/mcp/tools/kinhdich/) vs missing compute (signal dev-kinh-dich). Register generic for all callers; bump toolCount SSOT (project-stats/tool-registry/system-map) per the tool-count-drift lesson."}} as $meta
| reduce $tids[] as $id (.;
    ([.task_board.ready[]? | select(.id==$id)][0]) as $t
    | .task_board.ready = [ .task_board.ready[]? | select(.id!=$id) ]
    | .task_board.in_progress = (.task_board.in_progress + [ $t + {
        status:"IN_PROGRESS",
        route_to:($meta[$id].route),
        zone:($meta[$id].zone),
        lane:($meta[$id].lane),
        mode:"recon-first",
        dispatched_ts:$now,
        dispatched_by:"dev-team",
        dispatch_note:($meta[$id].note)
      } ]) )
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-FB-POSTER-NOARG-MARKET-TOOLS", next_agent:null,
    note:("DEV-TEAM TICK " + $now + " — dispatched TWO ready->in_progress (active coding lane was 0, WIP<=2): FIX-FB-POSTER-NOARG-MARKET-TOOLS(P1)->cowork-refactory-expert (cowork-lane, mutex-wrapped; poster calls get_foreign_flow({})/get_ticker_intelligence({}) no code= => schema fail), FIX-MARKET-HEXAGRAM-TOOL-MISSING(P2)->dev-mcp-server (get_market_hexagram not in tool list, Sunday digest-predict fails; recon-first registration-gap probe). Both recon-first, disjoint zones, background. HELD ready: FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2 dev-stock-price). review[] gates 2026-06-16: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (01:00Z/02:15Z), FIX-VNSTOCK-TRADINGSTATS-CRASH (08:30Z sweep) — one-shot probes armed. ARCH-SHIP-WAVE-REAUDIT PARKED. Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). PUSH held (PO post-gates).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
