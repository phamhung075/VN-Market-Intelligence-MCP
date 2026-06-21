# Team MCP Tool Health Recheck — 2026-06-18T22:07Z

**Cycle:** 2026-06-18T22:07Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-18-2009.md`

---

## Executive Summary

**1 P0 BUG WORSENED** — BCTC VPS pipeline now 2961 min SLA breach (was 2843 at 20:09Z, +118 min in ~2h; service down ~50h). No change in VPS status.
**2 P1 BUGs UNCHANGED** — `get_insider_signals` schema mismatch (code+outstandingShares required); `get_agent_signals` from_agent-only calls broken (3 call sites).
**1 P1 ISSUE ONGOING** — SBV zero-value rejections continuing every 30 min; SLA marginally breached (33/30 min).
**1 ISSUE RESOLVED** — `pollNewsJob` crash from 20:03Z was transient; recovered by 22:00Z.
**1 NEW ISSUE P2** — `get_technical_indicators(code="VNM")` returns MA20=3,680,960 (~62× actual price 59,200); BB bands span -27M to +35M. Historical OHLCV contamination in VNM table.
**Server restart** at 20:04 UTC reset circuit breaker and source-health counters; Reuters/TE at 17 consecutive failures since restart (chronic, not a new issue).
All other ISSUEs and IMPROVEs unchanged.

---

## STEP 3c — Prior-Finding Delta (Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence (this cycle) |
|-----------|-------------|-------|-----------------------|
| BUG-1/2 | BUG P0 | **WORSENED** | bctc SLA: 2961 min (was 2843 at 20:09Z, +118 min); `get_sla_status` → `bctc: 2961/360 CRITICAL`; `get_vps_proxy_health` → bctc STALE, 0 24h pushes, last 2026-06-16 18:02:24 |
| BUG-NEW-A | BUG P1 | **CONFIRMED UNCHANGED** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` — same error |
| BUG-NEW-C | BUG P1 | **CONFIRMED UNCHANGED** | `get_agent_signals({hours_back:2})` → `agent: Required`; `get_agent_signals({agent:"market-watcher",hours_back:2})` → OK. Confirms 3 broken call sites that omit `agent` |
| ISSUE-SBV | ISSUE P1 | **ONGOING** | Zero-value rejections continue (18:59–21:59 UTC, every 30 min, 7 errors); `get_sla_status` → sbv_fx: 33/30 min = breached HIGH (VPS push flowing but DB writes rejected) |
| ISSUE-ISM | ISSUE P1 | **CONFIRMED UNCHANGED** | `get_ism_subcomponents` → `{error:"no_data", "message":"fred_series_daily has no ISM sub-component rows. Requires FRED_API_KEY."}` |
| ISSUE-Reuters/TE | ISSUE P2 | **ONGOING POST-RESTART** | Server restarted 20:04 UTC; Reuters RSS: 17 consecutive failures since restart; Trading Economics×2: 17 consecutive failures — confirms chronic (not counter reset artifact) |
| ISSUE-BDI | ISSUE P2 | **CONFIRMED** | `get_pipeline_health` → BDI: rows=0, TA not ready |
| ISSUE-WTI | ISSUE P2 | **CONFIRMED** | `get_system_status` → `wti_crude_usd 95.5`; Brent at $79.44 — $16+ spread physically impossible |
| ISSUE-DJIA | ISSUE P2 | **CONFIRMED** | `get_system_status` → `dow_jones 23750` — COVID-era 2020 value (actual ~42,000+) |
| ISSUE-vnstock | ISSUE P2 | **CONFIRMED UNCHANGED** | `vnstockTradingStatsRefresh`: 80.0% (5 runs), avg 768,321 ms |
| IMPROVE-6 | IMPROVE | **CONFIRMED** | `cycleBootstrapTool.ts` enum still includes `financial-analyst`, `report-analyzer` |
| IMPROVE-N3 | IMPROVE | **SLIGHTLY IMPROVED** | `bctcReparseJob`: 89.4% (104 runs) — slight improvement from 88.7% at 20:09Z; avg 214,317 ms |
| IMPROVE-EVN | IMPROVE | **CONFIRMED** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| IMPROVE-TA-DOC | IMPROVE | **CONFIRMED** | `get_technical_indicators({ticker:"VNM"})` → `code: Required`; doc says `ticker`, live uses `code`; 0 affected callers |
| NEW-ISSUE-POLLNEWS | ISSUE P1 | **RESOLVED** | `pollNewsJob` last_run: 22:00:01 UTC, status: success, rate: 99.8% — transient crash at 20:03Z recovered |

