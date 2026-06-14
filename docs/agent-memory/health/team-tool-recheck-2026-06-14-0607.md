# MCP Tool Health Recheck — 2026-06-14T06:07Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime: **30m 42s** ⚠️ (CRASHED AGAIN ~05:33Z)  
**DB:** market.db 274.13 MB, WAL 1.64 MB  
**mcpServerStartup:** last_run 2026-06-14 05:33:35 ✅ (restart confirmed)  
**Probe scope:** 18 tool probes + cron health + source health + VPS health  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-14-0407.md`

---

## Delta vs Prior Report (2026-06-14-0407)

| Status | Count |
|--------|-------|
| WORSENED | 1 (I11 — server crashed AGAIN at ~05:33Z) |
| IMPROVED | 2 (I7 vn-sbv-fetch healthy; N1 VPS news stale false-positive resolved) |
| NEW | 1 (B13 — send_telegram param drift `text`→`message`) |
| UNCHANGED | 11 BUGs + 13 ISSUEs + 7 IMPROVEs |

---

## Summary

| Class | Count | Delta vs 04:07Z |
|-------|-------|-----------------|
| BUG   | 12    | +1 NEW (B13 send_telegram param drift) |
| ISSUE | 15    | 1 worsened (I11 crash again), 2 improved (I7, N1 resolved) |
| IMPROVE | 7  | unchanged |

---

## CHANGED since 2026-06-14-0407

| # | Finding | Class | Evidence | Delta |
|---|---------|-------|----------|-------|
| **I11** | MCP server crashed AGAIN at ~05:33Z | BUG→ISSUE | Uptime at 06:04Z = 30m 42s. At 04:07Z uptime was 4h 45m (stable window). `mcpServerStartup last_run: 2026-06-14 05:33:35` confirms restart. WAL at 1.64 MB (lower than the 3.49 MB seen before checkpoint). This is crash #5+ on June 14. Pattern: crash every 90–120 min despite WAL checkpoint at 04:00Z flushing 3.49 MB → 3.49 MB. Crash may not be WAL-related — investigate Docker OOM / memory leak / reconnect storm. | **WORSENED — crash loop continues; 04:07Z "stable window" was temporary** |
| **I7** | `vn-sbv-fetch` HEALTHY | ISSUE→ ✅ | `get_vps_service_health` at 06:04Z: `vn-sbv-fetch: healthy`. SBV pushes flowing (05:56Z, 05:26Z, 04:56Z ✅). Previously marked UNKNOWN at 04:07Z (probe omitted). | **IMPROVED — sbv VPS service healthy** |
| **N1** | VPS news stale false-positive RESOLVED | IMPROVE→ ✅ | `get_vps_proxy_health` at 06:04Z: `news: stale?=no`. Recent push log: 06:01, 05:45, 05:29, 05:13, 05:00 ✅. Prior 04:07Z report showed `stale=YES` while pushes were flowing — was a threshold miscalibration. | **RESOLVED — false-positive cleared (likely reset on server restart at 05:33Z)** |

---

## BUGs (broken / errors) — 11 total

| # | Tool / Cron | Evidence | Suggested Fix | Delta |
|---|-------------|----------|---------------|-------|
| B1 | `vnstockFundamentalsRefresh` cron CRASHED | `last_status=crashed`, `success_rate=0.0%`, `avg_duration=4036s`, `last_run: 2026-06-08`. 6+ days, zero fundamental data. | Investigate crash log (OOM/vnstock API timeout). Add pagination + 30-min timeout guard. | UNCHANGED |
| B2 | `get_technical_indicators` all N/A | All MA/RSI/MACD/BB fields N/A (source_tier=3). Pre-computed `ta_ohlcv` table exists and is populated (pipeline_health shows RSI14 for all HOSE tickers). Tool bypasses table. Confirmed prior runs. | Route tool to pre-computed `ta_ohlcv` table; raw-calc as fallback only. | UNCHANGED |
| B3 | `get_bctc_full` param drift: `ticker`→`code` | Tool schema requires `code: string`. Agent tool packages document `ticker: string`. Every BCTC lookup from flow docs fails schema validation. | Update all tool packages: replace `ticker` → `code`. | UNCHANGED |
| B4 | HNX/UPCOM all price sources failing | 10 errors in 06:04Z window: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` every ~1 min. 5 watchlist tickers (BDI, DLC, JSH, SIS, VDC) show N/A. Server restart at 05:33Z did NOT fix this. | Diagnose HNX/UPCOM scraper; add UPCOM fallback source. | UNCHANGED |
| B6 | `get_patterns` schema drift | Tool requires `{stockCode, eventKeyword}` (both required). `market-watcher.md` documents `{code}`. Every chart-pattern call fails validation. | Fix `market-watcher.md`: replace `code` with `{stockCode, eventKeyword}`. | UNCHANGED |
| B7 | `get_sentiment_trend` schema drift | Tool requires `stock_code: string`. `unified-agent.md` documents as no-arg. Every call fails. | Add `stock_code: string (required)` to `unified-agent.md`. | UNCHANGED |
| B8 | `get_kinhdich_reading` param drift: `ticker`→`code` | `market-watcher.md`, `bctc-analyst.md`, `unified-agent.md` all document `ticker`. Tool accepts `code`. | Update 3 tool packages: `ticker` → `code`. | UNCHANGED |
| B9 | `get_agent_signals` undocumented required `agent` param | `agent: string` required; `news-scout.md` omits it — calls would fail validation. Confirmed at 06:04Z: probe without `agent` → schema error. | Add `agent: string (required)` to `news-scout.md` and all caller docs. | UNCHANGED |
| B10 | `get_market_hexagram` missing from server | Not in system-map.json tool list; uncallable. Every Sunday digest-predict cycle broken — **today is Sunday, cycle is actively broken.** Fallback not wired. | Implement tool or replace with `get_kinhdich_reading(code="^VNINDEX")` in `digest-predict.md`. | UNCHANGED |
| B11 | `get_market_summary` requires `period` param | Tool requires `period: 'daily'|'weekly'|'monthly'|'quarterly'|'yearly'`. `digest-predict.md` documents as no-arg. | Add `period` (required enum) to `digest-predict.md`. | UNCHANGED |
| B12 | `get_financial_summary` requires `actionCode` param | Tool requires `actionCode: string`. Agent packages document `ticker`. | Document `actionCode` in all tool packages. | UNCHANGED |
| B13 | `send_telegram` param drift: `text`→`message` | **NEW.** Tool requires `message: string`. Many agent flow docs and tool packages document `text: string`. Probe at 06:07Z: `{channel:"bug", text:"..."}` → validation error; `{channel:"bug", message:"..."}` → ✅ sent (message_id: 2820). All agent Telegram sends using `text` param silently fail. | Audit all agent tool packages and flow files: replace `text` → `message` for `send_telegram`. | **NEW** |

