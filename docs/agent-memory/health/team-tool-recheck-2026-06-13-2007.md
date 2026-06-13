# MCP Tool Health Recheck — 2026-06-13T20:07Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: 1h 32m (restarted ~18:31Z — see I11 NEW)  
**DB:** market.db 273.12 MB, WAL 7.30 MB (+2.3 MB vs 18:06Z — WAL growth expected post-restart)  
**Probe scope:** 38 direct tool probes (expanded full sweep)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-1806.md`

---

## Delta vs Prior Report (18:06Z)

| Status | Count |
|--------|-------|
| NEW findings | 4 (I11 server restart, B11 get_market_summary schema, B12 get_financial_summary schema, I12 get_bctc_full empty-data) |
| CHANGED | 1 (I7: vn-sbv-fetch UNHEALTHY again — crash-loop confirmed) |
| UNCHANGED | 28 (all prior BUGs + ISSUEs + IMPROVEs unchanged) |

No prior BUGs resolved. 10 prior BUGs remain open.

---

## Summary

| Class | Count | Delta vs 18:06Z |
|-------|-------|-----------------|
| BUG   | 12    | +2 new (B11, B12) |
| ISSUE | 12    | +2 new (I11, I12); I7 crashed again |
| IMPROVE | 7  | unchanged |

---

## NEW / CHANGED since 18:06Z

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **I11** | MCP server unexpected restart ~18:31Z | ISSUE | `get_system_status` generated at 20:03Z shows `uptime: 1h 32m 6s` → started ~18:31:20Z. Prior report (18:06Z) showed uptime ~10h (started ~08:00Z). Unexpected mid-day restart. RSS failure counters reset (9 failures = ~fresh start). WAL grew 2.3 MB in ~1.5h. Cause unknown — OOM, manual, or crash-restart. | **NEW** |
| **B11** | `get_market_summary` requires `period` param (undocumented) | BUG | Call `{}` → `{"error":"period is required: 'daily'\|'weekly'\|'monthly'\|'quarterly'\|'yearly'"}`. `digest-predict.md` documents as no-arg: `Daily/weekly market summary — —`. All no-arg calls from digest-predict will fail validation. | **NEW** |
| **B12** | `get_financial_summary` requires `actionCode` param (undocumented) | BUG | Call `{ticker: "VCB"}` → `{"error":"actionCode: Required"}`. Not documented in any tool package. The system-map.json capability_manifest cites it as the `pdf` (pdf-extractor) probe, but schema mismatch means probe will fail. | **NEW** |
| **I12** | `get_bctc_full(code: "VCB")` returns empty despite PDF in storage | ISSUE | `get_bctc_full(code="VCB")` → `"Chưa có dữ liệu BCTC"`. `list_stored_pdfs` confirms `VCB_2026_Q1.pdf` (8.1 MB, 2026-06-07). `get_cash_flow(ticker="VCB")` → Q1/2026 OCF data found (source_tier 1). Structural BCTC parsed to CF only; income statement / balance sheet rows still missing. BCTC analysts get empty response for fundamental analysis. | **NEW** |
| **I7↑** | `vn-sbv-fetch` UNHEALTHY again | ISSUE | `get_vps_service_health`: `vn-sbv-fetch: unhealthy, uptime: 1h 14m`. Was TEMP-RESOLVED at 18:06Z, crashed again by ~18:50Z. Crash-loop confirmed — service restarts, runs 1–2h, crashes. SBV data is flowing (push log shows sbv pushes at 19:55Z) but via different code path or cached data. Root cause unresolved. | **CONFIRMED crash-loop** |

---

## BUGs (broken / errors) — all prior BUGs UNCHANGED + 2 new

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | `last_status: crashed`, `success_rate: 0.0%`, `avg_duration: 4036s (~67 min)`, last_run: 2026-06-08. **5+ days, 0 fundamental refreshes.** | Investigate crash log (likely OOM or vnstock API timeout). Reset/redeploy with pagination + 30-min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` routing broken | FPT (38 rows, TA ready per pipeline health, RSI14=51.2) → `source_tier: 3`, all MA/RSI/MACD/BB = N/A. Tool bypasses pre-computed TA values entirely. `get_pipeline_health` shows TA ready but MCP tool cannot read it. | Route MCP tool to pre-computed `ta_ohlcv` table when TA ready; raw-calc path as fallback only. | UNCHANGED (confirmed FPT) |
| B3 | `get_bctc_full` param `ticker` → `code` schema drift | Call with `ticker="VCB"` → `Required: code`. All 4 agent tool packages document `ticker: string`. | Update all 4 packages: replace `ticker` → `code`. **Note I12:** even with correct `code=`, VCB returns empty data. | UNCHANGED |
| B4 | HNX/UPCOM price sources all failing | `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` — recurring every ~2 min in error log. 5 watchlist tickers (BDI, DLC, JSH, SIS, VDC) have 0 OHLCV rows. | Diagnose HNX scraper; add UPCOM fallback source. | UNCHANGED |
| B5 | BCTC VPS pipeline stale | `get_vps_proxy_health`: bctc last push `2026-06-08 00:30:03` (**5+ days stale**). `vn-bctc-fetch` shows "healthy" (TCP ping only — not data-push health). 0 new BCTC PDFs for 5 days. | SSH into VPS; inspect `vn-bctc-fetch` process + cron logs. Fix health check to validate data push, not just TCP. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{ stockCode: string, eventKeyword: string }`. `market-watcher.md` documents `{ code: string }`. Every chart-pattern call from market-watcher cycle fails validation. | Fix `market-watcher.md` tool package to show `{stockCode: string (req), eventKeyword: string (req)}`. | UNCHANGED |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. `unified-agent.md` documents as no-arg. Unified-agent synthesis calls fail. Confirmed: `get_sentiment_trend(stock_code="VCB")` → works ✅. | Add `stock_code: string (required)` to `unified-agent.md` tool package. | UNCHANGED (workaround confirmed) |
| B8 | `get_kinhdich_reading` param `ticker` → `code` drift | Call with `ticker="FPT"` → `Required: code`. `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md` all document `ticker`. | Update 3 tool packages to `code: string (required)`. | UNCHANGED (confirmed works with `code`) |
| B9 | `get_agent_signals` undocumented required param | `agent: string` is required. `alert-commander.md` package docs list it correctly (`agent: string (REQUIRED)`). But `news-scout.md` bootstrap docs omit it. | Add `agent: string (required)` note to `news-scout.md`. | UNCHANGED |
| B10 | `get_market_hexagram` tool not found | Not re-tested; assumed unchanged from 18:06Z (tool missing from server). Every Sunday `digest-predict` cycle fails at this step. | Implement tool or remove from `digest-predict.md`; fallback: `get_kinhdich_reading(code="^VNINDEX")`. | ASSUMED UNCHANGED |
| **B11** | `get_market_summary` requires `period` param (undocumented) | Call `{}` → MCP error: `period is Required ('daily'\|'weekly'\|'monthly'\|'quarterly'\|'yearly')`. `digest-predict.md` documents as no-arg. | Add `period: 'daily'\|'weekly'\|'monthly'\|'quarterly'\|'yearly' (required)` to `digest-predict.md`. | **NEW** |
| **B12** | `get_financial_summary` requires `actionCode` param (undocumented) | Call `{ticker: "VCB"}` → `actionCode: Required`. Not in any tool package. system-map.json capability_manifest cites it as the `pdf` service probe — probe currently broken. | Document `actionCode` required schema in pdf-extractor tools list; add to capability_manifest probe so health checks pass. | **NEW** |

---

## ISSUEs (degraded / empty / slow)

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no data | `{"error":"no_data","message":"fred_series_daily has no ISM rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}` — CONFIRMED this run. `macroIndicatorRefreshJob` runs successfully (last: 2026-06-13 12:13Z) but ISM not populated → FRED_API_KEY not set. | Set `FRED_API_KEY` env var in mcp-server container. | UNCHANGED |
| I2 | CafeF RSS + Reuters RSS + TradingEconomics (×2) failing | 9 consecutive failures each since server restart ~18:31Z. `get_system_status` source health: "Ngưng" for all 4. Circuit breakers show [OK] — failures at RSS/HTTP layer. cafef.vn reachable per rate_limit_status. | Audit RSS endpoint URLs post-restart; check if TradingEconomics requires API key rotation. | UNCHANGED |
| I3 | `get_sector_rotation` 5-day gap | All 16 sectors: `N/A / 5d`, only 1-day momentum. `ohlcv-daily-aggregator` last_run: 2026-06-10 (confirmed 3+ days stale). `ohlcv-sanity-check` ran 2026-06-12 (success). | Investigate why `ohlcvDailyAggregatorJob` has not fired since June 10 — check for schedule regression. | UNCHANGED |
| I4 | BDI stale in `get_supply_chain_exposure` | BDI `1,400 (+0.0%) - 2026-04-07` — **67+ days old**, confirmed this run. `commodityTrackerRefreshJob` succeeds daily but does not include BDI. | Add Baltic Dry Index to `commodityTrackerRefreshJob` scope or dedicated shipping-index fetcher. | UNCHANGED |
| I5 | `bctcReparseJob` 83% success rate | 182 runs at 83.0% — persistent 17% failure floor. vnstock rate-limiting for ACB, HPG, HSG confirmed in error log this run (max retries exhausted). | Add per-ticker exponential back-off in `bctcQueueEnricherJob`; skip tickers with N consecutive "max retries exhausted". | STABLE |
| I6 | `pending_feedback` + `open_warnings` backlog | `pending_feedback: 54` (unchanged from 18:06Z); `open_warnings: 45` unchanged. Backlog not draining. | Drain feedback queue; fix I2 RSS failures to stop generating new error records. | UNCHANGED |
| I7 | `vn-sbv-fetch` crash-loop | **UNHEALTHY again** (uptime 1h 14m at 20:00Z). Was TEMP-RESOLVED at 18:06Z. Crashed again ~18:50Z (within predicted 2h window). SBV push log shows pushes at 19:55Z via alternative code path. Root cause unresolved. | Add PM2/systemd restart supervisor + alert on >2 restarts/hour. Add data-push health check separate from TCP ping. | **CONFIRMED crash-loop** |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null` — confirmed this run. `vnIndexDelta: -6.96` computes correctly. Affects directional macro analysis in all cowork agents. | Fix delta calculation for commodity fields; store prev-close baseline in macro_indicators table. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live hydro data | "Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)." — confirmed. `weatherCheckJob` succeeds but does not populate hydro grid signals. | Trace hydro data path from weatherCheckJob output to energy-grid consumer; fix response parser. | UNCHANGED |
| I10 | `wti_crude_usd` stale at $95.5 | `get_system_status` auto-tracked: `wti_crude_usd 95.5 (79 data points)`. Live `brent_crude_usd: 87.33`. WTI > Brent by $8.17 is physically impossible (WTI trades $1–3 BELOW Brent). Stale/invalid value corrupts oil-signal regime analysis. | Audit which job owns WTI; confirm data source URL; add WTI to `commodityTrackerRefreshJob` scope. | UNCHANGED |
| **I11** | Unexpected MCP server restart ~18:31Z | `uptime: 1h 32m` at 20:03Z (started ~18:31Z). Prior report showed ~10h uptime. Cause unknown — OOM, crash, or manual. WAL growth +2.3 MB post-restart. After restart: all circuit breakers at 9 failures (no-reconnect state), bctcReparseJob running (last 18:42Z success). | Investigate restart cause in Docker/systemd logs. Monitor for repeat. Confirm all crons resumed post-restart. | **NEW** |
| **I12** | `get_bctc_full(code="VCB")` returns empty despite PDF in storage | `list_stored_pdfs` shows `VCB_2026_Q1.pdf` (8.1 MB, 2026-06-07). `get_bctc_full(code="VCB")` → `"Chưa có dữ liệu BCTC"`. `get_cash_flow(ticker="VCB")` → Q1/2026 OCF data found (tier-1). PDF parsed for CF only; income statement / balance sheet unparsed. BCTC analysts get empty response on the most used call. | Trigger `bctcReparseJob` for VCB specifically; check `bctc_table_rows` for VCB Q1 2026 row counts. | **NEW** |

---

## IMPROVEMENTs

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation | `get_cascade_metrics`: 1,965+ rule hits, `Eval=0` for ALL 49 rules. `record_signal_outcome` never called from cowork cycle. | Wire `record_signal_outcome` into alert-commander feedback loop after verdict. | UNCHANGED |
| M2 | Alert outcome unknown rate | 683 total alerts, 653 (95.6%) "unknown" verdict. Only price_surge/price_drop/volume_spike auto-resolved (30 of 683). | Auto-resolve price alerts by comparing alert price vs 5-day close. | UNCHANGED |
| M3 | `get_foreign_flow` undocumented required param | Tool requires `code: string`; calling `{}` → validation error. Not documented in any flow file. | Add `code: string (required)` to all relevant flow docs. | UNCHANGED |
| M4 | `run_impact_chain` sector direction errors | SBV rate reduction → BEARISH for banking (should be BULLISH for NIM expansion). Confirmed correct chain logic otherwise (9-node chain for VCB test). | Add sector override: `monetary_easing → banking: bullish`. | UNCHANGED |
| M5 | `get_sector_rotation` non-watchlist sectors | Returns `gold_mining`, `construction`, `insurance` with 0 watchlist tickers. Clutters output for agents filtering by watchlist. | Filter output to sectors with ≥1 active watchlist ticker. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min duration | `avg_duration: 4,735,029ms` (1 run, 2026-06-09). Sister job to B1. OOM risk on next run. | Add 30-min timeout guard; paginate vnstock batch calls. | UNCHANGED |
| M7 | `macroIndicatorRefreshJob_FAILTEST` test cron in prod | Listed in `get_cron_health` (last_run: 2026-06-08, 1 run). Test artifact polluting prod cron health dashboard. | Delete or disable this test job entry from cron registry. | UNCHANGED |

---

## Tool Probe Coverage (this run — 38 probes)

| Tool | Result | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(news-scout)` | ✅ | 38ms; 41 tickers; 2 open alerts |
| `get_system_status` | ⚠️ | HNX errors B4; RSS failures I2; uptime 1h32m I11 |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | commodity deltas null I8; VND/FX/carry data present |
| `get_watchlist` | ✅ | 41 tickers |
| `get_agent_signals(agent="news-scout")` | ✅ | no new signals (correct) |
| `get_alerts` | ✅ | 20 alerts (7d), 2 unread open (24h) |
| `get_earnings_calendar` | ✅ | 41 tickers; 10 QUÁ HẠN |
| `get_rate_limit_status` | ✅ | 11 hosts; all ready/not-called |
| `get_recent_fixes` | ✅ | 5 fixes returned |
| `fetch_and_analyze` | ✅ | 20 items; VnExpress OK; CafeF absent I2 |
| `get_fed_liquidity_spread` | ✅ | EFFR 3.62, IORB 3.65, spread -0.03 (tier-1) |
| `get_ism_subcomponents` | ❌ | no_data / FRED_API_KEY missing (I1) |
| `get_sector_rotation` | ⚠️ | all N/A/5d (I3) |
| `get_supply_chain_exposure` | ⚠️ | BDI 2026-04-07 stale (I4) |
| `get_climate_risk_signals` | ✅ | generic June advisory |
| `get_energy_grid_signals` | ⚠️ | 70% default, no live hydro (I9) |
| `get_legal_risk_signals` | ✅ | 5 signals (most recent 2026-05-29) |
| `get_crisis_early_warning` | ✅ | GAS/PLX/VNM danger scores |
| `get_insider_signals({})` | ❌ | schema drift: `code` + `outstandingShares` required (B6-class) |
| `get_technical_indicators(code="FPT")` | ❌ | tier-3, all N/A despite 38 rows (B2 confirmed) |
| `get_patterns(code="VCB")` | ❌ | requires `{stockCode, eventKeyword}` — schema drift (B6) |
| `get_ticker_intelligence(code="HPG")` | ✅ | tier-2; evidence score + price returned |
| `get_price_history(code="VCB", days=7)` | ✅ | 5 trading days returned |
| `get_open_chain_findings` | ✅ | 0 findings (correct; market closed) |
| `get_kinhdich_reading(code="FPT")` | ✅ | Hexagram 56 returned (use `code` not `ticker`) |
| `get_portfolio_conviction` | ✅ | 41 tickers; all MODERATE; 1 active FPT position |
| `get_positions` | ✅ | 1 position: FPT -8.5% |
| `get_bctc_full(code="VCB")` | ⚠️ | empty data despite PDF in storage (I12) |
| `get_cash_flow(ticker="VCB")` | ✅ | Q1/2026 OCF data; tier-1 |
| `list_stored_pdfs` | ✅ | 60 PDFs; latest 2026-06-08 |
| `get_portfolio_risk` | ✅ | VaR -0.1%; single FPT position |
| `get_sentiment_trend({})` | ❌ | requires `stock_code` param; schema drift B7 |
| `get_sentiment_trend(stock_code="VCB")` | ✅ | 7-day trend returned (workaround confirmed) |
| `get_prediction_markets` | ✅ | 1 Polymarket market; 0 active signals |
| `get_cascade_metrics` | ⚠️ | 1,965+ hits; Eval=0 all rules (M1) |
| `get_cron_health` | ✅ | B1 confirmed; M7 test job present |
| `get_market_summary({})` | ❌ | `period` Required — schema drift (B11 NEW) |
| `get_rebalancing_signals` | ✅ | no targets set |
| `run_impact_chain` | ✅ | 9-node chain for VCB banking input |
| `search_similar_context` | ✅ | 5 results; recency-weighted scores |
| `get_pipeline_health` | ✅ | 36/41 TA-ready; 5 tickers 0 rows (B4) |
| `get_vps_service_health` | ⚠️ | vn-sbv-fetch UNHEALTHY (I7); 2 healthy; 2 idle |
| `task_list_held` | ✅ | 1 expired lock (unified-agent commit-mutex, exp 19:56Z) |
| `get_alert_accuracy` | ✅ | 96.7% accuracy; 653/683 unknown (M2) |
| `get_signal_effectiveness` | ✅ | 1 signal in 7d (news-scout urgent_news) |
| `get_vps_proxy_health` | ❌ | bctc STALE 5+ days (B5) |
| `get_financial_summary` | ❌ | requires `actionCode` param undocumented (B12 NEW) |

---

## Priority Action Items (unchanged P0–P3 + new additions)

**P0 — Critical, blocking cowork agent execution:**
1. **B1**: `vnstockFundamentalsRefresh` crashed — 5+ days, 0 fundamental refreshes
2. **B5**: BCTC VPS pipeline stale — 5+ days, 0 new PDFs (TCP health ≠ data health)
3. **B10**: `get_market_hexagram` missing — every Sunday digest-predict cycle broken
4. **I7**: `vn-sbv-fetch` crash-loop — crashed again as predicted (within 2h of 18:06Z report)
5. **B2**: `get_technical_indicators` routing broken — all N/A despite pipeline ready (confirmed FPT this run)
6. **I11** NEW: Unexpected mcp-server restart ~18:31Z — cause unknown; investigate OOM/crash

**P1 — Schema drifts breaking live agent calls:**
7. **B3**: `get_bctc_full` — `ticker` → `code` (4 tool packages)
8. **B8**: `get_kinhdich_reading` — `ticker` → `code` (3 tool packages)
9. **B6**: `get_patterns` — market-watcher broken (`code` vs `{stockCode, eventKeyword}`)
10. **B7**: `get_sentiment_trend` — unified-agent broken (no-arg vs `stock_code` required)
11. **B11** NEW: `get_market_summary` — digest-predict broken (no-arg vs `period` required)
12. **B9**: `get_agent_signals` — undocumented required `agent` param
13. **I12** NEW: `get_bctc_full(code="VCB")` empty — PDF parsed for CF only, income/balance missing

**P2 — Active ISSUEs degrading data quality:**
14. **I1**: `get_ism_subcomponents` no data — FRED_API_KEY not set
15. **I2**: CafeF/Reuters/TradingEconomics failing — 4 news+macro sources down since restart
16. **I10**: WTI crude stale at $95.5 (impossible vs Brent $87.33)
17. **I3**: Sector rotation missing 5-day data — ohlcvDailyAggregatorJob not firing since Jun 10
18. **I8**: Commodity macro deltas null in all agents

**P3 — Technical debt / improve:**
19. **B12**: `get_financial_summary` schema undocumented — capability probe broken
20. **M1**: Cascade evaluation 0% — outcomes never resolved
21. **M2**: Alert outcome 95.6% unknown — evaluation loop missing
22. **I4**: BDI stale 67+ days in supply chain signal
23. **M6+B1**: vnstockTradingStatsRefresh 79-min run — OOM risk on next execution
24. **M7**: Test cron `macroIndicatorRefreshJob_FAILTEST` in prod registry

---

_Report generated: 2026-06-13T20:07Z by health-recheck agent_
