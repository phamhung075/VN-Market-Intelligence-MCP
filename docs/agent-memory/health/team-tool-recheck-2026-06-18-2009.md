# Team MCP Tool Health Recheck — 2026-06-18T20:09Z

**Cycle:** 2026-06-18T20:09Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-18-1805.md`

---

## Executive Summary

**1 P0 BUG ongoing and WORSENED** — BCTC VPS pipeline now 2843 min SLA breach (was 2721 at 18:05Z, +122 min in ~2h; service has been down ~48h).
**2 P1 BUGs ongoing unchanged** — `get_insider_signals` schema mismatch; `get_agent_signals` from_agent-only calls broken (3 call sites in 2 flow files).
**1 NEW ISSUE** — `pollNewsJob` crashed on most recent run (20:03:35 UTC).
**SBV SLA breach RESOLVED** — sbv_fx now 302/696 min = ok (VPS push flowing; zero-value guard protecting DB). Zero-value error pattern still ongoing but SLA tool confirms freshness OK.
All other ISSUEs and IMPROVEs unchanged from 18:05Z.

---

## STEP 3c — Prior-Finding Delta (Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence (this cycle) |
|-----------|-------------|-------|-----------------------|
| BUG-1/2 | BUG P0 | **WORSENED** | bctc SLA: 2843 min (was 2721 at 18:05Z, +122 min); `vn-bctc-fetch` UNHEALTHY, 0 24h pushes; `get_sla_status` → breached CRITICAL |
| BUG-NEW-A | BUG P1 | **CONFIRMED UNCHANGED** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` — same schema error |
| BUG-NEW-C | BUG P1 | **CONFIRMED UNCHANGED** | `get_agent_signals({from_agent:null,...})` → `agent: Required` + `from_agent: Expected string, received null` — 3 broken call sites re-confirmed |
| ISSUE-SBV | ISSUE P1 | **ONGOING / SLA RESOLVED** | Zero-value rejections continuing (16:59, 17:29, 17:59, 18:29, 18:59, 19:29, 19:59 UTC); `get_sla_status` → sbv_fx: 302/696 min = **ok** (VPS push flowing; internal guard protects DB). Root cause unresolved. |
| ISSUE-ISM | ISSUE P1 | **CONFIRMED UNCHANGED** | `get_ism_subcomponents` → `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Requires FRED_API_KEY."}` |
| ISSUE-Reuters/TE | ISSUE P2 | **CONFIRMED WORSENED** | Reuters RSS: 230 errors (was 213); TE×2: 230–231 errors (was 213–214) — +17 consecutive failures each |
| ISSUE-BDI | ISSUE P2 | **CONFIRMED** | `get_pipeline_health` → BDI: rows=0, TA not ready |
| ISSUE-WTI | ISSUE P2 | **CONFIRMED** | `get_system_status` → `wti_crude_usd 95.5` — physically impossible $17+ above Brent ($79.54) |
| ISSUE-DJIA | ISSUE P2 | **CONFIRMED** | `get_system_status` → `dow_jones 23750` — 2020 COVID-era value (~42,000+ in reality) |
| ISSUE-vnstock | ISSUE P2 | **CONFIRMED UNCHANGED** | `vnstockTradingStatsRefresh`: 80.0% success (5 runs), avg 768,321 ms |
| IMPROVE-6 | IMPROVE | **CONFIRMED** | `apps/mcp-server/src/interface/mcp/tools/system/cycleBootstrapTool.ts:27-28` — `financial-analyst`, `report-analyzer` still in live enum |
| IMPROVE-N3 | IMPROVE | **SLIGHTLY WORSENED** | `bctcReparseJob`: 88.7% (was 89.1% at 18:05Z); avg 221,477 ms |
| IMPROVE-EVN | IMPROVE | **CONFIRMED** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| IMPROVE-TA-DOC | IMPROVE | **ASSUMED UNCHANGED** | Doc-only drift; not re-grepped this cycle; 0 affected callers |

---

## NEW Finding This Cycle

