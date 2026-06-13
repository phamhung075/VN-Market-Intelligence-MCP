# MCP Tool Health Recheck — 2026-06-13T12:05Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime at probe start: 4h 10m 56s  
**DB:** market.db 272.13 MB, WAL 7.33 MB  
**Probe scope:** 18 direct tool probes (delta-focused vs prior run)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-1009.md`

---

## Delta vs Prior Report (10:09Z)

| Status | Count |
|--------|-------|
| NEW findings | 2 |
| UNCHANGED | 22 |
| RESOLVED | 1 |

---

## Summary

| Class | Count | Delta vs 10:09Z |
|-------|-------|-----------------|
| BUG   | 9     | +0              |
| ISSUE | 9     | +1 new, -1 resolved (net 0) |
| IMPROVE | 6  | +1 new          |

---

## RESOLVED (since 10:09Z)

| # | Finding | Resolution |
|---|---------|------------|
| R1 | I7: `vn-sbv-fetch` UNHEALTHY | Now HEALTHY. Confirmed transient false-positive from service restart ~49m before prior probe. No action needed. |

---

## BUGs (broken / errors) — ALL UNCHANGED

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | `last_status: crashed`, `success_rate: 0.0%`, `avg_duration: 4036s (~67 min)`, last_run: 2026-06-08. **5 days with no fundamental refresh.** Live errors cycling through SIS ticker (see N1 below). | Investigate crash log; likely OOM or vnstock API auth expiry. Reset + redeploy. Note: `vnstockTradingStatsRefresh` sister cron succeeded but took 79 min (see M6). | **UNCHANGED** |
| B2 | `get_technical_indicators` routing | Called `code="FPT"`: returns `source_tier=3`, ALL N/A: `MA5/MA20/MA50=N/A (needs 50 candles)`, `RSI=N/A (needs ≥15 candles)`, `MACD=N/A`, `BB20=N/A`. Meanwhile `get_pipeline_health` confirms FPT `rows=38, TA ready, RSI14=51.2`. Tool does NOT route to pre-computed TA values. | Route `get_technical_indicators` to the TA service pre-computed pipeline when pipeline is ready. | **UNCHANGED** |
| B3 | `get_bctc_full` schema drift | `bctc-analyst.md` + `unified-agent.md` document `ticker: string`, live tool requires `code: string`. Any bctc-analyst cycle using documented signature fails. | Update docs: replace `ticker` → `code` for `get_bctc_full`. | **UNCHANGED** |
| B4 | HNX/UPCOM price sources | System errors confirmed: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` at 12:02-12:03 UTC. Affected tickers: BDI[HNX], DLC[UPCOM], JSH[HNX], VDC[UPCOM] = 0 OHLCV rows, N/A prices. | Diagnose HNX/UPCOM scraper; add fallback source. | **UNCHANGED** |
| B5 | BCTC VPS pipeline stale | `get_vps_proxy_health` bctc last push `2026-06-08 00:30:03` (5+ days ago). `vn-bctc-fetch` shows "healthy" (TCP ping only). 0 new PDFs in 5+ days despite `bctcPdfPullJob` at 97.7% success. | SSH into VPS; check `vn-bctc-fetch` logs. Add functional health check beyond TCP ping. | **UNCHANGED** |
| B6 | `get_patterns` schema drift | Live tool requires `stockCode: string` + `eventKeyword: string` (both required). `market-watcher.md` documents `{ code: string }`. Market-watcher chart-pattern step will always fail. | Fix `market-watcher.md` to document correct params `{stockCode, eventKeyword}`. | **UNCHANGED** |
| B7 | `get_sentiment_trend` schema drift | Probe confirmed: tool works with `stock_code="FPT"` (returns 7-day trend). But flow docs document it as no-arg tool. All agents calling `get_sentiment_trend({})` without `stock_code` will fail validation. | Add `stock_code: string (required)` to all relevant flow docs. | **UNCHANGED** |
| B8 | `get_kinhdich_reading` schema drift | Live tool requires `code: string`. `bctc-analyst.md` docs `ticker: string`. Mixed documentation. | Standardize all packages to `code: string`. | **UNCHANGED** |
| B9 | `get_agent_signals` schema drift (news-scout) | Live tool requires `agent: string` (mandatory). `news-scout.md` documents as no required params. News-scout bootstrap step calling `{}` will fail. | Update `news-scout.md` to show `agent: string` as required. | **UNCHANGED** |

