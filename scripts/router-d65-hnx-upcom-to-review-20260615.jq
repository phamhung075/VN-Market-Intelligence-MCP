# Router dev-team tick 2026-06-15T1xZ — RELOCATE FIX-HNX-UPCOM-PRICE-SOURCES-DEAD
# in_progress[] -> review[] on dev-stock-price return (agentId a410f1cd).
#
# WHY THIS MOVE EXISTS: the dev's own board commit d5131030 flipped the task's
# status FIELD to "REVIEW" but left the object PHYSICALLY in in_progress[] (never
# relocated). Router owns the lane move — this script physically relocates it and
# records the independent RAW verification, so lane membership == status field.
#
# ROUTER RAW VERIFY (git + code + tests + watchlist, NOT a relayed badge):
#   * fix commit af481e12 = 3 files (fetchers.go +122/-, fetchers_test.go +30,
#     infrastructure.md doc) — zone-only, no -A sweep / foreign / secret.
#   * code diff RAW-read: Tier1/2 endpoint /v4/stocks -> /v4/stock_prices (the
#     /v4/stocks path returned company INFO, no OHLCV); Tier3 column fetched_at ->
#     updated_at (matches live market_prices schema). Source derived from .floor
#     (HOSE/HNX/UPCOM) NOT hardcoded SourceHOSE; Price *1000 (thousands VND ->
#     VND, e.g. 17.7 => 17,700 — plausibility-correct). GENERIC: no per-ticker
#     allowlist / date-literal / hardcode (/goal#2 PASS).
#   * router-run `go test ./...` (apps/stock-price) => infrastructure 0.671s OK +
#     all suites green (RAW, not cached-only — infra recompiled).
#   * DEAD-TICKER RECLASSIFICATION corroborated independently: BDI/DLC/JSH/SIS/VDC
#     are NONE of them in the 30-ticker watchlist (jq system-map). BDI = Bloomberg
#     Baltic Dry INDEX (floor=BLOOMBERG type=INDEX), DLC delisted 2016-11-11,
#     JSH/SIS/VDC unknown to VnDirect. rows=0 for these is CORRECT, not a defect —
#     the original task premise (5 recoverable small-caps) was false. The genuine
#     defect was the endpoint+schema bug affecting the 3-tier path for ALL tickers.
#
# REBUILD_REQUIRED: YES — fetchers.go is runtime code in apps/stock-price/. Router
#   dispatches ops to FORCE-RECREATE stock-price ONLY (NEVER docker compose down —
#   named-vol market.db + peers). Verify peers + DB rows post-rebuild.
#
# LIVE GATE (router RAW-verifies AFTER rebuild, then review->done_verified):
#   probe the stock-price SERVICE's own price path (NOT get_market_snapshot which
#   may read market.db directly) for a watchlist HNX/UPCOM ticker (SHB/HUT) =>
#   plausible non-zero VND price + correct source(floor); AND a dead ticker (BDI)
#   => HONEST empty/absent (no fabricated zero, no crash). Plausibility per /goal#1.
#
# GUARD: refuse unless task in in_progress[] AND not already in review[].
# CONSERVATION: total task count UNCHANGED (pure move in_progress->review).
# Usage: jq --arg now "$NOW" -f scripts/router-d65-hnx-upcom-to-review-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-HNX-UPCOM-PRICE-SOURCES-DEAD" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in in_progress[] — refuse")
  elif ([.task_board.review[]? | select(.id==$tid)]|length>0) then error("already in review[] — refuse")
  else . end
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!=$tid) ]
| .task_board.review = (.task_board.review + [ $t + {
      status:"REVIEW",
      review_entered_ts:$now,
      fix_commit:"af481e12",
      board_commit_by_dev:"d5131030 (flipped status field only — router relocated object)",
      root_cause:"stock-price 3-tier price fallback broken: Tier1/2 hit VnDirect /v4/stocks (company INFO, no OHLCV) instead of /v4/stock_prices; Tier3 queried non-existent column fetched_at instead of updated_at. Endpoint+schema bug affected ALL tickers via the 3-tier path; active tickers were masked by other data paths. The 5 named 'dead' tickers (BDI/DLC/JSH/SIS/VDC) were a FALSE premise — delisted/index/unknown, none in watchlist.",
      tests_green:"router-run go test ./... (apps/stock-price) — infrastructure 0.671s OK, all suites green (infra recompiled, not cached-only)",
      commit_hygiene_verified:"router git show --stat af481e12 = 3 files (fetchers.go +122, fetchers_test.go +30, infrastructure.md doc), zone-only, no -A sweep/foreign/secret",
      generic_verified:"/goal#2 PASS — source derived from .floor (HOSE/HNX/UPCOM) not hardcoded; price *1000 thousands->VND; no per-ticker allowlist/date-literal",
      dead_ticker_reclassification:"router-corroborated: BDI=Bloomberg Baltic Dry INDEX, DLC delisted 2016-11-11, JSH/SIS/VDC unknown to VnDirect; NONE in 30-ticker watchlist => rows=0 is correct behavior not a defect",
      rebuild_required:true,
      rebuild_scope:"stock-price ONLY — fetchers.go is runtime code in apps/stock-price/. Force-recreate only, NEVER down (named-vol market.db). Verify peers + DB rows.",
      pending_live_gate:"AFTER rebuild: probe stock-price SERVICE price path (not get_market_snapshot) for watchlist HNX/UPCOM ticker (SHB/HUT) => plausible non-zero VND + correct source(floor); dead ticker (BDI) => honest empty (no fabricated zero/crash). Plausibility per /goal#1. Then review->done_verified.",
      push_disposition:"HOLD — bundles with held RSI/MA5/restart commits; PO pushes the fast-forward after the FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate closes 2026-06-16"
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops",
    rebuild_required:true,
    note:("DEV-TEAM TICK " + $now + " — FIX-HNX-UPCOM-PRICE-SOURCES-DEAD dev-stock-price RETURNED (a410f1cd), router RELOCATED in_progress->review (dev d5131030 only flipped status field, left object stranded in in_progress[]). Fix af481e12: Tier1/2 endpoint /v4/stocks->/v4/stock_prices, Tier3 col fetched_at->updated_at, source from .floor, price*1000. Router RAW: 3-file zone commit no -A/secret; go test ./... green (infra 0.671s recompiled); GENERIC no allowlist (/goal#2). Dead tickers BDI/DLC/JSH/SIS/VDC reclassified NOT-recoverable (index/delisted/unknown, none in watchlist) — corroborated. REBUILD_REQUIRED=YES stock-price ONLY (force-recreate, NEVER down) — router dispatches ops. LIVE GATE after rebuild: service price path for watchlist HNX/UPCOM => plausible non-zero + correct source; dead ticker => honest empty; then review->done_verified. PUSH held (bundle, PO post-RSI-gate 2026-06-16). PARALLEL: FIX-VNSTOCK-TRADINGSTATS-CRASH in_progress (dev-mcp-server a8448dee running); FIX-ALERT-ENGINE-RSI-SINGLEDIGIT review (behavioral gate 2026-06-16). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (design).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
