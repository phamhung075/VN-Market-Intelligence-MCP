# Router dev-team tick 2026-06-15T11:1xZ — RELOCATE FIX-VNSTOCK-TRADINGSTATS-CRASH
# in_progress[] -> review[] on dev-mcp-server return (agentId a8448dee).
#
# WHY THIS MOVE EXISTS: dev flipped the task's status FIELD to "REVIEW" but left the
# object PHYSICALLY in in_progress[] (recurring pattern). Router owns the lane move.
#
# ROUTER RAW VERIFY (git + code diff + router-run tests, NOT a relayed badge):
#   * fix commit 64f188fc = 3 files ALL in apps/mcp-server/ zone (syncVnstockData.ts +8,
#     vnstockFundamentalsJob.ts +44, fix-vnstock-tradingstats-crash.test.ts +308) — no -A
#     sweep / foreign file / secret. Memory commits (09fd9d93 notebook, a14a49c8 journal)
#     separate. Linear history on router 661a5a9d (no board divergence; orch-state not dirty).
#   * CODE DIFF RAW-READ: root cause = markFetched(code, "trading_stats") with NO
#     backoffMinutes on the null/timeout path => stamped fetched_at=now on a failed fetch,
#     silencing retries for the full 2h staleness window (data never landed but job believed
#     "freshly fetched"). Fix adds 30-min backoff on ALL 4 null paths (syncStock trading_stats
#     + syncStockLight trading_stats/financials/balance_sheet) — DRY mirror of the
#     FIX-FUNDAMENTALS-REFRESH-CRON-DEAD family. PLUS rowsWritten now computed from
#     COUNT(vnstock_trading_stats) DB-delta (DI getDbFn) instead of result.succeeded
#     (ticker count) — kills the false-positive "success" when all fetches return null.
#     GENERIC: no per-ticker/date hardcode; 30-min matches existing financials backoff.
#   * ROUTER-RUN bun test fix-vnstock-tradingstats-crash.test.ts => 10 pass / 0 fail /
#     21 expect(). Output proves the fix LIVE: succeeded=3 rowsWritten=0 (the false-positive
#     case the fix kills) vs succeeded=1 rowsWritten=1 (honest delta). Adjacent
#     1920a-vnstock-fundamentals-job + fix-vnstock-fundamentals-crash-spike => 17 pass / 0
#     fail (no regression). bun tsc --noEmit clean.
#   * DISJOINT-FAILURE-SET (per feedback_ci_subset_verify): full suite 12982 pass / 44 fail;
#     router confirmed NO _deprecated test references syncVnstockData/vnstockFundamentalsJob/
#     vnstock_trading_stats => the 44 pre-existing failures are disjoint from the changed
#     modules (not a regression from this fix).
#
# REBUILD_REQUIRED: YES — mcp-server ONLY (both source files in apps/mcp-server/). Force-
#   recreate only, NEVER docker compose down (named-vol market.db + peers). Verify peers + rows.
#
# LIVE GATE (router RAW-verifies AFTER rebuild, then review->done_verified):
#   (1) rebuild lands: mcp-server image .Created > commit 64f188fc (2026-06-15T11:09:51Z UTC),
#       RestartCount=0, healthy, all peers up, market.db row parity.
#   (2) NO crash on the trading_stats sync path (the ~50% crash symptom gone) — confirm via
#       cron_job_runs (last vnstockTradingStatsRefresh run status != error) and/or a manual
#       sync trigger if a tool exists; container stays healthy RestartCount=0 after.
#   (3) rowsWritten HONESTY live: any reported rowsWritten matches the actual
#       vnstock_trading_stats COUNT delta (no ticker-count inflation). Backoff retry-semantics
#       already unit-proven (fetch_log timestamp assertions). Plausibility per /goal#1.
#
# GUARD: refuse unless task in in_progress[] AND not already in review[].
# CONSERVATION: total task count UNCHANGED (pure move in_progress->review).
# Usage: jq --arg now "$NOW" -f scripts/router-d67-vnstock-tradingstats-to-review-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-VNSTOCK-TRADINGSTATS-CRASH" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in in_progress[] — refuse")
  elif ([.task_board.review[]? | select(.id==$tid)]|length>0) then error("already in review[] — refuse")
  else . end
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!=$tid) ]
| .task_board.review = (.task_board.review + [ $t + {
      status:"REVIEW",
      review_entered_ts:$now,
      fix_commit:"64f188fc",
      memory_commits:["09fd9d93","a14a49c8"],
      board_note:"dev flipped status field only — router relocated object in_progress->review",
      root_cause:"runVnstockTradingStatsJob path: markFetched(code,'trading_stats') called with NO backoffMinutes on the null/timeout result => stamped fetched_at=now on a failed fetch, silencing retries for the full 2h staleness window (data never landed, job believed 'freshly fetched'). Plus runVnstockTradingStatsJobCron reported rowsWritten=result.succeeded (ticker count) => false-positive success when all fetches null.",
      fix_summary:"30-min retry backoff on all 4 null paths (syncStock trading_stats + syncStockLight trading_stats/financials/balance_sheet) — DRY mirror of FIX-FUNDAMENTALS-REFRESH-CRON-DEAD family; rowsWritten computed from COUNT(vnstock_trading_stats) DB-delta via DI getDbFn (not ticker count). The 45s Python subprocess SIGTERM timeout was already correct — issue was retry-backoff after timeout.",
      tests_green:"router-run bun test: fix-vnstock-tradingstats-crash.test.ts 10 pass/0 fail/21 expect (output proves fix: succeeded=3 rowsWritten=0 false-positive killed, succeeded=1 rowsWritten=1 honest); adjacent 1920a + fundamentals-crash-spike 17 pass/0 fail (no regression); tsc --noEmit clean",
      commit_hygiene_verified:"router git show --stat 64f188fc = 3 files all apps/mcp-server/ zone, no -A/foreign/secret; memory commits separate; orch-state not dirty; linear history on router 661a5a9d",
      disjoint_failure_set:"full suite 12982 pass/44 fail; router confirmed NO _deprecated test references the changed modules => 44 pre-existing failures disjoint from this fix (not a regression)",
      generic_verified:"/goal#2 PASS — backoff applied to every ticker's null path, no per-ticker/date allowlist; 30-min matches existing financials backoff constant",
      rebuild_required:true,
      rebuild_scope:"mcp-server ONLY — both source files in apps/mcp-server/. Force-recreate only, NEVER down (named-vol market.db). Verify peers + DB rows.",
      pending_live_gate:"AFTER rebuild: (1) image .Created > commit 64f188fc 2026-06-15T11:09:51Z UTC, RestartCount=0, healthy, peers up, market.db row parity; (2) NO crash on trading_stats sync path (cron_job_runs last run status!=error and/or manual trigger; container healthy after); (3) rowsWritten honesty live = actual vnstock_trading_stats COUNT delta (no ticker-count inflation). Backoff retry-semantics unit-proven. Plausibility per /goal#1. Then review->done_verified.",
      push_disposition:"HOLD — bundle; PO pushes the fast-forward after the FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate closes 2026-06-16"
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops",
    rebuild_required:true,
    note:("DEV-TEAM TICK " + $now + " — FIX-VNSTOCK-TRADINGSTATS-CRASH dev-mcp-server RETURNED (a8448dee), router RELOCATED in_progress->review (dev flipped status field only). Fix 64f188fc: 30-min retry backoff on all 4 null paths (markFetched missing backoffMinutes stamped fetched_at=now on timeout, silencing retries 2h) + rowsWritten from COUNT(vnstock_trading_stats) DB-delta not ticker count (false-positive killed). DRY mirror of fundamentals-fix family. Router RAW: 3-file zone commit no -A/secret; bun test 10 pass (succeeded=3/rowsWritten=0 proves fix) + adjacent 17 pass; tsc clean; 44 full-suite fails DISJOINT (_deprecated, none touch changed modules); GENERIC no allowlist (/goal#2). REBUILD_REQUIRED=YES mcp-server ONLY (force-recreate, NEVER down) — router dispatches ops. LIVE GATE after rebuild: image .Created>11:09:51Z RestartCount=0 peers up DB parity; no crash on sync path; rowsWritten honesty=actual COUNT delta; then review->done_verified. PUSH held (bundle, PO post-RSI-gate 2026-06-16). PARALLEL: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT review (behavioral gate 2026-06-16). Ready: FIX-FB-POSTER-NOARG-MARKET-TOOLS(P1), FIX-MARKET-HEXAGRAM-TOOL-MISSING(P2), FIX-STOCK-PRICE-TIER3-CACHE-FRESH-MISLABEL(P2). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (design). Active coding lane=0.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
