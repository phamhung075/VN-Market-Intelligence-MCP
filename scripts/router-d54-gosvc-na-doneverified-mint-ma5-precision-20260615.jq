# Router dev-team — promote FIX-TA-GOSVC-NA-DESPITE-DEPTH in_progress -> done_verified after router LIVE RAW
# re-probe in the REBUILT Go TA-svc container, AND peel the residual precision divergence into a recon-first
# follow-on FIX-TA-GOSVC-MA5-PRECISION.
#
# LIVE GATE (router gateway call_tool get_technical_indicators, NOT ops/dev badge), 2026-06-15T06:47Z, in the
# rebuilt technical-analysis container (image sha256:e83b0dde @06:46:23Z, AFTER commit 33e7a094 @06:43:07Z;
# old image 151dd32f @2026-06-10 destroyed-free recreate, all 13 peers survived):
#   Go TA svc now returns REAL indicators on the 38-candle daily_ohlcv depth (was N/A "(cần 15 nến)" pre-fix):
#     VRE RSI(14)=39.9  VIC=34.7  VHM=35.5  — all mid-band, NO single-digit, NOT N/A.
#     vs report path defaultComputeTa (VRE 39.52 / VIC 35.09 / VHM 36.73) => BOTH PATHS AGREE within 0.4-1.2 pt.
#     MACD line/signal/hist + BB(20) upper/mid/lower + MA20 now ALSO populate (were N/A) — confirms GetCandles
#     returns full depth. MA50 correctly fail-closes "(cần 50 nến)" (only 38<50 candles exist) — legit.
#   => FIX-TA-GOSVC root cause (Go GetCandles stub `return nil, errors.New("not implemented yet")` replaced with
#      real database/sql + modernc.org/sqlite SELECT date,close FROM daily_ohlcv WHERE code=? ORDER BY date ASC
#      LIMIT ?, commit 33e7a094) is LIVE-CONFIRMED. The user-flagged single-digit/N-A RSI class is now CLOSED on
#      its LAST open consumer (get_technical_indicators / Go svc).
#
# RESIDUAL (peeled, NOT a flaw blocking this gate — same pattern as feedback_same_db_tools_diverge_rowcount:
#   promote the correct-path fix, mint the divergence as recon-first follow-on):
#   (a) MA5=N/A despite 38 candles although MA20 (needs 20) computes — MA5 (needs 5) should always compute =>
#       concrete latent Go-svc MA5 bug; (b) RSI agrees only within 0.4-1.2 pt not identical => Go path likely
#       reads a different candle-window/smoothing-seed than the TS report path (LIMIT 60 vs ?). Make both read the
#       SAME window+method so indicators are identical across paths. -> FIX-TA-GOSVC-MA5-PRECISION (recon-first).
#
# GUARD: refuse unless GOSVC in in_progress[] AND not already done_verified AND MA5 follow-on not yet minted.
# CONSERVATION: assert final task total == initial+1 (one new follow-on minted).
# Usage: jq --arg now "$NOW" -f scripts/router-d54-...jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]? | select(.id=="FIX-TA-GOSVC-NA-DESPITE-DEPTH")][0]) as $t
| if ($t==null) then error("FIX-TA-GOSVC-NA-DESPITE-DEPTH not in in_progress[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id=="FIX-TA-GOSVC-NA-DESPITE-DEPTH")]|length>0) then error("already done_verified — refuse")
  elif ([..|objects|select(.id?=="FIX-TA-GOSVC-MA5-PRECISION")]|length>0) then error("FIX-TA-GOSVC-MA5-PRECISION already minted — refuse")
  else . end
| ("LIVE-VERIFIED (router independent gateway re-probe get_technical_indicators 2026-06-15T06:47Z in REBUILT technical-analysis container image sha256:e83b0dde @06:46:23Z — AFTER commit 33e7a094 @06:43:07Z; NOT ops/dev badge): the Go TA svc (PRIMARY path of get_technical_indicators) now returns REAL indicators on the 38-candle daily_ohlcv depth it previously under-read to N/A — VRE RSI(14)=39.9, VIC=34.7, VHM=35.5 — all mid-band, NO single-digit, NOT N/A, AGREEING with the report path defaultComputeTa (39.52/35.09/36.73) within 0.4-1.2 pt. MACD/BB(20)/MA20 also populate now (were N/A); MA50 correctly fail-closes (only 38<50 candles). ROOT FIX (33e7a094): replaced the GetCandles stub (`return nil, errors.New(\"not implemented yet\")`) with a real database/sql + modernc.org/sqlite query mirroring the TS path; Go suite green (build/vet/test incl. TestComputeTA_38Rows_RSI_NonNull + TestGetCandles_38Rows). The user-flagged single-digit/N-A RSI class is now CLOSED on its LAST open consumer. RESIDUAL peeled to recon-first follow-on FIX-TA-GOSVC-MA5-PRECISION: (a) MA5=N/A despite 38 candles though MA20 computes; (b) RSI agrees within ~1pt not identical (Go vs TS candle-window/seed). Both paths probed LIVE per feedback_same_db_tools_diverge_rowcount.") as $V
| {
    id:"FIX-TA-GOSVC-MA5-PRECISION", type:"FIX",
    title:"FIX-TA-GOSVC-MA5-PRECISION — Go TA svc returns MA5=N/A despite 38 daily_ohlcv candles (MA20 computes), and its RSI agrees with the mcp-server report path only within ~1pt not identically — Go path likely reads a different candle-window/smoothing-seed than defaultComputeTa",
    zone:"apps/technical-analysis/", owner:"dev-technical-analysis", owner_agent:"dev-technical-analysis",
    status:"READY", priority:"medium", size:"S", recon_first:true,
    root_cause:"After FIX-TA-GOSVC (33e7a094) the Go svc reads the 38-candle daily_ohlcv depth and computes RSI(14)/MACD/BB(20)/MA20 correctly. Two residuals remain: (a) MA5 reports N/A even though 38>=5 candles exist and MA20 (needs 20) computes — a guard/length-check bug in the Go MA5 path; (b) Go RSI (VRE 39.9/VIC 34.7/VHM 35.5) agrees with the TS report path defaultComputeTa (39.52/35.09/36.73) only within 0.4-1.2 pt, not identically — the two paths likely read a different candle window (Go LIMIT ? default 60 vs report LIMIT 60) or use a different RSI smoothing seed (Wilder EMA vs simple-avg-of-first-14). Same 38-row daily_ohlcv, so identical inputs SHOULD yield identical RSI.",
    fix_spec:"RECON FIRST: (a) read apps/technical-analysis/pkg/application calculator MA5 path — find why MA5 returns N/A at depth>=5 while MA20 succeeds; (b) compare the Go RSI(14) smoothing method + candle-window against the TS report path localComputeRSI/defaultComputeTa (LIMIT 60, fixed period-14 post-FIX-RSI-REPORT-FAILCLOSED) — align window+method so both paths return IDENTICAL RSI on the same daily_ohlcv rows. GENERIC across all watchlist tickers (/goal#2). Add a Go test: 38-row ticker yields non-null MA5; and a cross-path parity assertion (Go RSI == report RSI to <=0.1 tolerance on identical candle set).",
    verification_gate:"LIVE: get_technical_indicators(VRE/VIC/VHM) returns a non-null MA5; AND Go RSI(14) == report-path defaultComputeTa RSI(14) to within 0.1 pt on the same daily_ohlcv rows (currently 0.4-1.2pt apart). Re-run scripts/verify-report-rsi-failclose.ts + cross-check the canonical tool.",
    baseline_pass:"33e7a094",
    source:"router LIVE RAW re-probe 2026-06-15T06:47Z during FIX-TA-GOSVC-NA-DESPITE-DEPTH done_verify — Go svc RSI now real & plausible (gate met) but MA5 still N/A + RSI diverges ~1pt from report path",
    created_at:$now, created_by:"dev-team", triaged_by:"dev-team",
    status_note:"Follow-on peeled from FIX-TA-GOSVC-NA-DESPITE-DEPTH LIVE verify. MEDIUM/S — does NOT affect the user MARKET report (report path is the now-fixed defaultComputeTa) and does NOT reopen the single-digit RSI class (Go RSI is plausible mid-band). Precision/parity + MA5 completeness only. PO triage next tick; pairs in the same zone as 33e7a094 so cheap to batch. Confirm Go MA5 length-guard + RSI window/seed first."
  } as $ma5
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!="FIX-TA-GOSVC-NA-DESPITE-DEPTH") ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"done_verified", done_verified_at:$now, done_verified_by:"dev-team",
      done_commit:"33e7a094",
      rebuild_image:"sha256:e83b0dde802c0610ede28506c3c8504f8e89cb7faf01e8255dae9c24b8e37984",
      live_verify_verdict:$V } ])
