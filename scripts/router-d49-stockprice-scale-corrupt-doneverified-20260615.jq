# Router dev-team — promote FIX-STOCK-PRICE-SCALE-CORRUPT -> done_verified after router LIVE RAW re-probe.
# LIVE GATE (router gateway call_tool re-probe 2026-06-15T05:02Z, NOT dev badge):
#   get_price_history VIC: 06-12 close=195,500 (was 195.5); VHM 138,700 (was 138.7); VJC 180,800 — all full-VND band,
#     day-over-day all within sane circuit-breaker band, NO -99.9%/+98570% artifacts. CORRUPTION ROOT GONE.
#   get_technical_indicators VIC + FPT: RSI(14)=N/A "(can toi thieu 15 nen)" — CORRECTLY fail-closed (daily_ohlcv holds ~6 candles).
#   => canonical tool NEVER emits the single-digit RSI again; user's report single-digits were the REPORT path (FIX-RSI-REPORT-FAILCLOSED).
# Commit 3035e298 landed (mcp-server zone — corruption is in ingestion ohlcvUnitGuard.ts, NOT Go stock-price which only READS).
# mcp-server force-recreated, Up healthy. orch-state NOT swept into dev commit (verified clean).
# Macro task (FIX-NSO-TRADE-VALUE-SCALE) STILL RUNNING -> head repoints to it; status stays in_progress.
# GUARD: refuse unless FIX-STOCK-PRICE-SCALE-CORRUPT present in in_progress[] as in_progress AND not already done_verified.
# Usage: jq --arg now "$NOW" -f scripts/router-d49-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(.id=="FIX-STOCK-PRICE-SCALE-CORRUPT")][0]) as $sp
| if ($sp==null or ($sp.status//"")!="in_progress") then error("FIX-STOCK-PRICE-SCALE-CORRUPT not in_progress in in_progress[] (\($sp.status//"missing")) — refuse")
  elif ([.task_board.done_verified[]? | select(.id=="FIX-STOCK-PRICE-SCALE-CORRUPT")]|length>0) then error("FIX-STOCK-PRICE-SCALE-CORRUPT already in done_verified — refuse")
  else . end
| ("LIVE-VERIFIED (router independent gateway call_tool re-probe 2026-06-15T05:02Z, NOT dev badge): get_price_history VIC 06-12 close=195,500 (was 195.5), VHM 138,700 (was 138.7), VJC 180,800 — all full-VND (137k-196k band), every day-over-day move within sane band, NO -99.90%/+98570% artifacts (the fake crash/rebound that cratered RSI is GONE). 39/45 corrupt rows repaired, 6 penny-stock rows correctly skipped, 0 suspect remaining. get_technical_indicators VIC+FPT RSI(14)=N/A correctly fail-closed (daily_ohlcv ~6 candles). Root fix = detectAndNormalizeScaleFromPrevClose() in ohlcvUnitGuard.ts (ratio>=50 vs prevClose -> x1000 whole-row, generic /goal#2) + repair-ohlcv-scale-corruption.ts backfill; integrated in taOhlcvBackfillJob.ts; 28 unit + 45 CONTAM tests green; tsc clean. Commit 3035e298; mcp-server force-recreated (image ae7b3389b595, Up healthy). ZONE NOTE: applied in apps/mcp-server (ingestion) not apps/stock-price (Go svc only READS daily_ohlcv) — root-correct. RSI single-digit in MARKET report is the report path -> FIX-RSI-REPORT-FAILCLOSED (queued). OBS (not blocking): daily_ohlcv depth ~6 candles -> all indicators N/A until backfill deepens; flag to PO.") as $V
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!="FIX-STOCK-PRICE-SCALE-CORRUPT") ]
| .task_board.done_verified = (.task_board.done_verified + [ $sp + {
      status:"done_verified", done_verified_at:$now, done_verified_by:"dev-team",
      done_commit:"3035e298", rebuild_image:"ae7b3389b595",
      live_verify_verdict:$V } ])
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-NSO-TRADE-VALUE-SCALE", next_agent:"dev-macro-indicators",
    note:"DEV-TEAM TICK 2026-06-15 — FIX-STOCK-PRICE-SCALE-CORRUPT DONE_VERIFIED (router LIVE RAW re-probe 05:02Z): user-flagged 'RSI bad calc' ROOT = 2026-06-12 price candle stored 1000x low for high-priced tickers (VIC 195.5->195,500; VHM 138.7->138,700; VJC repaired) crashing RSI to single digits. Fix = ohlcvUnitGuard prevClose ratio-guard (generic) + DB backfill + tests; commit 3035e298; mcp-server force-recreated healthy. LIVE: all closes full-VND, no -99.9%/+98570% artifacts; get_technical_indicators RSI N/A correctly fail-closed. Single-digit RSI in the REPORT is the report path -> FIX-RSI-REPORT-FAILCLOSED (READY, next dispatch). OBS: daily_ohlcv only ~6 candles deep -> indicators N/A until backfill grows (flag PO, not blocking). === STILL RUNNING: FIX-NSO-TRADE-VALUE-SCALE (dev-macro-indicators a758f56258db26a32) — head active here; HOLD board commit of macro outcome until it returns (don't sweep in-flight parsers_vmt_trade.go). === SF-1 held. NEXT: verify macro LIVE (get_vn_trade_balance plausibility), then FIX-RSI-REPORT-FAILCLOSED."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
