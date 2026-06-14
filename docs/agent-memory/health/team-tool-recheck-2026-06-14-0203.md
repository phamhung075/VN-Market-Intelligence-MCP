# MCP Tool Health Recheck — 2026-06-14T02:03Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: 2h 44m 31s (started ~23:18Z June 13 — stable, no 5th restart)  
**DB:** market.db 273.42 MB, WAL 3.95 MB (was 1.75 MB at 00:07Z → growing ~1 MB/h)  
**Probe scope:** 22 tool probes (delta vs 2026-06-14-0007)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-14-0007.md`

---

## Delta vs Prior Report (2026-06-14-0007)

| Status | Count |
|--------|-------|
| IMPROVED | 1 (I11 — no 5th restart; 2h44m stable) |
| WORSENED | 4 (I7 regressed; I2 escalated; I14 expanded; I3 one more missed day) |
| UNCHANGED | 10 BUGs + 11 ISSUEs + 7 IMPROVEs |

---

## Summary

| Class | Count | Delta vs 2026-06-14-0007 |
|-------|-------|--------------------------|
| BUG   | 11    | unchanged |
| ISSUE | 15    | 4 worsened (I2, I3, I7, I14); 1 improved (I11) |
| IMPROVE | 7  | unchanged |

---

## CHANGED since 2026-06-14-0007

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **I11** | Server stable — no 5th restart | ISSUE | `vnstockStartupProbe` still last_run: 2026-06-13 23:18:22; server uptime 2h 44m at probe time 02:02Z (no crash in ~2h 44m). WAL growing: 1.75 MB at 00:07Z → 3.95 MB at 02:02Z (~1 MB/h). 5th restart has not occurred yet. | **IMPROVED — watching WAL growth** |
| **I7** | vn-sbv-fetch REGRESSED to unhealthy | ISSUE | `get_vps_service_health` at 02:02Z: `vn-sbv-fetch: unhealthy, uptime 1h 14m`. Was "healthy" at 00:07Z probe. VPS proxy push log shows sbv pushes at 01:56Z, 01:26Z ✅ (data still flowing via push buffer). Root cause still unknown — vn-sbv-fetch keeps crashing and restarting. | **REGRESSED — crash-loop recurring** |
| **I2** | Reuters RSS + TradingEconomics ×2 escalated | ISSUE | Source health at 02:02Z: Reuters RSS "Ngưng" 14 consecutive errors; Trading Economics ×2 "Ngưng" 14 errors each (all "Chưa bao giờ" — never succeeded in this server instance since 23:18Z restart). At 00:07Z they were at 3 errors. Circuit breakers still [OK] (failure threshold not hit), masking the degradation from agent monitoring. | **WORSENED — 14 errors each, escalating** |
| **I14** | bctcQueueEnricher batch-zero now 5 tickers | ISSUE | At 02:00-02:01Z system errors show 0 URLs for: **JSH, SIS, VDC, VNH, VEA** (was VDC/VNH/VEA at 00:07Z — now also JSH + SIS). All 5 are QUÁ HẠN tickers. VPS BCTC-discover endpoint returning 0 URLs for these company IDs. JSH (HNX utilities), SIS (HOSE tech), VDC (UPCOM securities), VNH (HNX agriculture), VEA (HOSE/UPCOM other). | **WORSENED — expanded from 3 to 5 failing tickers** |

---

## BUGs (broken / errors) — 11 total (UNCHANGED)

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | last_status=crashed, success_rate=0.0%, avg_duration=4036s, last_run: 2026-06-08. **6+ days, 0 fundamental data refreshes.** | Investigate crash log (OOM/vnstock API timeout). Add pagination + 30-min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` routing broken | FPT at 02:03Z: source_tier=3, all MA/RSI/MACD/BB = N/A ("needs 50/15/34/20 candles"). `get_pipeline_health` shows FPT rows=38, RSI14=51.2 computed — tool bypasses pre-computed ta_ohlcv table. | Route MCP tool to pre-computed ta_ohlcv table when rows≥15; raw-calc as fallback. | UNCHANGED |
| B3 | `get_bctc_full` param `ticker` → `code` schema drift | Tool accepts `code: string`. Agent tool packages document `ticker: string`. Confirmed: `{code:"FPT"}` ✅. `{ticker:"FPT"}` would fail. | Update all 4 tool packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM all price sources failing | Every minute: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed`. 5 tickers (BDI, DLC, JSH, SIS, VDC) have 0 OHLCV rows in pipeline_health. Confirmed at 02:01Z. | Diagnose HNX scraper; add UPCOM fallback. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{stockCode: string, eventKeyword: string}`. `market-watcher.md` documents `{code: string}`. Every chart-pattern call from market-watcher fails validation. `{stockCode:"VCB", eventKeyword:"pattern"}` ✅. | Fix `market-watcher.md`: replace `code` with `{stockCode, eventKeyword}` (both required). | UNCHANGED |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. `unified-agent.md` documents as no-arg. | Add `stock_code: string (required)` to `unified-agent.md`. | UNCHANGED |
| B8 | `get_kinhdich_reading` param `ticker` → `code` | `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md` all document `ticker`. Tool accepts `code`. `{code:"FPT"}` ✅. | Update 3 tool packages: `ticker` → `code`. | UNCHANGED |
| B9 | `get_agent_signals` undocumented required param | `agent: string` required. `news-scout.md` omits this parameter — bootstrap step would fail at schema validation. `{agent:"market-watcher"}` ✅. | Add `agent: string (required)` to `news-scout.md`. | UNCHANGED |
| B10 | `get_market_hexagram` missing from server | Not in system-map.json tool list; not callable. Every Sunday `digest-predict` cycle fails when this tool is called. | Implement tool or remove from `digest-predict.md`; fallback: `get_kinhdich_reading(code="^VNINDEX")`. | UNCHANGED |
| B11 | `get_market_summary` requires `period` param | Tool requires `period: 'daily'|'weekly'|'monthly'|'quarterly'|'yearly'`. `digest-predict.md` documents as no-arg. `{period:"daily"}` ✅. | Add `period` (required, enum) to `digest-predict.md`. | UNCHANGED |
| B12 | `get_financial_summary` requires `actionCode` | Tool requires `actionCode: string`. Agent packages document `ticker`. `capability_manifest.pdf.probe` uses `ticker` — probe broken. `{actionCode:"FPT"}` ✅. | Document `actionCode` in all tool packages; fix `capability_manifest` probe. | UNCHANGED |

