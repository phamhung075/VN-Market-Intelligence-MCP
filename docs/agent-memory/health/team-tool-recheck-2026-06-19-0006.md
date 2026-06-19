# Team MCP Tool Health Recheck — 2026-06-19T00:06Z

**Cycle:** 2026-06-19T00:06Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-18-2207.md`

---

## Executive Summary

**P0 BUG WORSENED** — BCTC VPS pipeline now 3085 min SLA breach (was 2961 at 22:07Z, +124 min in ~2h; service down ~51.4h). No VPS recovery observed.
**2 P1 BUGs UNCHANGED** — `get_insider_signals` schema mismatch; `get_agent_signals` from_agent-only call sites broken (2 flow files).
**2 FINDINGS RESOLVED** — `ISSUE-SBV` (SBV FX SLA now OK, 6/30 min); `NEW-ISSUE-VNM-TA` (VNM OHLCV contamination gone — MA20=58,910 now correct).
**All other ISSUEs/IMPROVEs unchanged** — ISM no-data, Reuters/TE chronic, BDI zero rows, WTI stale at $95.5, DJIA stale at 23,750, EVN estimate, bctcReparseJob 89.7%.

---

## STEP 3c — Prior-Finding Delta (Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence (this cycle) |
|-----------|-------------|-------|-----------------------|
| BUG-1/2 | BUG P0 | **WORSENED** | `get_sla_status` → `bctc: 3085/360 CRITICAL` (+124 min since 22:07Z); `get_vps_proxy_health` → bctc STALE, 0 24h pushes, last 2026-06-16 18:02:24; `get_vps_service_health` → `vn-bctc-fetch: unhealthy` |
| BUG-NEW-A | BUG P1 | **CONFIRMED UNCHANGED** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` — same error |
| BUG-NEW-C | BUG P1 | **CONFIRMED UNCHANGED** | `get_agent_signals({from_agent:null, status:"all", hours_back:0.25})` → `agent: Required`; 2 broken call sites confirmed: `market-watcher/flow/main.md:54`, `news-scout/flow/stage-bootstrap.md:56` |
| ISSUE-SBV | ISSUE P1 | **RESOLVED ✅** | `get_sla_status` → `sbv_fx: 6/30 min = ok`; VPS push log shows recent sbv push at 23:59:58; zero-value rejections ceased |
| ISSUE-ISM | ISSUE P1 | **CONFIRMED UNCHANGED** | `get_ism_subcomponents` → `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| ISSUE-Reuters/TE | ISSUE P2 | **ONGOING (CHRONIC)** | Source health still shows Reuters RSS: "Ngưng", 6+ failures; Trading Economics×2: "Ngưng", 6+ failures; "Chưa bao giờ" (never succeeded post-restart) |
| ISSUE-BDI | ISSUE P2 | **CONFIRMED** | `get_pipeline_health` → `BDI: rows=0, TA not ready` |
| ISSUE-WTI | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_system_status` → `wti_crude_usd 95.5`; Brent at $78.97 — $16+ spread physically impossible |
| ISSUE-DJIA | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_system_status` → `dow_jones 23750` — COVID-era 2020 value (actual ~42,000+) |
| ISSUE-vnstock | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_cron_health` → `vnstockTradingStatsRefresh`: 80.0% (5 runs), avg 768,321 ms |
| IMPROVE-6 | IMPROVE | **CONFIRMED** | `get_cycle_bootstrap` enum still includes `financial-analyst`, `report-analyzer` (deprecated agents) |
| IMPROVE-N3 | IMPROVE | **SLIGHTLY IMPROVED** | `bctcReparseJob`: 89.7% (107 runs) — marginal improvement from 89.4% at 22:07Z; avg 208,308 ms |
| IMPROVE-EVN | IMPROVE | **CONFIRMED** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| IMPROVE-TA-DOC | IMPROVE | **CONFIRMED** | `get_technical_indicators({ticker:"VNM"})` fails requiring `code`; doc still says `ticker`; 0 affected callers |
| NEW-ISSUE-VNM-TA | ISSUE P2 | **RESOLVED ✅** | `get_technical_indicators(code="VNM")` → MA5=59,200 ✅; MA20=58,910 ✅; MACD Line=-342 ✅; BB Upper=59,749/Lower=58,071 ✅ — contaminated rows purged or overwritten |

