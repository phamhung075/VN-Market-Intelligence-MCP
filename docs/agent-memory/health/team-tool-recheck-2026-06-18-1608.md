# Team MCP Tool Health Recheck — 2026-06-18T16:08Z

**Cycle:** 2026-06-18T16:08Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-18-1410.md`

---

## Executive Summary

**1 P0 BUG ongoing** (BCTC VPS now 2602 min SLA breach — worsened from 2485 at 14:10).
**2 P1 BUGs ongoing** (`get_insider_signals` schema mismatch; `get_agent_signals` from_agent-only calls — BUG-NEW-C now confirmed for ALL 3 patterns including from_agent non-null).
**1 RESOLVED** since 14:10: ISSUE-BCTC-PAYLOAD is non-issue — caller-surface-verified (refine_bctc_md uses `limit:1`; no oversized response with that call).
SBV zero-value rejections (14:29–15:59), ISM no_data, Reuters/TE stopped, WTI $95.5 stale, DJIA 23,750 stale, vnstock 80%, EVN estimate — all ONGOING unchanged.

---

## STEP 3c — Prior-Finding Delta (Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence (this cycle) |
|-----------|-------------|-------|-----------------------|
| BUG-1/BUG-2 | BUG P0 | **WORSENED** | bctc SLA: 2602 min elapsed (was 2485 at 14:10); `vn-bctc-fetch` still UNHEALTHY, 0ms response, 0 24h pushes; `get_sla_status` → breached CRITICAL |
| BUG-NEW-A | BUG P1 | **NOT RE-PROBED** | No code change detected; carried as ONGOING from 14:10 |
| BUG-NEW-C | BUG P1/P2 | **CONFIRMED + WORSENED** | Re-probed: `get_agent_signals({from_agent:"news-scout",...})` without `agent` → same Required error; ALL 3 patterns broken (prev cycle only confirmed null pattern); 3 callers affected |
| ISSUE-SBV | ISSUE P1 | **ONGOING** | System errors: 4 new rejections at 14:29, 14:59, 15:29, 15:59 UTC |
| ISSUE-ISM | ISSUE P1 | **ONGOING** | system_status WARN `get_ism_subcomponents: no ISM data in fred_series_daily` — confirmed via current cycle system_status |
| ISSUE-Reuters/TE | ISSUE P2 | **ONGOING** | Reuters RSS: 194 errors; TE×2: 194–195 errors — all "Ngưng" |
| ISSUE-BDI | ISSUE P2 | **NOT RE-PROBED** | Carried as ONGOING; no fetcher fix detected |
| ISSUE-WTI | ISSUE P2 | **ONGOING** | system_status `wti_crude_usd 95.5` (79 data points) — still stale; Brent=$77 confirms WTI spread impossible |
| ISSUE-DJIA | ISSUE P2 | **ONGOING** | system_status `dow_jones 23750` — unchanged |
| ISSUE-vnstock | ISSUE P2 | **ONGOING** | `get_cron_health`: vnstockTradingStatsRefresh 80.0% (5 runs), avg 768,321 ms |
| ISSUE-BCTC-PAYLOAD | ISSUE P2 | **✅ RESOLVED — NON-ISSUE** | Re-probe `get_bctc_pending_refine({limit:1})` → 1 item returned cleanly. Flow `refine_bctc_md/flow/main.md` always calls `{limit:1}`. Caller-surface-verified: 0 affected callers use unbounded call. DROP from active list. |
| IMPROVE-6 | IMPROVE | **ONGOING** | `get_cycle_bootstrap` enum still includes `financial-analyst` (deprecated) — no schema change detected |
| IMPROVE-N3 | IMPROVE | **SLIGHTLY IMPROVED** | bctcReparseJob: 88.4% (121 runs) up from 87.0%; trending stable |
| IMPROVE-EVN | IMPROVE | **NOT RE-PROBED** | No fix detected; carried as ONGOING |

---

## Active BUG Findings

### BUG-1/BUG-2 — BCTC VPS Pipeline CRITICAL (P0, WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical |
| **SLA breach** | 2602 min elapsed / 360 min threshold (WORSENED from 2485 at 14:10; +117 min gap) |
| **Last push** | 2026-06-16 18:02:24 UTC (≈46h ago and counting) |
| **24h pushes** | 0 |
| **VPS health** | `get_vps_service_health` → `vn-bctc-fetch: unhealthy | 0ms response | uptime 1d 21h 57m` |
| **SLA status** | `get_sla_status` → `bctc: breached CRITICAL` |
| **Proxy health** | `get_vps_proxy_health` → bctc STALE (0 24h pushes, `YES` stale flag) |
| **BCTC queue** | `get_bctc_pending_refine({limit:1})` → VCB Q1-2026 in PARTIAL refine (paused; no new PDFs queued since outage) |
| **Callers** | bctc-analyst (all cycles), refine_bctc_md (all cycles), unified-agent (Layer 4 valuation), digest-predict (weekly), market-analyst (on-demand) — **≥5 callers** |
| **Fix** | SSH to VPS → `systemctl status vn-bctc-fetch` / `journalctl -u vn-bctc-fetch -n 100`; restart + confirm 24h push recovery |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, ONGOING)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 |
| **Evidence** | `get_insider_signals({ticker:"VCB"})` → requires `code` (not `ticker`) AND `outstandingShares: number` (marked optional in doc) |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md` marks `outstandingShares` optional (auto-fetch from DB) |
| **Callers** | `grep -rn "get_insider_signals" docs/agents/*/flow/*.md` → market-watcher `eod.md`, bctc-analyst `stage-analyze.md` — **2 callers** |
| **Fix** | Restore `outstandingShares` as optional in live schema (auto-fetch from DB). Secondary: update callers to pass `outstandingShares`. |

