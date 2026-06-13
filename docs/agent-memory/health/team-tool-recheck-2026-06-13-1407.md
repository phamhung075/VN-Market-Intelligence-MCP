# MCP Tool Health Recheck — 2026-06-13T14:07Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: ~6h 10m (restarted ~08:00 UTC)  
**DB:** market.db 272.54 MB, WAL 9.17 MB  
**Probe scope:** 30+ direct tool probes (full sweep)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-1205.md`

---

## Delta vs Prior Report (12:05Z)

| Status | Count |
|--------|-------|
| NEW findings | 3 |
| ESCALATED (unchanged bug, worsening metric) | 1 |
| REGRESSION (was resolved, now re-broken) | 1 |
| UNCHANGED | 22 |

---

## Summary

| Class | Count | Delta vs 12:05Z |
|-------|-------|-----------------|
| BUG   | 10    | +1 new (B10)    |
| ISSUE | 10    | +1 regression (I7-R), +1 escalated (I2↑) |
| IMPROVE | 6  | unchanged       |

---

## NEW / CHANGED since 12:05Z

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **B10** | `get_market_hexagram` — tool not found | BUG | `MCP error -32602: Tool get_market_hexagram not found`. Listed in `docs/agents/tools/package/digest-predict.md` under "Kinh Dịch & Prediction". Called in `docs/agents/digest-predict/flow/weekly.md` Sunday cycle. Breaking for every weekly digest run. | **NEW** |
| **I7-R** | `vn-sbv-fetch` UNHEALTHY again | ISSUE | `get_vps_service_health` at 14:05Z shows `vn-sbv-fetch: unhealthy, response 0ms, VPS uptime 54m`. Was resolved at 12:05Z (R1). Service appears to restart every ~1–2h then go unhealthy. Pattern suggests VPS process crash loop, not one-off event. | **REGRESSION** (was R1, re-broken) |
| **I2↑** | CafeF/Reuters/TradingEconomics failure count escalating | ISSUE | Failures: 38 consecutive (up from 26 at 12:05Z, 9 at 10:09Z). Rate: +12 per 2h. At this rate, 50+ failures by next cycle. These sources never succeeded since server restart. | **ESCALATED** |
| **N2** | JSH vnstock rate-limit storm | ISSUE | System errors at 14:02–14:03Z: `vnstock:finance:JSH RATE_LIMITED — max retries exhausted`; `vnstock:balance_sheet:JSH RATE_LIMITED`. Same pattern as N1 (SIS, flagged at 12:05Z). `bctcQueueEnricherJob` cycling through JSH every 15 min. Now affecting both SIS and JSH. Error log floods every cycle. | **NEW** (parallel to N1) |

---

## BUGs (broken / errors)

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | `last_status: crashed`, `success_rate: 0.0%`, `avg_duration: 4036s (~67 min)`, last_run: 2026-06-08. **5 days no fundamental refresh.** | Investigate crash log; likely OOM or vnstock API timeout. Reset/redeploy with pagination + 30min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` routing broken | `get_technical_indicators(code="VCB")` → `source_tier:3`, ALL N/A (MA/RSI/MACD/BB). `get_pipeline_health` confirms VCB has 38 rows with RSI14=52.9. Tool bypasses pre-computed TA pipeline. | Route tool to pre-computed TA service values when pipeline `TA ready`. | UNCHANGED |
| B3 | `get_bctc_full` param `ticker` → `code` drift | All 4 agent tool packages (`bctc-analyst.md`, `unified-agent.md`, `market-watcher.md`, `digest-predict.md`) document `ticker: string`; live tool requires `code: string`. Confirmed: call with `ticker` → validation error; call with `code` → OK. | Update all 4 packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM price sources failing | `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` at 14:02–14:03Z (multiple errors). 5 watchlist tickers (BDI, DLC, JSH, SIS, VDC) have 0 OHLCV rows. | Diagnose HNX scraper; add UPCOM fallback. | UNCHANGED |
| B5 | BCTC VPS pipeline stale | `bctc` proxy last push `2026-06-08 00:30:03` (5+ days). `vn-bctc-fetch` shows "healthy" (TCP ping only). 0 new PDFs. `bctcPdfPullJob` 97.7% success — discrepancy suggests VPS is receiving job but not pushing results. | SSH into VPS; check `vn-bctc-fetch` logs. Add functional health check (item count diff) beyond TCP ping. | UNCHANGED |
| B6 | `get_patterns` schema drift | Prior report confirmed: tool requires `{ stockCode: string, eventKeyword: string }`. `market-watcher.md` documents `{ code: string }`. Chart-pattern step in market-watcher cycle always fails. | Fix `market-watcher.md` params to `{stockCode, eventKeyword}`. | UNCHANGED (not re-probed) |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. Flow docs document as no-arg. Unified-agent synthesis step calling `{}` fails validation. | Add `stock_code: string (required)` to all relevant flow packages. | UNCHANGED (not re-probed) |
| B8 | `get_kinhdich_reading` param `ticker` → `code` drift | Confirmed: call with `ticker="VCB"` → validation error. Call with `code="VCB"` → OK. `market-watcher.md` and `bctc-analyst.md` document `ticker`; only `alert-commander.md` correctly documents `code`. | Update `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md`, `digest-predict.md` to `code`. | UNCHANGED |
| B9 | `get_agent_signals` missing required param in docs | Live tool requires `agent: string` (enum). `news-scout.md` docs show no required params. News-scout bootstrap call with `{}` → validation error. | Update `news-scout.md` to show `agent: string` as required. | UNCHANGED |
| **B10** | `get_market_hexagram` — tool not found | `MCP error -32602: Tool get_market_hexagram not found`. Listed in `digest-predict.md`. Called in `weekly.md` Sunday cycle to get `market_hex.hexagram_id` before creating prediction claims. Every Sunday digest fails at this step. | Remove from `digest-predict.md` or implement the tool in mcp-server. If removed: replace with `get_kinhdich_reading(code="^VNINDEX")` or skip the hexagram-keyed prediction block. | **NEW** |

