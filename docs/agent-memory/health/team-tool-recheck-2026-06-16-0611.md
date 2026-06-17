# Team MCP Tool Health Recheck — 2026-06-16 06:11 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-16 06:03–06:11 UTC (VN market OPEN — 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-16-0406.md` (2h 05min delta)
**Method:** Read-only smoke calls per tool + caller-surface verification per STEP 3b/3c. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — uptime ~22m at probe start (restarted 05:41:17 UTC); Telegram env SET |
| VN trading window | **OPEN** (02:00–08:59 UTC) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC VPS push dead | `get_vps_proxy_health`: bctc `STALE, last push 2026-06-13 23:45:12, 0 pushes/24h`; `get_sla_status`: bctc **614min/120min CRITICAL** (was 489/120 at 04:06 — +125min in 2h) | **ONGOING, WORSENED** (+125min; now >58h dead) |
| BUG-3 | `post_agent_signal` schema drift (system-auditor) | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: `from_agent`, `to_agent`, `signal_type`, `payload` — confirmed; system-auditor flow L193/L482/L509 verified still wrong | **ONGOING, UNCHANGED** |
| BUG-NEW-3 | `bctcReparseJob` at alert threshold | `get_cron_health`: `success_rate=0.81 (80.6%)`, `total_runs=175`, `last_run=2026-06-16 05:41:47 success` — rate unchanged; one new success run but rate stable | **ONGOING, UNCHANGED** |
| BUG-NEW-4 | `get_foreign_flow` no-args fail | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)`. `docs/agents/fb-market-poster/flow/main.md:78` read this cycle — still `arguments={}` | **ONGOING, UNCHANGED** |
| BUG-NEW-5 | `get_ticker_intelligence` no-args fail | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)`. `docs/agents/fb-market-poster/flow/main.md:81` read this cycle — still `arguments={}` | **ONGOING, UNCHANGED** |
| ISSUE-1 | Server restart rate | `get_cron_health`: `mcpServerStartup total_runs=35` (was 33 at 04:06 — +2 restarts in ~2h) | **WORSENED** (+2 in 2h; 35/7d = 5.0/day) |
| ISSUE-2 | WTI crude inverted vs Brent | `get_system_status`: `wti_crude_usd=95.5`, `brent_crude_usd=82.75` — identical inversion ($12.75 spread) | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters RSS + Trading Economics never succeed | `get_system_status` (session 22m): Reuters RSS **5 consecutive failures**/never; TE ×2 **5 failures**/never — consistent ~11–13 failures/hour rate across all sessions | **ONGOING, UNCHANGED** |
| ISSUE-4 | pushPrices zero_ohlc rejections at market open | `get_system_status` at 06:03–06:11: only `foreign-flow-job` entries; no zero_ohlc errors | **STILL RESOLVED** (runtime-side) — see BUG-NEW-6 for TA side-effect |
| ISSUE-5 | VPS health endpoint false "unhealthy" | `get_vps_proxy_health`: prices/news/sbv/foreign-flow pushing OK. VPS proxy active. | **STILL RESOLVED** |
| ISSUE-6 | `foreign-flow-job` internal fallback exhaustion | `get_system_status` at 06:01–06:03: `[foreign-flow-job] fallback activated` + `all fallbacks exhausted` × 2 consecutive minutes. `get_sla_status`: **foreign_flow 235/10min CRITICAL BREACHED** (new this cycle — was missing from 04:06 report) | **WORSENED** (SLA now breached, 235/10min) |
| IMPROVE-1 | `get_cycle_bootstrap` dead enum values | Schema still includes `financial-analyst`, `report-analyzer` (no new agents with these names) | **ONGOING, UNCHANGED** |
| IMPROVE-2 | 5 dark tickers 0 OHLCV rows | `get_cron_health` `bctcPdfPullJob` + pipeline not re-probed this cycle; 5 dark tickers unchanged per prior cycle | **ONGOING, ASSUMED UNCHANGED** |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift | `get_cron_health`: last_run=2026-06-15 12:13:01 UTC; system-map still says `"19:13 UTC daily"` | **ONGOING, UNCHANGED** |
| IMPROVE-4 | `get_sla_status` BCTC threshold mismatch | `get_sla_status` threshold: 120 min; system-map out-of-window: 168h — divergence confirmed | **ONGOING, UNCHANGED** |
| IMPROVE-5 | Tool docs use `ticker` param, live uses `code` | 0 runtime callers affected (docs/examples only) | **ONGOING, UNCHANGED** |
| IMPROVE-6 | VEA enricher noise | `get_system_status`: bctcQueueEnricher WARN "0 URLs found for VEA" at 06:01 UTC | **ONGOING, UNCHANGED** |
| IMPROVE-7 | Off-hours HNX/UPCOM error log noise | Market OPEN at probe time — not observable | **NOT APPLICABLE** |

