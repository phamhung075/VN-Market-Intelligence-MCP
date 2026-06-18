# Team MCP Tool Health Recheck — 2026-06-18T18:05Z

**Cycle:** 2026-06-18T18:05Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-18-1608.md`

---

## Executive Summary

**1 P0 BUG ongoing** (BCTC VPS now 2721 min SLA breach — worsened from 2602 at 16:08Z; +119 min in ~2h).
**2 P1 BUGs ongoing** (`get_insider_signals` schema mismatch; `get_agent_signals` from_agent-only calls — all 3 broken patterns confirmed again).
**1 new SLA breach confirmed**: sbv_fx now breached HIGH (32 min / 30 min threshold) — direct consequence of ISSUE-SBV zero-value pattern.
All prior ISSUEs and IMPROVEs unchanged. Zero new resolutions this cycle.

---

## STEP 3c — Prior-Finding Delta (Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence (this cycle) |
|-----------|-------------|-------|-----------------------|
| BUG-1/2 | BUG P0 | **WORSENED** | bctc SLA: 2721 min (was 2602 at 16:08); `vn-bctc-fetch` UNHEALTHY uptime 1d 23h 57m; `get_sla_status` → breached CRITICAL |
| BUG-NEW-A | BUG P1 | **CONFIRMED** | `get_insider_signals({ticker:"VCB"})` → Required errors for both `code` and `outstandingShares` — unchanged |
| BUG-NEW-C | BUG P1 | **CONFIRMED** | `get_agent_signals({from_agent:null,...})` → Required `agent` + Expected string received null for `from_agent`. All 3 broken patterns re-confirmed |
| ISSUE-SBV | ISSUE P1 | **ONGOING + NEW SLA BREACH** | 4 new rejections: 16:29, 16:59, 17:29, 17:59 UTC; sbv_fx SLA now shows "breached HIGH" in `get_sla_status` (32 min / 30 min threshold) |
| ISSUE-ISM | ISSUE P1 | **CONFIRMED** | `get_ism_subcomponents` → `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows"}` |
| ISSUE-Reuters/TE | ISSUE P2 | **CONFIRMED** | Reuters: 213 errors; TE×2: 213, 214 errors — `get_system_status` source list |
| ISSUE-BDI | ISSUE P2 | **CARRIED (fresh signal)** | `get_pipeline_health` → BDI: rows=0, TA not ready — consistent with 72d+ stale |
| ISSUE-WTI | ISSUE P2 | **CONFIRMED** | `get_system_status` → `wti_crude_usd 95.5` (79 data points); brent_crude_usd 78.08 — impossible $17+ spread |
| ISSUE-DJIA | ISSUE P2 | **CONFIRMED** | `get_system_status` → `dow_jones 23750` (49 data points) — COVID-era 2020 value |
| ISSUE-vnstock | ISSUE P2 | **CONFIRMED** | `get_cron_health` → `vnstockTradingStatsRefresh 80.0%` (5 runs), avg 768,321 ms |
| IMPROVE-6 | IMPROVE | **CONFIRMED** | First call error text: enum includes `financial-analyst`, `report-analyzer` (deprecated per cowork-team flow) |
| IMPROVE-N3 | IMPROVE | **SLIGHTLY IMPROVED** | `bctcReparseJob` 89.1% (110 runs, avg 224,494 ms) — up from 88.4% at 16:08; trend improving |
| IMPROVE-EVN | IMPROVE | **CONFIRMED** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| IMPROVE-TA-DOC | IMPROVE | **CONFIRMED** | `docs/agents/tools/list/get_technical_indicators.md` still documents param as `ticker` not `code`; live tool uses `code` |

---

## Active BUG Findings

