# MCP Tool Health Recheck — 2026-06-13T16:04Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: ~8h 10m (restarted ~08:00 UTC)  
**DB:** market.db 273.12 MB, WAL 9.17 MB  
**Probe scope:** 30+ direct tool probes (full sweep)  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-13-1407.md`

---

## Delta vs Prior Report (14:07Z)

| Status | Count |
|--------|-------|
| NEW findings | 1 |
| ESCALATED (unchanged bug, worsening metric) | 2 |
| RESOLVED (temporary) | 1 |
| UNCHANGED | 27 |

---

## Summary

| Class | Count | Delta vs 14:07Z |
|-------|-------|-----------------|
| BUG   | 10    | unchanged       |
| ISSUE | 10    | +1 new (N3), I2↑↑ cap hit, I7 temp-resolved |
| IMPROVE | 6  | unchanged       |

---

## NEW / CHANGED since 14:07Z

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **N3** | `bctcQueueEnricherJob` rate-limit storm rotated to VHM + D2D | ISSUE | System errors at 16:02–16:03Z: `vnstock:finance:VHM RATE_LIMITED — max retries exhausted`; `vnstock:balance_sheet:VHM RATE_LIMITED`; `vnstock:stats:D2D RATE_LIMITED — max retries exhausted`. Confirms the job is cycling through tickers alphabetically; previously SIS+JSH (N1+N2 at 14:07Z). Same root cause: no per-ticker exponential back-off in `bctcQueueEnricherJob`. | **NEW** (same class as N1/N2, different tickers) |
| **I2↑↑** | CafeF/Reuters/TradingEconomics failure counter hit 50-cap | ISSUE | `get_system_status` 16:03Z: CafeF RSS 50 failures, Reuters RSS 50, Trading Economics ×2 both 50 — all capped at 50 (server's max counter). These sources have NEVER succeeded since server restart ~08:00Z (8h running). Rate: counter capped so true count unknown but ≥50/8h. Note: circuit breakers show [OK]/0 failures — the failures are at the RSS-fetch layer, not HTTP level. cafef.vn domain is reachable per `get_rate_limit_status`. | **ESCALATED** (cap hit; was 38 at 14:07Z) |
| **I7-temp** | `vn-sbv-fetch` healthy again at 16:03Z | ISSUE | `get_vps_service_health` 16:03Z: `vn-sbv-fetch: healthy`. Was UNHEALTHY at 14:07Z (I7-R). Same temporary recovery pattern as 12:05Z. The service restarts and becomes healthy for 1–2h before crashing again. Root cause is a crash-loop — NOT fixed. | **TEMPORARILY RESOLVED** (expect regression within 2h per pattern) |
| **I6↑** | `pending_feedback` rising: 62 items (was 53 at 14:07Z) | ISSUE | `pending_feedback: 62` at 16:03Z. Rate: +9/2h (+53 since server restart at ~08:00Z / 8h = +6.6/h). Tied to 50-cap RSS failures generating unresolved error records each cycle. `open_warnings: 45` unchanged. | **ESCALATED** |

---

## BUGs (broken / errors) — all UNCHANGED vs 14:07Z

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron crashed | `last_status: crashed`, `success_rate: 0.0%`, `avg_duration: 4036s (~67 min)`, last_run: 2026-06-08. **5 days no fundamental refresh.** | Investigate crash log; likely OOM or vnstock API timeout. Reset/redeploy with pagination + 30min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` routing broken | `get_technical_indicators(code="VCB")` → `source_tier:3`, ALL N/A (MA/RSI/MACD/BB). `get_pipeline_health` confirms VCB has 38 rows with RSI14=52.9. Tool bypasses pre-computed TA pipeline. | Route tool to pre-computed TA service values when pipeline `TA ready`. | UNCHANGED |
| B3 | `get_bctc_full` param `ticker` → `code` drift | Call with `ticker="FPT"` → `Required: code (string)` validation error. All 4 agent tool packages document `ticker: string`; live tool requires `code: string`. | Update all 4 packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM price sources failing | `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` at 16:02Z. 5 tickers (BDI, DLC, JSH, SIS, VDC) still have 0 OHLCV rows in pipeline_health. | Diagnose HNX scraper; add UPCOM fallback. | UNCHANGED |
| B5 | BCTC VPS pipeline stale | `bctc` proxy last push `2026-06-08 00:30:03` (5+ days, ~135+ hours). `vps_proxy_health` still shows STALE. 0 new PDFs. | SSH into VPS; check `vn-bctc-fetch` logs. Add functional health check (item count diff) beyond TCP ping. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{ stockCode: string, eventKeyword: string }`. `market-watcher.md` documents `{ code: string }`. Chart-pattern step in market-watcher cycle always fails. | Fix `market-watcher.md` params to `{stockCode, eventKeyword}`. | UNCHANGED (not re-probed) |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. Flow docs document as no-arg. Unified-agent synthesis step calling `{}` fails validation. | Add `stock_code: string (required)` to all relevant flow packages. | UNCHANGED (not re-probed) |
| B8 | `get_kinhdich_reading` param `ticker` → `code` drift | Call with `ticker="VCB"` → `Required: code (string)` validation error (confirmed this run). `market-watcher.md` and `bctc-analyst.md` document `ticker`. | Update `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md`, `digest-predict.md` to `code`. | UNCHANGED |
| B9 | `get_agent_signals` missing required param in docs | Call with `{}` → `Required: agent (string)` validation error (confirmed this run). `news-scout.md` docs show no required params. | Update `news-scout.md` to show `agent: string` as required. | UNCHANGED |
| B10 | `get_market_hexagram` — tool not found | `MCP error -32602: Tool get_market_hexagram not found` (confirmed this run). Listed in `digest-predict.md`. Called in `weekly.md` Sunday cycle. Every Sunday digest fails at this step. | Remove from `digest-predict.md` or implement the tool. Fallback: `get_kinhdich_reading(code="^VNINDEX")`. | UNCHANGED |

---

## ISSUEs (degraded / empty / slow)

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no_data | `{"error":"no_data","message":"FRED_API_KEY required"}`. `macroIndicatorRefreshJob` last ran 12:13 (success) but ISM still empty — FRED key absent. | Set `FRED_API_KEY` env var in mcp-server container. | UNCHANGED |
| I2 | CafeF RSS + Reuters RSS + Trading Economics (×2) failures | **50 consecutive failures (capped)** — never succeeded since server restart ~08:00Z. See I2↑↑ above. Note: `get_rate_limit_status` shows cafef.vn domain reachable (called 4 min ago) — failure is at RSS feed URL layer, not HTTP. | Audit RSS endpoint URLs post-restart; TradingEconomics may require API key rotation; check if RSS paths changed. | ESCALATED (cap hit) |
| I3 | `get_sector_rotation` 5-day gap | All 16 sectors: `N/A / 5d`, only 1d momentum. `ohlcv-daily-aggregator` last_run: 2026-06-10 15:00 (3 days ago). | Investigate why `ohlcvDailyAggregatorJob` has not fired since June 10. | UNCHANGED |
| I4 | BDI staleness in `get_supply_chain_exposure` | BDI last updated 2026-04-07 (67+ days old, confirmed 16:04Z). `commodityTrackerRefreshJob` runs daily (last: 2026-06-13 06:00, success) but does not include BDI. | Add Baltic Dry Index to `commodityTrackerRefreshJob`; or create dedicated shipping-index fetcher. | UNCHANGED |
| I5 | `bctcReparseJob` declining success rate | 182 runs at 83.0% (slightly up from 82.3% at 14:07Z — marginal improvement, still ~17% failure floor). Currently running normally. | Review failing tickers in `bctc_vps_queue`; check for layout changes in Q1-2026 reports. | STABLE (marginal +0.7pp; monitor) |
| I6 | `pending_feedback` escalating backlog | `pending_feedback: 62` (was 53 at 14:07Z). Rising ~4.5 items/hour since server restart. `open_warnings: 45` unchanged. Linked to 50-cap RSS failures generating unresolved error records. | Drain feedback queue; fix I2 RSS failures to halt new error generation. | ESCALATED |
| I7 | `vn-sbv-fetch` crash-loop (temporarily resolved) | `get_vps_service_health` 16:03Z: healthy. Was UNHEALTHY at 14:07Z. Pattern: service restarts, works 1–2h, crashes. Root cause unresolved — next crash expected within 2h. | Add process supervisor (PM2/systemd) restart policy + alert on >2 restarts/hour. | TEMP-RESOLVED (crash-loop continues) |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null` (confirmed 16:03Z). `vnIndexDelta: -6.96` works. Affects macro directional analysis in all cowork agents. | Fix delta calculation for commodity fields; store prev-close baseline in macro_indicators table. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live data | Reservoir fill falls back to default 70%. `weatherCheckJob` last success 11:00 UTC (ran OK). Hydro data source not being consumed by grid signals. | Trace why `weatherCheckJob` success doesn't populate grid signals; check hydro endpoint response parser. | UNCHANGED |
| N1+N2+N3 | vnstock rate-limit storms: SIS + JSH + VHM + D2D | At 14:07Z: SIS and JSH hitting max-retry exhaustion. At 16:03Z: VHM and D2D now hitting rate limits (SIS/JSH apparently backed off). Confirmed: `vnstock:finance:VHM`, `vnstock:stats:D2D` both showing "max retries exhausted" in system_status. Root: `bctcQueueEnricherJob` cycles tickers without per-ticker back-off — now affecting 4+ tickers total. Error logs flood every 15 min. | Add per-ticker exponential back-off in `bctcQueueEnricherJob`; skip tickers with N consecutive "max retries exhausted". | N3 NEW; N1/N2 partially abated (SIS/JSH backoff'd) |

---

## IMPROVEMENTs — all UNCHANGED

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation | `get_cascade_metrics`: 2,000+ rule hits, `Eval=0` for ALL 49 rules. `record_signal_outcome` never called from cowork cycle. | Wire `record_signal_outcome` into alert-commander feedback loop after verdict. | UNCHANGED |
| M2 | Alert outcome unknown rate | 686 total alerts, 656 (95.6%) "unknown" verdict. Price alerts only auto-resolved type. | Auto-resolve price alerts by comparing alert price vs 5-day close price. | UNCHANGED |
| M3 | `get_foreign_flow` undocumented required param | Tool requires `code: string` (confirmed: `{}` → validation error). No flow docs document this. | Add `code: string (required)` to all relevant flow docs. | UNCHANGED |
| M4 | `run_impact_chain` rate-cut direction | SBV rate reduction → BEARISH for banking (should be BULLISH for NIM expansion). | Add sector override: `monetary_easing → banking: bullish`. | UNCHANGED |
| M5 | `get_sector_rotation` non-watchlist sectors | Returns `gold_mining`, `construction`, `insurance` sectors with no watchlist tickers. Clutters output. | Filter to sectors with ≥1 watchlist ticker. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min duration | 1 run at `avg_duration: 4,735,029ms` (~79 min). Sister to crashed B1 job. Risk of OOM on next monthly run. | Add 30-min timeout guard; paginate vnstock batch calls. | UNCHANGED |

---

## Tool Probe Coverage (this run)

| Tool | Result | Notes |
|------|--------|-------|
| `get_system_status` | ✅ | uptime 8h 10m; 10 unresolved errors; I2/I6 escalated |
| `get_cron_health` | ✅ | B1 still crashed; ohlcv-aggregator stale 3d; all others healthy |
| `get_vps_service_health` | ⚠️ | vn-sbv-fetch healthy (temp-resolved I7); bctc healthy (TCP only) |
| `get_vps_proxy_health` | ❌ | bctc stale 5+ days (B5 unchanged) |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | commodity deltas null (I8 unchanged) |
| `get_pipeline_health` | ⚠️ | 5 tickers with 0 rows (B4); VCB 38 rows confirmed |
| `get_technical_indicators(VCB)` | ❌ | tier-3, all N/A despite 38 rows (B2 unchanged) |
| `get_cycle_bootstrap(news-scout)` | ✅ | OK; 41 tickers; 2 open alerts |
| `get_agent_signals(news-scout)` | ✅ | no signals — OK |
| `get_agent_signals({})` | ❌ | required `agent` param missing (B9 unchanged) |
| `get_sector_rotation` | ⚠️ | all sectors N/A/5d (I3 unchanged) |
| `get_ism_subcomponents` | ❌ | FRED_API_KEY missing (I1 unchanged) |
| `get_supply_chain_exposure` | ⚠️ | BDI 67+ days old (I4 unchanged) |
| `get_rate_limit_status` | ✅ | all 14 sources ready; tradingeconomics.com never called (circuit breaker OK) |
| `get_market_hexagram` | ❌ | Tool not found (B10 unchanged) |
| `get_bctc_full(ticker=FPT)` | ❌ | param must be `code`, not `ticker` (B3 unchanged) |
| `get_kinhdich_reading(ticker=VCB)` | ❌ | param must be `code`, not `ticker` (B8 unchanged) |

---

## Priority Action Items (unchanged from 14:07Z — no new resolutions)

**P0 — Critical, blocking cowork agent execution:**
1. **B1**: `vnstockFundamentalsRefresh` crashed — 5 days, 0 fundamental refreshes
2. **B5**: BCTC VPS pipeline stale — 5+ days, 0 new PDFs
3. **B10**: `get_market_hexagram` missing from server — digest-predict Sunday cycle broken
4. **I7**: `vn-sbv-fetch` crash-loop — temporarily healthy; next crash expected within 2h
5. **B2**: `get_technical_indicators` routing broken — all N/A despite pipeline ready

**P1 — Schema drifts breaking live agent calls:**
6. **B3**: `get_bctc_full` — 4 tool packages use wrong `ticker` param
7. **B8**: `get_kinhdich_reading` — 3 tool packages use wrong `ticker` param
8. **B6**: `get_patterns` — market-watcher broken (`code` vs `{stockCode, eventKeyword}`)
9. **B7**: `get_sentiment_trend` — unified-agent broken (no-arg vs `stock_code` required)
10. **B9**: `get_agent_signals` — news-scout bootstrap broken (undocumented required `agent` param)

**P2 — Active ISSUEs degrading data quality:**
11. **N1+N2+N3**: vnstock rate-limit storms (SIS/JSH/VHM/D2D) — error log flooding every 15 min
12. **I2↑↑**: 50-cap CafeF/Reuters/TradingEconomics failures — RSS feed layer broken since server restart
13. **I6↑**: pending_feedback 62 and rising (+4.5/h) — linked to I2 RSS failures
14. **I8**: `get_macro_snapshot` commodity deltas null
15. **I1**: `get_ism_subcomponents` no data (FRED_API_KEY missing)
16. **I3**: `ohlcvDailyAggregatorJob` not fired since 2026-06-10 — 5d gap in sector rotation

**P3 — Monitor:**
17. **B4**: HNX/UPCOM price sources failing (5 tickers, 0 OHLCV rows)
18. **M6**: `vnstockTradingStatsRefresh` 79-min duration — OOM risk next run

---

*Report generated: 2026-06-13T16:04Z | Prior: docs/agent-memory/health/team-tool-recheck-2026-06-13-1407.md*
