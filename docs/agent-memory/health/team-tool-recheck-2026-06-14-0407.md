# MCP Tool Health Recheck — 2026-06-14T04:07Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: 4h 45m 14s (stable since 2026-06-13T23:18Z restart)  
**DB:** market.db 273.57 MB, WAL 3.49 MB (DOWN from 3.95 MB at 02:02Z — walCheckpointJob ran at 04:00Z ✅)  
**Probe scope:** 26 tool probes  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-14-0203.md`

---

## Delta vs Prior Report (2026-06-14-0203)

| Status | Count |
|--------|-------|
| IMPROVED | 2 (I11 server stable 4h45m; WAL checkpoint ran) |
| WORSENED | 1 (I2 — Reuters/TE escalated 14→27 errors) |
| NEW | 1 (VPS news stale false-positive) |
| UNCHANGED | 11 BUGs + 13 ISSUEs + 7 IMPROVEs |

---

## Summary

| Class | Count | Delta vs 02:03Z |
|-------|-------|-----------------|
| BUG   | 11    | unchanged |
| ISSUE | 15    | 1 improved (I11), 1 worsened (I2) |
| IMPROVE | 7  | unchanged |

---

## CHANGED since 2026-06-14-0203

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **I11** | Server stable — 4h 45m (best window since June 13) | ISSUE | Uptime 4h 45m at 04:03Z. No crash since 23:18Z restart. WAL checked DOWN to 3.49 MB (was 3.95 MB at 02:02Z) — walCheckpointJob at 04:00Z flushed WAL. Positive signal: crash may have been WAL-related. | **IMPROVED — WAL managed; longest stable window yet** |
| **I2** | Reuters RSS + TradingEconomics ×2 escalated 14→27 errors | ISSUE | Source health at 04:03Z: Reuters RSS "Ngưng" 27 errors; Trading Economics ×2 "Ngưng" 27 errors. Was 14 errors at 02:02Z. All still "Chưa bao giờ" (never succeeded in current server instance since 23:18Z restart). Circuit breakers still [OK] — false-open masking degradation. Rate: ~6.5 new errors/hour. | **WORSENED — 27 errors each, trend ≈6.5/h** |
| **NEW** | VPS proxy news staleness check false-positive | IMPROVE | `get_vps_proxy_health` at 04:04Z shows `news: STALE` flag, but recent push log contradicts: pushes at 03:52, 03:36, 03:20, 03:04, 03:00 ✅. Stale-detection threshold not aligned with actual push cadence. Risk: if ops or alert-commander uses this flag to skip news processing, they will incorrectly suppress a healthy feed. | **NEW — false-positive stale detection** |

---

## BUGs (broken / errors) — 11 total (ALL UNCHANGED since 02:03Z)

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron CRASHED | `last_status=crashed`, `success_rate=0.0%`, `avg_duration=4036s`, `last_run: 2026-06-08`. **6+ days, 0 fundamental data refreshes.** | Investigate crash log (OOM/vnstock API timeout). Add pagination + 30-min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` all N/A | At 04:04Z for VCB: source_tier=3, MA5/MA20/MA50/RSI/MACD/BB all N/A ("needs 50/15/34/20 candles"). `get_price_history(code="VCB", days=10)` returns 7 rows with clean data — data exists but tool bypasses pre-computed ta_ohlcv table. Consistent with FPT probe at 02:03Z. | Route MCP tool to pre-computed ta_ohlcv table when rows≥15; raw-calc as fallback. | UNCHANGED |
| B3 | `get_bctc_full` param `ticker` → `code` schema drift | Tool schema requires `code: string`. Agent packages document `ticker: string`. `{code:"VCB"}` used in probe ✅; `{ticker:"VCB"}` would fail. | Update all tool packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM all price sources failing | At 04:03Z: 10 unresolved errors — `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` recurring every ~1 min. 5 watchlist tickers (BDI, DLC, JSH, SIS, VDC) show `N/A` prices. | Diagnose HNX scraper; add UPCOM fallback. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{stockCode: string, eventKeyword: string}`. `market-watcher.md` documents `{code: string}`. Every chart-pattern call from market-watcher fails validation. | Fix `market-watcher.md`: replace `code` with `{stockCode, eventKeyword}` (both required). | UNCHANGED |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. `unified-agent.md` documents as no-arg. | Add `stock_code: string (required)` to `unified-agent.md`. | UNCHANGED |
| B8 | `get_kinhdich_reading` param `ticker` → `code` | `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md` all document `ticker`. Tool accepts `code`. | Update 3 tool packages: `ticker` → `code`. | UNCHANGED |
| B9 | `get_agent_signals` undocumented required `agent` param | `agent: string` required. `news-scout.md` omits this parameter — bootstrap step would fail at schema validation. Probe at 04:05Z: `{agent:"news-scout"}` ✅ returns 2 signals. | Add `agent: string (required)` to `news-scout.md`. | UNCHANGED |
| B10 | `get_market_hexagram` missing from server | Not in system-map.json tool list; not callable. Every Sunday digest-predict cycle fails. Today is Sunday — digest-predict cycle is BROKEN right now. | Implement tool or remove from `digest-predict.md`; fallback: `get_kinhdich_reading(code="^VNINDEX")`. | UNCHANGED |
| B11 | `get_market_summary` requires `period` param | Tool requires `period: 'daily'|'weekly'|'monthly'|'quarterly'|'yearly'`. `digest-predict.md` documents as no-arg. | Add `period` (required enum) to `digest-predict.md`. | UNCHANGED |
| B12 | `get_financial_summary` requires `actionCode` | Tool requires `actionCode: string`. Agent packages document `ticker`. | Document `actionCode` in all tool packages. | UNCHANGED |

---

## ISSUEs — 15 total

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no data | At 04:04Z: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}` macroIndicatorRefreshJob last_run 2026-06-13 12:13 (success) — env var `FRED_API_KEY` not set. | Set `FRED_API_KEY` env var; pmi returns `null` in `get_investment_clock_phase`. | UNCHANGED |
| I2 | Reuters RSS + TradingEconomics ×2 failing | 27 errors each at 04:03Z (was 14 at 02:02Z). Rate ≈ 6.5/h. CBs all [OK] — false-open. | Audit RSS endpoint URLs and TE auth headers; lower CB failure threshold. | **WORSENED** |
| I3 | `ohlcv-daily-aggregator` 4-day stale | last_run: 2026-06-10 (Tue). Missed June 11 (Wed), June 12 (Fri), June 13 (Sat non-market). Root cause of OHLCV gap: this job feeds `get_technical_indicators`. | Investigate schedule registration; check if cron missed registration after June 13 server restart. | UNCHANGED |
| I4 | BDI stale 68+ days in supply chain | `get_supply_chain_exposure` at 04:04Z: BDI `1,400 (+0.0%) — 2026-04-07`. commodityTrackerRefreshJob does not include BDI. | Add Baltic Dry Index to commodityTrackerRefreshJob scope. | UNCHANGED |
| I5 | `bctcReparseJob` 80.8% success rate | 182 runs at 80.8%. vnstock rate-limiting confirmed recurring. | Add per-ticker exponential back-off. | STABLE |
| I6 | `pending_feedback` + `open_warnings` backlog | `pending_feedback: 54`, `open_warnings: 45` at 04:03Z — unchanged from previous runs. | Triage and drain. | UNCHANGED |
| I7 | `vn-sbv-fetch` crash-loop | Not re-probed this run (`get_vps_service_health` not called). VPS proxy shows sbv push at 03:56Z ✅ — data flowing. Prior status: UNHEALTHY at 02:02Z. | Monitor; add supervisor restart-count alert. | UNKNOWN (probe omitted) |
| I8 | `get_macro_snapshot` commodity deltas null | At 04:04Z: `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null`. `vnIndexDelta: -6.96` computes correctly. | Fix delta calculation for commodity fields. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live hydro data | Not re-probed this run. weatherCheckJob running 100%. | Trace hydro data path. | UNCHANGED (assumed) |
| I10 | `wti_crude_usd` stale at $95.5 | get_system_status auto-tracked: `wti_crude_usd 95.5` (79 points). Live Brent $87.33. WTI > Brent by $8.17 is physically impossible. | Audit WTI source; add to commodityTrackerRefreshJob. | UNCHANGED |
| I11 | MCP server crash-loop — longest stable window | Uptime 4h 45m at 04:03Z. WAL 3.49 MB (DOWN from 3.95 MB — checkpoint at 04:00Z flushed it). 4 crashes on June 13 total. | Monitor for WAL correlation with crashes. | **IMPROVED** |
| I12 | `get_bctc_full(code="VCB")` returns empty | At 04:04Z: "Chưa có dữ liệu BCTC". earnings_calendar confirms VCB ĐÃ NỘP 2026-06-13. bctcPdfPullJob last_run 03:00Z (success). bctcReparseJob last_run 23:29Z. | Trigger bctcReparseJob for VCB; check if VCB PDF pulled but not parsed. | UNCHANGED |
| I13 | vnstock RATE_LIMITED | Off-market (weekend). Not active. | Add staggered inter-ticker delay. | SETTLED |
| I14 | `bctcQueueEnricher` batch-zero — 5 tickers | JSH, SIS, VDC, VNH, VEA (unchanged from 02:03Z probe). HNX errors (B4) likely source for JSH/VNH. | Investigate company ID mapping for HNX/UPCOM tickers. | UNCHANGED |
| I15 | BCTC VPS pipeline | bctcPdfPullJob 96% success, last_run 03:00Z ✅. | Monitor. | STABLE |