---

## ISSUEs (degraded / empty / slow)

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no_data | `{"error":"no_data","message":"FRED_API_KEY required"}`. `macroIndicatorRefreshJob` last ran 12:13 (success) but ISM still empty — FRED key absent. | Set `FRED_API_KEY` env var in mcp-server container. | UNCHANGED |
| I2 | CafeF RSS + Reuters RSS + Trading Economics (×2) failures | **38 consecutive failures** (↑ from 26 at 12:05Z), never succeeded since server restart. See I2↑ above. | Audit URLs post-restart; TradingEconomics may require API key rotation. | ESCALATED |
| I3 | `get_sector_rotation` 5-day gap | All 16 sectors: `N/A / 5d`, only 1d momentum. `ohlcvDailyAggregatorJob` last ran 2026-06-10 15:00 (3 days ago). | Investigate why `ohlcvDailyAggregatorJob` has not fired since June 10. | UNCHANGED |
| I4 | BDI staleness in `get_supply_chain_exposure` | BDI last updated 2026-04-07 (67+ days old). `commodityTrackerRefreshJob` runs daily (last: 2026-06-13 06:00, success) but does not include BDI. | Add Baltic Dry Index to `commodityTrackerRefreshJob`; or create dedicated shipping-index fetcher. | UNCHANGED |
| I5 | `bctcReparseJob` declining success rate | 181 runs at 82.3% (down from 83.2% at 12:05Z). Currently `running` at probe time. Consistent 18% failure rate. | Review failing tickers in `bctc_vps_queue`; check for layout changes in Q1-2026 reports. | UNCHANGED |
| I6 | Pending feedback + open warnings backlog | `pending_feedback: 53`, `open_warnings: 45 high/critical`. No change since 10:09Z. | system-auditor or ops agent should drain; likely tied to 38 TE/CafeF/Reuters failures each contributing error records. | UNCHANGED |
| **I7-R** | `vn-sbv-fetch` UNHEALTHY (regression) | `get_vps_service_health` 14:05Z: `vn-sbv-fetch: unhealthy, VPS uptime 54m`. Was "RESOLVED" at 12:05Z. Service has restarted at least twice today. Crash-loop pattern. | Add process supervisor (PM2/systemd) restart policy + alert on >2 restarts/hour. | REGRESSION |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null`. `vnIndexDelta: -6.96` works. Affects macro directional analysis in all cowork agents. | Fix delta calculation for commodity fields; store prev-close baseline in macro_indicators table. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live data | Reservoir fill falls back to default 70%. Hydro data source down or geo-blocked. `weatherCheckJob` last success 11:00 UTC. | Check `nchmf.gov.vn` response (rate-limit status shows 184 min last call = working); trace why grid signals don't consume it. | UNCHANGED |
| **N1+N2** | vnstock rate-limit storms: SIS + JSH | Both `vnstock:finance:SIS`/`balance_sheet:SIS` AND `vnstock:finance:JSH`/`balance_sheet:JSH` hitting max-retry exhaustion every cycle. Error logs flood every 15 min from `bctcQueueEnricherJob`. | Add per-ticker exponential back-off in `bctcQueueEnricherJob`; skip tickers with N consecutive "max retries exhausted". | NEW (N2 is new; N1 unchanged) |

---

## IMPROVEMENTs

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation | `get_cascade_metrics`: 2,000+ rule hits, `Eval=0` for ALL 49 rules. `record_signal_outcome` never called from cowork cycle. | Wire `record_signal_outcome` into alert-commander feedback loop after verdict. | UNCHANGED |
| M2 | Alert outcome unknown rate | 686 total alerts, 656 (95.6%) "unknown" verdict. `news_mention`, `macro_deviation`, `foreign_flow`, `ta_oversold`, `ta_bb_breakout_down`, `bctc_overdue` all N/A. Only price alerts get auto-resolved. | Auto-resolve price alerts by comparing alert price vs 5-day close price. | UNCHANGED |
| M3 | `get_foreign_flow` undocumented required param | Tool requires `code: string` (confirmed: `{}` → validation error). No flow docs document this. | Add `code: string (required)` to all relevant flow docs. | UNCHANGED |
| M4 | `run_impact_chain` rate-cut direction | SBV rate reduction → BEARISH for banking (should be BULLISH for NIM expansion). | Add sector override: `monetary_easing → banking: bullish`. | UNCHANGED |
| M5 | `get_sector_rotation` non-watchlist sectors | Returns `gold_mining`, `construction`, `insurance` sectors with no watchlist tickers. Clutters output. | Filter to sectors with ≥1 watchlist ticker. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min duration | 1 run at `avg_duration: 4,735,029ms` (~79 min). Sister to crashed B1 job. Risk of OOM on next monthly run. | Add 30-min timeout guard; paginate vnstock batch calls. | UNCHANGED |

---

## Tool Probe Coverage (this run)

| Tool | Result | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(news-scout)` | ✅ | OK; required `agent_name` param |
| `get_system_status` | ✅ | uptime 6h 10m; 10 unresolved errors |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | commodity deltas null (I8) |
| `get_watchlist` | ✅ | 41 tickers |
| `get_agent_signals({})` | ❌ | missing required `agent` param (B9) |
| `get_agent_signals(news-scout)` | ✅ | no signals — OK |
| `get_pipeline_health` | ✅ | 5 tickers with 0 rows |
| `get_cron_health` | ✅ | B1 still crashed; others healthy |
| `get_vps_proxy_health` | ⚠️ | bctc stale 5+ days (B5) |
| `get_vps_service_health` | ❌ | vn-sbv-fetch unhealthy (I7-R) |
| `get_rate_limit_status` | ✅ | all sources ready; tradingeconomics never called |
| `get_sla_status` | ✅ | all 5 within SLA |
| `get_earnings_calendar` | ✅ | 41 entries; 11 overdue |
| `get_alerts(limit=5)` | ✅ | 5 returned |
| `get_legal_risk_signals` | ✅ | 5 signals (oldest: 2026-05-20) |
| `get_crisis_early_warning` | ✅ | GAS/PLX/VNM reputation warnings |
| `get_supply_chain_exposure` | ⚠️ | BDI data 67 days old (I4) |
| `get_market_hexagram` | ❌ | Tool not found (B10 — NEW) |
| `get_cascade_metrics` | ⚠️ | 2000+ hits, 0 evaluated (M1) |
| `get_kinhdich_reading(ticker=VCB)` | ❌ | wrong param; `code` required (B8) |
| `get_kinhdich_reading(code=VCB)` | ✅ | OK with correct param |
| `get_technical_indicators(VCB)` | ❌ | tier-3, all N/A despite 38 rows (B2) |
| `get_sector_rotation` | ⚠️ | 5d gap N/A (I3) |
| `get_alert_accuracy` | ⚠️ | 95.6% unknown verdicts (M2) |
| `get_signal_effectiveness(7d)` | ⚠️ | 1 signal only, thin data |
| `get_positions` | ✅ | FPT 5000 shares |
| `get_fed_liquidity_spread` | ✅ | EFFR-IORB spread -0.03pp, tier-1 |
| `get_ism_subcomponents` | ❌ | no_data; FRED_API_KEY (I1) |
| `get_macro_calendar(14d)` | ❌ | status: unavailable, tier-4 |
| `get_bctc_full(ticker=FPT)` | ❌ | wrong param; `code` required (B3) |
| `get_bctc_full(code=FPT)` | ✅ | OK; FPT Q1-2026 confidence 81% |
| `list_stored_pdfs` | ✅ | 60 PDFs, newest 2026-06-08 |
| `get_prediction_accuracy(7d)` | ⚠️ | no resolved predictions in window |
| `get_portfolio_risk` | ✅ | FPT VaR -0.1% |
| `generate_market_summary(weekly)` | ✅ | rich output |
| `get_prediction_markets` | ✅ | 1 market (Taiwan/GTA VI) |
| `get_price_history(VCB,5)` | ✅ | 5-day OHLCV returned |
| `task_list_held` | ✅ | 0 locks |
| `task_claim` (schema check) | ⚠️ | `ttl_seconds` min=60 not documented; `task_kind` enum undocumented |
| `get_foreign_flow({})` | ❌ | `code` required, undocumented (M3) |
| `get_insider_signals` | ✅ | VCB: no signals |
| `get_climate_risk_signals` | ✅ | seasonal power risk flagged |
| `get_energy_grid_signals` | ⚠️ | estimated data only (I9) |

