# Router dev-team tick 2026-06-15T08:38Z — move FIX-TA-GOSVC-MA5-PRECISION in_progress -> review
# on dev-technical-analysis return (agentId a87e237e). Code DoD met + tests green; LIVE gate PENDING rebuild.
#
# ROUTER RAW VERIFY (git, NOT a badge):
#   * commit d32f0a17 touches EXACTLY 8 files (6 Go apps/technical-analysis/ + 2 TS apps/mcp-server/) — no -A
#     sweep, no foreign files, no secret. Notebook c5fb163c separate. Both fix zones clean in working tree.
#   * RECON ROOT CAUSE (protocol gap, not symptom): Go module.Compute computed ONE SMA(MAPeriod=14) mis-aliased
#     as ma20; ma5/ma50 were never requested/returned/mapped. Fix adds fixed-period SMA(5)/SMA(20)/SMA(50) end
#     to end (Result -> domain -> DTO JSON -> clients.ts named-field mapper). RSI ~1pt drift fixed by forcing
#     BOTH paths onto the same closes (ORDER BY date ASC LIMIT 60, close>0) so Wilder smoothing is identical.
#   * Tests: go test ./... 11 pkgs GREEN incl regression_ma5_on_38_candles_ma50_na; go vet clean; pnpm check clean.
#
# REBUILD_REQUIRED: YES — and BOTH services, not just technical-analysis (dev under-scoped this):
#   - technical-analysis (Go binary: new SMA5/20/50 compute + JSON fields)
#   - mcp-server (TS: clients.ts now reads raw.ma5/ma20/ma50 named fields; technicalIndicatorTools.ts pre-fetches
#     closes). Rebuilding only technical-analysis leaves mcp-server's old mapper => fix not served end-to-end.
#   Force-recreate only; NEVER docker compose down (named-vol DB). Verify peers + DB rows post-rebuild.
#
# LIVE GATE (router RAW-verifies AFTER rebuild): get_technical_indicators must return NUMERIC MA5 for majors
#   (VHM/VIC/VRE, 38 candles >=5) where it returned N/A this tick; MA50 stays N/A (correct, needs 50); Go RSI(14)
#   matches TS report path <0.1pt on a shared ticker; GENERIC all watchlist tickers. Then review -> done_verified.
#
# GUARD: refuse unless FIX-TA-GOSVC-MA5-PRECISION in in_progress[] AND not already in review[].
# CONSERVATION: total task count UNCHANGED (pure move in_progress->review).
# Usage: jq --arg now "$NOW" -f scripts/router-d59-ta-gosvc-ma5-to-review-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]? | select(.id=="FIX-TA-GOSVC-MA5-PRECISION")][0]) as $t
| if ($t==null) then error("FIX-TA-GOSVC-MA5-PRECISION not in in_progress[] — refuse")
  elif ([.task_board.review[]? | select(.id=="FIX-TA-GOSVC-MA5-PRECISION")]|length>0) then error("already in review[] — refuse")
  else . end
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!="FIX-TA-GOSVC-MA5-PRECISION") ]
| .task_board.review = (.task_board.review + [ $t + {
      status:"REVIEW",
      review_entered_ts:$now,
      fix_commit:"d32f0a17",
      notebook_commit:"c5fb163c",
      root_cause:"protocol gap: Go module.Compute computed ONE SMA(MAPeriod=14) mis-aliased as ma20; ma5/ma50 never requested/returned/mapped. MA20-computes-while-MA5-N/A was the symptom. Fix adds fixed-period SMA(5/20/50) end-to-end + RSI closes alignment (same ORDER BY date ASC LIMIT 60 closes both paths).",
      tests_green:"go test ./... 11 pkgs incl regression_ma5_on_38_candles_ma50_na; go vet clean; pnpm check clean",
      commit_hygiene_verified:"router git show --stat: d32f0a17 = 8 files (6 Go + 2 TS), no -A sweep, no foreign/secret; both zones clean in tree",
      rebuild_required:true,
      rebuild_scope:"BOTH technical-analysis (Go binary) AND mcp-server (clients.ts named-field mapper + technicalIndicatorTools.ts closes prefetch) — dev under-scoped to technical-analysis only; mcp-server old mapper would not serve ma5/ma20/ma50 end-to-end. Force-recreate only, NEVER down.",
      pending_live_gate:"AFTER rebuild router RAW get_technical_indicators: NUMERIC MA5 for majors (VHM/VIC/VRE, was N/A this tick), MA50 stays N/A (correct), Go RSI(14) matches TS report path <0.1pt shared ticker, GENERIC all tickers — then review->done_verified",
      push_disposition:"HOLD — push is PO's call after live gate; bundles with the held RSI-fix commits"
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-TA-GOSVC-MA5-PRECISION", next_agent:"ops",
    note:"DEV-TEAM TICK 2026-06-15T08:38Z — FIX-TA-GOSVC-MA5-PRECISION dev-technical-analysis RETURNED, moved in_progress->review (code DoD met, tests green, commit d32f0a17 RAW-verified clean: 8 files 6 Go+2 TS, no -A sweep/secret). ROOT CAUSE = protocol gap (Go computed ONE SMA(14) mis-aliased ma20; ma5/ma50 never requested) — definitive, not symptom. RSI ~1pt drift fixed by same-closes alignment. REBUILD_REQUIRED=YES BOTH services (technical-analysis Go binary + mcp-server TS mapper) — router dispatches ops force-recreate (NEVER down). LIVE GATE after rebuild: get_technical_indicators NUMERIC MA5 for VHM/VIC/VRE (was N/A), MA50 stays N/A, Go RSI matches TS report path <0.1pt, generic all tickers -> then review->done_verified. PUSH held for PO. PARALLEL gate unchanged: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate fires 2026-06-16 briefing 01:00Z/scan 02:15Z. Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (queued)."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