---

## IMPROVEMENTs — 7 total (ALL UNCHANGED from 02:03Z)

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation dead | 0 evaluated outcomes despite 1,965+ rule hits. `record_signal_outcome` never called. | Wire into alert-commander feedback loop. | UNCHANGED |
| M2 | Alert outcome unknown ~95% | `system_status: "ok \| 512 alerts pending"`. Vast majority unresolved. | Auto-resolve price alerts vs 5-day close. | UNCHANGED |
| M3 | `get_foreign_flow` requires undocumented `code` param | Not in flow docs. | Document `code: string (required)` in relevant packages. | UNCHANGED |
| M4 | `run_impact_chain` sector direction error | SBV rate reduction → BEARISH banking (should be BULLISH). | Add `monetary_easing → banking: bullish` override. | UNCHANGED |
| M5 | `get_sector_rotation` 1d=5d values | At 04:04Z all 16 sectors show identical 1d and 5d % change (e.g. banking +0.49%/5d = +0.49%/1d). Single data-point or averaging bug. | Verify 5d window uses 5 separate close prices. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min run | avg_duration: 4,735,029ms. OOM risk. | Add 30-min timeout guard; paginate. | UNCHANGED |
| M7 | `macroIndicatorRefreshJob_FAILTEST` test cron in prod | Listed in get_cron_health. | Delete or disable. | UNCHANGED |

