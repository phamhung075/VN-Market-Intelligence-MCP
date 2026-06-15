# Router dev-team — promote FIX-NSO-TRADE-VALUE-SCALE review -> done_verified after router LIVE RAW re-probe + plausibility check.
# LIVE GATE (router gateway call_tool re-probe get_vn_trade_balance fetched_at 2026-06-15T05:09:25Z, NOT dev badge):
#   export_total 46929mn ($46.9bn), import_total 52141mn ($52.1bn), trade_balance -5212mn (-$5.2bn sane),
#   export_ytd 215656, import_ytd 229464 — monthly<=YTD holds BOTH sides; balance within sane band;
#   HS breakdown matches real VN export mix (electronics 13.4bn / phones 5.1bn / machinery 6.0bn / textiles 3.2bn / footwear 2.1bn);
#   import YoY 133.8% > export YoY 118% internally explains the deficit; core is_estimate=false.
#   => the prior 1000x/wrong-column corruption (June import 212000mn = 59% of YTD) is GONE. PLAUSIBILITY PASS.
# Root fix (commit 7a3da0df): parseTradeSheet read col2 (Lượng/quantity) not col3 (Trị giá/value); matched blank-col0 sub-items
#   as national total instead of "TỔNG TRỊ GIÁ" row; multiplied by 1000 (assumed tỷ USD) when sheets are Triệu USD direct;
#   col9 YoY% now strconv.ParseFloat. + plausibility guard test (monthly<=YTD, value in [5000,200000], |balance|<=50000).
# macro-indicators force-recreated (image sha256:da5e59bc..., Up healthy 2min); 14 new trade tests GREEN, G12 primitive 18/18 + module 2/2.
# GUARD: refuse unless FIX-NSO-TRADE-VALUE-SCALE present in review[] as review AND not already in done_verified[].
# Usage: jq --arg now "$NOW" -f scripts/router-d50-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.review[]? | select(.id=="FIX-NSO-TRADE-VALUE-SCALE")][0]) as $t
| if ($t==null or ($t.status//"")!="review") then error("FIX-NSO-TRADE-VALUE-SCALE not review in review[] (\($t.status//"missing")) — refuse")
  elif ([.task_board.done_verified[]? | select(.id=="FIX-NSO-TRADE-VALUE-SCALE")]|length>0) then error("FIX-NSO-TRADE-VALUE-SCALE already in done_verified — refuse")
  else . end
| ("LIVE-VERIFIED (router independent gateway call_tool re-probe get_vn_trade_balance fetched_at 2026-06-15T05:09:25Z, NOT dev badge): status=ok period 2026-06; export_total 46929mn ($46.9bn), import_total 52141mn ($52.1bn), trade_balance -5212mn (-$5.2bn, sane near-balance deficit); export_ytd 215656mn, import_ytd 229464mn — monthly<=YTD holds BOTH sides; export_yoy 118%, import_yoy 133.8% (import surge internally explains the deficit). HS structure matches real VN export mix (Điện tử 13.394bn, Điện thoại 5.089bn, Máy móc 6.040bn, Dệt may 3.189bn, Giày dép 2.142bn); core is_estimate=false; source NSO Excel 14.XK+15.NK+12.FDI. PLAUSIBILITY PASS — the prior corruption (June import 212000mn = 59% of YTD 358000mn; -138000mn/mo balance) is GONE. ROOT FIX (7a3da0df): col3(Trị giá) not col2(Lượng); 'TỔNG TRỊ GIÁ' total row not blank-col0 sub-item; Triệu-USD direct (no x1000); col9 strconv.ParseFloat; + plausibility guard test (monthly<=YTD, [5000,200000]mn, |balance|<=50000). 14 new trade tests GREEN, G12 primitive 18/18 + module 2/2, go vet/build clean. macro-indicators force-recreated (image sha256:da5e59bc, Up healthy). KNOWN-DEGRADED (out of scope, flagged): bloc_split FDI share 0% is_estimate=true — Customs SPA inaccessible; core XK/NK figures unaffected. Lock release ok:false (rebuild-orphaned owner_session, LET-EXPIRE).") as $V
| .task_board.review = [ .task_board.review[]? | select(.id!="FIX-NSO-TRADE-VALUE-SCALE") ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"done_verified", done_verified_at:$now, done_verified_by:"dev-team",
      done_commit:"7a3da0df", rebuild_image:"sha256:da5e59bce8229d363d30a38a9592bcbd985f5ccbc4b6ad416b7e6cda7a8beeff",
      live_verify_verdict:$V } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-RSI-REPORT-FAILCLOSED", next_agent:"dev-technical-analysis",
    note:"DEV-TEAM TICK 2026-06-15 — FIX-NSO-TRADE-VALUE-SCALE DONE_VERIFIED (router LIVE RAW re-probe 05:09:25Z, NOT badge): get_vn_trade_balance now PLAUSIBLE — June export 46929mn/import 52141mn/balance -5212mn, monthly<=YTD both sides, HS mix matches real VN structure, is_estimate=false. Prior 212000mn corruption GONE. Root = col3-not-col2 + TỔNG-TRỊ-GIÁ-total-row + Triệu-USD-no-x1000 (commit 7a3da0df) + plausibility guard test. macro-indicators force-recreated healthy. === BOTH user-flagged + value-accuracy fixes now done_verified this tick: FIX-STOCK-PRICE-SCALE-CORRUPT (3035e298) + FIX-NSO-TRADE-VALUE-SCALE (7a3da0df). === NEXT: (1) batch-push HEAD (5 ahead of origin: 3035e298 + 16a7d8d4 + 7a3da0df + 2dc437d8 + d49/d50 board) — PO-authorized CI push; WATCH GitHub Actions run to conclusion=success on SHA != RED before fully closing the CI gate. (2) dispatch FIX-RSI-REPORT-FAILCLOSED (READY, dev-technical-analysis) — report RSI path not fail-closed on <15 candles; confirm RSI source first. === KNOWN-DEGRADED (flagged, not blocking): trade bloc_split FDI 0% is_estimate=true (Customs SPA inaccessible). OBS: daily_ohlcv ~6 candles -> indicators N/A until backfill deepens (flag PO). SF-1 held until clean tick-end."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