---

## ISSUEs (degraded / empty / slow)

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no_data | Confirmed: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`. `macroIndicatorRefreshJob` last ran 2026-06-12 12:13 (success) but ISM rows still empty. | Verify `FRED_API_KEY` env var in mcp-server container. | **UNCHANGED** |
| I2 | CafeF RSS + Reuters RSS + Trading Economics (×2) | All 4 sources: `Ngưng`, **26 consecutive failures**, "Chưa bao giờ" (never succeeded). News diversity reduced. | Check URL validity; TradingEconomics likely anti-bot blocked. | **UNCHANGED** |
| I3 | `get_sector_rotation` 5d gap | All 16 sectors show `N/A / 5d` — only 1-day momentum available. Regime detection degraded. | Allow 1 more trading day; `ohlcvDailyAggregatorJob` last ran 2026-06-10. | **UNCHANGED** |
| I4 | BDI staleness in `get_supply_chain_exposure` | BDI last updated 2026-04-07 (67+ days ago). `commodityTrackerRefreshJob` runs daily but BDI not included. | Add BDI to `commodityTrackerRefreshJob` or create dedicated shipping-index fetcher. | **UNCHANGED** |
| I5 | `bctcReparseJob` 83.2% success | 184 runs, ~31 failures. Down from 83.5% at 10:09Z. Consistent with PDF layout variations. | Review failing tickers in bctc_queue. | **UNCHANGED** |
| I6 | Pending feedback + open warnings backlog | `pending_feedback: 53 new items`, `open_warnings: 45 high/critical items`. Counts unchanged since 10:09Z. | system-auditor or ops agent should drain pending_feedback queue. | **UNCHANGED** |
| I8 | `get_macro_snapshot` delta fields null | Confirmed: `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null`. `vnIndexDelta: -6.96` works (VN index). Commodity directional analysis unavailable. Affects unified-agent layer-1 framing. | Fix delta calculation for commodity fields in macro snapshot service. | **UNCHANGED** |
| I9 | `get_energy_grid_signals` reservoir | Reservoir fill rate still estimated at default 70%. Not live data. | Check `weatherCheckJob` for hydrological data source; may be geo-blocked or URL changed. | **UNCHANGED** (not re-probed, `weatherCheckJob` still succeeds 2026-06-13 11:00) |
| **N1** | **NEW** `vnstock:SIS` rate-limit storm | **8+ RATE_LIMITED errors in <1 minute** at 12:02-12:03 UTC for `balance_sheet:SIS` and `cash_flow:SIS`. "max retries exhausted" x2. SIS is on HOSE (not HNX/UPCOM — separate from B4), has 0 OHLCV rows and N/A price. Source: likely `bctcQueueEnricherJob` (runs every 15 min) hammering blocked vnstock endpoint for SIS. Error log fills with SIS warnings each cycle. | Add a per-ticker back-off registry in `bctcQueueEnricherJob`: skip tickers that have `max retries exhausted` N times in a row. Also investigate why SIS price is unavailable on HOSE. | **NEW** |

---

## IMPROVEMENTs

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation | `get_cascade_metrics`: 2,000+ rule hits, `Eval=0` for ALL 49 rules. `record_signal_outcome` not called from cowork cycle. | Wire `record_signal_outcome` into alert-commander feedback loop. | **UNCHANGED** |
| M2 | Alert outcome unknown rate | 660/690 (96%) alerts "unknown". Only 30 outcomes evaluated. Accuracy metric unreliable. | Auto-resolve price alerts by comparing alert price vs 5-day close. | **UNCHANGED** |
| M3 | `get_foreign_flow` undocumented `code` param | Tool requires `code: string` (mandatory) but no flow docs mention it. | Add `code: string (required)` to all relevant flow docs. | **UNCHANGED** |
| M4 | `run_impact_chain` rate-cut direction | SBV rate reduction probe returns BEARISH for banking (should be BULLISH for NIM). | Add sector override logic: `monetary_easing → banking: bullish`. | **UNCHANGED** |
| M5 | `get_sector_rotation` sector membership | Shows sectors not in watchlist ("gold_mining", "construction", "insurance"). | Filter output to sectors with ≥1 watchlist ticker. | **UNCHANGED** |
| **M6** | **NEW** `vnstockTradingStatsRefresh` long duration | Ran 2026-06-09 08:30 UTC, 1 run, success — but `avg_duration: 4,735,029 ms` (**~79 min**). Sister job to crashed B1 `vnstockFundamentalsRefresh` (67 min → OOM). At 79 min, a second run risks the same OOM/timeout fate. Not yet crashed (1 run only). | Add job timeout guard at 30 min. Paginate vnstock calls to avoid single massive batch. Monitor before next monthly run. | **NEW** |

---

## Tool Probe Results (this run)

| Tool | Result | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ | requires `agent_name` (schema drift vs no-arg docs) |
| `get_system_status` | ✅ | uptime 4h 10m 56s; 10 unresolved errors |
| `get_cron_health` | ✅ | B1 still crashed; all others healthy |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_vps_proxy_health` | ⚠️ | bctc stale 5+ days (B5 unchanged) |
| `get_macro_snapshot` | ⚠️ | oilUsdDelta/goldUsdDelta/usdVndDelta all null (I8 unchanged) |
| `get_vps_service_health` | ✅ | all 3 running healthy, 2 idle (market closed) — I7 RESOLVED |
| `get_technical_indicators(FPT)` | ❌ | tier-3, all N/A despite 38 rows in pipeline (B2 unchanged) |
| `get_pipeline_health` | ✅ | FPT RSI14=51.2 confirmed; BDI/DLC/JSH/SIS/VDC = 0 rows |
| `get_sentiment_trend(FPT)` | ✅ | works with `stock_code`; docs still wrong (B7 unchanged) |
| `get_ism_subcomponents` | ❌ | no_data; FRED_API_KEY (I1 unchanged) |
| `task_list_held` | ✅ | 0 locks |

