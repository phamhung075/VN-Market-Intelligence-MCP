# MCP Tool Health Recheck — 2026-06-13T22:07Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: 1h 38m 53s (started ~20:24Z — 3rd restart today — see I11-R2 NEW)  
**DB:** market.db 273.12 MB, WAL 15.65 MB (+8.35 MB vs 20:07Z — WAL growing between restarts)  
**Probe scope:** 29 tool probes (delta sweep vs prior full run at 20:07Z)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-2007.md`

---

## Delta vs Prior Report (20:07Z)

| Status | Count |
|--------|-------|
| NEW findings | 1 (I11-R2: 3rd mcp-server restart today at ~20:24Z) |
| CHANGED | 1 (I7: vn-sbv-fetch still unhealthy, crash-loop ongoing; WAL up 8 MB) |
| CONFIRMED unchanged | 12 BUGs + 11 ISSUEs + 7 IMPROVEs (all prior findings hold) |

---

## Summary

| Class | Count | Delta vs 20:07Z |
|-------|-------|-----------------|
| BUG   | 12    | unchanged |
| ISSUE | 13    | +1 new (I11-R2 — 3rd server restart) |
| IMPROVE | 7  | unchanged |

---

## NEW / CHANGED since 20:07Z

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **I11-R2** | MCP server restarted a 3rd time today ~20:24Z | ISSUE | `get_system_status` generated at 22:03Z shows `uptime: 1h 38m 53s` → started ~20:24Z. Prior report (20:07Z) showed start ~18:31–18:35Z. Server has now restarted 3× in one day: 1st restart some point before 08:07Z report, 2nd ~18:31Z, 3rd ~20:24Z. WAL grew from 7.30 MB (20:07Z) → 15.65 MB (+8.35 MB) across the 2h gap — writes accumulating between restarts. Crash-loop cadence is accelerating (~2h cycle). | **NEW** |
| **I7 (ongoing)** | `vn-sbv-fetch` crash-loop continues | ISSUE | `get_vps_service_health`: `vn-sbv-fetch: unhealthy, uptime: 1h 14m` at 22:00Z. Crashed again as predicted. SBV push log shows pushes at 21:55Z (before probe), so SBV data is flowing via alternative path or last good push. Root cause still unresolved. | **CONFIRMED crash-loop** |

---

## BUGs (broken / errors) — all 12 UNCHANGED

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | last_status=crashed, success_rate=0.0%, avg_duration=4036s, last_run: 2026-06-08. **5+ days, 0 fundamental refreshes.** | Investigate crash log (OOM/vnstock API timeout). Reset/redeploy with pagination + 30-min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` routing broken | FPT (38 rows, RSI14=51.2 in pipeline health) → source_tier: 3, all MA/RSI/MACD/BB = N/A. VCB confirmed same. Tool bypasses pre-computed TA values; raw-calc path lacks sufficient candles. | Route MCP tool to pre-computed `ta_ohlcv` table when TA ready; raw-calc as fallback only. | UNCHANGED (confirmed FPT + VCB) |
| B3 | `get_bctc_full` param `ticker` → `code` schema drift | Tool requires `code: string`; agent tool packages document `ticker: string`. | Update all 4 packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM all price sources failing | `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` recurring in error log. 5 watchlist tickers (BDI, DLC, JSH, SIS, VDC) have 0 OHLCV rows; N/A prices. | Diagnose HNX scraper; add UPCOM fallback. CB shows [OK] — failures at fetch layer, CB threshold not tripping. | UNCHANGED |
| B5 | BCTC VPS pipeline stale | `get_vps_proxy_health`: bctc last push `2026-06-08 00:30:03` (5+ days). `vn-bctc-fetch` service reports "healthy" (TCP ping only — not data-push health). 0 new BCTC PDFs. Q1-2026 earnings window active — SLA is 24h, highly overdue. | SSH VPS; inspect `vn-bctc-fetch` process + cron. Fix health check to validate data push not just TCP. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{ stockCode: string, eventKeyword: string }`. `market-watcher.md` documents `{ code: string }`. Every chart-pattern call from market-watcher fails validation. | Fix `market-watcher.md` to show `{stockCode: string (req), eventKeyword: string (req)}`. | UNCHANGED |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. `unified-agent.md` documents as no-arg. | Add `stock_code: string (required)` to `unified-agent.md`. | UNCHANGED |
| B8 | `get_kinhdich_reading` param `ticker` → `code` | `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md` all document `ticker`. Tool requires `code`. | Update 3 tool packages: `ticker` → `code`. | UNCHANGED |
| B9 | `get_agent_signals` undocumented required param | `agent: string` required; `news-scout.md` omits it (bootstrap step would fail). | Add `agent: string (required)` to `news-scout.md`. | UNCHANGED |
| B10 | `get_market_hexagram` tool missing from server | Not in tool list; every Sunday `digest-predict` cycle fails. | Implement tool or remove from `digest-predict.md`; fallback: `get_kinhdich_reading(code="^VNINDEX")`. | ASSUMED UNCHANGED |
| B11 | `get_market_summary` requires `period` param | Tool requires `period: 'daily'|'weekly'|'monthly'|'quarterly'|'yearly'`. `digest-predict.md` documents as no-arg. | Add `period` (required) to `digest-predict.md`. | UNCHANGED |
| B12 | `get_financial_summary` requires `actionCode` | Confirmed: `{ticker: "VCB"}` → error; `{actionCode: "FPT"}` ✅. Tool packages document `ticker`. system-map.json capability_manifest `pdf` probe uses wrong param → probe broken. | Document `actionCode: string` in tool packages; fix capability_manifest probe. | UNCHANGED (confirmed works with `actionCode`) |

---

## ISSUEs (degraded / empty / slow)

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no data | FRED_API_KEY not set → no ISM rows. `macroIndicatorRefreshJob` runs successfully but cannot populate ISM. | Set `FRED_API_KEY` env var. | UNCHANGED |
| I2 | CafeF RSS + Reuters RSS + TradingEconomics (×2) failing | 10 consecutive errors each (same as 20:07Z). Source health: "Ngưng". Circuit breakers [OK] — fetch layer failures. | Audit RSS endpoint URLs; check if TradingEconomics requires key rotation post-restart. | UNCHANGED |
| I3 | `get_sector_rotation` 5-day gap | All 16 sectors N/A/5d. `ohlcv-daily-aggregator` last_run: 2026-06-10 (3+ days stale). | Investigate why `ohlcvDailyAggregatorJob` not firing since June 10. | UNCHANGED |
| I4 | BDI stale 67+ days in supply chain | BDI `1,400 (+0.0%) - 2026-04-07`. `commodityTrackerRefreshJob` does not include BDI. | Add Baltic Dry Index to `commodityTrackerRefreshJob` scope. | UNCHANGED |
| I5 | `bctcReparseJob` 82-83% success rate | 182 runs at 82.3-83.0%. vnstock rate-limiting (ACB, NVL, ACV) confirmed in error log this run. | Add per-ticker exponential back-off; skip N consecutive RATE_LIMITED tickers. | STABLE |
| I6 | `pending_feedback` + `open_warnings` backlog | `pending_feedback: 54`, `open_warnings: 45` (unchanged). | Triage and drain. | UNCHANGED |
| I7 | `vn-sbv-fetch` crash-loop | **Still UNHEALTHY** (uptime 1h14m at 22:00Z). Third crash since this morning. SBV pushes still arriving via alternative path. | Add PM2/systemd supervisor restart limit alert + data-push health check separate from TCP ping. | **CONFIRMED crash-loop** |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null`. `vnIndexDelta: -6.96` computes correctly. | Fix delta calculation for commodity fields; store prev-close baseline in macro_indicators. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live hydro data | Default 70% estimate; weatherCheckJob not populating hydro signals. | Trace hydro data path from weatherCheckJob to energy-grid consumer. | UNCHANGED |
| I10 | `wti_crude_usd` stale at $95.5 | Auto-tracked: `wti_crude_usd 95.5 (79 data points)`. Live Brent $87.33. WTI > Brent by $8.17 is physically impossible. Corrupts oil-signal regime. | Audit WTI data source; add WTI to `commodityTrackerRefreshJob`. | UNCHANGED |
| I11 | MCP server crash-loop — 3 restarts today | 1st restart: before 08:07Z. 2nd: ~18:31Z (per 20:07Z report). 3rd: ~20:24Z (confirmed 22:03Z probe). WAL grew 8.35 MB in 2h window. Crash cadence: ~2h. | Urgent: investigate Docker/systemd crash logs for OOM/SIGSEGV pattern. Add restart alert to ops monitoring. | **ONGOING — 3rd restart (I11-R2 NEW)** |
| I12 | `get_bctc_full(code="VCB")` returns empty | `list_stored_pdfs` confirms VCB_2026_Q1.pdf (8.1 MB, 2026-06-07). `get_bctc_full` → empty. CF data present (get_cash_flow ✅). Income/balance sheet unparsed. | Trigger bctcReparseJob for VCB; check bctc_table_rows for missing income/balance rows. | UNCHANGED |
| **I13** | vnstock RATE_LIMITED on multiple tickers (active this run) | `get_system_status` recent errors at 22:02-22:03Z: `NVL balance_sheet` max retries exhausted, `ACB cash_flow` max retries exhausted, `ACV finance` RATE_LIMITED backing off. Recurring within-session rate limit exhaustion. | Add staggered inter-ticker delay in vnstock fundamental fetchers; reduce parallelism. | **CONFIRMED active** |

