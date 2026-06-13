# MCP Tool Health Recheck — 2026-06-13T10:09Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime at probe start: 2h 10m 49s  
**DB:** market.db 271.68 MB, WAL 6.10 MB  
**Probe scope:** 42 tools probed across all cowork + dev team flow files  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-0807.md`

---

## Delta vs Prior Report (08:07Z)

| Status | Count |
|--------|-------|
| NEW findings | 7 |
| UNCHANGED | 11 |
| RESOLVED | 2 |

---

## Summary

| Class | Count | New this run |
|-------|-------|-------------|
| BUG   | 9     | +5 new      |
| ISSUE | 9     | +2 new      |
| IMPROVE | 5  | +2 new      |

---

## Findings Table

### BUGs (broken / errors)

| # | Tool / Cron | Class | Evidence | Suggested Fix | Delta |
|---|-------------|-------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron | **BUG** | `last_status: crashed`, `success_rate: 0.0%`, `avg_duration: 4035s (~67 min)`, last_run: 2026-06-08. Explains repeated `vnstock:balance_sheet:VHM RATE_LIMITED` + `vnstock:finance:GVR` errors in live system_status. | Investigate crash log; likely OOM or vnstock API auth expiry. Reset + redeploy. | **UNCHANGED** from 08:07 |
| B2 | `get_technical_indicators` routing | **BUG** | Called with `code="FPT"`, returns `source_tier=3`, ALL N/A: `MA5/MA20/MA50=N/A`, `RSI=N/A (needs ≥15 candles)`, `MACD=N/A`, `BB20=N/A`. Meanwhile `get_pipeline_health` shows FPT `rows=38, TA ready, RSI14=51.2`. Tool does NOT route to pre-computed TA values. | Route `get_technical_indicators` to the TA service pre-computed pipeline path when `rows ≥ 15`. | **UNCHANGED** from 08:07 |
| B3 | `get_bctc_full` schema drift | **BUG** | `bctc-analyst.md` + `unified-agent.md` document `ticker: string`, live tool requires `code: string`. Validation error on `{ticker:"FPT"}`. Any bctc-analyst cycle using documented signature fails. | Update tool package docs: replace `ticker` → `code` for `get_bctc_full`. | **UNCHANGED** from 08:07 |
| B4 | HNX/UPCOM price sources | **BUG** | System errors: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed`. 6 watchlist tickers with N/A prices; 5 tickers with 0 OHLCV rows (BDI, DLC, JSH, SIS, VDC). | Diagnose HNX/UPCOM scraper; add fallback source. | **UNCHANGED** from 08:07 |
| B5 | BCTC VPS pipeline stale | **BUG** | `get_vps_proxy_health`: bctc last push `2026-06-08 00:30:03` (5 days ago). `vn-bctc-fetch` shows "healthy" (TCP ping only). 0 new PDFs in 5 days despite `bctcPdfPullJob` running at 97.7% success rate. | SSH into VPS; check `vn-bctc-fetch` logs. Add functional health check (file count > 0) beyond TCP ping. | **UNCHANGED** from 08:07 |
| B6 | **NEW** `get_patterns` schema drift | **BUG** | Live tool requires `stockCode: string` (required) + `eventKeyword: string` (required). `market-watcher.md` documents `{ code: string }`. Tool signature is completely different — appears to be an event-pattern lookup, not a chart-pattern tool. Any market-watcher agent calling `get_patterns({code: "FPT"})` will fail. | Fix `market-watcher.md` to document correct params `{stockCode, eventKeyword}`. Clarify if chart patterns are available via a different tool. | **NEW** |
| B7 | **NEW** `get_sentiment_trend` schema drift | **BUG** | Live tool requires `stock_code: string` (mandatory). All agent packages (`unified-agent.md`, etc.) document as no-arg tool. Calling without args returns `{"error": "Error: stock_code (or symbol) is required"}` (source_tier 3 error). Breaks unified-agent chef synthesis step that reads aggregate sentiment. | Add `stock_code` param to all tool package docs that list `get_sentiment_trend`. Consider making it optional (returning index-wide sentiment when omitted). | **NEW** |
| B8 | **NEW** `get_kinhdich_reading` schema drift | **BUG** | Live tool requires `code: string`. `bctc-analyst.md` docs `ticker: string`; `alert-commander.md` correctly docs `code: string`. Mixed documentation causes 50% chance of bctc-analyst calling with wrong param name. | Standardize all packages to `code: string`. Grep all flow files for `ticker:` passed to this tool. | **NEW** |
| B9 | **NEW** `get_agent_signals` schema drift (news-scout) | **BUG** | `news-scout.md` documents `get_agent_signals` with no required params ("—"). Live tool requires `agent: string` (mandatory). `alert-commander.md` correctly docs `agent: string` (REQUIRED). News-scout calling with `{}` will always fail validation. | Update `news-scout.md` to show `agent: string` as required param. | **NEW** |