---

## ISSUEs — 15 total

| # | Tool / Source | Evidence | Suggested Fix | Delta |
|---|---------------|----------|---------------|-------|
| I1 | `get_ism_subcomponents` no data | `{"error":"no_data"}` — FRED_API_KEY not set. `macroIndicatorRefreshJob` ran 2026-06-13 12:13 but cannot fetch ISM data without key. `get_investment_clock_phase` returns `pmi: null`. | Set `FRED_API_KEY` env var. | UNCHANGED |
| I2 | Reuters RSS + TradingEconomics ×2 degraded | At 06:04Z: 3 consecutive failures each, "Suy giảm", never succeeded in current instance. Failure counter reset by 05:33Z restart; underlying endpoints still broken. CB all [OK] — false-open masking degradation. | Audit RSS endpoint URLs and TE auth headers; tighten CB failure threshold. | UNCHANGED (counter reset; problem persists) |
| I3 | `ohlcv-daily-aggregator` stale | last_run: 2026-06-10. Missed June 11, 12 market days. Feeds `get_technical_indicators`. | Investigate schedule registration post-restart. | UNCHANGED |
| I4 | BDI supply chain data 68+ days stale | `get_supply_chain_exposure`: BDI `1,400 (+0.0%) — 2026-04-07`. Not in commodityTrackerRefreshJob scope. | Add Baltic Dry Index to commodityTrackerRefreshJob. | UNCHANGED |
| I5 | `bctcReparseJob` 80.8% success rate | 182 runs, 80.8%. Near alert floor of 80%. Likely vnstock rate-limit related. | Add per-ticker exponential back-off. | STABLE |
| I6 | `pending_feedback` + `open_warnings` backlog | `pending_feedback: 54`, `open_warnings: 45` at 06:04Z — unchanged over all three reports today. | Triage and drain; schedule a dedicated review cycle. | UNCHANGED |
| I7 | `vn-sbv-fetch` VPS service | HEALTHY at 06:04Z. SBV data flowing. | Monitor. | **IMPROVED** |
| I8 | `get_macro_snapshot` commodity deltas null | `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null`. `vnIndexDelta` computes correctly. | Fix delta calculation for commodity fields. | UNCHANGED |
| I9 | `get_energy_grid_signals` no live hydro data | Not re-probed this run. | Trace hydro data path; weatherCheckJob healthy. | UNCHANGED (assumed) |
| I10 | `wti_crude_usd` stale at $95.5 | Auto-tracked indicator shows `wti_crude_usd: 95.5`. Live Brent $87.33. WTI > Brent by $8.17 is physically impossible — stale/wrong source. | Audit WTI source; add to commodityTrackerRefreshJob. | UNCHANGED |
| I11 | MCP server crash loop (5+ crashes June 14) | Uptime at 06:04Z = 30m 42s. Restart at 05:33Z confirmed. Prior "stable" window (4h45m after 23:18Z restart) ended. WAL checkpoint at 04:00Z did not prevent crash. | Urgent: capture crash log. Profile memory usage over lifecycle. Check Docker OOM killer. | **WORSENED — was "stable" at 04:07Z, crashed again** |
| I12 | `get_bctc_full(code="VCB")` returns empty | VCB ĐÃ NỘP 2026-06-13; bctcPdfPullJob last_run 06:00Z (success); bctcReparseJob last_run 06:00Z (success). BCTC data not surfacing via tool despite pipeline activity. | Check if VCB PDF was pulled + parsed but not indexed by `get_bctc_full`. | UNCHANGED |
| I13 | vnstock rate-limiting (off-market) | Weekend — vn-price-fetch idle, not active. | Add staggered inter-ticker delay. | SETTLED (off-market) |
| I14 | `bctcQueueEnricher` batch-zero — 9 items | At 06:01Z: `0 URLs populated across all 9 item(s)`. JSH, SIS, VDC, VNH, VEA likely still affected (overlaps B4 HNX errors). | Investigate company ID mapping for HNX/UPCOM tickers. | UNCHANGED |
| I15 | BCTC VPS pipeline | bctcPdfPullJob 96%, last_run 06:00Z ✅. bctcReparseJob 80.8%, last_run 06:00Z ✅. | Monitor. | STABLE |