---

## Priority Action Items (current state)

**P0 — Critical, >5 days unresolved:**
1. **B1**: `vnstockFundamentalsRefresh` crashed — 5 days, 0 fundamental data refreshes
2. **B5**: BCTC VPS pipeline stale — 5 days, 0 new PDFs
3. **B2**: `get_technical_indicators` routing broken — TA data all N/A in tool despite pipeline ready

**P1 — Schema drifts breaking cowork agents:**
4. **B6**: `get_patterns` — market-watcher chart-pattern step broken
5. **B7**: `get_sentiment_trend` — unified-agent synthesis step broken (no-arg calls)
6. **B3**: `get_bctc_full` — bctc-analyst ticker→code drift
7. **B8**: `get_kinhdich_reading` — bctc-analyst ticker→code drift
8. **B9**: `get_agent_signals` — news-scout bootstrap broken (missing required `agent` param in docs)

**P2 — Active ISSUEs:**
9. **N1**: SIS vnstock rate-limit storm — error log flooding every 15 min cycle *(NEW)*
10. **I8**: `get_macro_snapshot` commodity deltas null — affects macro analysis in all cowork agents
11. **I1**: `get_ism_subcomponents` no_data — FRED_API_KEY missing

**P3 — Ongoing degradation:**
12. **B4**: HNX/UPCOM price sources failed (4 tickers affected)
13. **I2**: CafeF/Reuters/TradingEconomics 26 consecutive failures (news diversity)
14. **I6**: 53 pending feedback + 45 open warnings unprocessed

**P4 — Monitor:**
15. **M6**: `vnstockTradingStatsRefresh` 79 min duration — potential OOM risk on next run *(NEW)*

---

*Report generated: 2026-06-13T12:05Z | Prior: docs/agent-memory/health/team-tool-recheck-2026-06-13-1009.md*