### BUG-1/2 — BCTC VPS Pipeline CRITICAL (P0, WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical |
| **SLA breach** | 2721 min elapsed / 360 min threshold (WORSENED; was 2602 at 16:08, +119 min) |
| **Last push** | 2026-06-16 18:02:24 UTC (≈48h ago) |
| **24h pushes** | 0 |
| **VPS health** | `get_vps_service_health` → `vn-bctc-fetch: unhealthy | 0ms response | uptime 1d 23h 57m` |
| **SLA status** | `get_sla_status` → `bctc: breached CRITICAL` |
| **Proxy health** | `get_vps_proxy_health` → bctc STALE (0 24h pushes, YES stale) |
| **Callers** | bctc-analyst (all cycles), refine_bctc_md (all cycles), unified-agent (Layer 4), digest-predict (weekly), market-analyst (on-demand) — **≥5 callers** |
| **Probe cmd** | `get_vps_service_health` + `get_sla_status` + `get_vps_proxy_health` |
| **Fix** | SSH to VPS → `systemctl status vn-bctc-fetch` / `journalctl -u vn-bctc-fetch -n 100`; restart service; monitor for 24h push recovery |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, ONGOING)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 |
| **Probe** | `get_insider_signals({ticker:"VCB"})` → `Required` for `code` AND `Required` (type: number) for `outstandingShares` |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md`: `outstandingShares | No | auto-fetch` (documented as optional, auto-fetch from BCTC) |
| **Live contract** | Both `code` and `outstandingShares` are `Required` |
| **Callers** | Grep: `grep -rn "get_insider_signals" docs/agents/*/flow/*.md` |
| | `market-watcher/flow/eod.md:59` — calls `get_insider_signals(code="{TICKER}")` — no `outstandingShares` → **BROKEN** |
| | `bctc-analyst/flow/stage-analyze.md:49` — `get_insider_signals()` no explicit args shown → **LIKELY BROKEN** |
| | `unified-agent/flow/market-analysis.md:8` — note says "requires code + outstandingShares — call per-ticker on event trigger" → already corrected in note, **AWARE** |
| **Caller count** | **2 confirmed broken callers** |
| **Fix** | Restore `outstandingShares` as optional in live tool schema (implement DB auto-fetch from `bctc` table as documented) |

### BUG-NEW-C — `get_agent_signals` from_agent-only Calls All Broken (P1, CONFIRMED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 |
| **Probe 1** | `get_agent_signals({from_agent:null, status:"all", hours_back:0.25})` → `agent: Required` + `from_agent: Expected string, received null` |
| **Probe 2** | `get_agent_signals({agent:"market-watcher", status:"all", hours_back:2})` → ✅ PASS — correct call works |
| **Doc contract** | `docs/agents/tools/list/get_agent_signals.md`: `agent` Required; `from_agent` optional — doc does NOT clarify that `agent` is still required when `from_agent` is provided |
| **Callers** | Grep: `grep -rn "from_agent" docs/agents/market-watcher/flow/main.md docs/agents/news-scout/flow/stage-bootstrap.md` |
| | `market-watcher/flow/main.md:54` — `{from_agent: null, status: "all", hours_back: 0.25}` — no `agent` → **BROKEN** |
| | `news-scout/flow/stage-bootstrap.md:43` — `{from_agent: "news-scout", status: "all", hours_back: 6}` — no `agent` → **BROKEN** |
| | `news-scout/flow/stage-bootstrap.md:56` — `{from_agent: null, status: "all", hours_back: 0.25}` — no `agent` → **BROKEN** |
| **Impact** | market-watcher gateway-down guard blind; news-scout sibling dedup (SIBLING_WINDOW_CACHE) and feedback tuning (SELF_SIGNALS_CACHE) disabled — both non-fatal (Non-fatal comment in flow) but degrades dedup and tuning |
| **Caller count** | **3 broken call sites in 2 files** |
| **Fix** | Add `agent: "<calling_agent>"` to each of the 3 call sites. OR fix tool schema to make `agent` optional when `from_agent` is provided (cleaner fix) |

---

## Active ISSUE Findings

### ISSUE-SBV — SBV Zero-Value Injections + SLA Breach (P1, WORSENED)

| Field | Value |
|-------|-------|
| **Evidence** | 4 new rejections this cycle: 16:29, 16:59, 17:29, 17:59 UTC. Pattern: every 30 min, all day. |
| **NEW** | `get_sla_status` now shows `sbv_fx: breached HIGH (32 min / 30 min threshold)` — SLA formally breached this cycle |
| **Data guard** | Server-side zero-value guard working correctly — DB not corrupted; proxy health shows sbv OK |
| **Root cause** | SBV VPS fetcher sending zero FX rates; likely SBV website HTML structure changed or returns zeros off-hours |
| **Callers** | `get_macro_snapshot`, `get_vn_liquidity_state` — **~2 callers** |
| **Fix** | Check VPS `/proxy/sbv` response body; update HTML parser for new SBV page structure; add off-hours detection |

### ISSUE-ISM — `get_ism_subcomponents` Returns no_data (P1, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_ism_subcomponents` → `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| **Callers** | news-scout (US monetary chain), unified-agent — **2 callers** |
| **Fix** | Check FRED_API_KEY env; verify NAPMBI series ID at fred.stlouisfed.org; may need series rename |

### ISSUE-Reuters — Reuters RSS + Trading Economics Never Connected (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Reuters RSS: 213 consecutive errors; TE×2: 213, 214 errors; `get_system_status` source list: `Ngưng`, `Chưa bao giờ` |
| **Caller impact** | `fetch_and_analyze` VN articles active (VnExpress/CafeF); **0 cowork callers hard-blocked** |
| **Fix** | Verify Reuters RSS URL (likely deprecated endpoint); investigate TE geo-blocking or API key |

### ISSUE-BDI — Baltic Dry Index Stale 72d+ (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_pipeline_health` → `BDI: rows=0, TA not ready` — consistent with prior report stale since 2026-04-07 |
| **Callers** | `get_supply_chain_exposure` — **1 caller** |
| **Fix** | Update BDI fetcher endpoint or data provider |

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `wti_crude_usd 95.5` (79 data points); `brent_crude_usd 78.08` — WTI $17+ above Brent is physically impossible |
| **Note** | `get_macro_snapshot` uses brent correctly ($78.08) — but wti stale value pollutes `get_energy_grid_signals` context |
| **Callers** | `get_macro_snapshot`, `get_energy_grid_signals` — **~2 callers** |
| **Fix** | Force-refresh WTI; check WTI fetcher parsing vs Brent source |

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `dow_jones 23750` (49 data points) — COVID 2020-era value; real ~42,000+ in 2026 |
| **Callers** | `get_macro_snapshot` — **1 caller** |
| **Fix** | Force-refresh DJIA from Yahoo Finance or alternative; check fetcher endpoint |

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 80.0% (5 runs), avg duration 768,321 ms (12.8 min avg) |
| **Callers** | market data enrichment pipeline — **~2 callers** |
| **Fix** | Review failure logs; consider job timeout extension |

---

## Active IMPROVE Findings

### IMPROVE-6 — Bootstrap Deprecated Agent Enum (ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | First schema validation error text: enum includes `financial-analyst`, `report-analyzer` (not in active cowork-team roster) |
| **Fix** | Prune deprecated values from `get_cycle_bootstrap` schema |

### IMPROVE-N3 — bctcReparseJob 89% Success Rate (SLIGHTLY IMPROVED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 89.1% (110 runs, avg 224,494 ms); up from 88.4%/121 runs at 16:08 |
| **Note** | Average duration 224s (3.7 min) — within normal bounds for PDF reparse |
| **Fix** | Review 11% failure modes; categorize if network vs parse vs timeout |

### IMPROVE-EVN — Energy Grid Using Estimate (ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| **Fix** | Investigate EVN endpoint URL; check for page structure change |

### IMPROVE-TA-DOC — `get_technical_indicators` Doc Param Drift (ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `docs/agents/tools/list/get_technical_indicators.md` documents param as `ticker` — live tool uses `code` |
| **Grep** | `grep -rn "get_technical_indicators" docs/agents/*/flow/*.md` → all callers use `code` correctly |
| **Caller-surface** | **0 affected callers** — doc drift only, no runtime impact |
| **Fix** | 1-line fix: rename `ticker` → `code` in tool list doc |

---

## RESOLVED Since Prior Cycle (16:08Z)

None — all prior findings confirmed ongoing this cycle.

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Latency | Notes |
|------|--------|---------|-------|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ PASS | 496ms | 823 alerts pending; last analysis 17:22; sub-calls: agent_signals 420ms, market_context 75ms |
| `get_system_status` | ⚠️ DEGRADED | ~1ms | 10 unresolved errors; SBV rejections; Reuters/TE Ngưng; WTI/DJIA stale |
| `get_vps_proxy_health` | ⚠️ DEGRADED | fast | bctc STALE (0 24h pushes, ≈48h); sbv proxy shows OK but zero-value rejection |
| `get_vps_service_health` | ❌ UNHEALTHY | fast | `vn-bctc-fetch`: unhealthy, 0ms response, 1d 23h 57m uptime |
| `get_sla_status` | ❌ BREACHED | fast | bctc: 2721 min / 360 threshold CRITICAL; sbv_fx: 32 min / 30 threshold HIGH |
| `get_cron_health` | ✅ PASS | fast | Most 99-100%; `vnstockTradingStatsRefresh` 80.0%; `bctcReparseJob` 89.1%; `bctcPdfPullJob` 99.2% |
| `get_macro_snapshot` | ✅ PASS | fast | source_tier:2; vnIndex 1830.47; oil $78.08; gold $4249.4; carry.is_estimate:false |
| `get_pipeline_health` | ✅ PASS | fast | 41 tickers; 7 TA-not-ready (BDI/DAG/DLC/JSH/SIS/VDC/VNH); 2 oversold signals (NKG RSI 26.6, REE RSI 28.3) |
| `emit_pressure_state` | ⚠️ STALE | fast | stale_warning:true, cycle_snapshot_promoted:false |
| `get_agent_signals(agent="market-watcher",status="all",hours_back=2)` | ✅ PASS | fast | 1 signal (VEA verified_decision from alert-engine) |
| `get_agent_signals(agent="news-scout",from_agent="news-scout",hours_back=2)` | ✅ PASS | fast | Empty — correct |
| `get_agent_signals({from_agent:null,status:"all",hours_back:0.25})` | ❌ FAIL | — | `agent: Required` + `from_agent: Expected string, received null` — 2 call sites broken |
| `get_insider_signals({ticker:"VCB"})` | ❌ FAIL | — | `code: Required` + `outstandingShares: Required (number)` — 2 flow callers broken |
| `get_ism_subcomponents` | ❌ NO_DATA | fast | `error: no_data` — FRED NAPMBI not populated |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | fast | EVN hydro endpoint broken; default 70% estimate |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status/restart vn-bctc-fetch` + monitor 24h push recovery. Now ≈48h down. | ops / dev-vps-crawls | BUG-1/2 |
| **P0** | Check VPS `/proxy/sbv` response body; fix zero-value HTML parse (SBV SLA now formally breached HIGH) | dev-vps-crawls | ISSUE-SBV |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional with DB auto-fetch from `bctc` table | dev-mcp-server | BUG-NEW-A |
| **P1** | Add `agent: "<caller>"` to 3 broken call sites: `market-watcher/flow/main.md:54`, `news-scout/flow/stage-bootstrap.md:43`, `news-scout/flow/stage-bootstrap.md:56` | agent-father | BUG-NEW-C |
| **P1** | Investigate FRED NAPMBI HTTP 400: verify series ID + FRED_API_KEY env | dev-macro-indicators | ISSUE-ISM |
| **P2** | Force-refresh WTI crude ($95.5 stale vs Brent $78.08) | dev-macro-indicators | ISSUE-WTI |
| **P2** | Force-refresh DJIA (23,750 → real ~42,000 in 2026) | dev-macro-indicators | ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecation; TE connection/API-key | dev-mainserver-crawls | ISSUE-Reuters |
| **P2** | Investigate BDI fetcher (72d stale, rows=0) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80%, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Prune deprecated enum from `get_cycle_bootstrap` (financial-analyst, report-analyzer) | dev-mcp-server | IMPROVE-6 |
| **P3** | Review bctcReparseJob 11% failure modes (89.1% success) | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for energy grid estimate | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Update tool list doc: `get_technical_indicators.md` param `ticker` → `code` (1-line fix) | dev-mcp-server | IMPROVE-TA-DOC |

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1805.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1608.md` |
| Probes run | 15 tools |
| PASS | 7 |
| FAIL/DEGRADED/STALE | 8 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC) |
| Active P1 BUGs | 2 (BUG-NEW-A insider, BUG-NEW-C agent_signals) |
| Active P2 BUGs | 0 |
| Active P1 ISSUEs | 2 (ISSUE-SBV worsened, ISSUE-ISM) |
| Active P2 ISSUEs | 5 (Reuters/TE, BDI, WTI, DJIA, vnstock) |
| Active IMPROVEs | 4 |
| Resolved since 16:08 | 0 |