---

## Active BUG Findings (Re-confirmed This Cycle)

### BUG-1/2 — BCTC VPS Pipeline CRITICAL (P0, WORSENING)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical |
| **SLA breach** | 3085 min elapsed / 360 min threshold (+124 min since 22:07Z); service down ~51.4h |
| **Last push** | 2026-06-16 18:02:24 UTC |
| **24h pushes** | 0 |
| **VPS service** | `vn-bctc-fetch: unhealthy`, response 0 ms, VPS uptime 2d 5h 57m |
| **Probe** | `get_sla_status` → `bctc: 3085/360 min CRITICAL`; `get_vps_proxy_health` → bctc STALE |
| **Callers** | bctc-analyst (all cycles), refine_bctc_md, unified-agent (Layer 4), digest-predict (weekly) — ≥5 callers |
| **Fix** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; monitor 24h push recovery |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` — schema requires both fields, callers omit them |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md`: `outstandingShares` documented as optional with auto-fetch |
| **Affected callers** | `market-watcher/flow/eod.md:59` — `get_insider_signals(code="{TICKER}")` without `outstandingShares` → BROKEN; `bctc-analyst/flow/stage-analyze.md:49` → LIKELY BROKEN |
| **Fix** | Restore `outstandingShares` as optional; implement DB auto-fetch from `bctc` table as documented |

### BUG-NEW-C — `get_agent_signals` `agent` Required, Breaking 2 Call Sites (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_agent_signals({from_agent:null, status:"all", hours_back:0.25})` → `agent: Required` (validation error) |
| **Broken call sites** | `market-watcher/flow/main.md:54` (sibling corroboration probe, gateway-down detection path — omits `agent`); `news-scout/flow/stage-bootstrap.md:56` (SIBLING_WINDOW_CACHE — omits `agent`; non-fatal fallback masks issue) |
| **Caller-surface grep** | `grep -rn 'get_agent_signals' docs/agents/*/flow/*.md` run this cycle: alert-commander (2 calls) and tran-ngoc-bau both use correct `agent:` param; only the above 2 call sites are broken |
| **Impact** | market-watcher gateway-down corroboration blind (latent bug fires during outages → false-positive BUG alert); news-scout cross-sibling dedup disabled |
| **Fix** | Add `agent: "<calling_agent>"` to both broken call sites, OR make `agent` optional when `from_agent` is provided in tool schema |

---

## Active ISSUE Findings

### ISSUE-ISM — `get_ism_subcomponents` No Data (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| **Impact** | ISM PMI subcomponents unavailable to news-scout, unified-agent US macro chain |
| **Fix** | Verify FRED_API_KEY env var; re-run macroIndicatorRefreshJob to populate ISM series |

### ISSUE-Reuters/TE — Chronic Source Failures (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Reuters RSS: "Ngưng", 6+ consecutive failures, never succeeded; Trading Economics×2: "Ngưng", 6+ failures, never succeeded; source health confirms post-restart persistence |
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
| **Evidence** | `get_system_status` → `wti_crude_usd 95.5`; Brent at $78.97 — $16+ spread physically impossible |
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
| **Evidence** | `get_cycle_bootstrap` enum in `cycleBootstrapTool.ts` still includes `financial-analyst`, `report-analyzer` |
| **Fix** | Prune deprecated values from enum |

### IMPROVE-N3 — bctcReparseJob 89.7% Success Rate

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 89.7% (107 runs), avg 208,308 ms — slight improvement (was 89.4% at 22:07Z) |
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

## RESOLVED Since Prior Cycle (22:07Z)