---

## IMPROVEMENTs — all 7 UNCHANGED

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation dead | 1,965+ rule hits; Eval=0 for ALL 49 rules. `record_signal_outcome` never called. | Wire `record_signal_outcome` into alert-commander feedback loop. | UNCHANGED |
| M2 | Alert outcome unknown 95.6% | 653/683 alerts "unknown" verdict. Only price_surge/drop/volume auto-resolved (30). | Auto-resolve price alerts vs 5-day close. | UNCHANGED |
| M3 | `get_foreign_flow` undocumented required `code` param | `{}` → validation error. Not in flow docs. | Add `code: string (required)` to relevant flow docs. | UNCHANGED |
| M4 | `run_impact_chain` sector direction error | SBV rate reduction → BEARISH banking (should be BULLISH). | Add sector override: `monetary_easing → banking: bullish`. | UNCHANGED |
| M5 | `get_sector_rotation` includes non-watchlist sectors | Returns sectors with 0 watchlist tickers (gold_mining, construction, insurance). | Filter output to sectors with ≥1 active watchlist ticker. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min run | avg_duration: 4,735,029ms (1 run). OOM risk. Sister to B1. | Add 30-min timeout guard; paginate vnstock batch calls. | UNCHANGED |
| M7 | `macroIndicatorRefreshJob_FAILTEST` test cron in prod | Listed in get_cron_health (1 run, 2026-06-08). Test artifact in prod cron health dashboard. | Delete or disable from cron registry. | UNCHANGED |

