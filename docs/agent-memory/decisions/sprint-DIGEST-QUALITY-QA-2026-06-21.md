# Decision Journal — Sprint: Digest Quality QA Gate (5-fix wave)
<!-- agent: qa | cycle: 306 | date: 2026-06-21 -->

## Entry 1
**task-id:** FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME (commit dfb4e268)
**what-considered:** tsc, pnpm check, 1307a test (16/16), DDD domain layer clean, security clean, mock-guard PASS, live FX stats (USD/VND stdDev=0 → normal level, guard fires correctly), FX_SLOW_MOVER_INDICATORS set + FX_PERCENT_FLOOR=0.5 present in running container.
**why-change:** no change from plan — all checks green. Boundary math verified via Python on live sbv_rates_history (30-row window all 26120.0 → stddev=0 → level=normal; even if a small drift occurred absPercentMove < 0.5% → Guard 2 caps to elevated). Test suite covers just-under/just-over 0.5% boundary + non-FX bypass.
**verdict:** APPROVED

## Entry 2
**task-id:** TASK-RSIFIX-1 (commit 60891f75, docs-only)
**what-considered:** File existence at docs/standards/ta-engine-contract.md confirmed. git show --stat = 3 files (orch-state + handoff + contract doc). No runtime code. Acceptance criteria: file exists, parameters source-cited (verified against Go source per dev record). Corrections documented: hard min=15 not 35, MA5/20/50 not MA100, empty closes = HTTP 400 not 200.
**why-change:** no change from plan — docs-only, no tsc/test gate needed.
**verdict:** APPROVED (docs-only Smart-Skip)

## Entry 3
**task-id:** TASK-RSIFIX-2 (commit 3e5a5a5a)
**what-considered:** tsc EXIT 0, pnpm check EXIT 0, RSIFIX-2-assembleBriefing.test.ts 4/4 PASS, RSIFIX-2-assembleEveningSummary.test.ts 6/6 PASS (10 total). defaultComputeTa() confirmed async at line 667 assembleBriefing.ts, computeRSILocal removed from path, computeTAIndicators imported, 35-candle gate at L677, market_prices_history fallback removed (comment at L659), stub-bar guard at L681. DDD: application imports infra (permitted). Security PASS. mock-guard EXIT 0. Live DB: TCH has 28 candles < 35 gate — would return null from defaultComputeTa (gate enforced in TS, not Go). Go pure-compute confirmed returns RSI for 28 closes (hard gate=15 in Go), TS gate=35 is the authoritative gating layer per contract. D2D 40 candles → rsi14 present confirmed.
**why-change:** no change from plan — all checks green.
**verdict:** APPROVED

## Entry 4
**task-id:** FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN (commit b1d32758)
**what-considered:** tsc EXIT 0, pnpm check EXIT 0, 14/14 test PASS. Live DB: without fix — MWG|35469, VNH|-40, ACV|0, DFF|0, HBC|0 (3 zero-padding rows confirmed for 2026-06-19). With fix (AND foreign_net_vol <> 0) — MWG|35469, VNH|-40 (only 2 nonzero rows, no padding). SQL in assembleEveningSummary.ts L664 confirmed. formatForeignFlowSection nonZeroMovers filter at L226 confirmed. Source table: daily_ohlcv (not vnstock_trading_stats as handoff PM spec said — actual code uses daily_ohlcv, confirmed at L660). DDD PASS. Security PASS. mock-guard EXIT 0.
**why-change:** no change from plan — all checks green. Minor note: source table in impl is daily_ohlcv (not vnstock_trading_stats from PM spec), but this matches the actual code and is the correct table per dev note in handoff.
**verdict:** APPROVED

## Entry 5
**task-id:** FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR (commit 2e762361)
**what-considered:** tsc EXIT 0, pnpm check EXIT 0, LF-1..LF-5 5/5 PASS, 1309-bb-alert-scan-job 21/21 PASS (BB regression suite), 1391-bb-stale-candle-skip included in the 21. Live DB: sub-floor tickers confirmed (HNF, MEL, VGV etc. with vol=1). Liquid tickers (VNINDEX 608M+, SHB 40M+). MIN_DAILY_VOLUME_FOR_ALERTS=100_000 confirmed in running container at L199 bbAlertScanJob + L210 taAlertScanJob. D2D ta_bb_breakout_down + ta_oversold alerts present for 2026-06-19 (PRE-rebuild). After container rebuild (2026-06-20T23:12:33Z): 0 ta_ type alerts found (market hours not yet reached in this new session; scan fires during VN market hours 02:00–08:00 UTC). Code path confirms floor at L199/200 bbAlertScanJob + L210/211 taAlertScanJob. alertThresholds.ts new domain service file verified. DDD PASS (scheduler→domain = permitted). Security PASS. mock-guard EXIT 0.
**why-change:** no change from plan — all checks green. done_verified gate for "no TA alerts from sub-floor tickers" requires next market-hours scan cycle (floor IS in the running code per container grep; no TA alerts from D2D post-rebuild is consistent with behavior but cannot be forced before next scan window).
**verdict:** APPROVED