### NEW-ISSUE-POLLNEWS — pollNewsJob CRASHED (Most Recent Run)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Severity** | P1 |
| **Evidence** | `get_cron_health`: `pollNewsJob \| last_run: 2026-06-18 20:03:35 \| last_status: crashed \| success_rate: 99.8% (1238 runs)` |
| **Context** | Most recent run (20:03:35 UTC) crashed. All prior runs healthy (99.8%). Crash is on the most recent cycle only — likely transient. |
| **Impact** | Latest news poll cycle missed. Downstream: `newsHeadlinesRefreshJob` ran at 20:00 (OK); `intelligence-cycle` has its own news fetch. Missing 1 poll cycle has low immediate impact. |
| **Callers** | `pollNewsJob` feeds `intelligenceCycleJob`, `market_context` in `get_cycle_bootstrap` |
| **Fix** | Check mcp-server container logs around 20:03 UTC; if isolated crash, monitor for recurrence. If repeating, diagnose `pollNews.ts` exception. |

---

## Active BUG Findings

### BUG-1/2 — BCTC VPS Pipeline CRITICAL (P0, WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical |
| **SLA breach** | 2843 min elapsed / 360 min threshold — WORSENED (+122 min since 18:05Z) |
| **Last push** | 2026-06-16 18:02:24 UTC (~48h ago) |
| **24h pushes** | 0 |
| **VPS health** | `vn-bctc-fetch: unhealthy \| 0ms response \| uptime 2d 1h 57m` |
| **Callers** | bctc-analyst (all cycles), refine_bctc_md, unified-agent (Layer 4), digest-predict (weekly) — **≥5 callers** |
| **Fix** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; monitor for 24h push recovery |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md`: `outstandingShares` documented as optional with auto-fetch |
| **Affected callers** | `market-watcher/flow/eod.md:59` — calls `get_insider_signals(code="{TICKER}")` no `outstandingShares` → **BROKEN**; `bctc-analyst/flow/stage-analyze.md:49` → **LIKELY BROKEN** |
| **Fix** | Restore `outstandingShares` as optional; implement DB auto-fetch from `bctc` table as documented |

### BUG-NEW-C — `get_agent_signals` from_agent-only Calls Broken (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_agent_signals({from_agent:null, status:"all", hours_back:0.25})` → `agent: Required` + `from_agent: Expected string, received null` |
| **Broken call sites** | `market-watcher/flow/main.md:54` (sibling corroboration probe — gateway-down guard blind); `news-scout/flow/stage-bootstrap.md:43` (SELF_SIGNALS_CACHE always empty); `news-scout/flow/stage-bootstrap.md:56` (SIBLING_WINDOW_CACHE always empty) |
| **Impact** | Both callers have non-fatal fallback (→ empty cache), so no hard crash. But: market-watcher gateway-down corroboration is permanently blind; news-scout cross-sibling dedup and feedback tuning disabled. |
| **Fix** | Add `agent: "<calling_agent>"` to the 3 broken call sites. OR make `agent` optional in tool schema when `from_agent` is provided. |

---

## Active ISSUE Findings

### ISSUE-SBV — SBV Zero-Value Injections (P1, ONGOING / SLA NOW OK)

| Field | Value |
|-------|-------|
| **Evidence** | Rejections every 30 min through at least 19:59 UTC; `get_system_status` → 10 unresolved errors |
| **SLA status** | `get_sla_status` → `sbv_fx: 302/696 min = ok` (VPS push flowing; guard protecting DB) |
| **Root cause** | SBV VPS fetcher returning zero FX rates; likely SBV website HTML changed or returns zeros off-hours |
| **Fix** | Check VPS `/proxy/sbv` response body; update HTML parser; add off-hours zero-value detection |

### ISSUE-ISM — `get_ism_subcomponents` No Data (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Requires FRED_API_KEY."}` |
| **Impact** | ISM PMI subcomponents unavailable to news-scout, unified-agent US macro chain |
| **Fix** | Verify FRED_API_KEY env; check NAPMBI series ID validity |

### ISSUE-Reuters/TE — 230+ Consecutive Failures (P2, WORSENED)

