# Router board promote: FIX-FE-CHART-PRICE-DOMAIN review[REVIEW] -> done_verified[DONE_VERIFIED].
# qa (agent ae42c1ff, cycle 266) returned APPROVED. Router RAW-verified before promotion:
#  - commit 366bd297 ("data-driven Y-domain + series sanitize") is in git history; HEAD d9546817 is qa's memory commit.
#  - independent genericity grep over indicators.ts + StockChart.tsx for 30 watchlist tickers => ONLY hit is a
#    JSDoc comment line (indicators.ts:17 " * ...like VCB..."), ZERO executable hardcode. DOMAIN_PAD=0.06 is a
#    ratio, not a price band. Both sanitize passes predicate-only (close===0&&vol===0; ratio>10||<0.1).
#  - reports/TASK_REPORT_FIX-FE-CHART-PRICE-DOMAIN.md present.
#  - frontend container rebuilt+live (2ba40ca60a35, image 2026-06-14T08:41:05Z, HTTP 200, sanitizePrices in
#    /app/build/server/index.js); qa multi-ticker gate GREEN: SHB/VCB/FPT all 4 ACs PASS (Y not zero-anchored,
#    candles 55.3%/70.9%/47.1% of pane vs 6.7% pre-fix, BB 5.2%/5.1%/4.6% of price, 0 poison rows). Unit suite
#    1572/1572 pass incl 18 new sanitize tests; tsc --noEmit 0 errors.
# This CLOSES the user chart bug END-TO-END: DATA half ALLZERO-OHLCV-FETCH already done_verified + FRONTEND half
# FIX-FE now done_verified. Frees the WIP slot; sets head idle (no in-flight pipeline).
# GUARD: refuse unless FIX-FE in review[] with status REVIEW (exactly qa's approved state). No status regression.
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b reconcile / Step 4 post-cycle promote-on-qa-green).
# Usage: jq --arg now "$NOW" -f scripts/router-fixfe-done-verified.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rev
| ([$rev[] | select(type=="object" and .id=="FIX-FE-CHART-PRICE-DOMAIN")][0]) as $fe
| if $fe == null then error("FIX-FE-CHART-PRICE-DOMAIN not in review[] — refuse")
  elif ($fe.status != "REVIEW") then error("FIX-FE status != REVIEW (got \($fe.status)) — refuse")
  else . end
# remove FIX-FE from review[]
| .task_board.review = [$rev[] | select((type=="object" and .id=="FIX-FE-CHART-PRICE-DOMAIN") | not)]
# append to done_verified[] with full provenance
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    ($fe + {
      status: "DONE_VERIFIED",
      verified_at: $now,
      verified_by: "router",
      qa_agent: "ae42c1ff",
      qa_cycle: 266,
      commit: "366bd297",
      verify_note: "qa APPROVED (cycle 266) + router RAW-verified. Multi-ticker live gate GREEN: SHB(13.8k)/VCB(61.6k)/FPT(73.5k) all 4 ACs PASS — Y-domain not zero-anchored (domainMin 12314/54990/65800), candles 55.3%/70.9%/47.1% of pane (vs 6.7% pre-fix), BB 5.2%/5.1%/4.6% of price (vs ±35k fan), 0 poison rows. Generic predicate-based sanitize, ZERO executable ticker hardcode (router re-grepped 30 tickers => only a JSDoc comment). Unit 1572/1572 incl 18 new sanitize tests; tsc 0. Container rebuilt+live (2ba40ca60a35). CLOSES user chart bug end-to-end with DATA half ALLZERO-OHLCV-FETCH."
    })
  ])
# head -> idle (no in-flight pipeline; both halves of the chart bug done_verified)
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null,
    note: "FIX-FE-CHART-PRICE-DOMAIN done_verified (qa cycle 266 APPROVED + router RAW). User chart bug CLOSED end-to-end (DATA half ALLZERO-OHLCV-FETCH + FRONTEND half FIX-FE both done_verified). WIP=0. Next eligible: ARCH-CRON-SCHEDULER-RELIABILITY (ready[], apps/mcp-server, depends_on=null) on a future dispatcher tick."
  }