### BUG-NEW-C — `get_agent_signals` from_agent-only Calls All Broken (P1, CONFIRMED WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 — now confirmed for all 3 patterns (prev cycle only confirmed null pattern) |
| **Re-probe this cycle** | (1) `{from_agent:null, status:"all", hours_back:0.25}` → Required error for `agent`. (2) `{from_agent:"news-scout", status:"all", hours_back:2}` → SAME Required error. Confirms ALL 3 call sites broken. |
| **Affected callers** | 3 call sites in 2 files: |
| | (1) `market-watcher/flow/main.md:53-57` — Step 0-GW sibling corroboration (`from_agent:null`) — gateway false-positive protection non-functional |
| | (2) `news-scout/flow/stage-bootstrap.md:43-47` — `SELF_SIGNALS_CACHE` (`from_agent:"news-scout"`, no `agent`) — feedback-acceptance-rate tuning never runs |
| | (3) `news-scout/flow/stage-bootstrap.md:56-60` — `SIBLING_WINDOW_CACHE` (`from_agent:null`) — cross-sibling dedup always falls to default thresholds |
| **Impact** | Market-watcher gateway-down guard blind; news-scout sibling dedup and feedback tuning disabled. Core signal reads (with correct `agent:` param) unaffected. |
| **Grep** | `grep -rn "from_agent" docs/agents/market-watcher/flow/main.md docs/agents/news-scout/flow/stage-bootstrap.md` → 3 matches |
| **Fix** | Add `agent: "<calling_agent>"` to each of the 3 call sites. Tool ignores `agent` for read-mark when `from_agent` is provided, but validation still requires the field. |

---

## Active ISSUE Findings

### ISSUE-SBV — SBV Zero-Value Injections Recurring (P1, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | 4 new rejections this cycle window: 14:29, 14:59, 15:29, 15:59 UTC. Pattern: every 30 min, all day. |
| **Data guard** | Server-side zero-value guard working correctly — DB not corrupted |
| **Root cause** | SBV VPS fetcher sending zero FX rates; likely SBV website HTML structure changed |
| **Callers** | `get_macro_snapshot`, `get_vn_liquidity_state` — **~2 callers** |
| **Fix** | Check VPS `/proxy/sbv` response body; update HTML parser for new SBV page structure |

### ISSUE-ISM — `get_ism_subcomponents` Returns no_data (P1, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | system_status WARN: `get_ism_subcomponents: no ISM data in fred_series_daily`; prior report confirmed FRED NAPMBI HTTP 400 |
| **Callers** | news-scout (US monetary chain), unified-agent — **2 callers** |
| **Fix** | Check FRED_API_KEY env; verify NAPMBI series ID at fred.stlouisfed.org; may need series rename |

