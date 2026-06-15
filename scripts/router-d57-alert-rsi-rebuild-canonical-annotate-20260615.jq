# Router dev-team — annotate FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (review lane) with the LANDED rebuild +
# LIVE canonical-baseline evidence, KEEPING it in review. NOT done_verified: the literal behavioral gate
# (a POST-rebuild TA-Alert scan + morning-briefing showing real mid-band RSI for majors, no single-digit /
# no 100.0) cannot fire yet — the rebuild (08:02:40Z) landed ~2min AFTER VN market close (08:00Z), so every
# TA-Alert/briefing currently in the MARKET queue is PRE-rebuild. Next provable cycle = 2026-06-16 session
# (morning-briefing 01:00Z + first TA scan 02:15Z); the hourly dev-team :07 cron returns the router to RAW-verify.
#
# ROUTER RAW VERIFY (ops rebuild result + router independent gateway probes, 2026-06-15T08:05Z — NOT a badge):
#   * REBUILD LANDED: mcp-server image sha256:5d728ae5adfc77a3550706bb697285b9a3b5bbf4b65cf9f48ab6a5d093f9b8b8
#     Created 2026-06-15T08:02:40Z (AFTER commit c9892200 @07:52:54Z); container 7817624365f3 Up/healthy;
#     MIN_CANDLES=35 guard confirmed present in /app/src/.../taAlertScanJob.ts; named-volume market.db writable
#     (120 rows, no write-wedge); ALL 13 peers survived; health 200 toolCount 163.
#   * CANONICAL BASELINE LIVE (router call_tool get_technical_indicators, the values the fixed scan now reproduces):
#       VHM RSI(14)=35.7  VIC=34.9  VRE=39.9  — all REAL mid-band, NO single-digit, NOT 100.0.
#   * PLAUSIBILITY WATCH-ITEM RESOLVED (the suppression-vs-real risk): router READ the live CANDLE_SQL — the scan
#     fetches `daily_ohlcv WHERE date>=date('now','-60 days') ORDER BY day ASC` (the SAME table the canonical Go
#     svc reads, where majors carry 38 candles) and calls the SAME computeTAIndicators Go service. Majors 38>=35
#     => PASS the guard => REAL RSI (identical to get_technical_indicators by construction, NOT suppressed). Only
#     genuinely thin tickers (<35 daily candles) fail-closed skip — correct. So majors get real RSI, not absence.
#   => Structural + rebuild + canonical all GREEN. Only the post-rebuild behavioral echo remains (next session).
#
# GUARD: refuse unless FIX-ALERT-ENGINE-RSI-SINGLEDIGIT in review[] AND rebuild_landed_at not already set.
# CONSERVATION: total task count UNCHANGED (pure in-place annotation, no lane move).
# Usage: jq --arg now "$NOW" -f scripts/router-d57-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.review[]? | select(.id=="FIX-ALERT-ENGINE-RSI-SINGLEDIGIT")][0]) as $t
| if ($t==null) then error("FIX-ALERT-ENGINE-RSI-SINGLEDIGIT not in review[] — refuse")
  elif ($t.rebuild_landed_at != null) then error("rebuild_landed_at already set — refuse (no double-annotate)")
  else . end
