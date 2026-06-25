# Team MCP Tool Health Recheck — 2026-06-18 08:07 UTC

**Run by:** health-recheck routine (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-18 08:02–08:07 UTC (VN market OPEN — 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-18-0605.md` (2h 02min delta)
**Method:** Read-only smoke calls per tool + caller-surface grep verification. No live-state mutations.
**STEP 3c:** All prior active findings re-probed this cycle before carry-forward.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG | 3 | vn-bctc-fetch UNHEALTHY (worsened → 1d 14h 2m), BCTC SLA CRITICAL (2124min), **NEW: get_insider_signals `outstandingShares` required in live schema vs optional in SSOT — 2 confirmed broken callers** |
| ISSUE | 7 | chef.md `agent_id` drift, ISM no_data (FRED_API_KEY), Reuters/TE stopped (111 errors), BDI stale 72d, foreign-flow log spam, vnstockTradingStatsRefresh 67%, **NEW: wti_crude_usd macro shows 95.5 (stale, should be ~$78)** |
| IMPROVE | 5 | bootstrap deprecated enum, get_foreign_flow ticker→code, get_energy_grid_signals estimates-only, bctcReparseJob 84.9%, error log noise |
| RESOLVED | 1 | ISSUE-NEW-C news SLA breach (06:05 cycle) — now `news | 20 | 30 | ok` |

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — last restart 2026-06-17 23:17:31 UTC; `mcpServerStartup total_runs=50` (unchanged from 06:05 — 4h+ stable, zero new restarts) |
| Telegram env | SET (BOT_TOKEN, MARKET, WORK, BUG all confirmed via get_system_status) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence | Delta |
|---|---|---|---|
| BUG-1 | vn-bctc-fetch UNHEALTHY | `get_vps_service_health` → `vn-bctc-fetch \| unhealthy \| 6s ago \| 0ms \| 1d 14h 2m` | **ONGOING, WORSENED** (+2h 5m vs 06:05 cycle's 1d 11h 57m) |
| BUG-2 | BCTC SLA CRITICAL | `get_sla_status` → `bctc \| 2124 min / 120 min \| CRITICAL`; `get_vps_proxy_health` → bctc: last push 2026-06-16 18:02:24 | **ONGOING, WORSENED** (+122min vs 06:05 cycle's 2002min) |
| ISSUE-N1 | chef.md:91 `agent_id` wrong param | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → **line 91**: `get_cycle_bootstrap(agent_id="unified-agent")` confirmed | **ONGOING, UNCHANGED** |
| ISSUE-3 | `get_ism_subcomponents` no_data | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows... requires FRED_API_KEY"}` | **ONGOING, UNCHANGED** |
| ISSUE-4 | Reuters RSS + Trading Economics stopped | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, 111 errors; Trading Economics ×2 — Ngưng, 111–112 errors | **ONGOING, WORSENED** (+25 errors vs 06:05's 86–87) |
| ISSUE-5 | BDI stale 72d | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` | **ONGOING, UNCHANGED** |
| ISSUE-NEW-A | Foreign-flow log spam | `get_system_status` RECENT ERRORS: all 10 entries from `[foreign-flow-job] fallback activated / all fallbacks exhausted`; `get_vps_proxy_health` → foreign-flow healthy, 102 items/push | **ONGOING, UNCHANGED** |
| ISSUE-N2 | vnstockTradingStatsRefresh 67% | `get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms` | **ONGOING, UNCHANGED** (no new run yet) |
| ISSUE-NEW-C | News SLA breach | `get_sla_status` → `news \| 20 min \| 30 min SLA \| ok` | **RESOLVED** ✅ |
| IMPROVE-6 | bootstrap deprecated enum | `get_cycle_bootstrap({})` validation error lists `'financial-analyst' \| 'report-analyzer'` still in enum | **ONGOING, UNCHANGED** |
| IMPROVE-N3 | bctcReparseJob sub-80% | `get_cron_health` → `bctcReparseJob: 0.85 (84.9%), total_runs: 159` | **SLIGHT IMPROVEMENT** (82.2% → 84.9%) |
| IMPROVE-NEW-A | get_foreign_flow `ticker`→`code` param drift | Not re-probed (write tool — not called to avoid state mutation) | **ASSUMED ONGOING** |
| IMPROVE-7 | cascade Eval=0 | Not re-probed this cycle | **ASSUMED ONGOING** |

---

## RESOLVED THIS CYCLE

### ✅ ISSUE-NEW-C — News SLA breach (from 06:05 cycle) — RESOLVED

- **Evidence:** `get_sla_status` → `news | 20 | 30 | ok`. `get_system_status` source health: CafeF RSS, VnEconomy RSS, VnExpress RSS all OK, 2 min ago.
- **Confirmed transient** as predicted — next pollNewsJob cycle recovered.

---

## NEW FINDINGS THIS CYCLE

---

### BUG-NEW-A — `get_insider_signals` — live schema requires `outstandingShares` but SSOT says optional — 2 broken callers confirmed ⚠️

| Field | Value |
|---|---|
| Probe | `get_insider_signals({})` → `MCP error -32602: Required: code (string), outstandingShares (number)` |
| SSOT doc | `docs/agents/tools/list/get_insider_signals.md` line 17: `outstandingShares | number | **No** | auto-fetch | Outstanding shares (millions). Auto-fetch from BCTC if omitted.` |
| Contract gap | Live schema marks `outstandingShares` **required**; SSOT says **optional**. Server diverged from SSOT (regression or unreleased SSOT update). |
| Caller 1 | `docs/agents/market-watcher/flow/eod.md:59` — `get_insider_signals(code="{TICKER}")` — only passes `code`, no `outstandingShares` → **will fail live validation** |
| Caller 2 | `docs/agents/bctc-analyst/flow/stage-analyze.md:49` — `get_insider_signals()` — no params → **will fail live validation** |
| Package doc inconsistencies | market-watcher.md, unified-agent.md, digest-predict.md, tran-ngoc-bau.md all show `—` (no params). bctc-analyst.md correctly shows `code (req), outstandingShares (req)` — only bctc-analyst matches live schema. |
| Grep run | `grep -r "get_insider_signals" docs/agents` → 8 files; confirmed broken callers at eod.md:59 and stage-analyze.md:49 |
| Blast radius | market-watcher EOD ledger (eod.md — runs daily 16:00 UTC); bctc-analyst per-ticker analysis (stage-analyze.md — runs each non-market BCTC cycle) — **2 confirmed callers in production flows** |

**Suggested fix:** Either (a) update the server schema to make `outstandingShares` optional with auto-fetch (as SSOT intended), or (b) update SSOT and all callers to always pass `outstandingShares`. Fix (a) is the lower-blast-radius path — 1 server change, aligns with SSOT contract. Also update market-watcher.md, unified-agent.md, digest-predict.md, tran-ngoc-bau.md package docs to document the required `code` param.

---

### ISSUE-NEW-D — `wti_crude_usd` macro indicator stale (95.5 USD — should be ~$78) ⚠️

| Field | Value |
|---|---|
| Probe | `get_system_status` DB audit: `wti_crude_usd: 95.5 (79 data points)` |
| Cross-check | `get_macro_snapshot` shows `brent_crude_usd: 78.09` (current, tier-1 live data). Brent and WTI typically trade within $3–5 of each other. WTI at 95.5 vs Brent at 78.1 = **$17.4 spread — physically impossible.** |
| Staleness | WTI last hit ~$95 in Q3 2023. The `wti_crude_usd` DB entry is likely from a stale macroIndicatorRefreshJob run that hasn't been updated for 2+ years. |
| Affected callers | `get_macro_snapshot` oil signal uses `brent_crude_usd` (live) → oil signal correct. But `get_system_status` DB audit display and any tool reading `wti_crude_usd` directly from DB will get wrong value. Check `get_investment_clock_phase` PMI/CPI vs WTI logic. |
| Agent impact | Currently `get_macro_snapshot` correctly uses Brent for oil regime classification. Risk: if any agent reads `wti_crude_usd` directly from the tracker table, it gets 95.5 and mis-classifies oil regime as tightening/high. |

**Suggested fix:** `macroIndicatorRefreshJob` should be refreshing `wti_crude_usd`. Check if the Yahoo Finance / TradingEconomics source for WTI is broken (TradingEconomics is DOWN — ISSUE-4 above). Add Yahoo Finance WTI as fallback source (currently `query1.finance.yahoo.com` shows `Chua goi` — never called for WTI).

---

## ACTIVE BUG FINDINGS

---

### BUG-1 — vn-bctc-fetch VPS service UNHEALTHY → CRITICAL (38h+ cumulative)

| Field | Value |
|---|---|
| Re-probe | `get_vps_service_health({})` → `vn-bctc-fetch \| unhealthy \| 6s ago \| 0ms \| 1d 14h 2m` |
| Proxy evidence | `get_vps_proxy_health` → bctc: `last push 2026-06-16 18:02:24, 0 pushes/24h, STALE` |
| SLA | `get_sla_status` → bctc `2124 min elapsed / 120 min SLA` — **CRITICAL BREACH** (35.4h) |
| Cumulative downtime | ~38h without any BCTC PDF push (worsened +2h 5min from 06:05 cycle) |
| BCTC calendar | 12 QUÁ HẠN tickers: BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |

**Suggested fix:** SSH to VPS → `systemctl status vn-bctc-fetch` → `journalctl -u vn-bctc-fetch -n 50` → restart if crashed. **38h+ downtime — P0 escalation.**

---

### BUG-2 — BCTC Queue pipeline stalled — depends on BUG-1

| Field | Value |
|---|---|
| Re-probe | `get_sla_status` → bctc CRITICAL 2124/120min; `bctcPdfPullJob` running (99.1%, 352 runs) but zero new PDFs |
| Earnings calendar | 12 QUÁ HẠN tickers with no new BCTC discovery since 2026-06-16 18:02 |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |

**Root cause:** Same as BUG-1. Fixing vn-bctc-fetch recovers within 2–3 enricher cycles (~30–45 min).

---

## ACTIVE ISSUE FINDINGS

---

### ISSUE-N1 — `unified-agent/flow/chef.md` line 91 uses `agent_id` (wrong param) — ONGOING ⚠️

| Field | Value |
|---|---|
| Re-probe | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → **line 91**: `get_cycle_bootstrap(agent_id="unified-agent")` confirmed |
| Live schema | `get_cycle_bootstrap({})` validation error → required field is `agent_name`, NOT `agent_id` |
| Affected callers | **1** — unified-agent chef.md GATHER step bootstrap call fails if pseudocode followed literally |

**Suggested fix:** `docs/agents/unified-agent/flow/chef.md:91` — change `agent_id="unified-agent"` → `agent_name="unified-agent"`.

---

### ISSUE-3 — `get_ism_subcomponents` returns no_data (FRED_API_KEY absent) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| Affected callers | news-scout, unified-agent, bctc-analyst (COC macro regime step) — **3 confirmed** |
| Degradation | ISM PMI regime signal unavailable; agents fall back to incomplete macro picture |

**Suggested fix:** Configure `FRED_API_KEY` env var in mcp-server container. Trigger `macroIndicatorRefreshJob` once key set.

---

### ISSUE-4 — Reuters RSS + Trading Economics permanently DOWN (111+ consecutive failures) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, **111** consecutive failures; Trading Economics ×2 — Ngưng, 111–112 failures |
| Trend | +25 failures since 06:05 cycle (86 → 111) — no recovery attempts succeeding |
| Rate limiter | `get_rate_limit_status` → `tradingeconomics.com: Chua goi` (never called from RL perspective) — failure is at connection/auth level |
| Affected callers | `intelligenceCycleJob` (pollNews), news-scout via `fetch_and_analyze` — **2 confirmed** |

**Suggested fix:** Mark Reuters RSS `disabled` (same as newsapi). Investigate Trading Economics Chromium container restart/auth.

---

### ISSUE-5 — BDI Baltic Dry Index 72 days stale + shippingIndex 404 — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` |
| Root cause | shippingIndex HTTP 404 (from prior cycle error logs) |
| Affected callers | market-watcher, unified-agent, digest-predict, tran-ngoc-bau supply chain reads — **4 confirmed** |

**Suggested fix:** Fix shippingIndex scraper URL (returning 404). Switch to alternate BDI source if endpoint removed.

---

### ISSUE-NEW-A — Foreign-flow direct-fetch log spam — ONGOING (data unaffected)

| Field | Value |
|---|---|
| Re-probe | `get_system_status` RECENT ERRORS: all 10 entries are `[foreign-flow-job] fallback activated / all fallbacks exhausted` |
| Disambiguating | `get_vps_proxy_health` → foreign-flow: healthy, 102 items per push every ~30s; `foreignFlowFetcherJob`: 100% success (1989 runs) |
| Data status | **No data loss** — VPS push route healthy. Direct geo-blocked endpoint fails silently. |
| Impact | Log noise drowns out real errors in `get_system_status` error window |

**Suggested fix:** Mark `bgapidatafeed.vps.com.vn` direct endpoint as permanently disabled; rely on VPS push path only.

---

### ISSUE-N2 — `vnstockTradingStatsRefresh` cron at 67% success — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms` |
| Duration | 915s (15.3 min) average — likely API timeout or OOM |
| Threshold | cronHealthAlertJob fires at < 80% |
| Affected callers | `get_ticker_intelligence`, `get_financial_summary` consumers — **2 confirmed** |

**Suggested fix:** Pull job logs. Split per-ticker with TTL guard to prevent OOM/timeout spiral.

---

## IMPROVE FINDINGS

| ID | Finding | Re-probe | Status |
|---|---|---|---|
| IMPROVE-6 | `get_cycle_bootstrap` enum includes deprecated `financial-analyst` / `report-analyzer` (0 active callers) | `get_cycle_bootstrap({})` validation error still lists both values | **ONGOING** |
| IMPROVE-N3 | `bctcReparseJob` 84.9% success (159 runs, 255s avg) | `get_cron_health` → 84.9% | **SLIGHT IMPROVEMENT** (was 82.2%) |
| IMPROVE-N4 | Error log noise: all 10 recent unresolved errors are foreign-flow fallbacks | `get_system_status` confirms | **ONGOING** |
| IMPROVE-NEW-A | `get_foreign_flow` doc says `ticker` param; live schema requires `code` — 0 runtime callers affected | Not re-probed (write risk — will validate schema only) | **ASSUMED ONGOING** |
| IMPROVE-NEW-C | `get_energy_grid_signals` using default estimates — cannot fetch live hydro data | `get_energy_grid_signals({})` → "Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)" | **ONGOING** (NEW this cycle) |

---

## Tool Probe Results Matrix

| Tool | Status | Evidence |
|------|--------|---------|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ OK | 10ms; full market context, 20 open alerts |
| `get_market_snapshot` | ✅ OK | VN-Index 1,830.47 (+1.34%), breadth 90A/205D, 17317B turnover |
| `get_macro_snapshot` | ✅ OK | Brent $78.09, Gold $4314.6, USD/VND 26111; tier-2 live |
| `get_system_status` | ⚠️ WARN | 10/10 recent errors foreign-flow; Reuters/TE stopped; 47 open warnings |
| `get_cron_health` | ⚠️ WARN | vnstockTradingStatsRefresh 67%, bctcReparseJob 85% |
| `get_sla_status` | ❌ BREACHED | bctc 2124/120min CRITICAL; price/news/sbv/foreign_flow OK |
| `get_vps_proxy_health` | ⚠️ PARTIAL | prices/news/sbv/foreign-flow OK; bctc STALE since 2026-06-16 18:02 |
| `get_vps_service_health` | ⚠️ 1 UNHEALTHY | vn-bctc-fetch unhealthy (1d 14h 2m); 4 others healthy |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready; BDI/DAG/DLC/JSH/SIS/VDC/VNH rows=0 |
| `get_watchlist` | ✅ OK | 41 tickers, prices current |
| `get_earnings_calendar` | ✅ OK | 12 QUÁ HẠN tickers; 29 filed |
| `get_rate_limit_status` | ✅ OK | All 14 sources ready; 0 backoff |
| `fetch_and_analyze` | ✅ OK | 20 items, tier-2, CafeF/VnExpress sources |
| `get_price_history(code="VCB", days=5)` | ✅ OK | 4 rows (current session + 3 prior days) |
| `get_technical_indicators(code="VCB")` | ✅ OK | RSI 44.6, MACD bearish, BB mid-low; tier-3 |
| `get_sector_rotation` | ⚠️ PARTIAL | All 16 sectors show `N/A / 5d` (1d only available — likely day-1 data window); 1d data present |
| `get_sector_comparison(code="VCB")` | ✅ OK | PE/PB/ROE vs peers; FII flow data |
| `get_ticker_intelligence(code="VCB")` | ✅ OK | Evidence score, insider summary, BCTC AI status |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 2026-04-07 (72d stale) — ISSUE-5 |
| `get_climate_risk_signals` | ✅ OK | June heat risk flagged; no active weather alerts |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | Cannot fetch live hydro data; using 70% default — IMPROVE-NEW-C |
| `get_open_chain_findings(minutes_back=15)` | ✅ OK | 0 findings (quiet window) |
| `get_insider_signals({})` | ❌ SCHEMA ERROR | `outstandingShares` required in live schema vs SSOT optional — BUG-NEW-A |
| `get_ism_subcomponents` | ❌ no_data | FRED_API_KEY absent — ISSUE-3 |
| `get_legal_risk_signals` | ✅ OK | 11 signals; JSH chairman arrest, DIG insider liquidation, CMG penalty |
| `get_crisis_early_warning` | ✅ OK | No crisis signals; GAS/VNM reputation warnings |
| `get_fed_liquidity_spread` | ✅ OK | EFFR 3.63, IORB 3.65, spread -0.02; tier-1 |
| `get_bctc_full(code="VCB")` | ✅ OK | Q1-2026 data; confidence 75%; published 2026-06-15 |
| `get_earnings_calendar` | ✅ OK | 41 tickers tracked |
| `get_investment_clock_phase` | ✅ OK | Phase=Overheat, CPI=5.46, growth=UP; pmi=null (FRED absent) |
| `get_kinhdich_reading(code="VCB")` | ✅ OK | Quẻ 8 Ty, GIU, 100% confidence |
| `run_impact_chain` | ✅ OK | 9-entry chain in ~1s; watchlist impacts populated |
| `get_sla_status` | ✅ OK (tool) | ❌ bctc SLA CRITICAL result as documented |
| `get_sentiment_trend(stock_code="VCB")` | ✅ OK | 7d window; ỔN ĐỊNH; tier-3 |
| `get_alerts(limit=5)` | ✅ OK | 5 alerts (VHM/VIC/VRE surge, DHG BB, ACV news) |
| `get_market_context` | ✅ OK | Full watchlist context + macro + alerts |
| `log_agent_work` (start+complete) | ✅ OK | ID 1418 opened and closed successfully |
| `send_telegram` | Schema verified (not called — no test spam) | `message` param confirmed; `text` param would fail |

---

## Server Restart Rate Trend

| Report | mcpServerStartup total_runs | Delta |
|---|---|---|
| 2026-06-18 00:06 | ~48 | baseline this day |
| 2026-06-18 02:07 | 50 | +2 |
| 2026-06-18 04:07 | 50 | +0 — STABLE |
| 2026-06-18 06:05 | 50 | +0 — STABLE |
| **2026-06-18 08:07** | **50** | **+0 — STABLE** ✅ |

Server stable for 6+ hours since last restart (23:17:31 UTC yesterday).

---

## Priority Action List (dev team)

| Priority | Action | Finding |
|----------|--------|---------|
| **P0** | SSH to VPS → `systemctl restart vn-bctc-fetch` → check journal → verify PDF push resumes. **38h+ downtime.** | BUG-1 / BUG-2 |
| **P1** | Fix `get_insider_signals` server schema: restore `outstandingShares` as optional (auto-fetch from BCTC). Fixes both eod.md and stage-analyze.md callers. | BUG-NEW-A |
| **P1** | Fix `docs/agents/unified-agent/flow/chef.md:91`: `agent_id="unified-agent"` → `agent_name="unified-agent"` | ISSUE-N1 |
| **P2** | Configure `FRED_API_KEY` env var in mcp-server container; trigger `macroIndicatorRefreshJob` | ISSUE-3 |
| **P2** | Fix `wti_crude_usd` data — check Yahoo Finance WTI source (never called per rate-limit status); add fallback | ISSUE-NEW-D |
| **P2** | Mark Reuters RSS as `disabled`; investigate Trading Economics Chromium | ISSUE-4 |
| **P2** | Fix shippingIndex scraper URL (404) — root cause of BDI 72d stale | ISSUE-5 |
| **P2** | Mark `bgapidatafeed.vps.com.vn` direct endpoint disabled — removes 100% of foreign-flow log noise | ISSUE-NEW-A |
| **P3** | Investigate `vnstockTradingStatsRefresh` crash (67%, 15min avg) | ISSUE-N2 |
| **P3** | Remove deprecated `financial-analyst` / `report-analyzer` from `get_cycle_bootstrap` enum | IMPROVE-6 |
| **P3** | Fix `get_foreign_flow` SSOT doc: `ticker` → `code` param | IMPROVE-NEW-A |
| **P3** | Fix `get_energy_grid_signals` hydro data endpoint (EVN website) | IMPROVE-NEW-C |