| .task_board.ready = (.task_board.ready + [ $ma5 ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null,
    note:"DEV-TEAM TICK 2026-06-15T06:47Z — FIX-TA-GOSVC-NA-DESPITE-DEPTH DONE_VERIFIED (router LIVE RAW gateway re-probe in REBUILT Go TA-svc container image sha256:e83b0dde @06:46:23Z, AFTER commit 33e7a094 @06:43:07Z; ops rebuild verified — all 13 peers survived, named-volume market.db mounted): get_technical_indicators now returns REAL RSI on 38-candle depth (VRE 39.9/VIC 34.7/VHM 35.5, mid-band, NO single-digit, NOT N/A), AGREEING with the report path (39.52/35.09/36.73) within ~1pt; MACD/BB/MA20 also populate. Root = Go GetCandles stub replaced w/ real SQLite query (33e7a094). === USER-FLAGGED SINGLE-DIGIT RSI CLASS NOW FULLY CLOSED on BOTH consumers: briefing path (ed77b9b0, prior arc) + canonical Go svc (33e7a094, this tick). === RESIDUAL peeled READY: FIX-TA-GOSVC-MA5-PRECISION (MEDIUM/S, recon-first) — Go MA5=N/A despite 38 candles + RSI ~1pt off report path; precision/parity only, does NOT reopen the flagged class. === STILL OPEN: FIX-CHEF-FABRICATED-TA-NUMBERS in REVIEW (structural anti-fabrication gate verified a925e89a; LIVE behavioral gate pending next chef-intraday dish ~07:13 UTC — router RAW-reads MARKET for zero numeric RSI, will NOT force a dish). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA observe gate), BA-VN-MACRO-TOOLING (queued). KEEP-PARK: ARCH-SHIP-WAVE-REAUDIT. === NEXT: 6 unpushed commits + this board chore — push is PO's authorized call after CHEF gate closes; CI flaky-suite aware (disjoint-set + green downstream SHA). SF-1 release at clean tick-end."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != ($before+1))
    then error("CONSERVATION FAIL: total != before+1") else . end