---

## STEP 3c — Resolved Findings

| ID | Finding | Resolution proof |
|---|---|---|
| ISSUE-4 | pushPrices zero_ohlc market-open rejections | `get_system_status` at 06:03–06:11: no zero_ohlc entries in error log — resolved (runtime error cleared). NOTE: TA side-effect persists as BUG-NEW-6 |
| ISSUE-5 | VPS health endpoint false "unhealthy" | VPS proxy health shows all services delivering data — unchanged since 04:06 resolution |

---

## NEW Findings This Cycle

### BUG-NEW-6 (NEW) — TA alert contamination at market open: price=0, RSI 3–10 false signals in bus

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence | `get_cycle_bootstrap` OPEN ALERTS at 02:15 UTC: VCB `RSI(14)=3.6`, VPB `RSI(14)=5.3`, VCI `RSI(14)=5.8`, VRE `RSI(14)=9.8`, SSI `RSI(14)=5.7`; BB breakout alerts show `"giá 0 dưới BB dưới X"` for VRE/VPB/VCI/VCB/TCH/SSI/PPC — price=0 |
| Contradiction | `get_technical_indicators` at 06:06 UTC: VCB RSI=46.7, VPB RSI=45.2, VRE RSI=40.9 — all normal. The 02:15 RSI values are physically impossible for these stocks |
| Root cause | TA alert scan ran at ~02:15 UTC (15 min after market open) using zero-OHLCV data before the `pushPrices` unit guard rejected the bad rows. The scan stored false `ta_oversold` + `ta_bb_breakout_down` alerts to the DB; unit guard (which runs AFTER the TA scan) cannot retroactively remove stored alerts |
| Impact | All cowork agents reading `get_cycle_bootstrap` see 12 false WARNING alerts (7 stocks) in OPEN ALERTS section; alert-commander may route false oversold signals to MARKET channel; agents may act on them |
| Caller-surface | `grep "get_cycle_bootstrap" docs/agents/*/flow/` → all cowork agents (market-watcher, news-scout, unified-agent, bctc-analyst, alert-commander, digest-predict) bootstrap with this call; estimated **6+ agents affected per cycle** |
| Fix | Add 2–5 min market-open grace period to `alertScanParallelJob` (skip TA scan for first 5 min post-02:00 UTC); OR gate TA scan on `unit_guard_passed=true` flag before storing alert; OR add DB cleanup step to delete zero-price TA alerts after unit guard runs |

---

### ISSUE-7 (NEW) — `get_ism_subcomponents` silent data gap: FRED_API_KEY not configured

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)"}` |
| macroIndicatorRefreshJob | `get_cron_health`: `last_run=2026-06-15 12:13:01 success_rate=1.00` — job succeeds but silently skips ISM when FRED_API_KEY absent |
| Caller-surface | `grep "get_ism_subcomponents" docs/agents/tools/package/` → **3 agent packages** explicitly list this tool: `news-scout.md`, `bctc-analyst.md`, `unified-agent.md`. All COC/macro chain steps that call this receive empty error response |
| Impact | ISM Manufacturing PMI regime signals unavailable; news-scout COC chain, bctc-analyst macro layer, unified-agent morning dish all read `no_data` silently |
| Fix | Option A: Configure `FRED_API_KEY` env var in mcp-server container. Option B: Register tool with explicit `available: false` note and have callers skip gracefully. Option C: Populate ISM data from alternative public source (BEA, Yahoo Finance macro) |

---