---

### ISSUEs (degraded / empty / slow)

| # | Tool / Source | Class | Evidence | Suggested Fix | Delta |
|---|---------------|-------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no_data | **ISSUE** | Returns `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`. `macroIndicatorRefreshJob` ran successfully 2026-06-12 12:13 but ISM rows still empty. | Verify `FRED_API_KEY` env var in mcp-server container. Check if ISM fetch is gated behind key. | **UNCHANGED** from 08:07 |
| I2 | CafeF RSS + Reuters RSS + Trading Economics | **ISSUE** | All 3 sources show "Ngưng" (Stopped), 13 consecutive failures, "Chưa bao giờ" (never succeeded). Trading Economics appears twice. News diversity reduced — `fetch_and_analyze` returns only vnexpress.net articles. | Check CafeF/Reuters RSS URL validity. TradingEconomics likely blocked (anti-bot). | **UNCHANGED** from 08:07 |
| I3 | `get_sector_rotation` 5d gap | **ISSUE** | All 16 sectors show `N/A / 5d` — only 1-day momentum data. Carrier regime detection and hot-money flags degraded. | Ensure `ohlcvDailyAggregatorJob` has ≥5 trading days populated. Should self-resolve over next trading days. | **UNCHANGED** from 08:07 |
| I4 | BDI staleness in `get_supply_chain_exposure` | **ISSUE** | BDI last updated `2026-04-07` (67 days ago). `commodityTrackerRefreshJob` runs daily (last: 2026-06-13 06:00) but BDI not included. | Add BDI to `commodityTrackerRefreshJob` or create dedicated shipping-index fetcher. | **UNCHANGED** from 08:07 |
| I5 | `bctcReparseJob` 83.5% success rate | **ISSUE** | 188 runs, ~31 failures (16 failures/week). Consistent with BCTC PDF layout variations. | Review recent failing tickers in bctc_queue. Some PDF layouts still triggering low-confidence extraction. | **UNCHANGED** from 08:07 |
| I6 | 53 pending feedback + 45 open high/critical warnings | **ISSUE** | DB audit shows `pending_feedback: 53 new items`, `open_warnings: 45 high/critical items`. Large backlog of unprocessed signals. | system-auditor or ops agent should drain the pending_feedback queue and triage open_warnings. | **UNCHANGED** from 08:07 (count similar) |
| I7 | **NEW** `vn-sbv-fetch` VPS service UNHEALTHY | **ISSUE** | `get_vps_service_health`: `vn-sbv-fetch` = unhealthy, VPS uptime 49m. However SBV data currently flowing fine (last push 09:55 UTC, 20 pushes/24h in `get_vps_proxy_health`). Likely transient false-positive from service restart 49m before probe. | Monitor for next cycle. If still unhealthy after 2h, SSH to check service logs. The health-check may be using a strict timeout that catches brief startup latency. | **NEW** (transient?) |
| I8 | **NEW** `get_macro_snapshot` delta fields null | **ISSUE** | `oilUsdDelta`, `goldUsdDelta`, `usdVndDelta` all `null` in live response. Directional analysis of macro moves unavailable. Affects unified-agent layer-1 macro framing and news-scout macro regime detection step. | Fix delta calculation in `get_macro_snapshot` — should compare current vs previous stored value. Check if the daily macro price snapshots are being stored for prior-day comparison. | **NEW** |
| I9 | `get_energy_grid_signals` reservoir default | **ISSUE** | "Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)." Reservoir fill rate is estimated, not live. | Check `weatherCheckJob` (last: 2026-06-13 05:00, success) to confirm it fetches reservoir data. Data source may be geo-blocked or changed URL. | Carried from 08:07 context |