### ISSUE-Reuters — Reuters RSS + Trading Economics Never Connected (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Reuters RSS: 194 consecutive errors; TE×2: 194–195 errors — `get_system_status` source list confirms |
| **Caller impact** | `fetch_and_analyze` VN articles still active (VnExpress/CafeF) — **0 cowork callers hard-blocked** |
| **Fix** | Verify Reuters RSS URL (may be deprecated); investigate TE geo-blocking or API key |

### ISSUE-BDI — Baltic Dry Index Stale 72d+ (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Prior report: system status BDI last data 2026-04-07 |
| **Callers** | `get_supply_chain_exposure` — **1 caller** |
| **Fix** | Update BDI fetcher endpoint or data provider |

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | system_status `wti_crude_usd 95.5` (79 data points); Brent at $77.00 — WTI $17+ above Brent is physically impossible |
| **Callers** | `get_macro_snapshot`, `get_energy_grid_signals` — **~2 callers** |
| **Fix** | Force-refresh WTI from commodity feed; check WTI fetcher parsing vs Brent source |

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | system_status `dow_jones 23750` (79 data points) — COVID 2020-era value; real ~42,000 in 2026 |
| **Callers** | `get_macro_snapshot` — **1 caller** |
| **Fix** | Force-refresh DJIA from Yahoo Finance or alternative; check fetcher endpoint |

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 80.0% (5 runs), avg duration 768,321 ms (12.8 min) |
| **Callers** | market data enrichment pipeline — **~2 callers** |
| **Fix** | Review failure logs; consider job timeout extension |

---

## Active IMPROVE Findings

### IMPROVE-6 — Bootstrap Deprecated Agent Enum (ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cycle_bootstrap` error text: enum includes `financial-analyst`, `report-analyzer` (deprecated agents per cowork-team flow) |
| **Fix** | Prune deprecated values from `get_cycle_bootstrap` schema |

### IMPROVE-N3 — bctcReparseJob 88% Success Rate (SLIGHTLY IMPROVED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 88.4% success (121 runs, avg 230s); up from 87.0% last cycle |
| **Fix** | Review reparse failure logs; categorize failure modes |

### IMPROVE-EVN — Energy Grid Using Estimate (ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Prior report: `get_energy_grid_signals` returns `using_estimate: true` (EVN endpoint broken) |
| **Fix** | Investigate EVN endpoint URL; check for page structure change |

### IMPROVE-TA-DOC — `get_technical_indicators` / `get_price_history` Doc Param Drift (NEW)

| Field | Value |
|-------|-------|
| **Evidence** | `docs/agents/tools/list/get_technical_indicators.md` and `get_price_history.md` both document `ticker` param; live tool uses `code`. Flow files already use correct `code`. |
| **Grep** | `grep -rn "get_technical_indicators(code\|get_price_history(code" docs/agents/*/flow/*.md` → all 3 callers use `code` ✓ |
| **Caller-surface** | 0 callers use broken `ticker` param in flow files. Doc drift only, no runtime impact. |
| **Fix** | Update tool list docs to use `code` not `ticker` (1-line fix each) |

---

## RESOLVED Since Prior Cycle (14:10Z)

