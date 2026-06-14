# MCP Tool Health Recheck — 2026-06-14T00:07Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: 45m 13s (started ~23:18Z June 13 — **4th restart today**)  
**DB:** market.db 273.12 MB, WAL 1.75 MB (reset post-restart; was 15.65 MB at prior 22:07Z run)  
**Probe scope:** 22 tool probes (full sweep; delta vs 2026-06-13-2207)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-2207.md`

---

## Delta vs Prior Report (2026-06-13-2207)

| Status | Count |
|--------|-------|
| NEW findings | 2 (I11-R3 — 4th server restart; I14 — bctcQueueEnricher batch-zero) |
| IMPROVED | 2 (B5→I15 — BCTC pipeline recovered; I7 — vn-sbv-fetch now healthy) |
| UNCHANGED | 11 BUGs + 12 ISSUEs + 7 IMPROVEs |

---

## Summary

| Class | Count | Delta vs 2026-06-13-2207 |
|-------|-------|--------------------------|
| BUG   | 11    | -1 (B5 downgraded to I15 — pipeline recovering) |
| ISSUE | 15    | +2 new; B5 reclassified into I15 |
| IMPROVE | 7  | unchanged |

---

## NEW / CHANGED since 2026-06-13-2207

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **I11-R3** | MCP server 4th restart at ~23:18Z June 13 | ISSUE | `vnstockStartupProbe` last_run: 2026-06-13 23:18:22. At probe time 00:03Z, `get_system_status` uptime=45m 13s → server started ~23:18Z. Prior restarts: before 08:07Z, ~18:31Z, ~20:24Z, now ~23:18Z. Crash cadence: ~2-3h, accelerating. WAL reset to 1.75 MB post-restart (was 15.65 MB at 22:07Z). | **NEW — 4th crash-loop restart** |
| **I14** | `bctcQueueEnricher` — 0 URLs for entire batch | ISSUE (NEW) | At 00:00-00:01Z: WARN `[bctcQueueEnricher] 0 URLs found for ticker VDC / VNH / VEA` and `0 URLs populated across all 9 items — all sources may be unavailable or geo-blocked`. All 3 named tickers are QUÁ HẠN in the earnings calendar. Suggests either company-name mapping failure or geo-block on the BCTC discover endpoint for these tickers. | **NEW** |
| **B5→I15** | BCTC VPS pipeline recovered | ISSUE (was BUG) | `get_vps_proxy_health`: bctc last push `2026-06-13 23:45:12` (vs stale `2026-06-08` at 22:07Z). `bctcPdfPullJob` currently RUNNING (status: running, success_rate 94.8%, 174 runs). Root cause of 5-day outage (June 8–13) not yet diagnosed. Monitor for stability. | **IMPROVED — pipeline now active** |
| **I7 (resolved?)** | `vn-sbv-fetch` crash-loop | ISSUE | At 00:00Z: `vn-sbv-fetch: healthy`. Was UNHEALTHY at 22:07Z (3 consecutive crashes). SBV push log shows pushes at 23:26, 23:56Z — data flowing. Crash-loop may have self-healed after 4th mcp-server restart. Still monitor; underlying root cause unknown. | **IMPROVED — currently healthy** |

---

## BUGs (broken / errors) — 11 total

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | last_status=crashed, success_rate=0.0%, avg_duration=4036s, last_run: 2026-06-08. **6+ days, 0 fundamental data refreshes.** | Investigate crash log (OOM/vnstock API timeout). Reset/redeploy with pagination + 30-min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` routing broken | FPT: `get_pipeline_health` shows rows=38, TA ready, RSI14=51.2. But `get_technical_indicators(code="FPT")` returns source_tier=3, all MA/RSI/MACD/BB = N/A ("needs 50/15/34/20 candles"). Tool bypasses pre-computed ta_ohlcv table. | Route MCP tool to pre-computed `ta_ohlcv` table when rows≥15; raw-calc as fallback. | UNCHANGED (confirmed this run) |
| B3 | `get_bctc_full` param `ticker` → `code` schema drift | Tool accepts `code: string`. Confirmed: `{code:"FPT"}` ✅ returns full BCTC. Agent tool packages document `ticker: string`. | Update all 4 tool packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM all price sources failing | Confirmed at 00:01-00:03Z June 14: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` firing every minute. 5 watchlist tickers (BDI, DLC, JSH, SIS, VDC) have 0 OHLCV rows; N/A prices. CB shows [OK] — failures at fetch layer. | Diagnose HNX scraper; add UPCOM fallback. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{stockCode: string, eventKeyword: string}`. `market-watcher.md` documents `{code: string}` and examples use `{ticker: "VCB"}`. Every chart-pattern call from market-watcher fails validation. Confirmed: `{stockCode:"VCB", eventKeyword:"pattern"}` ✅. | Fix `market-watcher.md`: replace `code` with `{stockCode: string (req), eventKeyword: string (req)}`. | UNCHANGED |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. `unified-agent.md` documents as no-arg. | Add `stock_code: string (required)` to `unified-agent.md`. | UNCHANGED |
| B8 | `get_kinhdich_reading` param `ticker` → `code` | `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md` all document `ticker`. Confirmed: `{code:"FPT"}` ✅ returns hexagram. | Update 3 tool packages: `ticker` → `code`. | UNCHANGED |
| B9 | `get_agent_signals` undocumented required param | `agent: string` required. `news-scout.md` omits this parameter — bootstrap step would fail at schema validation. | Add `agent: string (required)` to `news-scout.md`. | UNCHANGED |
| B10 | `get_market_hexagram` missing from server | Not in `system-map.json` tool list; not callable. Every Sunday `digest-predict` cycle fails when this tool is called. | Implement tool or remove from `digest-predict.md`; fallback: `get_kinhdich_reading(code="^VNINDEX")`. | ASSUMED UNCHANGED |
| B11 | `get_market_summary` requires `period` param | Tool requires `period: 'daily'\|'weekly'\|'monthly'\|'quarterly'\|'yearly'`. `digest-predict.md` documents as no-arg. Confirmed: `{period:"daily"}` ✅ returns full summary. | Add `period` (required, enum) to `digest-predict.md`. | UNCHANGED |
| B12 | `get_financial_summary` requires `actionCode` | Confirmed: `{actionCode:"FPT"}` ✅. `{ticker:"FPT"}` would fail (B12). `system-map.json` `capability_manifest.pdf.probe` uses `ticker` → probe broken. Agent tool packages document `ticker`. | Document `actionCode: string` in all tool packages; fix `capability_manifest` probe. | UNCHANGED |