---

## NEW Finding This Cycle

### NEW-ISSUE-VNM-TA — VNM OHLCV Historical Contamination (P2)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Severity** | P2 |
| **Probe** | `get_technical_indicators(code="VNM")` → MA5=59,200 ✅; MA20=3,680,960 ❌ (~62× actual price); MACD Line=-703,066; BB Upper=35,257,301 / Lower=-27,895,381 |
| **Expected** | VNM trades at ~59,200 VND; MA20 should be ~57,000–62,000; BB spread ~4,000–6,000 |
| **Root cause** | Historical OHLCV rows for VNM contain contaminated price values (not in same unit or wrong ticker data injected). MA5 correct (recent 5 rows), MA20 wrong (older rows contain outliers ~4–5M VND scale) |
| **Impact** | TA signals for VNM unreliable (MACD direction/histogram wrong; BB position wrong). RSI(14)=48.1 may be accurate (price-change relative). `signal=neutral` in pipeline health. alert-commander, market-watcher, unified-agent TA signal layer for VNM affected |
| **Callers** | `get_pipeline_health` (VNM TA row), `get_technical_indicators(code="VNM")`, cowork agents reading TA signals |
| **Suggested fix** | Audit `daily_ohlcv` rows for VNM: `SELECT date, close FROM daily_ohlcv WHERE ticker='VNM' ORDER BY date DESC LIMIT 40` — identify outlier rows; purge and re-aggregate from raw tick data |

---

## Active BUG Findings

### BUG-1/2 — BCTC VPS Pipeline CRITICAL (P0, WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical |
| **SLA breach** | 2961 min elapsed / 360 min threshold (+118 min since 20:09Z); service down ~50h |
| **Last push** | 2026-06-16 18:02:24 UTC |
| **24h pushes** | 0 |
| **Probe** | `get_sla_status` → `bctc: 2961/360 min CRITICAL`; `get_vps_proxy_health` → bctc STALE |
| **Callers** | bctc-analyst (all cycles), refine_bctc_md, unified-agent (Layer 4), digest-predict (weekly) — ≥5 callers |
| **Fix** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; monitor 24h push recovery. Escalate if still down after restart. |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md`: `outstandingShares` documented as optional with auto-fetch |
| **Affected callers** | `market-watcher/flow/eod.md:59` — `get_insider_signals(code="{TICKER}")` without `outstandingShares` → BROKEN; `bctc-analyst/flow/stage-analyze.md:49` → LIKELY BROKEN |
| **Fix** | Restore `outstandingShares` as optional; implement DB auto-fetch from `bctc` table as documented |

### BUG-NEW-C — `get_agent_signals` `agent` Required, Breaking 3 Call Sites (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_agent_signals({hours_back:2})` → `agent: Required`; `get_agent_signals({agent:"market-watcher",hours_back:2})` → ✅ OK |
| **Broken call sites** | `market-watcher/flow/main.md:54` (sibling corroboration probe — omits `agent`); `news-scout/flow/stage-bootstrap.md:43` (SELF_SIGNALS_CACHE broken); `news-scout/flow/stage-bootstrap.md:56` (SIBLING_WINDOW_CACHE broken) |
| **Impact** | market-watcher gateway-down corroboration permanently blind; news-scout cross-sibling dedup and feedback tuning disabled. Non-fatal fallback (→ empty cache) masks the issue. |
| **Fix** | Add `agent: "<calling_agent>"` to the 3 broken call sites, OR make `agent` optional in tool schema when `from_agent` is provided |

---

## Active ISSUE Findings

### ISSUE-SBV — SBV Zero-Value Injections (P1, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Rejections every 30 min since at least 18:59 UTC (7+ errors); `get_sla_status` → `sbv_fx: 33/30 min = breached HIGH` |
| **VPS status** | `get_vps_proxy_health` → sbv: ok, 44 24h pushes, last 21:59:55 — VPS pushing but every push zero-value rejected |
| **Root cause** | SBV VPS fetcher returning zero FX rates (website structure change or off-hours response); zero-value guard correctly protecting DB but root cause unresolved |
| **Fix** | SSH to VPS → inspect `/proxy/sbv` raw response; update HTML parser or add off-hours zero-value detection; confirm SBV off-hours behavior |

