# Router dev-team tick 2026-06-15T08:45Z — promote FIX-TA-GOSVC-MA5-PRECISION review -> done_verified.
# Rebuild LANDED + LIVE GATE GREEN (router RAW get_technical_indicators 08:44Z, NOT a badge).
#
# ROUTER RAW LIVE VERIFY (5 tickers — 3 originally-failing majors + 2 genericity probes):
#   VHM MA5=142,420 MA20=150,805 MA50=N/A RSI 35.7 | VIC MA5=194,660 MA20=206,730 MA50=N/A RSI 34.9
#   VRE MA5=29,010  MA20=31,098  MA50=N/A RSI 39.9 | FPT MA5=73,620 MA20=74,225 MA50=N/A RSI 48.4
#   HPG MA5=23,600  MA20=24,338  MA50=N/A RSI 44.2
#   => MA5 NUMERIC on all 5 (was N/A pre-fix) — GENERIC across tickers (/goal#2). MA50 correctly N/A (38<50).
#   PLAUSIBILITY (FLOOR not bar): MA5<MA20 on EVERY ticker — correct for the oversold/falling regime (RSI 35-48,
#   price<MA20, MACD bearish); magnitudes track current price. RSI identical to canonical baseline (stable) +
#   same-closes alignment makes Go RSI == TS report-path RSI by construction (Wilder math identical, same closes).
#
# REBUILD RAW (ops a737541a): mcp-server image 62b1e615 @08:42:15Z + technical-analysis 9acf36f3 @08:42:40Z
#   (both AFTER commit d32f0a17); mcp-server health ok toolCount 163; TA health ok :5003; named-vol market.db
#   writable daily_ohlcv 34,568 rows (no write-wedge); 11/12 peers Up/healthy (gateway undeployed by design);
#   MIN_CANDLES=35 guard from earlier RSI fix (c9892200) NOT regressed (grep count 1).
#
# DoD: MA5 numeric all tickers >=5 candles PASS | MA50 N/A correct PASS | RSI Go==TS <0.1pt PASS (same-closes) |
#   generic no per-instance branch PASS | go test 11 pkgs + pnpm check green PASS | commit d32f0a17 clean PASS |
#   rebuild landed both services PASS | live RAW-verified PASS. => done_verified.
#
# PUSH: HELD as a bundle with FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (commit c9892200 etc.) — that fix's BEHAVIORAL gate
#   fires next session (2026-06-16 briefing 01:00Z / scan 02:15Z). Pushing now splits the bundle; runtime already
#   serves BOTH fixes via landed rebuilds so origin-sync is non-urgent. PO pushes the whole fast-forward after the
#   RSI gate closes. (MA5 itself is fully done_verified — only the cross-fix push is bundled.)
#
# GUARD: refuse unless FIX-TA-GOSVC-MA5-PRECISION in review[] AND not already in done_verified[].
# CONSERVATION: total task count UNCHANGED (pure move review->done_verified).
# Usage: jq --arg now "$NOW" -f scripts/router-d60-ta-gosvc-ma5-doneverified-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.review[]? | select(.id=="FIX-TA-GOSVC-MA5-PRECISION")][0]) as $t
| if ($t==null) then error("FIX-TA-GOSVC-MA5-PRECISION not in review[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id=="FIX-TA-GOSVC-MA5-PRECISION")]|length>0) then error("already in done_verified[] — refuse")
  else . end
| .task_board.review = [ .task_board.review[]? | select(.id!="FIX-TA-GOSVC-MA5-PRECISION") ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"DONE_VERIFIED",
      done_verified_ts:$now,
      done_verified_by:"dev-team",
      rebuild_landed:"mcp-server 62b1e615 @08:42:15Z + technical-analysis 9acf36f3 @08:42:40Z (both after commit d32f0a17); health ok mcp toolCount 163 / TA :5003; named-vol daily_ohlcv 34,568 rows; 11/12 peers up (gateway undeployed by design); MIN_CANDLES=35 guard not regressed",
      live_gate_evidence:"router RAW get_technical_indicators 08:44Z — VHM MA5=142,420/MA20=150,805/MA50=N/A/RSI35.7; VIC MA5=194,660/MA20=206,730/MA50=N/A/RSI34.9; VRE MA5=29,010/MA20=31,098/MA50=N/A/RSI39.9; FPT MA5=73,620/RSI48.4; HPG MA5=23,600/RSI44.2 — MA5 numeric all 5 (was N/A), MA50 correctly N/A, MA5<MA20 plausible for oversold/falling regime, generic all tickers",
      goal_alignment:"/goal#1 (last-ship correctness regression fixed: MA5 N/A protocol gap from 33e7a094) + /goal#2 (generic across all tickers, no per-instance branch)",
      push_disposition:"HOLD — bundled with FIX-ALERT-ENGINE-RSI-SINGLEDIGIT push; that fix's behavioral gate fires 2026-06-16; runtime already serves both via rebuilds so origin-sync non-urgent; PO pushes the fast-forward after RSI gate closes"
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", next_agent:null,
    note:"DEV-TEAM TICK 2026-06-15T08:45Z — FIX-TA-GOSVC-MA5-PRECISION PROMOTED review->done_verified. Rebuild LANDED (ops a737541a: mcp-server 62b1e615 @08:42:15Z + technical-analysis 9acf36f3 @08:42:40Z, both after commit d32f0a17; mcp health 200 toolCount 163; TA :5003 ok; named-vol daily_ohlcv 34,568 rows; 11/12 peers up gateway-undeployed-by-design; MIN_CANDLES=35 guard intact). LIVE GATE GREEN (router RAW get_technical_indicators 08:44Z): MA5 NUMERIC on VHM 142,420/VIC 194,660/VRE 29,010/FPT 73,620/HPG 23,600 (all were N/A pre-fix), MA50 correctly N/A (38<50), MA5<MA20 plausible for oversold regime, RSI stable==canonical, GENERIC all tickers. Root cause = protocol gap (Go computed ONE SMA(14) mis-aliased ma20). DoD all PASS. PUSH held (bundled with RSI fix, PO's call after 2026-06-16 RSI behavioral gate). ACTIVE FOCUS returns to FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (review, behavioral gate fires 2026-06-16 briefing 01:00Z/scan 02:15Z — hourly :07 cron returns router to RAW-verify refilled queue then promote+push). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (queued). Ready lane EMPTY."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
