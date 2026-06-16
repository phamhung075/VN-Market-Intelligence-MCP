# Router 2026-06-16T09:4xZ — FIX-VNSTOCK-TRADINGSTATS-CRASH review -> done_verified (live behavioral gate GREEN).
#
# The .pending_live_gate fired: the historically-crashing vnstockTradingStatsRefresh weekday-08:30 sweep ran for the
# FIRST time AFTER the 2026-06-15T11:17:43Z deploy. Router RAW-verified the LIVE named volume (NOT host ./data decoy),
# did NOT relay any sub-agent badge (honors feedback_router_verify_raw_not_badges + feedback_live_db_is_named_volume):
#   (1) cron_job_runs (router-run sqlite3 sidecar, named vol vn-market-intelligence-mcp_market_data /data/market.db):
#         vnstockTradingStatsRefresh 2026-06-16 08:30:01  status=success  error='' rows_written=0   <- TODAY, post-deploy
#         vnstockTradingStatsRefresh 2026-06-15 08:30:01  status=crashed  rows_written=-1            <- PRE-deploy crash
#         vnstockTradingStatsRefresh 2026-06-09 08:30:00  status=success  rows_written=33
#       => newest run started_at >= 2026-06-16 08:30 is SUCCESS (NOT crashed/error). The ~50% crash family is closed
#          on its first live sweep after deploy.
#   (2) rows_written=0 is HONEST, NOT a ticker count (~1200) and NOT result.succeeded — the false-positive-success bug
#       (rowsWritten=result.succeeded) is killed. Plausibility per /goal#1: table vnstock_trading_stats COUNT=3735 and
#       MAX(fetched_at)=2026-06-16T08:04:35 PREDATES the 08:30 run => the 08:30 sweep genuinely wrote 0 new rows and
#       reported 0. The +104 over the 3631 baseline (2026-06-15T11:24Z) came from earlier runs across the day, not this
#       run. rows_written is a real COUNT delta (DB getDbFn), not a fabricated ticker tally.
#
# REBUILD: already DONE (image .Created 2026-06-15T11:17:43Z > commit 64f188fc 11:09:51Z; healthy; 11/11 peers up —
#   router-confirmed at gate-sharpen time). PUSH: held (PO post-gates, bundle; branch ahead 19/behind 8).
#
# GUARD: refuse unless task in review[] AND not already in done_verified[]. CONSERVATION: total UNCHANGED (pure move).
# HEAD: kept non-dispatching (status idle, active_task_id null, next_agent null) so the next dev-team tick falls to
#   Step 1 triage — promotion is recorded in the task object, not the head.
# Usage: jq --arg now "$NOW" -f scripts/router-d79-vnstock-tradingstats-doneverified-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-VNSTOCK-TRADINGSTATS-CRASH" as $tid
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
      rebuild_evidence:"mcp-server force-recreated: image .Created 2026-06-15T11:17:43Z > commit 64f188fc 11:09:51Z (UTC); Health=healthy; RestartCount=0; 11/11 peers Up (force-recreate, NEVER down).",
      live_gate_evidence:"router-run RAW (NOT relayed), named volume vn-market-intelligence-mcp_market_data /data/market.db: cron_job_runs newest vnstockTradingStatsRefresh started_at 2026-06-16 08:30:01 status=success error='' rows_written=0 (prior 2026-06-15 08:30:01 crashed = PRE-deploy; deploy 11:17:43Z). rows_written=0 HONEST not ticker count. Plausibility /goal#1: vnstock_trading_stats COUNT=3735, MAX(fetched_at)=2026-06-16T08:04:35 predates the 08:30 run => 0 new rows genuine; +104 over 3631 baseline from earlier runs. First live exercise of the historically-crashing sweep path post-deploy = SUCCESS.",
      generic_verified:"/goal#2 PASS — 30-min retry backoff applied to every ticker null path (syncStock trading_stats + syncStockLight trading_stats/financials/balance_sheet); rowsWritten = COUNT(vnstock_trading_stats) DB-delta via DI getDbFn for ALL tickers; no per-ticker/date allowlist; 30-min matches existing financials backoff constant.",
      root_cause:"runVnstockTradingStatsJob: markFetched(code,'trading_stats') called with NO backoffMinutes on null/timeout => stamped fetched_at=now on a FAILED fetch, silencing retries for the full 2h staleness window (data never landed, job believed 'freshly fetched'). Plus runVnstockTradingStatsJobCron reported rowsWritten=result.succeeded (ticker count) => false-positive success when all fetches null.",
      fix_commit:"64f188fc",
      fix_summary:"30-min retry backoff on all 4 null paths (syncStock trading_stats + syncStockLight trading_stats/financials/balance_sheet) — DRY mirror of FIX-FUNDAMENTALS-REFRESH-CRON-DEAD family; rowsWritten computed from COUNT(vnstock_trading_stats) DB-delta via DI getDbFn (not ticker count). 45s Python subprocess SIGTERM timeout was already correct.",
      push_disposition:"HOLD — bundle; PO pushes the fast-forward after the remaining 2026-06-16 behavioral gates close."
    } ])
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null, rebuild_required:false,
    note:("ROUTER " + $now + " — FIX-VNSTOCK-TRADINGSTATS-CRASH PROMOTED review->done_verified on live behavioral gate GREEN. RAW-verified (NOT relayed) named-vol cron_job_runs: vnstockTradingStatsRefresh 2026-06-16 08:30:01 success rows_written=0 (honest 0, not ticker count; prior 06-15 crash was PRE-deploy 11:17:43Z). Plausibility /goal#1: COUNT=3735, MAX(fetched_at)=08:04:35 predates the 08:30 run => 0-new genuine. Fix 64f188fc. REBUILD done. Head kept idle (non-dispatching) -> next tick falls to Step 1. Remaining review[] gate: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (data_source_fixed, alert-engine-vs-canonical RSI residual). PUSH held (PO post-gates; branch ahead 19/behind 8). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
