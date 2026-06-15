# Router 2026-06-15T12:0xZ — FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL review -> done_verified.
#
# Ops (a0fe27f8) force-recreated stock-price + ran the live gate => PASS. Router did NOT relay — RAW re-verified every
# component itself (honors feedback_router_verify_raw_not_badges + the named-volume/host-decoy trap, since the gate is
# DB-derived from market_prices + a live gateway call):
#   (1) docker inspect (router-run): image .Created 2026-06-15T12:04:35Z > commit 8fde56ef 11:58:49Z (UTC; %cI was
#       13:58:49+02:00); health=healthy; RestartCount=0; running=true; 13 peers Up (force-recreate, NONE killed).
#   (2) mount resolved (router-run): /app/data = volume:vn-market-intelligence-mcp_market_data (named vol, NOT host decoy).
#       Live query: rows price>1,000,000 == 0 (NO poison); MAX 192600 VIC (real); spot FPT 73600 / VCB 61600 / VNM 59700
#       (sane thousands-VND); VN30 1962.48 / VNINDEX 1799.31 (index scale, NOT *1000-inflated). Scale integrity holds.
#   (3) call_tool get_ticker_intelligence({code:VCB}) (router-run, NOT relayed): 61,600 VND, fresh ts 12:06:09Z (AFTER
#       ops 12:05:02Z => genuine live recompute, no cached relay). Plausible per /goal#1.
#   (4) staleness-honesty code present in SHIPPED source: price_resolution.go:138 `winningTierIndex==2 && label==Fresh`
#       downgrade. Unit-proven by the 3 router-re-run tests (TestCacheFallbackNotFresh etc.).
#
# REBUILD: DONE (image 12:04:35Z, force-recreate, 13 peers intact). PUSH: held (PO post-gates, bundle).
#
# GUARD: refuse unless task in review[] AND not already in done_verified[]. CONSERVATION: total UNCHANGED (pure move).
# Usage: jq --arg now "$NOW" -f scripts/router-d76-stockprice-tier3-doneverified-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL" as $tid
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
      rebuild_evidence:"stock-price force-recreated: image .Created 2026-06-15T12:04:35Z > commit 8fde56ef 11:58:49Z (UTC); health=healthy; RestartCount=0; running=true; 13 peers Up (force-recreate, NEVER down — none killed).",
      live_gate_evidence:"router-run (NOT relayed): /app/data mount resolved = named volume vn-market-intelligence-mcp_market_data (NOT host decoy). market_prices: rows price>1M == 0 (NO poison); MAX 192600 VIC; spot FPT 73600 / VCB 61600 / VNM 59700 sane thousands-VND; VN30 1962.48 / VNINDEX 1799.31 index scale (NOT inflated). call_tool get_ticker_intelligence({code:VCB}) => 61,600 VND fresh ts 12:06:09Z (after ops 12:05:02Z => genuine live recompute). Staleness-honesty code present price_resolution.go:138. Plausibility per /goal#1 PASS.",
      generic_verified:"/goal#2 PASS — staleness from tier index (winningTierIndex==2 == both live tiers failed, not per-ticker); scale from VnDirect API type==STOCK && Floor in {HOSE,HNX,UPCOM}; indices/non-VN read as-is; Tier3CacheFetcher reads price as-is. No per-ticker/BDI literal.",
      root_cause:"(1) price_resolution.Resolve labeled a tier-3 cache hit FRESH by timestamp without tracking which tier won (dishonest). (2) Tier1/Tier2 VnDirect fetchers blindly did Close*1000 for ALL responses, garbling indices/non-VN-floor assets.",
      fix_commit:"8fde56ef",
      fix_summary:"track winningTierIndex over {tier1,tier2,tier3}; tier-3 win (both live tiers failed) downgrades FRESH->STALE. Guard *1000 on item.Type==STOCK && Floor in {HOSE,HNX,UPCOM}; indices/non-VN read as-is. Tier3CacheFetcher already reads price as-is. Single unit-truth = VnDirect API type+floor.",
      push_disposition:"HOLD — bundle; PO pushes after 2026-06-16 behavioral gates close."
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:null, rebuild_required:false,
    note:("ROUTER " + $now + " — FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL PROMOTED review->done_verified. Ops (a0fe27f8) force-recreated stock-price + gated PASS; router RAW RE-VERIFIED (not relayed): own docker inspect (image 12:04:35Z>commit 11:58:49Z, healthy, restarts=0, 13 peers), own named-vol market_prices query (0 rows>1M, VCB 61600/FPT 73600 sane, VN30 1962/VNINDEX 1799 index scale), own call_tool get_ticker_intelligence(VCB)=>61,600 VND fresh recompute 12:06:09Z, staleness code present price_resolution.go:138. STALENESS: tier-3 win downgrades FRESH->STALE. SCALE: *1000 guarded by type==STOCK && VN floor. GENERIC /goal#2. Commit 8fde56ef. REBUILD DONE. Remaining review[] gates 2026-06-16: FIX-VNSTOCK-TRADINGSTATS-CRASH (08:30Z sweep, probe 3b57017e), FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (01:00Z/02:15Z, probe 09b8693f). ARCH-SHIP-WAVE-REAUDIT PARKED. FIX-MARKET-HEXAGRAM + FIX-FB-POSTER done_verified. Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). PUSH held (PO post-gates). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