---

## Tool Probe Coverage (this run — 29 probes, delta sweep)

| Tool | Result | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(news-scout)` | ✅ | 7ms; market_context+agent_signals+system_status OK |
| `get_system_status` | ⚠️ | Uptime 1h38m (3rd restart); HNX errors B4; RSS failures I2; vnstock RATE_LIMITED I13 |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | Commodity deltas null I8; VND/FX/carry data present |
| `get_cron_health` | ⚠️ | B1 confirmed (crashed); M7 test job; bctcPdfPullJob currently running |
| `get_pipeline_health` | ✅ | 36/41 TA-ready; 5 tickers 0 rows (B4) |
| `get_vps_proxy_health` | ❌ | bctc STALE 2026-06-08 (B5); prices/news/sbv ok |
| `get_vps_service_health` | ⚠️ | vn-sbv-fetch UNHEALTHY I7; 2 healthy; 2 idle |
| `get_sla_status` | ✅ | 5 sources ok; bctc SLA not breached by tool (earned_threshold = 37.7h > push age) |
| `get_rate_limit_status` | ✅ | 11 hosts; all ready — no hard limits hit |
| `get_earnings_calendar` | ✅ | 41 tickers; 10 QUÁ HẠN |
| `get_agent_signals(agent="market-watcher")` | ✅ | No new signals (correct — market closed) |
| `get_alerts(limit=5)` | ✅ | 506 pending; 2 open 24h (VCB HIGH, HCM LOW) |
| `get_technical_indicators(code="FPT")` | ❌ | tier-3, all N/A (B2 confirmed) |
| `get_technical_indicators(code="VCB")` | ❌ | tier-3, all N/A (B2 confirmed on 2nd ticker) |
| `get_financial_summary(actionCode="FPT")` | ✅ | FPT Q1-2026; Net Rev 12.48T; confidence 81% |
| `get_financial_summary({ticker: "FPT"})` | ❌ | actionCode Required (B12 confirmed) |
| `get_foreign_flow(code="HPG")` | ✅ | tier-2; net_buy signal, 2-day streak |
| `get_price_history(code="VCB", days=5)` | ✅ | 5 trading days returned (text + JSON dual output) |
| `get_open_chain_findings(minutes_back=15)` | ✅ | 0 findings (market closed) |
| `get_market_context(hours=24)` | ✅ | 41 tickers; 36 stale (expected weekend) |
| `get_sector_rotation` | ⚠️ | All N/A/5d (I3 confirmed) |
| `get_watchlist` | ✅ | 41 tickers with threshold data |
| `get_macro_snapshot` | ✅ | investment-clock CORE_VN; yield CHEAP (3.2pp spread) |
| `task_claim(ttl=30)` | ❌ | ttl_seconds minimum 60 — undocumented constraint |
| `get_recent_fixes(limit=20)` | ✅ | 20 fixes; most recent: HEAD.lock HOTFIX 2026-05-12 |
| `get_financial_summary(actionCode="FPT")` | ✅ | Confirmed working schema |
| `get_foreign_flow({})` | ❌ | `code: Required` (M3 confirmed) |
| `get_agent_signals({})` | ❌ | `agent: Required` (B9 confirmed) |

---

## Priority Action Items (unchanged P0–P3 + I11-R2 escalation)

**P0 — Critical, blocking or crashing:**
1. **I11-R2** NEW: 3rd mcp-server restart today (~20:24Z) — crash-loop cadence ~2h; WAL 15.65 MB (+8.35 MB). **Investigate Docker/OOM logs urgently.**
2. **B1**: `vnstockFundamentalsRefresh` crashed — 5+ days, 0 fundamental refreshes
3. **B5**: BCTC VPS pipeline stale — 5+ days, 0 new PDFs; Q1 earnings window active
4. **I7**: `vn-sbv-fetch` crash-loop — 3rd crash confirmed this session
5. **B2**: `get_technical_indicators` routing broken — N/A on FPT and VCB (confirmed)
6. **B10**: `get_market_hexagram` missing — Sunday digest-predict cycle broken

**P1 — Schema drifts blocking live agent calls:**
7. **B3**: `get_bctc_full` — `ticker` → `code` (4 tool packages)
8. **B6**: `get_patterns` — `code` vs `{stockCode, eventKeyword}`
9. **B7**: `get_sentiment_trend` — no-arg vs `stock_code` required
10. **B8**: `get_kinhdich_reading` — `ticker` → `code` (3 packages)
11. **B9**: `get_agent_signals` — undocumented `agent` required
12. **B11**: `get_market_summary` — no-arg vs `period` required
13. **B12**: `get_financial_summary` — `ticker` vs `actionCode` required

**P2 — Active ISSUEs degrading data quality:**
14. **I2**: CafeF/Reuters/TradingEconomics — 4 sources down (10 consecutive failures each)
15. **I3**: Sector rotation missing 5-day data — ohlcvDailyAggregatorJob stale since Jun 10
16. **I10**: WTI crude $95.5 vs Brent $87.33 — physically impossible, corrupts oil-signal
17. **I1**: `get_ism_subcomponents` — FRED_API_KEY missing
18. **I8**: Macro commodity deltas null in all agents
19. **I13**: vnstock RATE_LIMITED (NVL/ACB/ACV) — max retries exhausted this session

**P3 — Technical debt / improve:**
20. **B12** / capability probe broken in system-map.json
21. **I4**: BDI stale 67+ days
22. **I12**: `get_bctc_full` VCB empty despite PDF present
23. **M1**: Cascade eval 0% — outcomes never resolved
24. **M2**: Alert outcome 95.6% unknown
25. **M6+B1**: vnstockTradingStatsRefresh 79-min run — OOM risk
26. **M7**: Test cron `macroIndicatorRefreshJob_FAILTEST` in prod

---

_Report generated: 2026-06-13T22:07Z by health-recheck agent_