### ISSUE-8 (NEW) — `get_sector_rotation` 5-day trend: N/A for all 16 sectors

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_sector_rotation({})` → all 16 sectors show `"N/A / 5d"` with note: `"chỉ có dữ liệu 1 ngày — chưa đủ 5 phiên giao dịch"` (only 1 day, need 5 sessions) |
| Root cause | The sector rotation calculator reads `stored_prices/market_prices` snapshot table which only retains today's prices; multi-day sector performance requires historical rows not present in this table |
| Caller-surface | `market-watcher/flow/cycle.md` Step 2: `get_sector_rotation()` for sector momentum analysis; Step 2 post-processing uses sector leaders for hot_money_concentration detection |
| Impact | Market-watcher cannot compute 5-day relative sector rotation; sector momentum signals degraded to 1-day view; `hot_money_concentration` flag may be unreliable |
| Note | May be a Monday-specific issue (weekend gap) or persistent depending on snapshot retention policy |
| Fix | Persist daily sector aggregate snapshots (1-row-per-sector-per-date) to a dedicated `sector_daily_summary` table; sector rotation calculator reads from this table for multi-day trend |

---

### ISSUE-9 (NEW) — `get_supply_chain_exposure` BDI data stale 70+ days

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_supply_chain_exposure({})` → `"BDI: 1,400 (+0.0%) - 2026-04-07"` — Baltic Dry Index last updated April 7 (70+ days ago) |
| Impact | Supply chain anomaly detection based on BDI shipping rates is degraded; BDI signal assumed flat since April even if significant moves occurred (e.g., Red Sea disruptions, China trade shifts) |
| Caller-surface | `market-watcher/flow/cycle.md` Step 2 calls `get_supply_chain_exposure()` each cycle; used to flag supply chain disruption signals |
| Fix | Verify BDI data source in `dev-mainserver-crawls` or VPS crawl; check if the BDI fetch job (`deepFetchMainJob`) is correctly scraping the BDI endpoint |

---

## ACTIVE FINDINGS (all re-confirmed this cycle unless noted)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). Weekday-only — next fire Mon 08:30 UTC |
| Downstream | `vnstock_trading_stats` table stale; `get_sector_comparison`, `get_market_cap`, `get_company_profile` degraded |
| Fix | Add `AbortSignal.timeout(60_000)` per-ticker + job-level 600s hard cap; investigate which ticker causes crash |

---

### BUG-2 (ONGOING, WORSENED) — BCTC VPS push dead: 614/120min SLA CRITICAL (>58h since last push)

| Field | Value |
|---|---|
| VPS evidence | `get_vps_proxy_health`: `bctc | 2026-06-13 23:45:12 | 0 pushes/24h | STALE YES` |
| SLA | `get_sla_status`: `bctc 614min / 120min → CRITICAL BREACHED` (+125min since 04:06 cycle) |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — service up but scraper producing 0 results |
| Calendar | `get_earnings_calendar`: 13 tickers QUÁ HẠN (ACV/BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) — no BCTC data since 2026-06-13 |
| Caller-surface | bctc-analyst every cycle; refine_bctc_md; bctcQueueEnricherJob |
| Fix | Run `trigger_bctc_vps_fetch`; SSH-probe VPS `curl /proxy/bctc-discover/<ticker>` — likely scraper format change or geo-block on cafef.vn BCTC PDF links |

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor 3 emit sites broken

| Field | Value |
|---|---|
| Live schema | Required: `from_agent (string)`, `to_agent (string)`, `signal_type (enum: urgent_news|price_anomaly|cross_validate|...)`, `payload (object)` |
| Flow mismatch | `docs/agents/system-auditor/flow/main.md` L193 (`type:"data_stale"`), L482 (`type:"db_integrity_breach"`), L509 (`type:"system_health_report"`) — wrong schema (no from_agent/to_agent/signal_type/payload) |
| Re-probe proof | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: from_agent, to_agent, signal_type, payload — confirmed this cycle |
| Impact | All infrastructure anomaly signals from system-auditor fail silently; signal_queue never populated by infra events |
| Fix | Rewrite 3 emit blocks with: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}` |

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at alert threshold: 80.6% (threshold: <80% fires Telegram)

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `success_rate=0.81 (80.6%)`, `total_runs=175`, `last_run=2026-06-16 05:41:47 success` |
| Note | One failure drives rate below 80% → `cronHealthAlertJob` fires BUG Telegram. Exacerbated by BUG-2 (no new PDFs for >58h) |

---

### BUG-NEW-4 (ONGOING) — `get_foreign_flow` no-args: fb-market-poster L78 fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)` — confirmed this cycle |
| Caller | `docs/agents/fb-market-poster/flow/main.md:78` → `call_tool(server="vn-market", tool="get_foreign_flow", arguments={})` — **1 confirmed broken caller** |
| Fix | Replace L78 with `get_market_foreign_flow(arguments={})` (no required args, returns market-wide net flow) |