---

### IMPROVEMENTs

| # | Tool | Class | Evidence | Suggested Fix |
|---|------|-------|----------|---------------|
| M1 | Cascade outcome evaluation gap | **IMPROVE** | `get_cascade_metrics`: 2,000+ rule hits across all 49 rules, but `Eval=0` for ALL. Win-rate tracking completely dormant — no `record_signal_outcome` calls filling cascade outcomes. | Wire `record_signal_outcome` into the cowork cycle's feedback loop. At minimum, `alert-commander` should call this after each alert verdict. |
| M2 | Alert outcome unknown rate | **IMPROVE** | `get_alert_accuracy`: 660/690 (96%) alerts are "unknown" (unverified). Only 30 outcomes evaluated. Accuracy metric of 97% is based on tiny sample; true accuracy unknown. | Add automatic outcome resolution for `price_surge`/`price_drop` alerts: compare alert price vs actual 5-day close to auto-mark hit/miss. `verdictResolutionJob` runs but may not be covering all alert types. |
| M3 | `get_foreign_flow` undocumented required param | **IMPROVE** | Requires `code: string` (mandatory) but no tool package docs mention required params. Will fail silently for agents not passing `code`. | Add `code: string (required)` to all relevant tool package docs. |
| M4 | `run_impact_chain` rate-cut direction | **IMPROVE** | SBV rate reduction probe returned BEARISH for all banking stocks (market-wide cascade). Rate cuts should be BULLISH for bank NIM and real estate. The cascade logic uses a generic market-wide direction, ignoring sector-specific monetary transmission. | Add sector override logic: `monetary_easing → banking: bullish, real_estate: bullish, utilities: neutral`. |
| M5 | `get_sector_rotation` sector membership | **IMPROVE** | Shows sectors like "gold_mining", "construction", "insurance" that are NOT in the watchlist. These sectors produce signals with no matched watchlist stocks. | Filter sector rotation output to only include sectors with ≥1 watchlist ticker, or add a "watchlist coverage" field to each sector row. |

---

## RESOLVED (since 08:07Z)