| Field | Value |
|-------|-------|
| **Evidence** | Reuters RSS: 230 errors; Trading Economics×2: 230–231 errors; `Chưa bao giờ` (never fetched) |
| **Impact** | Degraded news coverage (VnExpress/CafeF/Bloomberg active); 0 cowork callers hard-blocked |
| **Fix** | Verify Reuters RSS endpoint (likely deprecated); investigate TE geo-blocking or API key |

### ISSUE-BDI — Baltic Dry Index 0 rows (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_pipeline_health` → BDI: rows=0, TA not ready |
| **Fix** | Update BDI fetcher endpoint or data provider |

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `wti_crude_usd 95.5`; Brent at $79.54 — $17+ spread physically impossible |
| **Fix** | Force-refresh WTI; check WTI fetcher vs Brent source divergence |

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `dow_jones 23750` — 2020-era COVID value |
| **Fix** | Force-refresh DJIA from Yahoo Finance or alternative |

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 80.0% (5 runs), avg 768,321 ms (12.8 min avg) |
| **Fix** | Review failure logs; consider job timeout extension or batching |

---

## Active IMPROVE Findings

### IMPROVE-6 — Bootstrap Enum Contains Deprecated Agents

| Field | Value |
|-------|-------|
| **Evidence** | `apps/mcp-server/src/interface/mcp/tools/system/cycleBootstrapTool.ts:27-28` — `financial-analyst`, `report-analyzer` in live enum |
| **Fix** | Prune deprecated values from schema enum |

### IMPROVE-N3 — bctcReparseJob 88.7% Success Rate

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 88.7% (106 runs), avg 221,477 ms; slightly worse than 18:05Z (89.1%) |
| **Fix** | Review 11% failure modes; categorize by error type |

### IMPROVE-EVN — Energy Grid Using Default Estimate

| Field | Value |
|-------|-------|
| **Evidence** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| **Fix** | Investigate EVN endpoint URL for structure change |

### IMPROVE-TA-DOC — `get_technical_indicators` Doc Param Drift

| Field | Value |
|-------|-------|
| **Evidence** | `docs/agents/tools/list/get_technical_indicators.md` documents param as `ticker`; live tool uses `code` |
| **Caller-surface** | 0 affected callers — doc drift only |
| **Fix** | 1-line fix: rename `ticker` → `code` in tool list doc |

---

## RESOLVED Since Prior Cycle (18:05Z)