---

## ISSUEs (degraded / empty / slow) — 15 total

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no data | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}` Confirmed at 02:03Z. | Set `FRED_API_KEY` env var. | UNCHANGED |
| I2 | Reuters RSS + TradingEconomics ×2 failing | At 02:02Z: Reuters "Ngưng" 14 errors; TradingEconomics ×2 "Ngưng" 14 errors. CBs all [OK] — false-closed. At 00:07Z these were at 3 errors each. All 3 sources show "Chưa bao giờ" (never succeeded in current server instance). | Audit RSS endpoint URLs; check TE key/headers post-restart; add CB threshold reduction. | **WORSENED — 14 errors, escalating** |
| I3 | Sector rotation — ohlcvDailyAggregatorJob 4-day stale | `ohlcv-daily-aggregator` last_run: 2026-06-10 (Tue). Missed June 11 (Wed), June 12 (Thu), June 13 (Fri) — **3 consecutive weekday misses**. Pipeline_health reports "Aggregator last run: 2026-06-12" (this is ta-ohlcv-backfill date, not the daily aggregator — inconsistent labels). All 16 sectors show N/A rotation. | Investigate why `ohlcvDailyAggregatorJob` not firing since June 10; check schedule registration. | **WORSENED — 3rd consecutive missed weekday** |
| I4 | BDI stale 67+ days in supply chain | BDI `1,400 (+0.0%) — 2026-04-07`. `commodityTrackerRefreshJob` does not include BDI. | Add Baltic Dry Index to `commodityTrackerRefreshJob` scope. | UNCHANGED |
| I5 | `bctcReparseJob` 80.8% success rate | 182 runs at 80.8%. vnstock rate-limiting (ACB, NVL, ACV) confirmed recurring. | Add per-ticker exponential back-off; skip N consecutive RATE_LIMITED tickers. | STABLE |
| I6 | `pending_feedback` + `open_warnings` backlog | `pending_feedback: 54`, `open_warnings: 45` — unchanged for 3 consecutive runs. | Triage and drain. | UNCHANGED |
| I7 | `vn-sbv-fetch` crash-loop | UNHEALTHY at 02:02Z (uptime 1h 14m). Was healthy at 00:07Z (I7 had been tentatively "IMPROVED — watching"). Data still flowing via push buffer (sbv pushes 01:56Z, 01:26Z ✅). Root cause of crash-loop unknown. | Add PM2/supervisor restart-count alert; separate data-push health from TCP ping. | **REGRESSED — crash-loop recurring** |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null`. `vnIndexDelta: -6.96` computes correctly. Confirmed at 02:03Z. | Fix delta calculation for commodity fields; store prev-close baseline in macro_indicators. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live hydro data | Not probed this run (unchanged assumption). `weatherCheckJob` running 100% success but hydro not populated. | Trace hydro data path from weatherCheckJob to energy-grid consumer. | UNCHANGED |
| I10 | `wti_crude_usd` stale/corrupted at $95.5 | `get_system_status` auto-tracked: `wti_crude_usd 95.5` (79 data points). Live Brent $87.33. WTI > Brent by $8.17 is physically impossible. Confirmed 02:02Z. | Audit WTI data source; add WTI to `commodityTrackerRefreshJob`. | UNCHANGED |
| I11 | MCP server crash-loop stabilizing | No 5th restart in 2h 44m (best window today). WAL growing: 1.75 MB → 3.95 MB in ~2h (rate: ~1 MB/h). `vnstockStartupProbe` last_run 23:18Z confirms session anchor. 4 restarts June 13 total. | Monitor WAL growth; check if crash correlates with WAL saturation or specific cron job schedule. | **IMPROVED — watching; WAL growing** |
| I12 | `get_bctc_full(code="VCB")` returns empty | Returns "Chưa có dữ liệu BCTC". Earnings calendar confirms VCB **ĐÃ NỘP 2026-06-13** (filed yesterday). `bctcPdfPullJob` last success 02:00Z (96% success rate) — PDF may have been pulled but not yet parsed. | Trigger `bctcReparseJob` for VCB explicitly; check `bctc_table_rows` for missing income/balance rows. | UNCHANGED |
| I13 | vnstock RATE_LIMITED | Not active at 02:03Z (market closed, weekend). | Add staggered inter-ticker delay. | SETTLED (market closed) |
| I14 | `bctcQueueEnricher` batch-zero — now 5 tickers | At 02:00-02:01Z: 0 URLs for JSH, SIS, VDC, VNH, VEA (was 3 tickers at 00:07Z). All QUÁ HẠN. VPS BCTC-discover endpoint returning nothing for these company IDs. | Investigate company ID mapping for HNX/UPCOM tickers (JSH, VNH, DLC) + SIS/VDC. Check VPS geo-block for non-HOSE exchange tickers. | **WORSENED — 5 tickers, was 3** |
| I15 | BCTC VPS pipeline — stable | `bctcPdfPullJob` success_rate 96.0%, last_run 02:00Z ✅. Last push 2026-06-13 23:45Z. 174 runs total. Root cause of June 8–13 outage still undiagnosed. | Monitor stability; root-cause the prior outage gap. | STABLE (improved from B5) |

