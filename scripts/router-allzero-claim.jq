# Router board claim: ALLZERO-OHLCV-FETCH backlog[] -> in_progress[] (READY -> IN_PROGRESS).
# Chart-sliver DATA fix (user's explicit bug). Unblocked now that FIX-MCP-CRASH-LOOP-WRITEWAL umbrella
# closed (done_verified) and freed the apps/mcp-server one-in-flight zone slot. depends=[] satisfied.
# Design complete IN THE BOARD OBJECT (scope + acceptance + regression_note authored by po-S52) — the
# handoff FILE BACKLOG_CONTAM_8.md is the STALE pre-rescope sketch, superseded by those board fields.
# => dispatch dev-technical-analysis DIRECTLY (no architect/pm). Sets head in_progress/next_agent.
# GUARD: refuse unless ALLZERO in backlog[] AND status READY AND depends empty AND in_progress[] EMPTY
#        (protect the apps/mcp-server one-in-flight slot) AND umbrella done_verified.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router claim before dev spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-allzero-claim.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.backlog | map(select(.id=="ALLZERO-OHLCV-FETCH"))[0]) as $t
| (((.task_board.done_verified // []) + (.task_board.done // []))
    | map(select(.id=="FIX-MCP-CRASH-LOOP-WRITEWAL" and .status=="done_verified")) | length) as $umbrella_closed
| if $t == null then error("ALLZERO-OHLCV-FETCH not in backlog[] — refuse")
  elif ($t.status != "READY") then error("ALLZERO status != READY (got \($t.status)) — refuse")
  elif (($t.depends // []) | length) != 0 then error("ALLZERO has unmet depends \($t.depends) — refuse")
  elif ((.task_board.in_progress // []) | length) != 0
    then error("in_progress[] not empty \((.task_board.in_progress|map(.id))) — apps/mcp-server slot busy, refuse")
  elif ($umbrella_closed != 1) then error("FIX-MCP-CRASH-LOOP-WRITEWAL not done_verified — zone gate unmet, refuse")
  else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      claimed_at: $now,
      claimed_by: "router",
      next_agent: "dev-technical-analysis",
      dispatch_note: "Dispatched dev-technical-analysis \($now). Chart-sliver DATA fix (user bug: price range min/max compressed, BB ±35k fan). AUTHORITATIVE brief = THIS board object's .scope/.acceptance/.regression_note (handoff file BACKLOG_CONTAM_8.md is the STALE pre-rescope sketch — IGNORE its low-priority/dev-mcp-server framing). Root: non-trading-day gap (2026-05-30) written as 0/0/0/0 candle in daily_ohlcv -> a 0 inside the 20-period BB window detonates stdev AND zero-anchors the chart Y-domain. GENERIC across ALL tickers — find the bulk-fetch emitter + guard skip-write on vol=0/open=0 non-trading day; backfill purge/forward-fill existing all-zero rows so get_price_history/get_technical_indicators/chart loader are gap-free. Fold VCB 2026-06-01 close=62.2 unit regression (×1000 normalize) into the same backfill. Accept: probe SHB(~13.8k)/VCB(~61.6k)/FPT(~73.5k) — no close=0 non-trading day, Min in real band, BB width <±15% not ±47%. Verify LIVE via direct market.db COUNT (named volume, NOT host ./data). Run pnpm check BEFORE commit (RED-PREPUSH). Promote -> review (qa) on green + commit. FIX-FE-CHART-PRICE-DOMAIN (dev-frontend) is gated behind this completing."
    })
  ]
| .task_board.backlog |= map(select(.id != "ALLZERO-OHLCV-FETCH"))
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "ALLZERO-OHLCV-FETCH",
    next_agent: "dev-technical-analysis",
    note: "ALLZERO-OHLCV-FETCH claimed — chart-sliver DATA fix (poison 0/0/0/0 non-trading-day row detonates BB stdev + zero-anchors Y-domain). dev-technical-analysis implements per board .scope/.acceptance/.regression_note (handoff file stale). GENERIC all-ticker. Promote -> review (qa) on green pnpm check + commit. FIX-FE gated behind this."
  }