---

### BUG-NEW-5 (ONGOING) — `get_ticker_intelligence` no-args: fb-market-poster L81 fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)` — confirmed this cycle |
| Caller | `docs/agents/fb-market-poster/flow/main.md:81` → `call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={})` — **1 confirmed broken caller** |
| Fix | Replace L81 with `get_market_snapshot(arguments={})` for market-wide movers, or per-ticker loop |

---

### BUG-NEW-6 (NEW) — TA alert contamination at market open

See NEW Findings section above.

---

## Issues (degraded, not broken)

### ISSUE-1 (WORSENED) — Server restart rate: 35 in 7 days (+2 since 04:06 cycle)

| Field | Value |
|---|---|
| Evidence | `mcpServerStartup total_runs=35` (was 33 at 04:06) — 5.0/day rate |
| Note | Last restart at 05:41:17 UTC (session uptime only 22m at probe start); CB counters reset per restart |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $82.75 — $12.75 inversion

| Field | Value |
|---|---|
| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`, `brent_crude_usd=82.75` |
| Impact | Historical WTI series reads wrong; live macro snapshot may partially compensate |

---

### ISSUE-3 (ONGOING) — Reuters RSS + Trading Economics: persistent 5+ failures/session, ~11/hour

| Field | Value |
|---|---|
| Evidence | `get_system_status` (session 22m): Reuters RSS 5 failures/never; TE ×2 5 failures/never |
| Rate | Consistent ~11 failures/hour per source across all sessions since at least 2026-06-13 |
| Impact | Missing international news feed; missing TE macro indicators (CPI, GDP forecasts) |

---

### ISSUE-6 (WORSENED) — `foreign-flow-job` internal fallback exhaustion + SLA CRITICAL

| Field | Value |
|---|---|
| Evidence | `get_system_status` 06:01–06:03: `[foreign-flow-job] fallback activated` + `all fallbacks exhausted` × 2 min |
| SLA breach | `get_sla_status`: `foreign_flow 235min / 10min → CRITICAL BREACHED` (new — not in 04:06 report) |
| VPS push | `get_vps_proxy_health`: foreign-flow 101–102 items pushed every ~30s — **push pipeline healthy** |
| Note | `get_foreign_flow({code:"VCB"})` returns data from DB (push-path); the SLA measures internal poll path. Agents can still read per-ticker foreign flow from DB. `foreignFlowFetcherJob success_rate=1.00` (push receiver OK) |
| Fix | Retire the internal `foreign-flow-job` poll; rely exclusively on VPS push pipeline; update `get_sla_status` foreign_flow metric to measure DB data age, not internal poll freshness |

---

### ISSUE-7, ISSUE-8, ISSUE-9 (NEW)

See NEW Findings section above.

---

## Improvements (non-blocking)

| ID | Finding | Caller-surface | Fix |
|---|---|---|---|
| IMPROVE-1 | `get_cycle_bootstrap` enum retains dead values: `financial-analyst`, `report-analyzer` | 0 active callers | Remove from Zod enum in tool registration |
| IMPROVE-2 | 5 watchlist tickers with 0 OHLCV rows: BDI/DLC/JSH/SIS/VDC — TA silent for 12% of watchlist | pipeline health | Trigger OHLCV backfill or remove from watchlist |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift: system-map says `"19:13 UTC"`, cron runs at 12:13 UTC | `docs/data/system-map.json` | Fix schedule field |
| IMPROVE-4 | `get_sla_status` BCTC threshold 120 min vs system-map 168h out-of-window | `get_sla_status({})` | Align SLA threshold |
| IMPROVE-5 | Tool docs `get_technical_indicators.md` + `get_price_history.md` use `ticker` param; live API uses `code` | 0 runtime callers | Fix param name in list docs |
| IMPROVE-6 | VEA (active=false in system-map) still in earnings calendar as QUÁ HẠN + processed by bctcQueueEnricher (WARN every cycle) | enricher reads DB watchlist | Purge VEA from DB watchlist OR add `active=false` filter to enricher query |
| IMPROVE-7 | Off-hours HNX/UPCOM price fetch generates ERROR log entries per 15-min cycle | `intelligenceCycleJob` 24/7 | Add market-hours gate or downgrade to DEBUG |

---

## Full Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_system_status` | ✅ OK (issues logged) | 16 CBs OK; foreign-flow-job fallback 2+/min; Reuters/TE 5 failures in 22min session |
| `get_cycle_bootstrap` | ✅ OK (stale alerts) | Returns valid data; false TA alerts (price=0, RSI 3-10) from 02:15 in OPEN ALERTS — BUG-NEW-6 |
| `get_market_snapshot` | ✅ OK | VN-Index 1804.25, source_tier=2 |
| `get_macro_snapshot` | ✅ OK | Carry NEUTRAL, yield CHEAP (spread 2.05pp), all source_tier=1–2 |
| `get_price_history` | ✅ OK | VCB 22 rows, 30d history returned correctly |
| `get_technical_indicators` | ✅ OK | VCB RSI=46.7, MA5/MA20 present; MA50=N/A (< 50 candles) |
| `get_sector_rotation` | ⚠️ DEGRADED | All 5-day trends N/A; 1-day data only — ISSUE-8 |
| `get_market_foreign_flow` | ✅ OK | Market-wide net sell -740k; top buyers/sellers present |
| `get_foreign_flow` | ❌ no-args | MCP -32602 Required: `code` (BUG-NEW-4); with code= returns data but holding ratio anomaly noted |
| `get_ticker_intelligence` | ❌ no-args | MCP -32602 Required: `code` (BUG-NEW-5); with code= returns data |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 2026-04-07 (70+ days stale) — ISSUE-9 |
| `get_climate_risk_signals` | ✅ OK | Returns seasonal risk note for June |
| `get_energy_grid_signals` | ⚠️ DEGRADED | Reservoir data unavailable; returns default 70% estimate |
| `get_sector_comparison` | ✅ OK (implied) | vnstockTradingStatsRefresh crashed — underlying data stale |
| `get_earnings_calendar` | ✅ OK | 28 ĐÃ NỘP, 13 QUÁ HẠN |
| `get_bctc_full` | ✅ OK | VCB Q1-2026 returned; refine_status=PARTIAL; EPS=15 VND (may be extraction artifact) |
| `get_cron_health` | ✅ OK (2 bugs) | `vnstockTradingStatsRefresh` crashed 50%; `bctcReparseJob` 80.6% |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv/foreign-flow push active; bctc STALE since 2026-06-13 23:45 |
| `get_sla_status` | ❌ CRITICAL | bctc 614/120min; foreign_flow 235/10min — BOTH BREACHED |
| `fetch_and_analyze` | ✅ OK | 20 news items fetched, analysis returned (CafeF RSS working) |
| `run_impact_chain` | ✅ OK | HVN chain: 43 entries, 41 watchlist impacts — working |
| `get_open_chain_findings` | ✅ OK | 3 findings, 2 stock groups returned |
| `get_fed_liquidity_spread` | ✅ OK | EFFR=3.62, IORB=3.65, spread=-0.03, asOf=2026-06-11 |
| `get_ism_subcomponents` | ❌ NO DATA | `error: no_data` — FRED_API_KEY not configured — ISSUE-7 |
| `get_watchlist` | ✅ OK | 41 tickers returned with live prices |
| `get_agent_signals` | ✅ OK | Returns "Không có tín hiệu mới" (no new signals — expected) |
| `emit_pressure_state` | ✅ OK | `success: true`, pressure-state.json path confirmed |
| `post_agent_signal` | ❌ wrong schema | MCP -32602 Required: from_agent, to_agent, signal_type, payload (BUG-3) |
| `task_list_held` | ✅ OK | 9 locks held (dev-team + unified-agent + digest-predict); 1 potentially orphaned (`FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0` expired at 05:58) |