### ISSUE-ISM — `get_ism_subcomponents` No Data (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Requires FRED_API_KEY."}` |
| **Impact** | ISM PMI subcomponents unavailable to news-scout, unified-agent US macro chain |
| **Fix** | Verify FRED_API_KEY env var is set; check NAPMBI series ID validity; re-run macroIndicatorRefreshJob |

### ISSUE-Reuters/TE — 17+ Consecutive Failures Post-Restart (P2, CHRONIC)

| Field | Value |
|-------|-------|
| **Evidence** | Server restarted 20:04 UTC; Reuters RSS + Trading Economics×2: 17 consecutive failures since restart; `Chưa bao giờ` (never fetched) in source health |
| **Note** | Prior count of 230+ failures reflected pre-restart accumulation; 17 post-restart confirms the issue is chronic, not counter drift |
| **Impact** | Degraded news coverage; VnExpress/CafeF/Bloomberg remain active — no hard block on cowork agents |
| **Fix** | Verify Reuters RSS endpoint URL (feeds.reuters.com deprecated); investigate TE geo-blocking or API key status |

### ISSUE-BDI — Baltic Dry Index 0 Rows (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_pipeline_health` → `BDI: rows=0, TA not ready` |
| **Fix** | Update BDI fetcher endpoint or data provider |

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `wti_crude_usd 95.5`; Brent at $79.44 — $16+ spread physically impossible |
| **Fix** | Force-refresh WTI; check WTI fetcher divergence from Brent source |

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `dow_jones 23750` — COVID-era 2020 value (actual ~42,000+) |
| **Fix** | Force-refresh DJIA from Yahoo Finance or alternative source |

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 80.0% (5 runs), avg 768,321 ms (12.8 min) |
| **Fix** | Review failure logs; consider timeout extension or batching |

---

## Active IMPROVE Findings

### IMPROVE-6 — Bootstrap Enum Contains Deprecated Agents

| Field | Value |
|-------|-------|
| **Evidence** | `apps/mcp-server/src/interface/mcp/tools/system/cycleBootstrapTool.ts:27-28` — `financial-analyst`, `report-analyzer` in live schema enum |
| **Fix** | Prune deprecated values from enum |

### IMPROVE-N3 — bctcReparseJob 89.4% Success Rate

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 89.4% (104 runs), avg 214,317 ms — slight improvement (was 88.7%) |
| **Fix** | Categorize the ~10% failure modes; likely PDF parse errors on edge-case documents |

### IMPROVE-EVN — Energy Grid Using Default Estimate

| Field | Value |
|-------|-------|
| **Evidence** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| **Fix** | Investigate EVN endpoint URL for structural change |

### IMPROVE-TA-DOC — `get_technical_indicators` Doc Param Drift

| Field | Value |
|-------|-------|
| **Evidence** | Probe `{ticker:"VNM"}` → `code: Required`; doc `get_technical_indicators.md` documents param as `ticker` |
| **Caller-surface** | 0 affected callers — doc drift only |
| **Fix** | 1-line fix: rename `ticker` → `code` in tool list doc |

---

## RESOLVED Since Prior Cycle (20:09Z)