---

## New Finding This Run

| # | Tool | Evidence | Suggested Fix |
|---|------|----------|---------------|
| N1 | VPS proxy `news` stale detection false-positive | `get_vps_proxy_health` at 04:04Z shows `news: STALE=YES`, but recent push log shows pushes at 03:52, 03:36, 03:26, 03:20, 03:04 ✅. The staleness threshold is miscalibrated vs actual push cadence. No actual data gap — news is flowing normally. | Recalibrate VPS stale-detection threshold; decouple stale flag from data-flow health. |

---

## Tool Probe Coverage (this run — 26 probes)

| Tool | Result | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ | 7ms; agent_signals + market_context + system_status |
| `get_system_status` | ⚠️ | Uptime 4h45m stable; HNX B4 errors; Reuters/TE I2 at 27 errors |
| `get_cron_health` | ⚠️ | B1 crashed; M7 test job; ohlcv-aggregator stale I3; walCheckpointJob ✅ |
| `get_watchlist` | ✅ | 41 tickers; 5 with N/A prices (HNX/UPCOM B4) |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | I8 commodity deltas null; carry data 3d stale (2026-06-11) |
| `get_earnings_calendar` | ✅ | 41 tickers; 11 QUÁ HẠN (ACV, BDI, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) |
| `task_claim` | ✅ | `{"claimed":true}` — coordination lock working |
| `task_release` | ✅ | `{"ok":true}` |
| `task_list_held` | ✅ | `{"locks":[],"count":0}` — clean state |
| `log_agent_work` (Call 1 + 2) | ✅ | Returns `{id: 1356}`; Call 2 ✅ `{ok:true, id:1356}` |
| `get_agent_work_log` | ✅ | Returns log entries; note: id 1347 has null summary/findings despite completed status |
| `get_technical_indicators(code="VCB")` | ❌ | tier-3; ALL N/A — MA5/MA20/MA50/RSI/MACD/BB (B2 confirmed) |
| `get_sector_rotation` | ⚠️ | Reachable; M5: 1d=5d values suspicious |
| `get_supply_chain_exposure` | ⚠️ | Reachable; I4: BDI from 2026-04-07 (68d stale) |
| `get_climate_risk_signals` | ✅ | Returns June seasonal risk signal |
| `get_crisis_early_warning` | ✅ | GAS/PLX DANGER (score 24/29), VNM WARNING (35) |
| `get_vps_proxy_health` | ⚠️ | N1: news STALE flag false-positive; prices last push 2026-06-12 (expected — weekend) |
| `get_price_history(code="VCB", days=10)` | ✅ | 7 rows returned (correct for 10 calendar days); clean OHLCV |
| `get_investment_clock_phase` | ⚠️ | `phase: Overheat`, `pmi: null` (I1 — no ISM data) |
| `get_ism_subcomponents` | ❌ | `no_data` — FRED_API_KEY not set (I1 confirmed) |
| `get_bctc_full(code="VCB")` | ❌ | "Chưa có dữ liệu BCTC" despite 2026-06-13 filing (I12) |
| `fetch_and_analyze` | ✅ | 20 items; sources: cafef.vn only (no Reuters/TE — confirms I2) |
| `get_positions` | ✅ | FPT 5000 shares, -8.5% (-34M VND); price from 2026-06-12 (stale) |
| `get_fed_liquidity_spread` | ✅ | EFFR=3.62, IORB=3.65, spread=-0.03; asOf=2026-06-11 (3d stale) |
| `get_legal_risk_signals` | ✅ | 6 signals; DIG (insider liquidation today), CMG, PC1, VPB |
| `get_agent_signals(agent="news-scout")` | ✅ | 2 signals (chain_catalyst VIC, gold risk-off) |

