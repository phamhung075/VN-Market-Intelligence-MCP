# Router 2026-06-15T12:0xZ — FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL in_progress -> review + dispatch ops rebuild.
#
# DEV RETURN (dev-stock-price ab9b160e, commit 8fde56ef @ 2026-06-15 11:58:49 UTC). Router RAW-verified (NOT relayed):
#   * commit hygiene: 3 files ALL apps/stock-price/ zone (fetchers.go +30, price_resolution.go +24, _test.go +118),
#     no -A/secret, linear.
#   * STALENESS fix (price_resolution.go): track winningTierIndex over {tier1,tier2,tier3}; if index==2 (cache wins,
#     i.e. BOTH live tiers failed) AND classifier label==Fresh => downgrade to Stale. "tier-3 won" == "no live tier
#     succeeded" == the spec OR condition. Honest. Generic (tier index, not ticker).
#   * SCALE fix (fetchers.go Tier1+Tier2 live): *1000 now guarded by item.Type=="STOCK" && Floor in {HOSE,HNX,UPCOM};
#     indices (type=="INDEX") / non-VN floors read as-is. Tier3CacheFetcher reads price AS-IS (no *1000) — confirmed
#     by reading fetchers.go:248-256. Single unit-truth source = VnDirect API type+floor.
#   * LIVE DB sanity (router-run, named volume NOT host decoy): market_prices has NO poison — MAX price 192600 (VIC,
#     real), 0 rows >1M, indices stored at correct scale (VNINDEX 1799.31, VN30 1962.48, HNXINDEX 310.91). So the old
#     *1000 bug left nothing to backfill; the guard prevents future poisoning.
#   * TESTS (router re-run, NOT relayed): go build EXIT 0; go test ./pkg/module/price_resolution/ => TestCacheFallbackNotFresh
#     PASS, TestLiveTierFreshAllowed PASS, TestTier2LiveFreshAllowed PASS; ./pkg/infrastructure/ ok.
#   * GENERIC /goal#2 PASS: no per-ticker/BDI literal; staleness from tier index, scale from API type+floor metadata.
#
# REBUILD_REQUIRED: YES — stock-price container ONLY (runtime Go service; live fetch scale + resolution staleness changed).
#   Current image .Created 2026-06-15T11:03:31Z is BEFORE commit 11:58:49Z => stale, must rebuild. Force-recreate only,
#   NEVER down (named-vol market.db + peers). Router dispatches ops.
#
# LIVE GATE (router RAW-verifies AFTER rebuild, then review->done_verified):
#   (1) stock-price image .Created > commit 8fde56ef (11:58:49Z), RestartCount=0, healthy, peers up.
#   (2) spot price call still sane: a VN stock (e.g. VCB) returns plausible thousands-VND (~55-70k), NOT *1000-inflated
#       to tens of millions; market_prices still has 0 rows >1M (no new poison).
#   (3) staleness honesty: any tier-3/cache-served quote labeled STALE/CACHED, never FRESH (unit-proven; spot-check live
#       if a cache-served symbol is observable). Plausibility per /goal#1.
#
# GUARD: refuse unless task in in_progress[] AND not in review[]/done_verified[]. CONSERVATION: total UNCHANGED.
# Usage: jq --arg now "$NOW" -f scripts/router-d75-stockprice-tier3-review-dispatch-ops-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in in_progress[] — refuse")
  elif ([.task_board.review[]?,.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already past in_progress — refuse")
  else . end
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!=$tid) ]
| .task_board.review = (.task_board.review + [ $t + {
      status:"REVIEW",
      review_entered_ts:$now,
      fix_commit:"8fde56ef",
      root_cause:"(1) price_resolution.Resolve labeled a tier-3 cache hit FRESH by timestamp without tracking which tier won (dishonest). (2) Tier1/Tier2 VnDirect fetchers blindly did Close*1000 (thousands-VND assumption) for ALL responses, garbling indices/non-VN-floor assets.",
      fix_summary:"track winningTierIndex over {tier1,tier2,tier3}; tier-3 win (both live tiers failed) downgrades FRESH->STALE. Guard *1000 on item.Type==STOCK && Floor in {HOSE,HNX,UPCOM}; indices/non-VN read as-is. Tier3CacheFetcher already reads price as-is. Single unit-truth = VnDirect API type+floor.",
      router_raw_verify:"commit zone-clean (3 files apps/stock-price/, no -A); staleness diff = winningTierIndex==2 && Fresh -> Stale (tier order {t1,t2,t3}, idx2=cache=both-live-failed=spec OR); scale guard type+floor; Tier3 reads as-is (fetchers.go:248-256); router-run go build EXIT0; go test price_resolution 3 new tests PASS + infrastructure ok; LIVE named-vol market_prices NO poison (max 192600 VIC, 0 rows>1M, VNINDEX 1799 correct).",
      generic_verified:"/goal#2 PASS — staleness from tier index, scale from API type+floor; no per-ticker/BDI literal.",
      rebuild_required:true,
      rebuild_scope:"stock-price container ONLY (runtime Go; live fetch scale + resolution staleness). Force-recreate, NEVER down.",
      rebuild_baseline:"pre-rebuild stock-price image .Created 2026-06-15T11:03:31Z (BEFORE commit 11:58:49Z).",
      pending_live_gate:"AFTER rebuild: (1) stock-price image .Created > 8fde56ef 11:58:49Z, RestartCount=0, healthy, peers up; (2) spot VN stock (VCB) sane thousands-VND ~55-70k NOT inflated, market_prices 0 rows>1M; (3) tier-3/cache quote labeled STALE not FRESH (unit-proven). Then review->done_verified.",
      ops_dispatched_ts:$now
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops", rebuild_required:true,
    note:("ROUTER " + $now + " — FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL dev-stock-price RETURNED (ab9b160e, commit 8fde56ef), router RAW-VERIFIED -> review[]. STALENESS: tier-3 cache win downgrades FRESH->STALE (winningTierIndex==2 == both live tiers failed). SCALE: *1000 guarded by type==STOCK && VN floor; indices read as-is; Tier3 reads as-is. Router RAW: zone-clean 3 files, go build EXIT0, 3 new tests PASS, LIVE market_prices NO poison (max 192600, 0>1M, VNINDEX 1799 correct). GENERIC /goal#2. REBUILD_REQUIRED=YES stock-price ONLY (force-recreate, NEVER down) — router DISPATCHING ops; baseline image 11:03:31Z. LIVE GATE post-rebuild: image .Created>11:58:49Z + healthy + peers + spot VCB sane thousands-VND + 0 rows>1M; then review->done_verified. Other review[] gates 2026-06-16: FIX-VNSTOCK-TRADINGSTATS-CRASH (08:30Z), FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (01:00Z/02:15Z). ARCH-SHIP-WAVE-REAUDIT PARKED. FIX-MARKET-HEXAGRAM + FIX-FB-POSTER done_verified (61). Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). PUSH held (PO post-gates). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
