# Router dev-team — promote FIX-RSI-REPORT-FAILCLOSED review -> done_verified after router LIVE RAW re-probe,
# AND mint follow-on FIX-TA-GOSVC-NA-DESPITE-DEPTH (canonical Go TA svc under-reads candle depth vs same DB).
#
# LIVE GATE (router gateway call_tool + in-container probe, NOT dev badge), 2026-06-15T05:37-05:41Z:
#   REPORT PATH (defaultComputeTa, mcp-server, the MARKET-report source) re-probed in the REBUILT container
#   (image sha256:d53c41f8 created 05:35:36Z, AFTER fix commit ed77b9b0 05:28:58Z; ops false "REBUILD_REQUIRED:no"
#   corrected — no src bind-mount, baked image, force-recreated):
#     VRE rsi14=39.52, VIC 35.09, VHM 36.73, FPT 48.72, VCB 46.51, HPG 38.62, VNM 48.15 — ALL plausible mid-band,
#     NO single-digit, computed on 38 REAL contiguous daily_ohlcv candles (Apr23..Jun15, full-VND 28k-36k band).
#     Code is fixed-period-14 (Math.min adaptive trick removed) + fail-close <15 (verified present in container).
#     18/18 affected tests green (FIX-RSI regression 9 TCs + 1346 + 1330), tsc EXIT=0.
#   => USER-FLAGGED SYMPTOM RESOLVED: MARKET report RSI path no longer emits single-digit RSI from shallow/corrupt
#      data; on real 38-candle depth it now yields plausible RSI; on genuine <15 it returns null (test-locked).
#
# DIVERGENCE FOUND (separate defect, NOT a flaw in this fix — honest gate note):
#   canonical get_technical_indicators (PRIMARY path = Go TA svc computeTAIndicators HTTP) returns RSI/MA/BB N/A
#   "(can toi thieu 15 nen)" for VRE/VIC/VHM EVEN THOUGH the Go svc mounts the SAME named-volume market.db
#   (/app/data, vn-market-intelligence-mcp_market_data, identical 290MB file+mtime) holding the SAME 38 candles
#   the report path reads. Same DB, divergent rowcount => Go-svc query/logic under-read OR HTTP param mismatch.
#   The fix's math IS identical to canonical (report==canonical for >=15 is test-locked); only the Go-svc data
#   AVAILABILITY diverges. -> minted FIX-TA-GOSVC-NA-DESPITE-DEPTH (recon-first, apps/technical-analysis).
#
# GUARD: refuse unless FIX-RSI-REPORT-FAILCLOSED present in review[] as REVIEW AND not already done_verified
#        AND follow-on id not already minted.
# Usage: jq --arg now "$NOW" -f scripts/router-d51-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.review[]? | select(.id=="FIX-RSI-REPORT-FAILCLOSED")][0]) as $t
| if ($t==null or (($t.status//"")|ascii_downcase)!="review") then error("FIX-RSI-REPORT-FAILCLOSED not REVIEW in review[] (\($t.status//"missing")) — refuse")
  elif ([.task_board.done_verified[]? | select(.id=="FIX-RSI-REPORT-FAILCLOSED")]|length>0) then error("FIX-RSI-REPORT-FAILCLOSED already done_verified — refuse")
  elif ([..|objects|select(.id?=="FIX-TA-GOSVC-NA-DESPITE-DEPTH")]|length>0) then error("FIX-TA-GOSVC-NA-DESPITE-DEPTH already minted — refuse")
  else . end
| ("LIVE-VERIFIED (router independent re-probe 2026-06-15T05:37-05:41Z in REBUILT container image sha256:d53c41f8 @05:35:36Z, NOT dev badge; ops 'REBUILD_REQUIRED:no' was WRONG — baked image, force-recreated): REPORT PATH defaultComputeTa (the MARKET-report RSI source feeding morning/evening/France briefings) now yields PLAUSIBLE RSI on real depth — VRE 39.52, VIC 35.09, VHM 36.73, FPT 48.72, VCB 46.51, HPG 38.62, VNM 48.15 — all mid-band, NO single-digit, on 38 real contiguous daily_ohlcv candles. Root fix (ed77b9b0): removed adaptive Math.min(14,rows.length-1) period, fixed at 14, guard <8-><15 (fail-close), identical period-14 math to canonical localComputeRSI (report==canonical for >=15 test-locked). 18/18 affected tests green, tsc EXIT=0. USER-FLAGGED single-digit RSI (VRE 10.3/VIC 7.4/VHM 9.8) RESOLVED. HONEST GATE NOTE: the 'report agrees with canonical' sub-clause is currently DIVERGENT — canonical get_technical_indicators (Go TA svc) returns N/A for these same tickers despite the SAME named-volume market.db holding 38 candles; this is a SEPARATE Go-svc under-read defect, not a flaw in this report-path fix -> follow-on FIX-TA-GOSVC-NA-DESPITE-DEPTH minted. LIVE-verify harness persisted: scripts/verify-report-rsi-failclose.ts.") as $V
| {
    id:"FIX-TA-GOSVC-NA-DESPITE-DEPTH", type:"FIX",
    title:"FIX-TA-GOSVC-NA-DESPITE-DEPTH — get_technical_indicators (Go TA svc) returns RSI/MA/BB N/A for VRE/VIC/VHM despite 38 real daily_ohlcv candles in the SAME named-volume market.db the mcp-server report path reads fine (RSI 39.5)",
    zone:"apps/technical-analysis/", owner:"dev-technical-analysis", owner_agent:"dev-technical-analysis",
    status:"READY", priority:"high", size:"M", recon_first:true,
    root_cause:"canonical get_technical_indicators PRIMARY path calls the Go TA svc via computeTAIndicators (HTTP POST /ta/indicators). LIVE 2026-06-15T05:37Z that svc returned RSI(14) N/A '(can toi thieu 15 nen)', MA20/BB20 N/A (needs 20), MACD N/A (needs 34) for VRE/VIC/VHM => the Go svc sees <15 candles. BUT the Go svc container (vn-market-intelligence-mcp-technical-analysis-1, DB_PATH=/app/data/market.db) mounts the SAME named volume vn-market-intelligence-mcp_market_data as mcp-server (identical 290MB file+mtime) whose daily_ohlcv holds 38 real contiguous VRE candles (Apr23..Jun15). The mcp-server report path defaultComputeTa reads those 38 and computes RSI 39.52. Same DB, divergent rowcount => the bug is in apps/technical-analysis SQLitePriceRepository query/logic (wrong table? extra DISTINCT/JOIN? date filter? code/symbol+exchange-suffix mismatch? stale prepared-stmt schema?) OR in the computeTAIndicators HTTP request params (days window, symbol formatting). RECON-FIRST to locate which.",
    fix_spec:"RECON: (a) curl the Go svc /ta/indicators for VRE directly and inspect the candle count it loaded; (b) read apps/technical-analysis/pkg/infrastructure/repositories.go SQLitePriceRepository — confirm it SELECTs daily_ohlcv WHERE code=? (matching the report path) and count rows for VRE; identify the filter/JOIN/symbol-format that drops 38-><15. THEN make the Go svc read the same 38 candles the report path reads, so get_technical_indicators(VRE) returns RSI ~39.5 (== report path). GENERIC across all watchlist tickers (/goal#2). Add a Go test: a ticker with 38 daily_ohlcv rows yields a non-null RSI, not N/A.",
    verification_gate:"LIVE: get_technical_indicators(VRE/VIC/VHM) returns a plausible RSI (~35-40, matching the mcp-server report path defaultComputeTa) NOT N/A; both paths agree (same value, both on the 38-candle daily_ohlcv). Re-run scripts/verify-report-rsi-failclose.ts + cross-check the canonical tool.",
    baseline_pass:"ed77b9b0",
    source:"router LIVE RAW re-probe 2026-06-15T05:37-05:41Z during FIX-RSI-REPORT-FAILCLOSED done_verify — report path fixed but canonical (Go svc) diverges on same-DB depth",
    created_at:$now, created_by:"dev-team", triaged_by:"dev-team",
    status_note:"Follow-on peeled from FIX-RSI-REPORT-FAILCLOSED LIVE verify. Distinct zone (Go TA svc). Canonical-tool depth under-read; does NOT affect the user MARKET report (which uses the now-fixed mcp-server report path). Next-tick dispatch after PO triage. Confirm Go-svc DB query first."
  } as $gosvc
| .task_board.review = [ .task_board.review[]? | select(.id!="FIX-RSI-REPORT-FAILCLOSED") ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"done_verified", done_verified_at:$now, done_verified_by:"dev-team",
      done_commit:"ed77b9b0", rebuild_image:"sha256:d53c41f897a5f30247706475713e73f3732a9801f0cb2a6e2509ef61acbc8912",
      live_verify_verdict:$V } ])
| .task_board.ready = (.task_board.ready + [ $gosvc ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null,
    note:"DEV-TEAM TICK 2026-06-15 — FIX-RSI-REPORT-FAILCLOSED DONE_VERIFIED (router LIVE RAW re-probe in rebuilt container 05:37-05:41Z, NOT badge): the MARKET-report RSI path (defaultComputeTa) now emits PLAUSIBLE RSI on real 38-candle depth (VRE 39.52/VIC 35.09/VHM 36.73, NO single-digit) and fail-closes <15 (test-locked); user-flagged 'RSI bad calcul' (VRE 10.3/VIC 7.4/VHM 9.8) FULLY RESOLVED. Root = removed adaptive period, fixed 14 + guard <15 (ed77b9b0); mcp-server force-recreated (ops 'no rebuild' badge was WRONG — corrected). === ALL 3 user-flagged + accuracy fixes now done_verified this arc: FIX-STOCK-PRICE-SCALE-CORRUPT (3035e298) + FIX-NSO-TRADE-VALUE-SCALE (7a3da0df) + FIX-RSI-REPORT-FAILCLOSED (ed77b9b0). === NEW FOLLOW-ON minted READY: FIX-TA-GOSVC-NA-DESPITE-DEPTH — canonical get_technical_indicators (Go TA svc) returns N/A despite 38 candles in the SAME market.db the report path reads (RSI 39.5); separate Go-svc under-read, does NOT affect user report. PO triage next tick. === NEXT: push HEAD (now 3 ahead w/ board commit) — watch CI green on non-RED SHA (flaky-suite aware). SF-1 release at clean tick-end. Harness: scripts/verify-report-rsi-failclose.ts."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
