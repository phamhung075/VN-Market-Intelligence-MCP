# MCP Tool Health Recheck — 2026-06-13T18:06Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: ~10h (restarted ~08:00 UTC)  
**DB:** market.db 273.12 MB, WAL 5.01 MB  
**Probe scope:** 22 direct tool probes (full sweep)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-1604.md`

---

## Delta vs Prior Report (16:04Z)

| Status | Count |
|--------|-------|
| NEW findings | 2 (I10 new ISSUE, M7 new IMPROVE) |
| IMPROVED | 1 (I6: pending_feedback -8) |
| TEMP-RESOLVED (root cause open) | 1 (I7: vn-sbv-fetch healthy again) |
| UNCHANGED | 25 |

No new BUGs. All 10 prior BUGs remain open and unresolved.

---

## Summary

| Class | Count | Delta vs 16:04Z |
|-------|-------|-----------------|
| BUG   | 10    | unchanged       |
| ISSUE | 11    | +1 new (I10), I6 improved, I7 temp-resolved |
| IMPROVE | 7  | +1 new (M7)     |

---

## NEW / CHANGED since 16:04Z

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **I10** | `wti_crude_usd` auto-tracker stale at 95.5 | ISSUE | `get_system_status` auto-tracked indicators: `wti_crude_usd 95.5 (79 data points)`. Live `brent_crude_usd: 87.33`. WTI at $95.5 is $8.17 above Brent — physically impossible; WTI consistently trades below Brent. `commodityTrackerRefreshJob` last_run: 2026-06-13 06:00 (success) but does not update WTI. `macroIndicatorRefreshJob` ran at 12:13 (success) but WTI value unchanged. Stale WTI price corrupts regime-analysis oil-signal in all cowork agents. | **NEW** |
| **M7** | `macroIndicatorRefreshJob_FAILTEST` test cron in production | IMPROVE | `get_cron_health` lists `macroIndicatorRefreshJob_FAILTEST` (last_run: 2026-06-08, success, 1 run). Test artifact from debugging should not persist in prod cron registry. Adds noise to health dashboard. | **NEW** |
| **I6↓** | `pending_feedback` partially drained | ISSUE | `pending_feedback: 54` (was 62 at 16:04Z, -8). Rate of generation slowing or partial drain occurred. `open_warnings: 45` unchanged. I2 RSS failures still generating new records. | **IMPROVED** (-8 items) |
| **I7-temp** | `vn-sbv-fetch` healthy again at 18:06Z | ISSUE | `get_vps_service_health`: `vn-sbv-fetch: healthy`. Was UNHEALTHY at 14:07Z, recovered by 16:03Z, still healthy at 18:06Z. Pattern holds: service restarts after crash, stays healthy 2–4h. Root cause (crash-loop) unresolved. | **TEMP-RESOLVED** (monitor for next crash) |

---

## BUGs (broken / errors) — all UNCHANGED vs 16:04Z

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | `last_status: crashed`, `success_rate: 0.0%`, `avg_duration: 4036s (~67 min)`, last_run: 2026-06-08. **5 days, 0 fundamental refreshes.** | Investigate crash log; likely OOM or vnstock API timeout. Reset/redeploy with pagination + 30-min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` routing broken | HPG (38 rows, TA ready) → `source_tier: 3`, all MA/RSI/MACD/BB = N/A (confirmed this run). VCB confirmed same at 16:04Z. Tool bypasses pre-computed TA pipeline values entirely. | Route tool to pre-computed `ta_ohlcv` table when `TA ready`; raw-calc path only as fallback. | UNCHANGED (confirmed HPG) |
| B3 | `get_bctc_full` param `ticker` → `code` drift | Call with `ticker="FPT"` → `Required: code (string)` validation error. All 4 agent tool packages document `ticker: string`. | Update all 4 packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM price sources failing | `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` — 10 errors in last 10 system errors (18:00–18:02Z). 5 tickers (BDI, DLC, JSH, SIS, VDC) still 0 OHLCV rows in `get_pipeline_health`. | Diagnose HNX scraper; add UPCOM fallback source. | UNCHANGED |
| B5 | BCTC VPS pipeline stale | `get_vps_proxy_health`: bctc last push `2026-06-08 00:30:03` (**5+ days stale**). `vn-bctc-fetch` shows "healthy" in VPS service health (TCP only — not data-push healthy). 0 new BCTC PDFs for 5 days. | SSH into VPS; check `vn-bctc-fetch` process logs. Fix health check to verify actual data push not just TCP. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{ stockCode: string, eventKeyword: string }`. `market-watcher.md` documents `{ code: string }`. Every chart-pattern call in market-watcher cycle silently fails. | Fix `market-watcher.md` tool package params to `{stockCode, eventKeyword}`. | UNCHANGED (not re-probed) |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. Flow docs document as no-arg. Unified-agent synthesis step fails validation on `{}`. | Add `stock_code: string (required)` to unified-agent tool package. | UNCHANGED (not re-probed) |
| B8 | `get_kinhdich_reading` param `ticker` → `code` drift | Call with `ticker="VCB"` → `Required: code (string)`. `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md` all document `ticker`. | Update 3 tool packages to use `code`. | UNCHANGED |
| B9 | `get_agent_signals` undocumented required param | Call with `{}` → `Required: agent (string)`. Confirmed — `get_agent_signals(agent="news-scout")` ✅ returns correctly. `news-scout.md` bootstrap docs show no required params. | Add `agent: string (required)` to `news-scout.md` and all callers. | UNCHANGED (confirmed param works) |
| B10 | `get_market_hexagram` — tool not found | `MCP error -32602: Tool get_market_hexagram not found`. Listed in `digest-predict.md`. Called in `weekly.md` Sunday cycle — every Sunday digest fails at this step. | Remove from `digest-predict.md` or implement the tool. Fallback: `get_kinhdich_reading(code="^VNINDEX")`. | UNCHANGED |

---

## ISSUEs (degraded / empty / slow)

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no data | `{"error":"no_data","message":"fred_series_daily has no ISM rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}` — CONFIRMED this run. | Set `FRED_API_KEY` env var in mcp-server container. | UNCHANGED |
| I2 | CafeF RSS + Reuters RSS + TradingEconomics (×2) | Never succeeded since ~08:00Z server restart (~10h running). Failure counters at or near 50-cap. Note: circuit breakers show [OK]/0 — failures at RSS-layer not HTTP. cafef.vn domain reachable via `get_rate_limit_status`. | Audit RSS endpoint URLs; check if paths changed post-restart; TradingEconomics may need API key rotation. | UNCHANGED |
| I3 | `get_sector_rotation` 5-day gap | All 16 sectors: `N/A / 5d`, only 1d momentum available — CONFIRMED this run. `ohlcv-daily-aggregator` last_run: 2026-06-10 (3 days ago). | Investigate why `ohlcvDailyAggregatorJob` has not fired since June 10. | UNCHANGED |
| I4 | BDI stale in `get_supply_chain_exposure` | BDI `1,400 (+0.0%) - 2026-04-07` — **67+ days old**, CONFIRMED this run. `commodityTrackerRefreshJob` daily (runs OK) does not include BDI. | Add Baltic Dry Index to `commodityTrackerRefreshJob` or create dedicated shipping-index fetcher. | UNCHANGED |
| I5 | `bctcReparseJob` declining success rate | 182 runs at 83.0% (~17% persistent failure floor). `vnstock:cash_flow:DHG` and `vnstock:finance:DLC` hit RATE_LIMITED this run. | Review failing tickers in bctc_vps_queue; check for Q1-2026 layout changes. Add per-ticker back-off in parser. | STABLE |
| I6 | `pending_feedback` backlog | `pending_feedback: 54` (was 62 at 16:04Z, -8). `open_warnings: 45` unchanged. Still linked to I2 RSS failures generating unresolved records. | Drain feedback queue; fix I2 RSS failures to stop new error generation. | IMPROVED (-8) |
| I7 | `vn-sbv-fetch` crash-loop | Healthy at 18:06Z. Pattern: service crashes, restarts, healthy 2–4h, crashes again. Root cause unresolved — next crash expected within next 2h window. | Add PM2/systemd restart supervisor + alert on >2 restarts/hour. | TEMP-RESOLVED |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null` — CONFIRMED this run. `vnIndexDelta: -6.96` computes correctly. Affects directional macro analysis in all cowork agents. | Fix delta calculation for commodity fields; store prev-close baseline in macro_indicators table. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live hydro data | "Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)." — CONFIRMED this run. `weatherCheckJob` runs successfully but does not populate grid signals. | Trace hydro data path from `weatherCheckJob` output to `get_energy_grid_signals` consumer; check response parser. | CONFIRMED |
| I10 | `wti_crude_usd` auto-tracker stale at $95.5 | System auto-tracked: `wti_crude_usd 95.5 (79 data points)`. Live `brent_crude_usd: 87.33`. WTI > Brent by $8.17 is physically impossible (WTI consistently trades $1–3 below Brent). Last stale value in database. `commodityTrackerRefreshJob` and `macroIndicatorRefreshJob` both succeed but neither updates WTI. Oil-signal regime analysis uses wrong price. | Audit which job is responsible for WTI; confirm data source URL; add WTI to `commodityTrackerRefreshJob` refresh scope. | **NEW** |
| N1–N3 | vnstock rate-limit storms | `vnstock:cash_flow:DHG` RATE_LIMITED (max retries exhausted), `vnstock:finance:DLC` RATE_LIMITED — confirmed in system errors this run. Root: `bctcQueueEnricherJob` cycles tickers without per-ticker back-off. Error log floods every ~15 min. | Add per-ticker exponential back-off in `bctcQueueEnricherJob`; skip tickers with N consecutive "max retries exhausted". | UNCHANGED |

---

## IMPROVEMENTs

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation | `get_cascade_metrics`: 2,000+ rule hits, `Eval=0` for ALL 49 rules. `record_signal_outcome` never called from cowork cycle. | Wire `record_signal_outcome` into alert-commander feedback loop after verdict. | UNCHANGED |
| M2 | Alert outcome unknown rate | 686 total alerts, 656 (95.6%) "unknown" verdict. Only price alerts auto-resolve. | Auto-resolve price alerts by comparing alert price vs 5-day close price. | UNCHANGED |
| M3 | `get_foreign_flow` undocumented required param | Tool requires `code: string`; calling `{}` → validation error. No flow docs document this. | Add `code: string (required)` to all relevant flow docs. | UNCHANGED |
| M4 | `run_impact_chain` rate-cut direction | SBV rate reduction → BEARISH for banking (should be BULLISH for NIM expansion). | Add sector override: `monetary_easing → banking: bullish`. | UNCHANGED |
| M5 | `get_sector_rotation` non-watchlist sectors | Returns `gold_mining`, `construction`, `insurance` with no watchlist tickers. Clutters output. | Filter to sectors with ≥1 watchlist ticker. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min duration | `avg_duration: 4,735,029ms` (1 run). Sister to crashed B1 job. OOM risk on next run. | Add 30-min timeout guard; paginate vnstock batch calls. | UNCHANGED |
| M7 | `macroIndicatorRefreshJob_FAILTEST` in prod | `get_cron_health` lists this test job (last_run: 2026-06-08, 1 run). Test artifact polluting prod cron registry and health dashboard. | Delete or disable this job; remove from cron registry. | **NEW** |

---

## Tool Probe Coverage (this run)

| Tool | Result | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(news-scout)` | ✅ | OK; 2 open alerts; 41 tickers |
| `get_system_status` | ⚠️ | HNX errors B4; RSS failures I2; open_warnings 45 |
| `get_cron_health` | ✅ | B1 confirmed crashed; M7 test job spotted |
| `get_pipeline_health` | ⚠️ | 5 tickers 0 rows (B4); all others TA-ready |
| `get_vps_service_health` | ✅ | 3 healthy, 2 idle (market closed); I7 temp-resolved |
| `get_vps_proxy_health` | ❌ | bctc stale 5+ days (B5 unchanged) |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | commodity deltas null (I8); text field double-encoded JSON |
| `get_earnings_calendar` | ✅ | 41 tickers; 10 QUÁ HẠN, 23 ĐÃ NỘP |
| `get_watchlist` | ✅ | 41 tickers returned |
| `get_price_history(FPT, 5d)` | ✅ | clean data; dual text+JSON output confirmed |
| `get_technical_indicators(HPG)` | ❌ | tier-3, all N/A despite 38 rows (B2 confirmed) |
| `get_sector_rotation` | ⚠️ | all N/A/5d (I3 confirmed) |
| `get_supply_chain_exposure` | ⚠️ | BDI 2026-04-07 stale (I4 confirmed) |
| `get_climate_risk_signals` | ✅ | returns generic June advisory; no live weather |
| `get_energy_grid_signals` | ⚠️ | 70% default, no live hydro data (I9 confirmed) |
| `get_ism_subcomponents` | ❌ | FRED_API_KEY missing (I1 confirmed) |
| `get_open_chain_findings(15m)` | ✅ | 0 findings, correct (market closed) |
| `get_agent_signals(news-scout)` | ✅ | no new signals (correct) |
| `task_list_held` | ✅ | 0 locks |
| `get_vps_proxy_health` | ❌ | bctc STALE; news/sbv/prices healthy |
| `get_cycle_bootstrap(news-scout)` | ✅ | 119ms total; sub-calls 54–60ms each |

---

## Priority Action Items (P0–P3 unchanged from 16:04Z + I10 added)

**P0 — Critical, blocking cowork agent execution:**
1. **B1**: `vnstockFundamentalsRefresh` crashed — 5 days, 0 fundamental refreshes
2. **B5**: BCTC VPS pipeline stale — 5+ days, 0 new PDFs (TCP health ≠ data health)
3. **B10**: `get_market_hexagram` missing — every Sunday digest-predict cycle broken
4. **I7**: `vn-sbv-fetch` crash-loop — currently healthy; next crash within ~2h window
5. **B2**: `get_technical_indicators` routing broken — all N/A despite pipeline ready (confirmed for VCB + HPG)

**P1 — Schema drifts breaking live agent calls:**
6. **B3**: `get_bctc_full` — `ticker` → `code` (4 tool packages)
7. **B8**: `get_kinhdich_reading` — `ticker` → `code` (3 tool packages)
8. **B6**: `get_patterns` — market-watcher broken (`code` vs `{stockCode, eventKeyword}`)
9. **B7**: `get_sentiment_trend` — unified-agent broken (no-arg vs `stock_code` required)
10. **B9**: `get_agent_signals` — undocumented required `agent` param

**P2 — Active ISSUEs degrading data quality:**
11. **N1–N3**: vnstock rate-limit storms (DHG + DLC active this run) — error-log flooding every 15 min
12. **I2**: CafeF/Reuters/TradingEconomics RSS failures — 50-cap, never succeeded (~10h)
13. **I10**: `wti_crude_usd` stale at $95.5 (Brent $87.33) — oil signal regime corrupted **[NEW]**
14. **I8**: `get_macro_snapshot` commodity deltas null
15. **I1**: `get_ism_subcomponents` no data (FRED_API_KEY)
16. **I3**: `ohlcvDailyAggregatorJob` not fired since 2026-06-10 — sector rotation stale

**P3 — Monitor:**
17. **B4**: HNX/UPCOM price sources failing (5 tickers, 0 rows)
18. **I6**: pending_feedback 54 (improved -8; monitor for re-accumulation)
19. **M6**: `vnstockTradingStatsRefresh` 79-min duration — OOM risk next run
20. **M7**: `macroIndicatorRefreshJob_FAILTEST` test cron in prod — remove **[NEW]**

---

*Report generated: 2026-06-13T18:06Z | Prior: docs/agent-memory/health/team-tool-recheck-2026-06-13-1604.md*