---

## IMPROVEMENTs — all 7 UNCHANGED

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation dead | 1,965+ rule hits; Eval=0 for ALL 49 rules. `record_signal_outcome` never called. | Wire `record_signal_outcome` into alert-commander feedback loop. | UNCHANGED |
| M2 | Alert outcome unknown 95.6% | 506 alerts pending; vast majority "unknown" verdict. | Auto-resolve price alerts vs 5-day close. | UNCHANGED |
| M3 | `get_foreign_flow` requires undocumented `code` param | `{}` fails validation; not in flow docs. `{code:"HPG"}` ✅. HPG data also shows data quality anomaly (see I16 note below). | Add `code: string (required)` to relevant flow docs. | UNCHANGED |
| M4 | `run_impact_chain` sector direction error | SBV rate reduction → BEARISH banking (should be BULLISH). | Add sector override: `monetary_easing → banking: bullish`. | UNCHANGED |
| M5 | `get_sector_rotation` includes non-watchlist sectors | Returns sectors with 0 watchlist tickers. | Filter to sectors with ≥1 active watchlist ticker. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min run | avg_duration: 4,735,029ms. OOM risk. Sister to B1. | Add 30-min timeout guard; paginate vnstock batch calls. | UNCHANGED |
| M7 | `macroIndicatorRefreshJob_FAILTEST` test cron in prod | Listed in `get_cron_health` (1 run, 2026-06-08). Test artifact in prod. | Delete or disable from cron registry. | UNCHANGED |

---

## Data Quality Note — HPG Foreign Flow Anomaly

`get_foreign_flow(code="HPG")` at 02:03Z shows:
- June 12: net_vol=0, holding_ratio=0.00%, foreign_room=211.22M
- June 13: net_vol=+1,812.03M, holding_ratio=21.46%, foreign_room=4,643.63M

A single-day jump of +1,812M shares net buy volume (HPG typical daily vol ~10-30M shares) and foreign room jump from 211M → 4,643M (+4,432M) is physically implausible. This is either a data feed glitch in the VPS foreign-flow scraper or a share structure change not properly handled. Risk: `get_foreign_flow` is generating a HIGH-severity signal that may be false-positive.