| # | Finding | Resolution |
|---|---------|------------|
| R1 | Zombie task locks (#9 from 08:07) | `task_list_held` now returns `{"locks":[],"count":0}`. Expired locks purged. |
| R2 | Container restart instability (#14 from 08:07) | Server uptime now 2h 10m 49s. Stable. |

---

## Canonical Tool Probe Results

| Tool | Reachable | Notes |
|------|-----------|-------|
| `get_system_status` | ✅ | 10 unresolved errors, 0 open circuits |
| `get_cycle_bootstrap` | ✅ | 6ms, valid data |
| `get_market_snapshot` | ✅ | tier-2, VN-Index 1791.65 (-0.39%) |
| `get_macro_snapshot` | ⚠️ | tier-2, delta fields null (I8) |
| `get_earnings_calendar` | ✅ | 11 tickers QUÁ HẠN Q1-2026 |
| `get_watchlist` | ✅ | 41 tickers, 6 N/A prices |
| `get_market_context` | ✅ | mirror of market_snapshot area |
| `get_technical_indicators` | ❌ | tier-3, all N/A (B2) |
| `get_sector_rotation` | ⚠️ | N/A/5d gap (I3) |
| `get_ticker_intelligence` | ✅ | tier-2, `code` param required |
| `get_patterns` | ❌ | schema drift — `stockCode`+`eventKeyword` required (B6) |
| `get_price_history` | ✅ | zero-price holiday rows (see 08:07 B10) |
| `get_supply_chain_exposure` | ⚠️ | BDI 67d stale (I4) |
| `get_climate_risk_signals` | ✅ | ok (not probed in depth) |
| `get_energy_grid_signals` | ⚠️ | reservoir data estimated (I9) |
| `get_insider_signals` | ✅ | `code` + `outstandingShares` required |
| `get_open_chain_findings` | ✅ | 0 findings (off-hours, expected) |
| `get_kinhdich_reading` | ❌ | schema drift — `code` required, some docs say `ticker` (B8) |
| `post_agent_signal` | ✅ (schema) | not mutated |
| `get_agent_signals` | ⚠️ | `agent` required; news-scout.md omits this (B9) |
| `log_agent_work` | ✅ (schema) | two-call pattern verified in docs |
| `send_telegram` | ✅ (schema) | TELEGRAM envs SET |
| `task_list_held` | ✅ | 0 locks (resolved) |
| `task_claim/heartbeat/release` | ✅ (schema) | not mutated |
| `fetch_and_analyze` | ✅ | 20 items, vnexpress only |
| `run_impact_chain` | ✅ | 42 entries; rate-cut direction IMPROVE (M4) |
| `search_similar_context` | ✅ (schema) | not probed in depth |
| `get_macro_snapshot` | ⚠️ | delta null (I8) |
| `get_fed_liquidity_spread` | ✅ | tier-1, asOf 2026-06-10 |
| `get_ism_subcomponents` | ❌ | no_data / FRED_API_KEY missing (I1) |
| `get_bctc_full` | ⚠️ | works with `code=`, docs say `ticker=` (B3) |
| `get_cash_flow` | ✅ | works with `ticker=` |
| `get_bctc_ocf` | not probed | — |
| `list_stored_pdfs` | ✅ | 60 PDFs, most recent 2026-06-08 |
| `get_earnings_calendar` | ✅ | ok |
| `get_sentiment_trend` | ❌ | requires `stock_code` (mandatory), docs say no-arg (B7) |
| `get_crisis_early_warning` | ✅ | GAS score=24, PLX score=29 danger |
| `get_legal_risk_signals` | ✅ | 5 signals (May 2026) |
| `get_alert_accuracy` | ✅ | 97% but 96% unknowns (M2) |
| `get_signal_effectiveness` | ✅ | 1 signal/7d |
| `get_cascade_metrics` | ⚠️ | 0 outcomes evaluated (M1) |
| `get_portfolio_risk` | ✅ | ok |
| `get_positions` | ✅ | 1 position (FPT) |
| `get_prediction_markets` | ✅ | 1 market; sector mapping issue |
| `get_investment_clock_phase` | ✅ | phase=Overheat, PMI=null |
| `get_alerts` | ✅ | 20 alerts / 7d |
| `get_cron_health` | ✅ | 1 crashed cron (B1) |
| `get_pipeline_health` | ✅ | 5 tickers TA not ready |
| `get_vps_proxy_health` | ✅ | bctc stale 5d (B5) |
| `get_vps_service_health` | ⚠️ | vn-sbv-fetch unhealthy (I7) |
| `get_rate_limit_status` | ✅ | all sources ready |
| `get_recent_fixes` | ✅ | last fix 2026-05-12 |
| `emit_pressure_state` | ✅ | write confirmed |
| `get_foreign_flow` | ⚠️ | `code` required, not documented (M3) |

---

## Priority Action Items

**P0 — Carry from 08:07, not yet fixed:**
1. `vnstockFundamentalsRefresh` crash (B1) — 5 days down
2. BCTC VPS pipeline stale (B5) — 5 days, 0 new PDFs
3. `get_technical_indicators` routing bug (B2) — market-watcher TA all N/A

**P1 — New schema drifts (will break cowork agents):**
4. `get_patterns` schema drift (B6) — market-watcher broken on chart pattern step
5. `get_sentiment_trend` schema drift (B7) — unified-agent synthesis step broken
6. `get_kinhdich_reading` schema drift (B8) — bctc-analyst I-Ching step broken
7. `get_agent_signals` schema drift in news-scout.md (B9) — news-scout bootstrap broken

**P2 — ISSUEs:**
8. `get_macro_snapshot` delta fields null (I8)
9. `vn-sbv-fetch` UNHEALTHY (I7) — monitor; likely transient

**P3 — Carry ISSUEs from 08:07:**
10. `get_ism_subcomponents` no_data (I1) — FRED_API_KEY
11. HNX/UPCOM price sources (B4)
12. CafeF RSS / Reuters RSS / TradingEconomics stopped (I2)

---

*Report generated: 2026-06-13T10:09Z | Path: docs/agent-memory/health/team-tool-recheck-2026-06-13-1009.md*
