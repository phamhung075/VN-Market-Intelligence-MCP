# Router dev-team tick 2026-06-15T11:5xZ — dispatch FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL ready->in_progress.
# A coding lane just freed (FIX-MARKET-HEXAGRAM done_verified, FB-POSTER done_verified). Active coding lane=0
# (in_progress = ARCH-CRON-SCHEDULER-RELIABILITY[QA-observe] + BA-VN-MACRO-TOOLING[design], neither a coding lane).
# WIP<=2 ALLOWS one coding dispatch.
#
# TASK (P2, dev-stock-price, apps/stock-price/, Go+CGO): Tier-3 market_prices cache fallback has TWO defects —
#   (1) HONESTY: labels a STALE cached row staleness:FRESH; must mark STALE/CACHED when the row updated_at age
#       exceeds the freshness window AND/OR when no live tier (1/2) succeeded.
#   (2) UNIT: blindly multiplies Close*1000 (thousands-VND assumption) for cached entities that are NOT
#       thousands-VND VN stocks => an index/commodity level (BDI=2729) becomes 2,729,000 garbage.
#
# GENERIC mandate (/goal#2): staleness must derive from the row's actual updated_at age vs the freshness window
#   for ALL entities (no per-ticker literal); the *1000 must be conditional on the entity's real unit/exchange/
#   asset-class metadata (stock-in-thousands-VND vs index/commodity/fx), NOT a per-ticker allowlist or hardcoded
#   BDI special-case. recon-first: dev reads how tier-1/2 label freshness + how the unit/scale is decided
#   elsewhere (single source of unit truth), then makes tier-3 honor the same.
#
# GUARD: refuse unless task in ready[] AND not already in in_progress[]. CONSERVATION: total UNCHANGED (pure move).
# Usage: jq --arg now "$NOW" -f scripts/router-d74-dispatch-stockprice-tier3-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.ready[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in ready[] — refuse")
  elif ([.task_board.in_progress[]? | select(.id==$tid)]|length>0) then error("already in in_progress[] — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]? | select(.id!=$tid) ]
| .task_board.in_progress = (.task_board.in_progress + [ $t + {
      status:"IN_PROGRESS",
      route_to:"dev-stock-price",
      zone:"apps/stock-price/",
      lane:"dev-zone",
      mode:"recon-first",
      dispatched_ts:$now,
      dispatched_by:"dev-team",
      dispatch_note:"Tier-3 market_prices cache fallback: (1) HONESTY — stop labeling stale cached rows FRESH; derive staleness from row updated_at age vs freshness window AND require a live tier success for FRESH. (2) UNIT — stop blind Close*1000; scale conditionally on the entity's real unit/asset-class (stock-thousands-VND vs index/commodity/fx) using the existing single unit-truth source. GENERIC: no per-ticker literal, no BDI special-case. recon-first: read tier-1/2 freshness labeling + unit/scale decision points before editing."
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"dev-stock-price",
    note:("DEV-TEAM TICK " + $now + " — dispatched FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2) ready->in_progress -> dev-stock-price (coding lane freed after HEXAGRAM+FB-POSTER done_verified; active coding lane was 0, WIP<=2). Two defects: (1) stale row labeled FRESH (honesty) — derive staleness from updated_at age vs window + require live-tier success; (2) blind Close*1000 garbles non-VND-stock units (BDI 2729->2,729,000) — scale conditionally on entity unit/asset-class via single unit-truth source. GENERIC /goal#2: no per-ticker literal / no BDI special-case. recon-first, background. review[] gates 2026-06-16: FIX-VNSTOCK-TRADINGSTATS-CRASH (08:30Z sweep, probe 3b57017e), FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (01:00Z/02:15Z, probe 09b8693f). ARCH-SHIP-WAVE-REAUDIT PARKED. Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). FIX-MARKET-HEXAGRAM + FIX-FB-POSTER done_verified. PUSH held (PO post-gates).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