---

## Tool Probe Coverage (this run — 22 probes)

| Tool | Result | Notes |
|------|--------|-------|
| `get_system_status` | ⚠️ | uptime 2h44m (stable); HNX B4 errors; Reuters/TE I2 escalated to 14 errors |
| `get_cron_health` | ⚠️ | B1 crashed; M7 test job; ohlcv-aggregator stale I3 (missed June 11,12,13) |
| `get_vps_service_health` | ❌ | vn-sbv-fetch UNHEALTHY (I7 regressed) |
| `get_vps_proxy_health` | ✅ | all services pushing data OK |
| `get_market_snapshot` | ✅ | VN-Index 1791.65, tier-2 |
| `get_macro_snapshot` | ⚠️ | Commodity deltas null I8; FX/carry/yield data present |
| `get_pipeline_health` | ✅ | 36/41 TA-ready (B4: 5 tickers 0 rows: BDI/DLC/JSH/SIS/VDC) |
| `get_technical_indicators(code="FPT")` | ❌ | tier-3, all N/A (B2 confirmed) |
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ | 49ms; returns agent_signals + market_context + system_status |
| `get_earnings_calendar` | ✅ | 41 tickers; 11 QUÁ HẠN |
| `get_ism_subcomponents` | ❌ | no_data — FRED_API_KEY required (I1 confirmed) |
| `get_macro_snapshot` | ⚠️ | oilUsdDelta/goldUsdDelta/usdVndDelta all null (I8 confirmed) |
| `get_foreign_flow(code="HPG")` | ⚠️ | Data quality anomaly — 1812M share jump + holding ratio 0→21.46% in one day |
| `get_bctc_full(code="VCB")` | ❌ | "Chưa có dữ liệu BCTC" despite filing 2026-06-13 (I12) |
| `get_bctc_full(code="FPT")` | ✅ | Full BCTC data, ROE=6.17%, confidence 81% |

---

## Priority Action Items

**P0 — Critical, blocking production:**
1. **B1** `vnstockFundamentalsRefresh` crashed — 6+ days, zero fundamental data
2. **B2** `get_technical_indicators` routing broken — all N/A despite 38 candles in pipeline
3. **B4** HNX/UPCOM price fetch failing every minute — 5 watchlist tickers without prices
4. **I7** vn-sbv-fetch crash-loop recurring — root cause unknown; SBV data flowing via push buffer for now

**P1 — Schema drifts blocking live agent calls (all unchanged, still unpatched):**
5. **B6** `get_patterns` — {code} vs {stockCode, eventKeyword}
6. **B7** `get_sentiment_trend` — no-arg vs `stock_code` required
7. **B8** `get_kinhdich_reading` — `ticker` → `code` (3 packages)
8. **B3** `get_bctc_full` — `ticker` → `code` (4 packages)
9. **B9** `get_agent_signals` — undocumented `agent` required in news-scout.md
10. **B11** `get_market_summary` — no-arg vs `period` required in digest-predict.md
11. **B12** `get_financial_summary` — `ticker` vs `actionCode` (all packages + capability_manifest)
12. **B10** `get_market_hexagram` — missing from server; digest-predict Sunday cycle broken

**P2 — Data quality degradation:**
13. **I14** bctcQueueEnricher batch-zero expanded: JSH/SIS/VDC/VNH/VEA (5 tickers, was 3)
14. **I2** Reuters RSS + TradingEconomics — 14 consecutive failures each, escalating
15. **I10** WTI crude $95.5 vs Brent $87.33 — corrupts oil-signal regime
16. **I3** ohlcvDailyAggregatorJob — 3 consecutive weekday misses (June 11-13)
17. **I8** Macro commodity deltas all null
18. **HPG foreign flow anomaly** — 1812M share jump may generate false HIGH-severity signal

**P3 — Monitor / tech debt:**
19. **I11** Server WAL growing (3.95MB, +1MB/h) — watch for approaching crash trigger
20. **I7** vn-sbv-fetch — healthy data push but service keeps crashing; add supervisor restart limit
21. **I12** `get_bctc_full(VCB)` empty despite 2026-06-13 filing — trigger manual reparse
22. **I1** FRED_API_KEY missing → no ISM data
23. **M1/M2** Cascade eval 0%, alert outcomes 95.6% unknown
24. **M6+B1** vnstockTradingStatsRefresh 79-min run — OOM risk
25. **M7** Test cron `macroIndicatorRefreshJob_FAILTEST` in prod

---

_Report generated: 2026-06-14T02:03Z by health-recheck agent_