---

## ISSUEs (degraded / empty / slow) — 15 total

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no data | Error: "no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)." `macroIndicatorRefreshJob` runs successfully but cannot populate ISM without key. | Set `FRED_API_KEY` env var. | UNCHANGED |
| I2 | CafeF/Reuters/TradingEconomics (×2) failing | `get_system_status` source health: CafeF RSS "Suy giảm" (3 consecutive errors), Reuters RSS "Suy giảm" (3 errors), Trading Economics ×2 "Suy giảm" (3 errors each). CBs all [OK] — false-closed (failure threshold not hit). | Audit RSS endpoint URLs; check TE key rotation post-restart. | UNCHANGED |
| I3 | Sector rotation 4-day data gap | `ohlcv-daily-aggregator` last_run: 2026-06-10 (now 4 days stale). All 16 sectors show N/A. | Investigate why `ohlcvDailyAggregatorJob` not firing since June 10. | UNCHANGED (improved 1 day vs prior) |
| I4 | BDI stale 67+ days in supply chain | BDI `1,400 (+0.0%) - 2026-04-07`. `commodityTrackerRefreshJob` does not include BDI. | Add Baltic Dry Index to `commodityTrackerRefreshJob` scope. | UNCHANGED |
| I5 | `bctcReparseJob` 81.2% success rate | 186 runs at 81.2%. vnstock rate-limiting (ACB, NVL, ACV) confirmed recurring. | Add per-ticker exponential back-off; skip N consecutive RATE_LIMITED tickers. | STABLE |
| I6 | `pending_feedback` + `open_warnings` backlog | `pending_feedback: 54`, `open_warnings: 45` (unchanged for 2+ runs). | Triage and drain. | UNCHANGED |
| I7 | `vn-sbv-fetch` — crash-loop (currently healthy) | HEALTHY at 00:00Z probe. SBV pushes at 23:26Z, 23:56Z ✅. Was unhealthy crash-loop at 22:07Z (3 crashes). May have recovered after 4th mcp-server restart. Root cause not fixed. | Add PM2/systemd supervisor restart limit alert + data-push health check separate from TCP ping. Monitor. | **IMPROVED — watching** |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null`. `vnIndexDelta: -6.96` computes correctly. | Fix delta calculation for commodity fields; store prev-close baseline in macro_indicators. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live hydro data | Default 70% estimate. `weatherCheckJob` running at 100% success (last run 23:00Z), but hydro signals not populated. | Trace hydro data path from weatherCheckJob to energy-grid consumer. | UNCHANGED |
| I10 | `wti_crude_usd` stale/corrupted at $95.5 | Auto-tracked: `wti_crude_usd 95.5` (79 data points). Live Brent $87.33. WTI > Brent by $8.17 is physically impossible — corrupts oil-signal regime for all agents. | Audit WTI data source; add WTI to `commodityTrackerRefreshJob`. | UNCHANGED |
| I11 | MCP server crash-loop — **4 restarts June 13** | `vnstockStartupProbe` last_run: 2026-06-13 23:18:22 confirms 4th restart. Restart sequence: before 08:07Z → ~18:31Z → ~20:24Z → ~23:18Z. Cadence ~2-3h, accelerating. WAL resets to ~1-2 MB per restart, grows 8+ MB between crashes — WAL accumulation may be symptom. | **URGENT**: inspect Docker/container crash logs for OOM/SIGSEGV/unhandled promise. Add restart-count alert to ops monitoring. | **ESCALATED — 4th restart** |
| I12 | `get_bctc_full(code="VCB")` returns empty | Returns "Chưa có dữ liệu BCTC". VCB confirmed ĐÃ NỘP 2026-06-13 per `get_earnings_calendar`. `get_financial_summary(actionCode="VCB")` may work (not probed). CF data present. Income/balance sheet unparsed for VCB. | Trigger `bctcReparseJob` for VCB; check `bctc_table_rows` for missing income/balance rows. | UNCHANGED |
| I13 | vnstock RATE_LIMITED (settled for now) | Not active at 00:03Z (market closed). Was active at 22:07Z (NVL/ACB/ACV exhausted). | Add staggered inter-ticker delay in vnstock fundamental fetchers; reduce parallelism. | SETTLED (market closed) |
| I14 (NEW) | `bctcQueueEnricher` batch-zero URLs | At 00:00-00:01Z June 14: "0 URLs found for VDC / VNH / VEA" + "0 URLs populated across all 9 items". All 3 named tickers are QUÁ HẠN. Suggests geo-block on BCTC discover VPS endpoint for this batch OR company ID mapping mismatch for unlisted/non-standard tickers. | Investigate company name/ID mapping in bctcQueueEnricher for VEA (UPCOM), VNH (HNX), VDC (UPCOM). Check VPS endpoint health for these tickers. | **NEW** |
| I15 (was B5) | BCTC VPS pipeline — recovering, stability unknown | Pipeline resumed: bctcPdfPullJob RUNNING, last push 2026-06-13 23:45Z (vs stale 2026-06-08 in prior report). Success rate 94.8% (174 runs). Root cause of 5-day outage (June 8–13) not diagnosed. | Monitor for stability; root-cause the June 8–13 outage gap; fix health check to validate data push not just TCP. | **IMPROVED — monitoring** |

---

## IMPROVEMENTs — all 7 UNCHANGED

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation dead | 1,965+ rule hits; Eval=0 for ALL 49 rules. `record_signal_outcome` never called. | Wire `record_signal_outcome` into alert-commander feedback loop. | UNCHANGED |
| M2 | Alert outcome unknown 95.6% | 506 alerts pending; vast majority "unknown" verdict. Only price_surge/drop/volume auto-resolved. | Auto-resolve price alerts vs 5-day close. | UNCHANGED |
| M3 | `get_foreign_flow` requires undocumented `code` param | `{}` → validation error. Not in flow docs. `{code:"HPG"}` ✅ works. | Add `code: string (required)` to relevant flow docs. | UNCHANGED |
| M4 | `run_impact_chain` sector direction error | SBV rate reduction → BEARISH banking (should be BULLISH). | Add sector override: `monetary_easing → banking: bullish`. | UNCHANGED |
| M5 | `get_sector_rotation` includes non-watchlist sectors | Returns sectors with 0 watchlist tickers (gold_mining, construction, insurance). | Filter output to sectors with ≥1 active watchlist ticker. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min run | avg_duration: 4,735,029ms (1 run). OOM risk. Sister to B1. | Add 30-min timeout guard; paginate vnstock batch calls. | UNCHANGED |
| M7 | `macroIndicatorRefreshJob_FAILTEST` test cron in prod | Listed in `get_cron_health` (1 run, 2026-06-08). Test artifact in prod cron health dashboard. | Delete or disable from cron registry. | UNCHANGED |

---

## Tool Probe Coverage (this run — 22 probes)

| Tool | Result | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ | 16ms; market_context + agent_signals + system_status OK |
| `get_system_status` | ⚠️ | uptime 45m (4th restart); HNX B4 errors; CafeF/Reuters/TE I2 degraded |
| `get_vps_service_health` | ✅ | vn-sbv-fetch HEALTHY (improved); 3 healthy, 2 idle (market closed) |
| `get_vps_proxy_health` | ⚠️ | bctc last push 23:45Z ✅ (B5 recovered); news stale flag (false positive — last push 23:47Z) |
| `get_cron_health` | ⚠️ | B1 confirmed crashed; M7 test job; bctcPdfPullJob RUNNING; ohlcv-aggregator stale I3 |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | Commodity deltas null I8; FX/carry/yield data present |
| `get_pipeline_health` | ✅ | 36/41 TA-ready (B4: 5 tickers 0 rows); FPT RSI14=51.2 in pipeline |
| `get_technical_indicators(code="FPT")` | ❌ | tier-3, all N/A (B2 confirmed — routing to raw-calc bypasses pre-computed data) |
| `get_financial_summary(actionCode="FPT")` | ✅ | FPT Q1-2026; 81% confidence; actionCode required (B12 schema confirmed) |
| `get_earnings_calendar` | ✅ | 41 tickers; 14 QUÁ HẠN (ACV, BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH, VNM) |
| `get_ism_subcomponents` | ❌ | no_data — FRED_API_KEY required (I1 confirmed) |
| `task_claim({task_id, task_kind:"cowork-slot", owner_agent, ttl_seconds:60})` | ✅ | claimed:true; correct schema works |
| `task_release(task_id, owner_agent)` | ✅ | ok:true |
| `get_sentiment_trend(stock_code="VCB")` | ✅ | 7-day trend data returned |
| `get_agent_signals(agent="market-watcher")` | ✅ | No new signals (correct — market closed) |
| `get_foreign_flow(code="HPG")` | ✅ | net_buy, HIGH severity; 3-day streak (note: holding ratio jump 0→21.46% in one day — possible data quality anomaly) |
| `get_bctc_full(code="VCB")` | ❌ | "Chưa có dữ liệu BCTC" (I12 confirmed) |
| `get_bctc_full(code="FPT")` | ✅ | Full BCTC data, ROE=6.17%, confidence 81% |
| `get_patterns(stockCode="VCB", eventKeyword="pattern")` | ✅ | Returns empty result (no precedents) — tool itself works; B6 is docs drift |
| `get_kinhdich_reading(code="FPT")` | ✅ | Quẻ 56 — Lữ (tool uses `code`; B8 is docs drift) |
| `get_market_summary(period="daily")` | ✅ | Full daily summary returned (tool requires `period`; B11 is docs drift) |

---

## Priority Action Items

**P0 — Critical, blocking production:**
1. **I11-R3** 4th mcp-server crash (~23:18Z) — crash-loop cadence ~2h, accelerating. Investigate Docker/OOM crash logs urgently. WAL reset pattern may indicate WAL-lock or connection pool exhaustion causing crash.
2. **B1** `vnstockFundamentalsRefresh` crashed — 6+ days, zero fundamental data
3. **B2** `get_technical_indicators` routing broken — all N/A despite 38 candles available in pipeline
4. **B4** HNX/UPCOM price fetch failing every minute — 5 watchlist tickers without prices

**P1 — Schema drifts blocking live agent calls:**
5. **B6** `get_patterns` — {code} vs {stockCode, eventKeyword}
6. **B7** `get_sentiment_trend` — no-arg vs `stock_code` required  
7. **B8** `get_kinhdich_reading` — `ticker` → `code` (3 packages)
8. **B3** `get_bctc_full` — `ticker` → `code` (4 packages)
9. **B9** `get_agent_signals` — undocumented `agent` required in news-scout.md
10. **B11** `get_market_summary` — no-arg vs `period` required in digest-predict.md
11. **B12** `get_financial_summary` — `ticker` vs `actionCode` (all packages + capability_manifest)
12. **B10** `get_market_hexagram` — missing from server; digest-predict Sunday cycle broken

**P2 — Data quality degradation:**
13. **I14** `bctcQueueEnricher` batch-zero for VEA/VNH/VDC (NEW — may block Q1 BCTC ingestion for these QUÁ HẠN tickers)
14. **I15** BCTC pipeline recovered — monitor stability; root-cause the June 8–13 gap
15. **I2** CafeF/Reuters/TradingEconomics — 4 sources degraded (10 consecutive failures in prior run, 3 this run)
16. **I10** WTI crude $95.5 physically impossible vs Brent $87.33 — corrupts oil-signal
17. **I3** Sector rotation 4-day data gap — ohlcvDailyAggregatorJob stale since June 10
18. **I8** Macro commodity deltas all null

**P3 — Technical debt / monitor:**
19. **I7** vn-sbv-fetch — currently healthy; watch for recurrence of crash-loop
20. **I12** `get_bctc_full(VCB)` empty despite 2026-06-13 filing
21. **I1** FRED_API_KEY missing → no ISM data
22. **M1/M2** Cascade eval 0%, alert outcomes 95.6% unknown
23. **M6+B1** vnstockTradingStatsRefresh 79-min run — OOM risk
24. **M7** Test cron `macroIndicatorRefreshJob_FAILTEST` in prod

---

_Report generated: 2026-06-14T00:07Z by health-recheck agent_