---

## IMPROVEs — 7 total (all unchanged)

| # | Tool | Evidence | Suggested Fix | Delta |
|---|------|----------|---------------|-------|
| M1 | Cascade outcome evaluation dead | 0 evaluated outcomes vs 1,965+ rule hits. `record_signal_outcome` never called. | Wire into alert-commander feedback loop. | UNCHANGED |
| M2 | Alert outcome unknown ~95% | `512 alerts pending`; vast majority unresolved. | Auto-resolve price alerts vs 5-day close. | UNCHANGED |
| M3 | `get_foreign_flow` undocumented required `code` param | Not in flow docs. | Document `code: string (required)` in relevant packages. | UNCHANGED |
| M4 | `run_impact_chain` sector direction error | SBV rate cut → BEARISH banking (should be BULLISH). | Add `monetary_easing → banking: bullish` override. | UNCHANGED |
| M5 | `get_sector_rotation` 1d=5d values | All 16 sectors show identical 1d and 5d % change. Single data-point or averaging bug. | Verify 5d window uses 5 separate close prices. | UNCHANGED |
| M6 | `vnstockTradingStatsRefresh` 79-min run | avg_duration 4,735,029ms. OOM risk; near-identical to vnstockFundamentalsRefresh crash profile. | Add 30-min timeout guard; paginate. | UNCHANGED |
| M7 | `macroIndicatorRefreshJob_FAILTEST` test cron in prod | Listed in `get_cron_health`. | Delete or disable. | UNCHANGED |

---

## Tool Probe Coverage (this run — 18 probes)