| Finding ID | Prior Class | Resolution |
|-----------|-------------|------------|
| ISSUE-BCTC-PAYLOAD | ISSUE P2 | **RESOLVED — NON-ISSUE**: `refine_bctc_md/flow/main.md` always calls `get_bctc_pending_refine({limit:1})`. Re-probe with `{limit:1}` returned clean 21-window response. Caller-surface-verified: 0 affected callers. |

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Latency | Notes |
|------|--------|---------|-------|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ PASS | 12ms | 822 alerts pending; last analysis 13:37 |
| `get_system_status` | ⚠️ DEGRADED | ~1ms | 10 unresolved errors; sbv rejections; ISM WARN; source timeouts |
| `get_pipeline_health` | ✅ PASS | fast | 41 tickers; 6 TA-not-ready (BDI/DAG/DLC/JSH/SIS/VDC/VNH) |
| `get_vps_proxy_health` | ⚠️ DEGRADED | fast | bctc STALE (0 24h pushes); sbv zero-value pattern |
| `get_vps_service_health` | ❌ UNHEALTHY | fast | `vn-bctc-fetch` UNHEALTHY; others healthy/idle |
| `get_cron_health` | ✅ PASS | fast | Most 99-100%; `vnstockTradingStatsRefresh` 80%; `bctcReparseJob` 88.4% |
| `get_sla_status` | ❌ BREACHED | fast | bctc: 2602 min / 360 threshold — CRITICAL |
| `get_rate_limit_status` | ✅ PASS | fast | 14 sources; 0 throttled |
| `get_macro_snapshot` | ✅ PASS | ~1ms | source_tier:2; carry.is_estimate:false |
| `get_market_snapshot` | ✅ PASS | fast | VN-Index 1830.47 +1.34%; breadth 90↑/205↓ |
| `get_system_status` | ✅ PASS | fast | Full source health returned |
| `get_earnings_calendar` | ✅ PASS | fast | 11 QUÁ HẠN, 30 ĐÃ NỘP for Q1-2026 |
| `get_week_period` | ✅ PASS | fast | 2026-W25; periodKey "2026-06-15/2026-06-21" |
| `get_technical_indicators(code="VIC")` | ✅ PASS | fast | source_tier:3; MA50=N/A (41 rows < 50 required — expected) |
| `get_price_history(code="VIC",days=5)` | ✅ PASS | fast | 4 rows returned; structured JSON |
| `emit_pressure_state` | ⚠️ STALE | fast | `stale_warning:true`, `cycle_snapshot_promoted:false` |
| `get_agent_signals(agent="market-watcher",status="all",hours_back=2)` | ✅ PASS | fast | Empty (no signals); correct response |
| `get_agent_signals({from_agent:null,status:"all",hours_back:0.25})` | ❌ FAIL | — | `agent` Required — 2 call sites use this pattern |
| `get_agent_signals({from_agent:"news-scout",status:"all",hours_back:2})` | ❌ FAIL | — | `agent` Required even with non-null `from_agent` — confirms all 3 call sites broken |
| `get_bctc_pending_refine({limit:1})` | ✅ PASS | fast | 1 item; VCB Q1-2025 PARTIAL refine; 21 windows |
| `get_earnings_calendar` | ✅ PASS | fast | Calendar intact |
| `get_vps_service_health` | ❌ FAIL | fast | bctc unhealthy |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status/restart vn-bctc-fetch` + monitor 24h push recovery | ops / dev-vps-crawls | BUG-1/2 |
| **P0** | Check VPS `/proxy/sbv` response body; fix zero-value HTML parse | dev-vps-crawls | ISSUE-SBV |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional (auto-fetch from DB) | dev-mcp-server | BUG-NEW-A |
| **P1** | Add `agent:"<caller>"` param to 3 `get_agent_signals` call sites: `market-watcher/flow/main.md:53`, `news-scout/flow/stage-bootstrap.md:43`, `news-scout/flow/stage-bootstrap.md:56` | agent-father | BUG-NEW-C |
| **P1** | Investigate FRED NAPMBI HTTP 400: verify series ID + FRED_API_KEY env | dev-macro-indicators | ISSUE-ISM |
| **P2** | Force-refresh WTI crude; check fetcher vs Brent source | dev-macro-indicators | ISSUE-WTI |
| **P2** | Force-refresh DJIA (23,750 2020-era stale) | dev-macro-indicators | ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecation; TE connection/API-key | dev-mainserver-crawls | ISSUE-Reuters |
| **P2** | Investigate BDI fetcher (72d stale) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80%, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Prune deprecated enum from `get_cycle_bootstrap` (financial-analyst, report-analyzer) | dev-mcp-server | IMPROVE-6 |
| **P3** | Review bctcReparseJob 12% failure modes (now 88.4%) | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for energy grid estimate | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Update tool list docs: `get_technical_indicators.md` + `get_price_history.md` → param `code` not `ticker` | dev-mcp-server | IMPROVE-TA-DOC |

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1608.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1410.md` |
| Probes run | 22 tools |
| PASS | 14 |
| FAIL/DEGRADED | 8 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC) |
| Active P1 BUGs | 2 (BUG-NEW-A insider, BUG-NEW-C agent_signals) |
| Active P2 BUGs | 0 |
| Active ISSUEs | 7 |
| Active IMPROVEs | 4 |
| Resolved since 14:10 | 1 (ISSUE-BCTC-PAYLOAD — non-issue, caller uses limit:1) |