| Finding | Resolution | Proof |
|---------|------------|-------|
| ISSUE-SBV | SBV zero-value injections ceased | `get_sla_status` → `sbv_fx: 6/30 min = ok`; VPS push log shows recent sbv push at 23:59:58 |
| NEW-ISSUE-VNM-TA | VNM OHLCV contamination purged | `get_technical_indicators(code="VNM")` → MA20=58,910 ✅ (was 3,680,960 ❌); BB range normal |

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Latency | Notes |
|------|--------|---------|-------|
| `get_system_status` | ⚠️ DEGRADED | — | 10 unresolved errors; HNX/UPCOM price fails repeating; intelligence-cycle skip; Reuters/TE stopped |
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ PASS | 25ms | agent_signals=[]; market context fresh; prices as expected for off-hours |
| `get_market_snapshot` | ✅ PASS | — | VN-Index 1830.47 +1.34%; breadth 90↑/205↓/60→; source_tier:2 |
| `get_macro_snapshot` | ✅ PASS | — | source_tier:2; oil $78.97 neutral; gold $4214.3 bullish; usdvnd 26111 bearish |
| `get_cron_health` | ✅ MOSTLY OK | — | bctcReparseJob 89.7%; vnstockTradingStatsRefresh 80%; all others ≥99% |
| `get_pipeline_health` | ⚠️ DEGRADED | — | BDI/DAG/DLC/JSH/SIS/VDC/VNH: TA not ready (rows=0/1/5); NKG+REE oversold |
| `get_vps_proxy_health` | ⚠️ DEGRADED | — | bctc STALE (0 24h pushes, last 2026-06-16 18:02); sbv/news/prices: ok |
| `get_sla_status` | ❌ BREACHED | — | bctc: 3085/360 min CRITICAL; sbv_fx: 6/30 min ok ✅ (resolved) |
| `get_vps_service_health` | ⚠️ DEGRADED | — | vn-bctc-fetch: unhealthy; 2 healthy (news, sbv); 2 idle (market closed) |
| `get_vn_macro_indicators` | ✅ PASS | — | IIP 2026-06 data; is_estimate:false; PROBE-3 PASS |
| `get_earnings_calendar` | ✅ PASS | — | 41 tickers; 12 overdue (BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) |
| `get_ism_subcomponents` | ❌ NO_DATA | — | `error:no_data`; FRED_API_KEY missing/series empty |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | — | EVN hydro endpoint broken; default 70% estimate |
| `get_technical_indicators(code="VNM")` | ✅ PASS | — | MA20=58,910 ✅ (contamination resolved since prior cycle) |
| `get_agent_signals(agent="news-scout")` | ✅ PASS | — | Returns "Không có tín hiệu mới" correctly |
| `get_agent_signals({from_agent:null,...})` | ❌ FAIL | — | `agent: Required` — 2 broken call sites in flow files |
| `get_insider_signals({ticker:"VCB"})` | ❌ FAIL | — | `code: Required` + `outstandingShares: Required` — 2 flow callers broken |
| `emit_pressure_state` | ⚠️ STALE_WARN | — | `stale_warning: true` returned |
| `task_list_held` | ✅ PASS | — | 7 locks; cowork-leader-lock + published slots + bctc sprint-task |
| `get_recent_signals(hours=6)` | ✅ PASS | — | 45 signals; all from alert-engine, verified_decision type |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; monitor 24h. Now **51.4h** down. | ops / dev-vps-crawls | BUG-1/2 |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional with DB auto-fetch (documented in tool contract) | dev-mcp-server | BUG-NEW-A |
| **P1** | Add `agent: "<caller>"` to 2 broken call sites: `market-watcher/flow/main.md:54` (sibling corroboration), `news-scout/flow/stage-bootstrap.md:56` (SIBLING_WINDOW_CACHE) | agent-father | BUG-NEW-C |
| **P1** | Verify FRED_API_KEY env var; re-run macroIndicatorRefreshJob to populate ISM series | dev-macro-indicators | ISSUE-ISM |
| **P2** | Force-refresh WTI crude ($95.5 impossible vs Brent $78.97) | dev-macro-indicators | ISSUE-WTI |
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
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-19-0006.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-18-2207.md` |
| Probes run | 20 tools |
| PASS | 11 |
| FAIL/DEGRADED/NO_DATA | 9 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC — worsened, 51.4h down) |
| Active P1 BUGs | 2 (BUG-NEW-A insider, BUG-NEW-C agent_signals) |
| Active P1 ISSUEs | 1 (ISSUE-ISM) |
| Active P2 ISSUEs | 5 (Reuters/TE, BDI, WTI, DJIA, vnstock) |
| Active IMPROVEs | 4 |
| Resolved since 22:07Z | 2 (ISSUE-SBV, NEW-ISSUE-VNM-TA) |
| New findings | 0 |