---

## Priority Action Items (current state)

**P0 — Critical, blocking cowork agent execution:**
1. **B10**: `get_market_hexagram` missing from server — digest-predict Sunday cycle broken
2. **B1**: `vnstockFundamentalsRefresh` crashed — 5 days, 0 fundamental refreshes
3. **B5**: BCTC VPS pipeline stale — 5 days, 0 new PDFs
4. **I7-R**: `vn-sbv-fetch` crash-loop — SBV FX data delivery unreliable
5. **B2**: `get_technical_indicators` routing broken — all N/A despite pipeline ready

**P1 — Schema drifts breaking live agent calls (all `ticker` → `code`):**
6. **B3**: `get_bctc_full` — 4 tool packages wrong
7. **B8**: `get_kinhdich_reading` — 3 tool packages wrong
8. **B6**: `get_patterns` — market-watcher broken
9. **B7**: `get_sentiment_trend` — unified-agent broken
10. **B9**: `get_agent_signals` — news-scout bootstrap broken

**P2 — Active ISSUEs degrading data quality:**
11. **N1+N2**: SIS + JSH vnstock rate-limit storms — error log flooding every 15 min
12. **I2↑**: 38 failures CafeF/Reuters/TradingEconomics (escalating +12/2h)
13. **I8**: `get_macro_snapshot` commodity deltas null
14. **I1**: `get_ism_subcomponents` no data (FRED_API_KEY missing)

**P3 — Monitor:**
15. **B4**: HNX/UPCOM price sources failing (4 tickers, 0 OHLCV rows)
16. **M6**: `vnstockTradingStatsRefresh` 79-min duration — OOM risk next run

---

*Report generated: 2026-06-13T14:07Z | Prior: docs/agent-memory/health/team-tool-recheck-2026-06-13-1205.md*