| Finding | Resolution |
|---------|------------|
| ISSUE-SBV SLA breach | `get_sla_status` shows sbv_fx: 302/696 min = ok this cycle. VPS push confirmed flowing (sbv: last push 19:59:48, 40 24h pushes). Zero-value root cause still unresolved but SLA formally clear. |

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Latency | Notes |
|------|--------|---------|-------|
| `get_system_status` | ⚠️ DEGRADED | ~1ms | 10 unresolved errors; SBV zero-value; Reuters/TE Ngưng; WTI/DJIA stale; intelligence-cycle skip |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ PASS | 27ms | agent_signals=0; prices fresh (08:59 UTC); market closed as expected |
| `get_market_snapshot` | ✅ PASS | fast | VN-Index 1830.47 +1.34%; breadth 90↑/205↓/60→ |
| `get_macro_snapshot` | ✅ PASS | fast | source_tier:2; carry.is_estimate:false; oil $79.54; gold $4235; usdvnd 26111 |
| `get_cron_health` | ⚠️ DEGRADED | fast | **pollNewsJob: crashed** (most recent run 20:03:35); vnstockTradingStatsRefresh 80%; bctcReparseJob 88.7%; all others 99-100% |
| `get_pipeline_health` | ✅ PASS | fast | 41 tickers; BDI/DAG/DLC/JSH/SIS/VDC/VNH: TA not ready; NKG RSI 26.6 + REE RSI 28.3 oversold |
| `get_vps_proxy_health` | ⚠️ DEGRADED | fast | bctc STALE (0 24h pushes, last 2026-06-16 18:02); sbv/news/prices: ok |
| `get_vps_service_health` | ❌ UNHEALTHY | fast | `vn-bctc-fetch`: unhealthy, 0ms response, 2d 1h 57m uptime; `vn-sbv-fetch`: unhealthy, 1h 15m uptime (data flowing despite unhealthy status) |
| `get_sla_status` | ❌ BREACHED | fast | bctc: 2843/360 min CRITICAL; sbv_fx: 302/696 min ok (resolved from 18:05 breach) |
| `get_rate_limit_status` | ✅ PASS | fast | All 11 sources ready; 0 waiting |
| `get_earnings_calendar` | ✅ PASS | fast | 41 tickers tracked; 11 overdue (BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) |
| `get_alerts(limit=5)` | ✅ PASS | fast | Returns recent alerts correctly |
| `get_agent_signals(agent="market-watcher")` | ✅ PASS | fast | Returns "no signals" correctly |
| `get_agent_signals({from_agent:null,...})` | ❌ FAIL | — | `agent: Required` + `from_agent: Expected string, received null` — 3 broken call sites |
| `get_insider_signals({ticker:"VCB"})` | ❌ FAIL | — | `code: Required` + `outstandingShares: Required (number)` — 2 flow callers broken |
| `get_ism_subcomponents` | ❌ NO_DATA | fast | `error:no_data` — FRED_API_KEY not set / series unpopulated |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | fast | EVN hydro endpoint broken; default 70% estimate |
| `get_bctc_refined("non-existent")` | ✅ PASS | fast | Returns graceful `error: no refined units found` — correct |
| `task_claim` + `task_release` | ✅ PASS | fast | Claim returned `{claimed:true}`; release returned `{ok:true}`; ttl_seconds minimum=60 enforced |
| `get_vn_macro_indicators` | ✅ PASS | fast | IIP data fresh (2026-06); is_estimate:false |
| `get_cycle_bootstrap(invalid_agent)` | SCHEMA CORRECT | — | Enum validation fires correctly; by-design guard |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; monitor 24h push recovery. Now ~48h down. | ops / dev-vps-crawls | BUG-1/2 |
| **P0** | Check VPS `/proxy/sbv` response body; fix HTML parser for zero-value SBV rates | dev-vps-crawls | ISSUE-SBV |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional with DB auto-fetch | dev-mcp-server | BUG-NEW-A |
| **P1** | Add `agent: "<caller>"` to 3 broken call sites: `market-watcher/flow/main.md:54`, `news-scout/flow/stage-bootstrap.md:43`, `news-scout/flow/stage-bootstrap.md:56` | agent-father | BUG-NEW-C |
| **P1** | Investigate FRED_API_KEY + NAPMBI series ID; re-run macroIndicatorRefreshJob | dev-macro-indicators | ISSUE-ISM |
| **P1** | Check mcp-server logs around 20:03 UTC for pollNewsJob crash root cause | dev-mcp-server | NEW-ISSUE-POLLNEWS |
| **P2** | Force-refresh WTI crude ($95.5 impossible vs Brent $79.54) | dev-macro-indicators | ISSUE-WTI |
| **P2** | Force-refresh DJIA (23,750 → real ~42,000+) | dev-macro-indicators | ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecated endpoint; TE geo-blocking or API key | dev-mainserver-crawls | ISSUE-Reuters/TE |
| **P2** | Update BDI fetcher endpoint (72d+ stale, rows=0) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80%, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Prune deprecated enum from `get_cycle_bootstrap` (`financial-analyst`, `report-analyzer`) | dev-mcp-server | IMPROVE-6 |
| **P3** | Review bctcReparseJob 11% failure modes | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for energy grid hydro data | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Update `get_technical_indicators.md` doc: `ticker` → `code` (1-line fix, 0 affected callers) | dev-mcp-server | IMPROVE-TA-DOC |

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-18-2009.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1805.md` |
| Probes run | 21 tools |
| PASS | 10 |
| FAIL/DEGRADED/NO_DATA | 11 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC) |
| Active P1 BUGs | 2 (BUG-NEW-A insider, BUG-NEW-C agent_signals) |
| Active P1 ISSUEs | 3 (ISSUE-SBV, ISSUE-ISM, NEW-ISSUE-POLLNEWS) |
| Active P2 ISSUEs | 5 (Reuters/TE, BDI, WTI, DJIA, vnstock) |
| Active IMPROVEs | 4 |
| Resolved since 18:05Z | 1 (ISSUE-SBV SLA breach — SLA now ok; root cause ongoing) |