| ("LIVE-PARTIAL (router RAW 2026-06-15T08:05Z, NOT a badge): REBUILD LANDED — mcp-server image sha256:5d728ae5 @08:02:40Z (after commit c9892200 @07:52:54Z), MIN_CANDLES=35 guard present in running container, named-volume market.db writable 120 rows, all 13 peers survived, health 200/toolCount 163. CANONICAL BASELINE LIVE (get_technical_indicators): VHM RSI 35.7 / VIC 34.9 / VRE 39.9 — REAL mid-band, NO single-digit, NOT 100.0. WATCH-ITEM (suppression-vs-real) RESOLVED: scan CANDLE_SQL reads daily_ohlcv 60-day window (SAME table as canonical Go svc, majors=38 candles) + calls SAME computeTAIndicators svc => majors 38>=35 PASS guard => RSI identical to canonical by construction (NOT suppressed); only <35-candle thin tickers fail-closed skip (correct). PENDING the BEHAVIORAL half only: rebuild landed 08:02:40Z, ~2min AFTER VN market close 08:00Z, so every TA-Alert/briefing now in the MARKET queue (msg 744 briefing 01:00Z VHM 9.8/VIC 7.4/DAG 100.0; msg 745/746/752 TA-Alerts 02:15-06:15Z) is PRE-rebuild — no post-rebuild scan has run. Next provable cycle = 2026-06-16 session: morning-briefing 01:00Z + first TA scan 02:15Z must show majors at real mid-band RSI (no single-digit, no 100.0), matching canonical within 0.1pt, GENERIC all tickers.") as $V
| .task_board.review = [ .task_board.review[]? |
    if .id=="FIX-ALERT-ENGINE-RSI-SINGLEDIGIT" then . + {
        rebuild_landed_at:$now,
        rebuild_image:"sha256:5d728ae5adfc77a3550706bb697285b9a3b5bbf4b65cf9f48ab6a5d093f9b8b8",
        rebuild_verify:"image @08:02:40Z>commit c9892200 @07:52:54Z; guard present in container; named-vol market.db writable 120 rows; 13 peers survived; health 200 toolCount 163",
        canonical_baseline_live:"get_technical_indicators 2026-06-15T08:05Z: VHM RSI 35.7 / VIC 34.9 / VRE 39.9 — real mid-band, no single-digit, not 100.0",
        watch_item_resolution:"RESOLVED: scan reads daily_ohlcv 60-day window (same table as canonical, majors=38 candles) + same computeTAIndicators svc => majors 38>=35 pass guard => RSI identical to canonical by construction, NOT suppressed; <35-candle thin tickers fail-closed skip (correct)",
        live_partial_verdict:$V,
        pending_behavioral_gate:"2026-06-16 session: morning-briefing 01:00Z + first TA scan 02:15Z show majors real mid-band RSI (no single-digit/no 100.0), match canonical within 0.1pt, generic all tickers — verifiable on the hourly dev-team :07 tick after the queue refills",
        push_disposition:"HOLD — 3 unpushed commits (c9892200 fix / 90787cc8 notebook / 66235a64 board); push is PO's call AFTER the behavioral gate closes next session (runtime already carries the fix via the landed rebuild, so origin-sync is non-urgent)"
      } else . end ]
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", next_agent:null,
    note:"DEV-TEAM TICK 2026-06-15T08:05Z — FIX-ALERT-ENGINE-RSI-SINGLEDIGIT stays REVIEW (rebuild+canonical GREEN, behavioral half pending next session). ROUTER RAW: ops rebuild LANDED c9892200 (mcp-server image sha256:5d728ae5 @08:02:40Z>commit @07:52:54Z, MIN_CANDLES=35 guard in container, named-vol DB writable 120 rows, 13 peers survived, health 200). CANONICAL LIVE get_technical_indicators VHM 35.7/VIC 34.9/VRE 39.9 — REAL mid-band. WATCH-ITEM RESOLVED: scan reads SAME daily_ohlcv 60-day window + SAME computeTAIndicators svc => majors 38>=35 pass guard => real RSI not suppressed (identical to canonical by construction); <35-candle thin tickers correctly fail-closed. BEHAVIORAL gate UNMET ONLY because rebuild landed 08:02:40Z ~2min after market close 08:00Z — ALL queued TA-Alerts/briefing (msg 744/745/746/752) are PRE-rebuild; no post-rebuild scan has run. NEXT: 2026-06-16 morning-briefing 01:00Z + first TA scan 02:15Z must show majors real mid-band RSI (no single-digit/no 100.0) — hourly dev-team :07 cron returns router to RAW-verify the refilled queue, then promote review->done_verified. PUSH HELD (PO's call after behavioral gate; runtime already has fix via landed rebuild). Holds unchanged: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (queued). Deferred ready: FIX-TA-GOSVC-MA5-PRECISION (MA5=N/A confirmed again this probe — separate precision task, not this gate)."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure annotation") else . end
