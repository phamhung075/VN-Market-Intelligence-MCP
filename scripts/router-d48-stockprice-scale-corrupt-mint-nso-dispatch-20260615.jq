# Router dev-team — tick 2026-06-15 (post-PO-triage) dual dispatch + new urgent bug mint.
# TRIGGER: user flagged MARKET report RSI single-digit (VIC 7.4 / VHM 9.8 / VRE 10.3) "bad calcul".
# ROUTER RAW-PROBE (gateway call_tool, NOT badge): get_technical_indicators VIC/VHM/VRE => RSI N/A (<15 candles, fail-closed OK).
#   get_price_history => ROOT FOUND: 2026-06-12 candle SCALE-CORRUPT 1000x for high-priced tickers:
#   VIC close=195.5 (should ~195,500), VHM close=138.7 (should ~138,700); VRE 28,600 + FPT 73,500 CLEAN.
#   The fake -99.90% crash on 06-12 + +98570% rebound on 06-15 craters RSI -> single digits -> poisons the MARKET report.
# Actions: (1) mint FIX-STOCK-PRICE-SCALE-CORRUPT (urgent, in_progress -> dev-stock-price).
#          (2) move FIX-NSO-TRADE-VALUE-SCALE ready->in_progress (PO-dispatched this tick -> dev-macro-indicators).
#          (3) mint FIX-RSI-REPORT-FAILCLOSED (READY follow-on — report RSI path computes on <15 candles vs canonical N/A).
# GUARD: refuse unless FIX-NSO-TRADE-VALUE-SCALE present in ready[] as READY AND neither new id already minted.
# Usage: jq --arg now "$NOW" -f scripts/router-d48-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready[]? | select(.id=="FIX-NSO-TRADE-VALUE-SCALE")][0]) as $nso
| if ($nso==null or ($nso.status//"")!="READY") then error("FIX-NSO-TRADE-VALUE-SCALE not READY in ready[] (\($nso.status//"missing")) — refuse")
  elif ([..|objects|select(.id?=="FIX-STOCK-PRICE-SCALE-CORRUPT")]|length>0) then error("FIX-STOCK-PRICE-SCALE-CORRUPT already minted — refuse")
  elif ([..|objects|select(.id?=="FIX-RSI-REPORT-FAILCLOSED")]|length>0) then error("FIX-RSI-REPORT-FAILCLOSED already minted — refuse")
  else . end
| ($nso + {status:"in_progress", dispatched_to:"dev-macro-indicators", dispatched_at:$now,
           dispatch_note:"recon-first value/unit misparse on selected NSO trade sheets; SERIALIZE on parsers_vmt_trade.go"}) as $nso_ip
| {
    id:"FIX-STOCK-PRICE-SCALE-CORRUPT", type:"FIX",
    title:"FIX-STOCK-PRICE-SCALE-CORRUPT — daily candle stored 1000x low for high-priced tickers (VIC 06-12 close=195.5 vs ~195,500; VHM 138.7 vs ~138,700) -> fake -99.9% crash craters RSI to single digits -> poisons MARKET report",
    zone:"apps/stock-price/", owner:"dev-stock-price", owner_agent:"dev-stock-price",
    status:"in_progress", priority:"urgent", size:"M", recon_first:true,
    dispatched_to:"dev-stock-price", dispatched_at:$now,
    root_cause:"On 2026-06-12 the ingested close for high-priced tickers (price > ~100k VND) was stored 1000x too low: VIC close=195.5 (raw JSON close:195.5) instead of ~195,500; VHM 138.7 instead of ~138,700. VRE(28,600) + FPT(73,500) on the same date are CLEAN. Pattern = the 06-12 source returned price in THOUSANDS-of-VND (nghin dong) for some tickers and pkg/primitive/price-quote-normalizer/normalizer.go did NOT rescale to VND. No outlier/plausibility guard exists at ingestion (grep: none). Downstream get_price_history shows -99.90% on 06-12 then +98570% on 06-15; RSI computed on that fake crash collapses to 7.4/9.8 and was published to MARKET.",
    fix_spec:"RECON-FIRST: (a) enumerate ALL watchlist tickers' price rows around 2026-06-12 (and scan full history) for any close that is >=~50x off the adjacent valid close = unit-corrupt set; (b) find the 06-12 ingestion path/source that returned thousands-scale (fetchers.go + which source tier) and why normalizer.go missed it. THEN: (1) add an ingestion-time plausibility/normalization guard in price-quote-normalizer: a daily close that deviates >=~50x (configurable threshold, NOT hardcoded per-ticker) from the prior valid close is a unit error -> rescale by the detected factor (x1000) or reject+refetch, fail-loud log. Generic across ALL tickers (/goal#2). (2) BACKFILL-CORRECT the already-corrupted candles in the live DB (named volume /app/data/market.db, NOT host ./data) — rescale the bad 06-12 closes to VND. (3) add a regression test: a thousands-scale input candle is normalized/rejected, never stored 1000x low. SECONDARY (note, not blocking): get_technical_indicators correctly returns RSI N/A on <15 candles, but the MARKET-report RSI path produced numbers anyway -> see follow-on FIX-RSI-REPORT-FAILCLOSED.",
    verification_gate:"LIVE post-rebuild: get_price_history VIC/VHM show NO 1000x-off candle on 06-12 (all closes ~140k-196k band, day-over-day change within sane circuit-breaker band, NO -99.9%/+98570% artifacts); get_technical_indicators RSI for a ticker WITH >=15 clean candles returns a plausible 0-100 value (not single-digit from corruption). Plausibility guard test green in CI.",
    baseline_pass:"04e1ebb7",
    source:"router RAW-probe 2026-06-15T04:43Z (user flagged MARKET report RSI bad-calc; root = price scale corruption, NOT RSI math)",
    created_at:$now, created_by:"dev-team", triaged_by:"dev-team",
    user_flagged:true,
    status_note:"User-facing live bug — wrong RSI + absurd % changes already published to MARKET. URGENT. dev-stock-price zone; recon then guard+backfill+test. Rebuild stock-price via force-recreate single service (NEVER compose down)."
  } as $sp
| {
    id:"FIX-RSI-REPORT-FAILCLOSED", type:"FIX",
    title:"FIX-RSI-REPORT-FAILCLOSED — MARKET-report RSI path emits values on <15 candles (VRE RSI 10.3 on ~6-candle downtrend) while canonical get_technical_indicators correctly returns N/A",
    zone:"apps/technical-analysis/", owner:"dev-technical-analysis", owner_agent:"dev-technical-analysis",
    status:"READY", priority:"high", size:"S", recon_first:true,
    root_cause:"The report/summary RSI source (candidate: generate_market_summary or a market-watcher/CHEF internal calc — RECON to confirm) computed RSI for VRE = 10.3 even though VRE has only ~6 candles; the canonical get_technical_indicators returns 'RSI(14): N/A (can toi thieu 15 nen)' for the same ticker. Two RSI code paths diverge: one fail-closed, one not. The non-fail-closed path also inherited the price corruption for VIC/VHM (single-digit). Even after FIX-STOCK-PRICE-SCALE-CORRUPT, the report would still emit under-determined RSI on shallow history.",
    fix_spec:"RECON: identify which tool/agent produced the MARKET report's RSI numbers (grep report generators + generate_market_summary RSI path). THEN make that path fail-closed identically to get_technical_indicators: RSI requires >=15 candles else emit N/A (and the report must render 'RSI: N/A' or omit, never a number). Single SSOT RSI calc shared by both paths is the DRY target (/goal#2). Add test: <15 candles -> N/A from BOTH paths.",
    verification_gate:"LIVE: the report RSI path and get_technical_indicators agree for the same ticker (both N/A when <15 candles; both same plausible value when >=15). No single-digit RSI emitted to MARKET from corrupted/shallow data.",
    baseline_pass:"04e1ebb7",
    source:"router RAW-probe 2026-06-15T04:43Z (VRE clean price yet RSI 10.3 reported = non-fail-closed report RSI path)",
    created_at:$now, created_by:"dev-team", triaged_by:"dev-team",
    status_note:"Follow-on to FIX-STOCK-PRICE-SCALE-CORRUPT. Distinct zone (technical-analysis/report). Next-tick dispatch after stock-price root fix lands. Confirm RSI source first."
  } as $rsi
| .task_board.ready = ([.task_board.ready[]? | select(.id!="FIX-NSO-TRADE-VALUE-SCALE")] + [ $rsi ])
| .task_board.in_progress = (.task_board.in_progress + [ $nso_ip, $sp ])
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-STOCK-PRICE-SCALE-CORRUPT", next_agent:"dev-stock-price",
    note:"DEV-TEAM TICK 2026-06-15 (post-PO) — DUAL DISPATCH + urgent user-flagged bug. (1) FIX-STOCK-PRICE-SCALE-CORRUPT minted URGENT in_progress -> dev-stock-price: ROOT of user's 'RSI bad calc' = 2026-06-12 price candle stored 1000x low for high-priced tickers (VIC 195.5 vs ~195,500; VHM 138.7 vs ~138,700; VRE+FPT clean) -> fake -99.9% crash craters RSI to single-digit -> poisoned MARKET report. Fix = normalizer outlier/rescale guard (generic) + DB backfill + test. (2) FIX-NSO-TRADE-VALUE-SCALE moved ready->in_progress -> dev-macro-indicators (recon-first trade value/unit misparse; disjoint zone, parallel-safe). (3) FIX-RSI-REPORT-FAILCLOSED minted READY follow-on (technical-analysis: report RSI path not fail-closed on <15 candles; VRE 10.3 on ~6 candles). WIP=2 live (ARCH-CRON + BA-VN-MACRO are non-live HOLD-OPEN/parked per PO). Both dispatched run_in_background; commit-mutex serialized; force-recreate single service on rebuild (NEVER compose down). === NEXT: drive both to done_verified w/ LIVE raw re-probe + plausibility check; then FIX-RSI-REPORT-FAILCLOSED. SF-1 held."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
