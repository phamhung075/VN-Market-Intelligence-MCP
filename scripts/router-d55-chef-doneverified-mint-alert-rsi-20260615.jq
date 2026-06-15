# Router cowork/dev-team — close the FIX-CHEF LIVE behavioral gate (review -> done_verified) AND mint a NEW
# RSI-class defect surfaced by the same RAW MARKET read: the alert-engine + morning-briefing TA-signal path
# STILL emits the user's exact flagged single-digit RSI to the LIVE MARKET group, contradicting the now-fixed
# canonical get_technical_indicators.
#
# RAW EVIDENCE (router gateway call_tool get_unreviewed_market_messages, 2026-06-15T07:2xZ, NOT agent badge):
#   (A) FIX-CHEF gate GREEN — new CHEF dish id 757 (sent 2026-06-15 07:25:07, from_agent=mcp-user, > baseline
#       753 @06:21:50 which carried "VHM RSI 9.8, VIC RSI 7.4") is CLEAN: "phiên giao dịch hỗn hợp ... tín hiệu
#       hội tụ ở nhóm hàng không và bất động sản ... HVN và ACV tăng 6.86% và 3.22% ... VHM chịu áp lực rút tiền
#       ... USD/VND vượt 26.000 ... kháng cự 26.100". Only price-% (real feed) + FX (real macro) — ZERO numeric
#       RSI/MACD/BB/sigma, zero single-digit fabrication. Step 6.7 AF-1/AF-2 gate (a925e89a) holds LIVE.
#   (B) NEW DEFECT, same flagged class, DIFFERENT producer — single-digit RSI STILL live in MARKET today:
#       * TA Alert id 746 (02:15, from_agent=unknown = alert-engine): VRE RSI=10.3, MBB RSI=3.7, MWG RSI=6.0;
#         id 745 (02:15): VHM RSI=9.8, VIC RSI=7.4, DAG RSI=100.0; id 752/756: more single-digit/saturated RSI.
#       * morning-briefing id 744 (from_agent=morning-briefing) "TA Tín hiệu" echoes VHM RSI=9.8, VIC RSI=7.4,
#         DAG RSI=100.0 — IDENTICAL to the alert-engine values => morning-briefing READS the alert-engine RSI,
#         it does not compute its own. ONE source = the alert-engine RSI computation.
#       * CONTRADICTS the now-fixed canonical tool I verified THIS session (get_technical_indicators in the
#         rebuilt Go svc, 33e7a094): VRE RSI=39.9 / VIC=34.7 / VHM=35.5 — mid-band, same names, same day.
#       Six large caps at single-digit RSI simultaneously is statistically impossible => CONFIRMED corrupt by
#       cross-reference. These are the user's EXACT originally-flagged values (VRE 10.3 / VHM 9.8 / VIC 7.4),
#       recurring daily at market open. The alert-engine has its OWN RSI calc that never went through the
#       Go-svc GetCandles fix. The user-flagged single-digit RSI class is NOT closed. => mint
#       FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (HIGH, recon-first, dev-alert-engine).
#
# GUARD: refuse unless FIX-CHEF in review[] AND not already done_verified AND FIX-ALERT-ENGINE-RSI not yet minted.
# CONSERVATION: CHEF moves review->done_verified (net 0) + 1 new mint => final total == before+1.
# Usage: jq --arg now "$NOW" -f scripts/router-d55-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.review[]? | select(.id=="FIX-CHEF-FABRICATED-TA-NUMBERS")][0]) as $chef
| if ($chef==null) then error("FIX-CHEF-FABRICATED-TA-NUMBERS not in review[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id=="FIX-CHEF-FABRICATED-TA-NUMBERS")]|length>0) then error("FIX-CHEF already done_verified — refuse")
  elif ([..|objects|select(.id?=="FIX-ALERT-ENGINE-RSI-SINGLEDIGIT")]|length>0) then error("FIX-ALERT-ENGINE-RSI-SINGLEDIGIT already minted — refuse")
  else . end
| ("LIVE-VERIFIED (router RAW get_unreviewed_market_messages 2026-06-15T07:2xZ, NOT CHEF badge): the chef-intraday dish fired this cowork tick (CHEF unified-agent a2bee2f4, running new chef.md a925e89a) published id 757 (07:25:07, from_agent=mcp-user, > baseline 753) to the LIVE MARKET group with ZERO numeric RSI/MACD/BB/sigma — qualitative only ('phiên giao dịch hỗn hợp', 'tín hiệu hội tụ', 'VHM chịu áp lực rút tiền'); the only numerals are real price-% (HVN +6.86%, ACV +3.22%) and real macro FX (USD/VND 26.000, kháng cự 26.100). Contrast the pre-fix dish 753 which fabricated 'VHM RSI 9.8, VIC RSI 7.4'. Step 6.7 AF-1 (no numeric indicator without a live cycle tool source) + AF-2 (qualitative-only TA vocab) + pre-publish strip gate HOLD LIVE. The CHEF fabrication consumer of the user-flagged single-digit RSI class is CLOSED.") as $Vchef
| {
    id:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", type:"FIX",
    title:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT — alert-engine (+ morning-briefing echo) publishes corrupt single-digit RSI to LIVE MARKET (TA Alert id 746: VRE 10.3/MBB 3.7/MWG 6.0; id 745: VHM 9.8/VIC 7.4/DAG 100.0), contradicting the now-fixed get_technical_indicators (VRE 39.9/VIC 34.7/VHM 35.5) — the user's exact originally-flagged values, recurring daily at market open",
    zone:"apps/alert-engine/", owner:"dev-alert-engine", owner_agent:"dev-alert-engine",
    status:"READY", priority:"high", size:"M", recon_first:true,
    root_cause:"The alert-engine computes its OWN RSI for the TA Alert stream (from_agent=unknown, 'TA Alert [HH:MM VN]') and the morning-briefing 'TA Tín hiệu' section READS/echoes those same alert values (id 744 shows VHM 9.8 / VIC 7.4 / DAG 100.0 IDENTICAL to TA Alert id 745) — so ONE source: the alert-engine RSI calc. It returns single-digit RSI (VRE 10.3, VHM 9.8, VIC 7.4, MBB 3.7, MWG 6.0, GAS 11.9) and saturated DAG 100.0 for large caps simultaneously — statistically impossible and CONTRADICTED by the now-fixed canonical get_technical_indicators (Go svc 33e7a094: VRE 39.9 / VIC 34.7 / VHM 35.5, same names same day, mid-band). This alert-engine RSI path NEVER went through the Go-svc GetCandles fix; it likely under-reads the candle window (too few candles -> degenerate RSI) or uses a wrong price column / descending order / non-Wilder seed. Same defect CLASS as FIX-TA-GOSVC (Go GetCandles under-read) but a SEPARATE service.",
    fix_spec:"RECON FIRST: locate the alert-engine RSI computation (apps/alert-engine — the producer of 'TA Alert [HH:MM VN]' MARKET messages and the RSI values morning-briefing echoes). Confirm the candle source + window + ordering + smoothing it uses vs the now-correct Go technical-analysis svc / report-path defaultComputeTa. FIX so the alert-engine RSI matches the canonical get_technical_indicators within 0.1pt on the same daily_ohlcv rows. GENERIC across ALL watchlist tickers (/goal#2) — not per-ticker. If the alert-engine SHOULD delegate to the canonical Go svc rather than re-compute, prefer that (single RSI SSOT, kills the divergence class permanently). Also fail-close DAG RSI=100.0 saturation (degenerate <N-candle series). Verify the morning-briefing TA section then shows the corrected values automatically (it echoes the alert source).",
    verification_gate:"LIVE: next alert-engine TA Alert cycle + next morning-briefing post (RAW-read via get_unreviewed_market_messages) show NO single-digit RSI and NO RSI=100.0 saturation; the RSI values match get_technical_indicators(VRE/VIC/VHM/MBB/MWG) within 0.1pt. Cross-check: get_technical_indicators(VRE)=~39.9 and the TA Alert RSI for VRE agree. No single-digit RSI anywhere on MARKET.",
    source:"router LIVE RAW verify during the chef-intraday cowork tick 2026-06-15T07:2xZ — while closing the FIX-CHEF gate, get_unreviewed_market_messages showed the alert-engine (id 745/746) + morning-briefing (id 744) STILL emitting the user's flagged single-digit RSI, contradicting the now-fixed canonical tool",
    created_at:$now, created_by:"cowork-team", triaged_by:"cowork-team",
    status_note:"4TH consumer of the user-flagged single-digit RSI class — distinct from the 3 now-closed: FIX-RSI-REPORT-FAILCLOSED (on-demand briefing/report path, ed77b9b0), FIX-TA-GOSVC-NA-DESPITE-DEPTH (canonical Go svc get_technical_indicators, 33e7a094), FIX-CHEF-FABRICATED-TA-NUMBERS (CHEF fabrication, a925e89a). HIGH because it republishes the user's EXACT flagged values (VRE 10.3 / VHM 9.8 / VIC 7.4) to the LIVE MARKET group EVERY market-open. The class is NOT closed until the alert-engine RSI is corrected. PO triage next dev-team tick — pairs with [[FIX-TA-GOSVC-MA5-PRECISION]] (same RSI-parity zone of concern); prefer delegating to the canonical Go svc for a single RSI SSOT. recon_first: confirm producer + candle window before patching. Do NOT spam a MARKET correction."
  } as $alert
| .task_board.review = [ .task_board.review[]? | select(.id!="FIX-CHEF-FABRICATED-TA-NUMBERS") ]
| .task_board.done_verified = (.task_board.done_verified + [ $chef + {
      status:"done_verified", done_verified_at:$now, done_verified_by:"cowork-team",
      done_commit:"a925e89a", live_verify_verdict:$Vchef,
      live_verify_dish_id:757 } ])
| .task_board.ready = (.task_board.ready + [ $alert ])
| .head = {
    status:"active", updated_at:$now, updated_by:"cowork-team",
    active_task_id:null, next_agent:null,
    note:"COWORK-TEAM TICK 2026-06-15T07:2xZ — FIX-CHEF-FABRICATED-TA-NUMBERS DONE_VERIFIED (router LIVE RAW get_unreviewed_market_messages, NOT CHEF badge): the chef-intraday dish (CHEF a2bee2f4 on new chef.md a925e89a) published id 757 to LIVE MARKET with ZERO numeric RSI — qualitative only, numerals are real price-%/FX. Step 6.7 anti-fabrication gate holds LIVE. CHEF fabrication consumer CLOSED. === HOWEVER the SAME RAW read surfaced a 4TH open consumer of the user-flagged single-digit RSI class: the ALERT-ENGINE (TA Alert id 745/746: VRE 10.3 / VHM 9.8 / VIC 7.4 / MBB 3.7 / MWG 6.0 / DAG 100.0) + morning-briefing (id 744 echoes the same) STILL publish corrupt single-digit RSI to LIVE MARKET daily at open, CONTRADICTING the now-fixed get_technical_indicators (VRE 39.9 / VIC 34.7 / VHM 35.5). => minted FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (READY, HIGH, dev-alert-engine, recon-first) — the user-flagged RSI class is NOT closed until the alert-engine RSI is corrected (prefer delegating to the canonical Go svc for a single RSI SSOT). No MARKET correction spam. === Board: review 2->1 (ARCH-SHIP-WAVE-REAUDIT remains, KEEP-PARK), done_verified 55->56, ready 1->2 (FIX-TA-GOSVC-MA5-PRECISION + FIX-ALERT-ENGINE-RSI). Holds: ARCH-CRON-SCHEDULER-RELIABILITY, BA-VN-MACRO-TOOLING. === Unpushed commits + this chore — push is PO's authorized call (CI flaky-aware). FLAG PO: the RSI class has one more open consumer; triage FIX-ALERT-ENGINE-RSI next tick."
  }
| ._updated_at=$now | ._updated_by="cowork-team"
| .task_board._updated_at=$now | .task_board._updated_by="cowork-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != ($before+1))
    then error("CONSERVATION FAIL: total != before+1") else . end