| Tool | Result | Notes |
|------|--------|-------|
| `get_system_status` | ⚠️ | HNX B4 errors active; Reuters/TE degraded; uptime 30m (crash) |
| `get_cron_health` | ⚠️ | B1 crashed; I3 ohlcv stale; I5 bctcReparse 80.8%; I11 restart at 05:33Z |
| `get_pipeline_health` | ✅ | HOSE tickers TA-ready; BDI/DLC/JSH/SIS/VDC 0 rows |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ | 20ms; agent_signals + market_context + system_status |
| `get_cycle_bootstrap()` (no args) | ❌ | Schema error: `agent_name` required — confirms schema drift vs empty calls |
| `get_market_snapshot` | ✅ | VN-Index 1791.65 (-0.39%), tier-2 |
| `get_macro_snapshot` | ⚠️ | I8 commodity deltas null; carry data from 2026-06-11 |
| `get_earnings_calendar` | ✅ | 41 tickers; 13 QUÁ HẠN (ACV,BDI,DAG,DLC,GAS,JSH,PLX,PPC,SIS,VDC,VEA,VNH,VNM) |
| `get_watchlist` | ✅ | 41 tickers; 5 N/A prices (B4) |
| `task_list_held` | ✅ | `{"locks":[],"count":0}` — clean state |
| `get_sla_status` | ✅ | All 5 signals within SLA; `foreign_flow: 2705 min` vs SLA 2736 min (borderline) |
| `get_vps_proxy_health` | ✅ | news/sbv/bctc ok; prices last push 2026-06-12 (expected weekend); no stale false-positive |
| `get_vps_service_health` | ✅ | 3 healthy (bctc,news,sbv), 2 idle (price,foreign — market closed) |
| `get_rate_limit_status` | ✅ | 11 sources ready; tradingeconomics.com "Chưa gọi" (not attempted) |
| `get_agent_signals(agent="news-scout")` | ✅ | 2 signals returned |
| `get_agent_signals()` (no args) | ❌ | Schema error: `agent` required — B9 confirmed |
| `get_market_context` | ✅ | 4ms; returns watchlist+macro+alerts+analysis |
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ | 4ms; empty agent_signals (expected: no pending signals for news-scout) |
| `send_telegram(channel="bug", text=...)` | ❌ | Schema error: `message` required, not `text` — B13 confirmed |
| `send_telegram(channel="bug", message=...)` | ✅ | Sent (message_id: 2820) |

---

## Priority Action Items (P0 = fire now)

| Priority | Item | Owner | Status |
|----------|------|-------|--------|
| **P0** | Capture + diagnose MCP server crash log — 5+ crashes June 14, crash loop continuing | ops / dev-mcp-server | OPEN |
| **P0** | `get_market_hexagram` missing — digest-predict Sunday cycle broken **right now** | dev-mcp-server | OPEN |
| **P0** | HNX/UPCOM price sources ALL failing — 5 watchlist tickers have no price data | dev-stock-price | OPEN |
| **P1** | `vnstockFundamentalsRefresh` crash — 6+ days no fundamental refresh | dev-stock-price | OPEN |
| **P1** | Fix 8 schema-drift BUGs (B2 ta_ohlcv routing, B3/B8/B12 ticker→code, B6 patterns, B7 sentiment, B9 agent_signals, B11 market_summary period) | dev-mcp-server | OPEN |
| **P1** | Reuters RSS + Trading Economics — investigate endpoint; never succeeded since last restart | dev-mainserver-crawls | OPEN |
| **P1** | `ohlcv-daily-aggregator` 4-day stale — TA feeds starved | dev-technical-analysis | OPEN |
| **P2** | `get_bctc_full(code="VCB")` empty despite filed + parsed BCTC | dev-pdf-extractor | OPEN |
| **P2** | `get_ism_subcomponents` — set FRED_API_KEY | ops | OPEN |
| **P2** | `wti_crude_usd` stale $95.5 (impossible vs Brent $87.33) | dev-macro-indicators | OPEN |
| **P1** | `send_telegram` param drift `text`→`message` — all agent Telegram sends using `text` silently fail | dev-mcp-server | **NEW** |
| **P2** | Drain 45 open_warnings + 54 pending_feedback | system-auditor / po | OPEN |

---

*Generated: 2026-06-14T06:07Z | Probe window: 06:04–06:07Z | VN market: CLOSED (Sunday)*
