# Router 2026-06-15T11:2xZ — SHARPEN FIX-VNSTOCK-TRADINGSTATS-CRASH live gate (in-place, NO lane move).
#
# WHY: ops acce77e8 returned REBUILD+GATE all-PASS, but RAW router re-verify caught that the agent
# read the HOST DECOY data/market.db (memory feedback_live_db_is_named_volume_not_host_data), NOT the
# authoritative named volume vn-market-intelligence-mcp_market_data mounted at /app/data. Re-reading the
# LIVE named volume changed the picture:
#   * REBUILD (router-confirmed live): mcp-server image .Created 2026-06-15T11:17:43Z > commit 64f188fc
#     11:09:51Z UTC; Health=healthy (not just "starting"), RestartCount=0, StartedAt 11:17:44Z; 11/11 peers up.
#   * vnstockStartupProbe | 2026-06-15 11:17:47 | success — POST-FIX boot probe ran 3s after reboot and
#     succeeded (container loads vnstock module clean). NECESSARY but NOT sufficient: the startup probe is a
#     lighter path than the full sweep (the 08:02 startup probe succeeded the same morning the 08:30 sweep crashed).
#   * vnstockTradingStatsRefresh | 2026-06-15 08:30:01 | CRASHED — the actual sweep job ran TODAY and crashed,
#     but that was BEFORE the fix (commit 11:09:51Z / rebuild 11:17:43Z). PRE-FIX bug symptom, NOT a regression.
#   * vnstockFundamentalsRefresh | 01:05 | success | 51 then | 0 — sibling fundamentals job (prior fix family)
#     shows honest rows_written LIVE (51 real, 0 on re-run) — corroborates the rowsWritten-honesty pattern works.
#   * Live vnstock_trading_stats = 3631 rows (agent host-decoy reported 0 — wrong DB). Freshness col = fetched_at.
#
# DAY-OF-WEEK CORRECTION: agent claimed "today is Sunday, next run Monday." RAW date: today = Monday 2026-06-15
# (dow=1); the 08:30:01 crashed run proves a weekday fired. Tomorrow 2026-06-16 = Tuesday (dow=2, weekday) =>
# next vnstockTradingStatsRefresh fires 2026-06-16 08:30 UTC. THAT is the first live exercise of the fix.
#
# DISPOSITION: KEEP in review[] (do NOT promote). Deploy-healthy + 10 unit tests green + green boot probe = the
# FLOOR per /goal#1, not the bar; the historically-crashing sweep path is unproven on the live deploy until the
# 2026-06-16 08:30 UTC run. One-shot behavioral probe armed (router-d68 cron) to close/fail the gate post-run.
#
# GUARD: refuse unless FIX-VNSTOCK-TRADINGSTATS-CRASH in review[] AND not in done_verified[]. CONSERVATION: total
# task count UNCHANGED (in-place field update on the review entry, no lane move).
# Usage: jq --arg now "$NOW" -f scripts/router-d68-vnstock-gate-sharpen-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-VNSTOCK-TRADINGSTATS-CRASH" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| if ([.task_board.review[]? | select(.id==$tid)]|length==0) then error($tid + " not in review[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already in done_verified[] — refuse")
  else . end
| .task_board.review = [ .task_board.review[]?
    | if .id==$tid then . + {
        rebuild_landed:"router-confirmed LIVE: mcp-server image .Created 2026-06-15T11:17:43Z > commit 64f188fc 11:09:51Z UTC; Health=healthy RestartCount=0 StartedAt 11:17:44Z; 11/11 peers up; /health 200 toolCount 163.",
        live_db_correction:"ops acce77e8 read the HOST DECOY data/market.db (reported trading_stats=0 rows, 'today is Sunday', 'no post-fix run'); ALL wrong. Router RAW-queried the authoritative named volume vn-market-intelligence-mcp_market_data (/app/data): trading_stats=3631 rows; today=Monday 2026-06-15; vnstockTradingStatsRefresh ran TODAY 08:30:01 and CRASHED (pre-fix, before rebuild 11:17:43Z).",
        live_evidence:"vnstockStartupProbe 11:17:47 success (post-fix boot probe clean — necessary not sufficient, lighter path than sweep); vnstockTradingStatsRefresh 08:30:01 crashed (PRE-fix symptom, not regression); vnstockFundamentalsRefresh 01:05 success rows_written 51 then 0 (sibling honest rowsWritten live).",
        pending_live_gate:"UNMET — code-live + deploy-healthy + 10 unit tests green + green boot probe = FLOOR not bar (/goal#1). The historically-crashing sweep path runs next 2026-06-16 08:30 UTC (Tuesday weekday). GATE (router-d68 one-shot probe ~09:12 UTC): query named-volume cron_job_runs for the newest vnstockTradingStatsRefresh started_at >= 2026-06-16 08:30 — require status='success' (NOT crashed) AND rows_written = honest vnstock_trading_stats COUNT delta (plausibility per /goal#1; a succeeded>0 / 0-new-rows run must report rows_written=0 not ticker count). Freshness col = fetched_at. GREEN => router move review->done_verified + commit. CRASH/FAIL => keep review + dispatch dev-mcp-server fixer.",
        next_live_gate_utc:"2026-06-16T08:30:00Z (vnstockTradingStatsRefresh, weekdays 30 8 * * 1-5); router-d68 one-shot probe armed 2026-06-16 09:12 UTC (11:12 CEST).",
        gate_sharpened_ts:$now
      } else . end ]
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:null,
    note:("ROUTER " + $now + " — FIX-VNSTOCK-TRADINGSTATS-CRASH rebuild LANDED + RAW-verified live (image 11:17:43Z>commit, healthy RestartCount=0, 11 peers, boot probe 11:17:47 success). CAUGHT ops acce77e8 host-decoy read (reported trading_stats=0/Sunday/no-run — all wrong); authoritative named volume shows 3631 rows, today=Monday, vnstockTradingStatsRefresh 08:30:01 CRASHED PRE-fix. KEPT in review[] (NOT promoted): live sweep path unproven on deploy until next run 2026-06-16 08:30 UTC (Tue). One-shot behavioral probe armed 2026-06-16 09:12 UTC: require status=success + rows_written honest COUNT-delta => then review->done_verified. PARALLEL gate: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT review (01:00Z briefing / 02:15Z scan 2026-06-16). PUSH held (PO post-gates). Ready: FIX-FB-POSTER-NOARG-MARKET-TOOLS(P1), FIX-MARKET-HEXAGRAM-TOOL-MISSING(P2), FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2). Holds: ARCH-CRON-SCHEDULER-RELIABILITY(QA-observe), BA-VN-MACRO-TOOLING(design). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on an in-place field update") else . end