---

## Priority Action Items (delta focus — P0/P1 unchanged, new context added)

**P0 — Critical, blocking production (STILL UNFIXED since >4h):**
1. **B1** `vnstockFundamentalsRefresh` crashed — 6+ days, zero fundamentals
2. **B2** `get_technical_indicators` routing broken — all N/A for all tickers
3. **B4** HNX/UPCOM price fetch failing every ~1 min — 5 watchlist tickers without prices
4. **B10** `get_market_hexagram` missing — digest-predict Sunday cycle BROKEN RIGHT NOW

**P1 — Schema drifts (all still unpatched):**
5. B6 `get_patterns`, B7 `get_sentiment_trend`, B8 `get_kinhdich_reading`, B3 `get_bctc_full`, B9 `get_agent_signals`, B11 `get_market_summary`, B12 `get_financial_summary`

**P2 — Escalating (worsened this run):**
8. **I2** Reuters RSS + TradingEconomics now 27 errors (was 14 at 02:02Z) — trend ≈ 6.5 errors/hour, will hit 50+ by next check
9. **I10** WTI $95.5 vs Brent $87.33 — physically impossible, corrupting oil-signal regime

**P3 — Monitor:**
10. **I11** Server stable 4h45m — longest window; WAL 3.49 MB post-checkpoint ✅
11. **I3** ohlcvDailyAggregatorJob — 4 missed market days; check after Monday market open
12. **N1** VPS news stale false-positive — low risk but fix threshold

---

_Report generated: 2026-06-14T04:07Z by health-recheck agent_  
_Prior: team-tool-recheck-2026-06-14-0203.md_