| Finding | Resolution |
|---------|------------|
| NEW-ISSUE-POLLNEWS | `pollNewsJob` last_run: 2026-06-18 22:00:01 UTC, status: success (99.8% success rate). Crash at 20:03:35 was a single transient event — not recurring. Closed. |

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_system_status` | ⚠️ DEGRADED | 10 unresolved errors; SBV zero-value every 30 min; Reuters/TE stopped; WTI/DJIA stale; 2× intelligence-cycle skip |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ PASS | agent_signals=[]; prices fresh 08:59 UTC; market closed as expected; latency 14ms |
| `get_market_snapshot` | ✅ PASS | VN-Index 1830.47 +1.34%; breadth 90↑/205↓/60→; liquidity 17,429 bn (-27.9%) |
| `get_macro_snapshot` | ✅ PASS | source_tier:2; oil $79.44 neutral; gold $4227.9 bullish; usdvnd 26111 bearish; carry spread 1.37pp |
| `get_cron_health` | ✅ MOSTLY OK | pollNewsJob recovered (22:00:01 success); vnstockTradingStatsRefresh 80%; bctcReparseJob 89.4%; all others ≥99% |
| `get_pipeline_health` | ⚠️ DEGRADED | VNM: MA20=3,680,960 data contamination; BDI/DAG/DLC/JSH/SIS/VDC/VNH: TA not ready; NKG+REE oversold |
| `get_vps_proxy_health` | ⚠️ DEGRADED | bctc STALE (0 24h pushes, last 2026-06-16 18:02); sbv/news/prices: ok |
| `get_sla_status` | ❌ BREACHED | bctc: 2961/360 min CRITICAL; sbv_fx: 33/30 min HIGH (marginal) |
| `get_vn_macro_indicators` | ✅ PASS | IIP 2026-06 data fresh; is_estimate:false |
| `get_earnings_calendar` | ✅ PASS | 41 tickers; 10 overdue (BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) |
| `get_ism_subcomponents` | ❌ NO_DATA | `error:no_data`; FRED_API_KEY not set / series unpopulated |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | EVN hydro endpoint broken; default 70% estimate |
| `get_technical_indicators(code="VNM")` | ⚠️ DATA_BAD | MA5=59,200 ✅; MA20=3,680,960 ❌ (~62× actual); BB span -27M to +35M ❌ |
| `get_agent_signals(agent="market-watcher")` | ✅ PASS | Returns empty correctly |
| `get_agent_signals({hours_back:2})` | ❌ FAIL | `agent: Required` — 3 broken call sites in flow files |
| `get_insider_signals({ticker:"VCB"})` | ❌ FAIL | `code: Required` + `outstandingShares: Required` — 2 flow callers broken |
| `get_cycle_bootstrap(no_args)` | SCHEMA CORRECT | Enum validation fires correctly; by-design guard |
| `get_recent_signals` | ❌ NOT FOUND | Tool does not exist (MCP -32602: tool not found) — check any flow files referencing it |
| `get_recent_fixes` | ✅ PASS | Returns recent fixes correctly |
| `task_list_held` | ✅ PASS | 7 locks held; `cowork-leader-lock` expires 22:21 UTC; bctc sprint-task held by bctc-analyst |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; monitor 24h. Now ~50h down. | ops / dev-vps-crawls | BUG-1/2 |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional with DB auto-fetch (documented in tool contract) | dev-mcp-server | BUG-NEW-A |
| **P1** | Add `agent: "<caller>"` to 3 broken call sites: `market-watcher/flow/main.md:54`, `news-scout/flow/stage-bootstrap.md:43`, `news-scout/flow/stage-bootstrap.md:56` | agent-father | BUG-NEW-C |
| **P1** | SSH to VPS → inspect `/proxy/sbv` raw response; update SBV HTML parser for zero-value returns | dev-vps-crawls | ISSUE-SBV |
| **P1** | Verify FRED_API_KEY env var; re-run macroIndicatorRefreshJob to populate ISM series | dev-macro-indicators | ISSUE-ISM |
| **P2** | Audit `daily_ohlcv` for VNM: `SELECT date, close FROM daily_ohlcv WHERE ticker='VNM' ORDER BY date DESC LIMIT 40`; purge outlier rows and re-aggregate | dev-stock-price | NEW-ISSUE-VNM-TA |
| **P2** | Force-refresh WTI crude ($95.5 impossible vs Brent $79.44) | dev-macro-indicators | ISSUE-WTI |
| **P2** | Force-refresh DJIA (23,750 → actual ~42,000+) | dev-macro-indicators | ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecated endpoint; TE geo-blocking / API key | dev-mainserver-crawls | ISSUE-Reuters/TE |
| **P2** | Update BDI fetcher endpoint (rows=0) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80%, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Prune deprecated enum from `get_cycle_bootstrap` (`financial-analyst`, `report-analyzer`) | dev-mcp-server | IMPROVE-6 |
| **P3** | Categorize bctcReparseJob 10% failure modes | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for hydro reservoir data | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Update `docs/agents/tools/list/get_technical_indicators.md`: `ticker` → `code` (0 affected callers) | dev-mcp-server | IMPROVE-TA-DOC |

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-18-2207.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-18-2009.md` |
| Probes run | 20 tools |
| PASS | 10 |
| FAIL/DEGRADED/NO_DATA/DATA_BAD | 10 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC — worsened) |
| Active P1 BUGs | 2 (BUG-NEW-A insider, BUG-NEW-C agent_signals) |
| Active P1 ISSUEs | 2 (ISSUE-SBV, ISSUE-ISM) |
| Active P2 ISSUEs | 6 (Reuters/TE, BDI, WTI, DJIA, vnstock, NEW-VNM-TA) |
| Active IMPROVEs | 4 |
| Resolved since 20:09Z | 1 (NEW-ISSUE-POLLNEWS — transient, recovered) |
| New findings | 1 (NEW-ISSUE-VNM-TA — OHLCV contamination) |