---

## Caller-Surface Verification (STEP 3b — this cycle)

```
# BUG-NEW-4 get_foreign_flow (re-probed):
call_tool("get_foreign_flow", {}) → MCP -32602 Required: code (string) — CONFIRMED
Read docs/agents/fb-market-poster/flow/main.md L78:
  foreign_flow = call_tool(server="vn-market", tool="get_foreign_flow", arguments={})
  → CONFIRMED BROKEN (1 caller, read this cycle)

# BUG-NEW-5 get_ticker_intelligence (re-probed):
call_tool("get_ticker_intelligence", {}) → MCP -32602 Required: code (string) — CONFIRMED
Read docs/agents/fb-market-poster/flow/main.md L81:
  ticker_intel = call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={})
  → CONFIRMED BROKEN (1 caller, read this cycle)

# BUG-3 post_agent_signal (re-probed):
call_tool("post_agent_signal", {type:"test_probe_health_recheck"}) → MCP -32602 Required: from_agent, to_agent, signal_type, payload — CONFIRMED
system-auditor flow L193/L482/L509 verified in prior cycles; no fix deployed

# BUG-2 BCTC (re-probed):
get_vps_proxy_health → bctc STALE: 2026-06-13 23:45:12, 0 pushes/24h — CONFIRMED
get_sla_status → bctc 614/120 CRITICAL — WORSENED from 489/120 (2h ago)

# BUG-1 vnstockTradingStatsRefresh (re-probed):
get_cron_health → last_status=crashed, success_rate=0.50, total_runs=2, avg_duration=2,754,485ms — CONFIRMED UNCHANGED

# ISSUE-6 foreign-flow-job (re-probed + escalated):
get_system_status → [foreign-flow-job] fallback activated + exhausted at 06:01–06:03 UTC — ONGOING
get_sla_status → foreign_flow 235/10min CRITICAL — WORSENED (SLA breach not in 04:06 report)

# ISSUE-7 get_ism_subcomponents (new):
call_tool("get_ism_subcomponents", {}) → {"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}
grep docs/agents/tools/package/ → news-scout.md, bctc-analyst.md, unified-agent.md — 3 affected agents

# BUG-NEW-6 TA contamination (new):
get_cycle_bootstrap → OPEN ALERTS at 02:15 UTC: VCB RSI=3.6, VPB RSI=5.3, VCI RSI=5.8, VRE RSI=9.8, SSI RSI=5.7; price=0 in BB alerts
get_technical_indicators(VCB) → RSI=46.7; get_technical_indicators(VRE) → RSI=40.9; get_technical_indicators(VPB) → RSI=45.2
→ 02:15 RSI values confirmed false (zero-price contamination); alerts remain in DB as OPEN

# ISSUE-4 (still resolved):
get_system_status at 06:03–06:11: no zero_ohlc entries — CONFIRMED RESOLVED (runtime-side)
```

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | **7** | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC VPS dead >58h + SLA CRITICAL 614/120min; BUG-3 `post_agent_signal` schema drift (3 sites); BUG-NEW-3 `bctcReparseJob` 80.6%; BUG-NEW-4 `get_foreign_flow` no-args (fb-market-poster L78); BUG-NEW-5 `get_ticker_intelligence` no-args (fb-market-poster L81); **BUG-NEW-6 TA alert contamination at open (price=0, RSI 3–10 false signals, 6+ agents affected)** |
| **ISSUE** | **7** | ISSUE-1 server restarts 35/7d (5/day); ISSUE-2 WTI crude inverted $12.75; ISSUE-3 Reuters/TE persistent failures; ISSUE-6 foreign-flow-job internal exhaustion + SLA breach 235/10min; **ISSUE-7 get_ism_subcomponents no data (3 agents affected)**; **ISSUE-8 get_sector_rotation 5d N/A (market-watcher degraded)**; **ISSUE-9 BDI data 70+ days stale** |
| **IMPROVE** | **7** | IMPROVE-1 bootstrap dead enum; IMPROVE-2 5 dark tickers; IMPROVE-3 job schedule doc drift; IMPROVE-4 SLA threshold mismatch; IMPROVE-5 tool-list param drift; IMPROVE-6 VEA enricher noise; IMPROVE-7 HNX off-hours error noise |
| **RESOLVED** | **2** | ISSUE-4 pushPrices zero_ohlc (market-open edge case); ISSUE-5 VPS health endpoint false unhealthy |
