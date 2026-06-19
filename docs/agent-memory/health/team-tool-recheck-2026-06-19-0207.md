# Team MCP Tool Health Recheck — 2026-06-19T02:07Z

**Cycle:** 2026-06-19T02:07Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-19-0006.md`
**VN Market:** OPEN (02:00–08:59 UTC) — this cycle runs during live trading hours

---

## Executive Summary

**P0 BUG WORSENING** — BCTC VPS pipeline now 3202 min SLA breach (was 3085 at 00:06Z, +117 min in 2h; service down ~53.4h). No recovery observed.
**2 P0/P1 BUGs UNCHANGED** — `get_insider_signals` schema mismatch; `get_agent_signals` from_agent-only pattern (BUG-NEW-C EXPANDED: 3rd broken call site found this cycle at `stage-bootstrap.md:43`).
**2 NEW BUGs** — SSC certificate error on HOSE fallback (6 errors in <2 min, market hours); VPS health check divergence (4/5 services "unhealthy" despite active data flow — health endpoint broken while data-push path works).
**1 NEW ISSUE** — `get_macro_calendar` unavailable (empty events, `status:"unavailable"`).
**All prior ISSUEs/IMPROVEs confirmed** — ISM no-data, Reuters/TE chronic, BDI zero, WTI $95.5, DJIA 23,750, vnstock 80%, EVN estimate, bctcReparseJob 89.7%.
**0 Resolutions** — no prior findings resolved this cycle.

---

## STEP 3c — Prior-Finding Delta (Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence (this cycle) |
|-----------|-------------|-------|-----------------------|
| BUG-1/2 | BUG P0 | **WORSENED** | `get_sla_status` → `bctc: 3202/120 min CRITICAL` (+117 min since 00:06Z); `get_vps_proxy_health` → bctc STALE, 0 24h pushes, last 2026-06-16 18:02:24; `get_vps_service_health` → `vn-bctc-fetch: unhealthy` |
| BUG-NEW-A | BUG P1 | **CONFIRMED UNCHANGED** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` — same error; 2 broken flow callers |
| BUG-NEW-C | BUG P1 | **CONFIRMED + EXPANDED** | `get_agent_signals({from_agent:"news-scout", status:"all", hours_back:6})` → `agent: Required` (new 3rd broken call site at `stage-bootstrap.md:43`); `get_agent_signals({from_agent:null, status:"all", hours_back:0.25})` → `agent: Required` (2 existing sites confirmed). Total: 3 broken call sites |
| ISSUE-ISM | ISSUE P1 | **CONFIRMED UNCHANGED** | `get_ism_subcomponents({})` → `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| ISSUE-Reuters/TE | ISSUE P2 | **ONGOING (CHRONIC)** | `get_system_status` → Reuters RSS: "Ngưng" 28+ errors "Chưa bao giờ"; Trading Economics×2: "Ngưng" 28–29 errors "Chưa bao giờ" |
| ISSUE-BDI | ISSUE P2 | **CONFIRMED** | `get_pipeline_health` → `BDI: rows=0, TA not ready` |
| ISSUE-WTI | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_system_status` → `wti_crude_usd 95.5` (79 data points) — Brent at $79.54, $16+ spread impossible |
| ISSUE-DJIA | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_system_status` → `dow_jones 23750` (49 data points) — COVID-era value; actual ~42,000+ |
| ISSUE-vnstock | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_cron_health` → `vnstockTradingStatsRefresh` 80.0% (5 runs), avg 768,321 ms |
| IMPROVE-6 | IMPROVE | **CARRIED** | Bootstrap deprecated enum not re-probeable via gateway — carried forward from prior cycle |
| IMPROVE-N3 | IMPROVE | **CONFIRMED** | `get_cron_health` → `bctcReparseJob` 89.7% (107 runs), avg 208,308 ms — unchanged |
| IMPROVE-EVN | IMPROVE | **CONFIRMED** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| IMPROVE-TA-DOC | IMPROVE | **CONFIRMED** | `get_technical_indicators({ticker:"VNM"})` → `code: Required` — doc still says `ticker`; 0 affected callers |

---

## NEW Findings This Cycle

### BUG-SSC-CERT — SSC HOSE Fallback Certificate Error (P1, NEW)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 — active during market hours |
| **Probe** | `get_system_status` → Recent Errors (last 10): 6× `[ERROR] [ssc] HOSE fallback fetch failed — unknown certificate verification error` at 02:02:16–02:02:31 UTC |
| **Evidence** | Circuit breaker `ssc [OK] failures:0` (not tripped yet); primary VNDirect path functional. This fires during every market-hours request cycle — the fallback is being tried and repeatedly failing. |
| **Caller-surface** | `get_market_snapshot`, `get_market_breadth`, `intelligenceCycleJob` — any HOSE fallback path triggers cert error |
| **Suggested fix** | Verify SSC HOSE endpoint TLS cert (likely expired or intermediate CA changed); update Node.js CA bundle in mcp-server container; or accept-insecure on this endpoint as fallback |

### BUG-VPS-HEALTH-DIVERGENCE — 4/5 VPS Services "Unhealthy" Despite Active Data Flow (P2, NEW)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P2 — health check reporting broken; data pipeline functional |
| **Probe** | `get_vps_service_health` → 4 unhealthy (vn-bctc-fetch, vn-foreign-flow, vn-price-fetch, vn-sbv-fetch); all show response 0ms. Only `vn-news-fetch: healthy` |
| **Contradiction** | `get_vps_proxy_health` shows prices pushed at 02:03:21 (98 items), foreign-flow pushed at 02:03:18 (102 items), sbv pushed at 02:00:03 (1 item) — all within last 5 min. Data flows while health says down. |
| **Prior cycle** | 00:06Z report: "2 healthy (news, sbv); 2 idle (market closed)" — off-market hours showed sbv healthy. Now in market hours, sbv "unhealthy". Suggests health check endpoint breaks when service is under load. |
| **Caller-surface** | `system-auditor/flow/main.md` §Tier-2 reads `get_vps_service_health` → may emit false-positive VPS CRITICAL alerts |
| **Suggested fix** | Inspect VPS health endpoint (`/health` on each service) — may be binding on wrong interface or crashing under load; separate data-push health from API health check |

### BUG-NEW-C EXPANSION — 3rd Broken `get_agent_signals` Call Site (P1, EXPANDED)

| Field | Value |
|-------|-------|
| **Prior cite** | 2 broken call sites: `market-watcher/flow/main.md:54`, `news-scout/flow/stage-bootstrap.md:56` |
| **New find** | `news-scout/flow/stage-bootstrap.md:43` (SELF_SIGNALS_CACHE) — `call_tool(... tool="get_agent_signals", arguments={from_agent:"news-scout", status:"all", hours_back:6})` — missing `agent` |
| **Probe this cycle** | `get_agent_signals({from_agent:"news-scout", status:"all", hours_back:6})` → `agent: Required` (validated live) |
| **Impact** | news-scout's L-4 feedback-tuning loop (acceptance-rate threshold adjustment) never populates; feedback hints always empty; thresholds never adapt. Previously thought only sibling-dedup was broken — now SELF_SIGNALS_CACHE (feedback tuning) is also broken every cycle. |
| **Caller-surface grep** | `grep -rn 'get_agent_signals' docs/agents/*/flow/*.md` this cycle: alert-commander (`stage-signals.md:32`, `:61`) both use `agent:"alert-commander"` ✅; tran-ngoc-bau uses `agent:"tran-ngoc-bau"` ✅; news-scout `stage-bootstrap.md:43` ❌ and `:57` ❌; market-watcher `main.md:54` ❌ |

### ISSUE-MACRO-CALENDAR — `get_macro_calendar` Returns No Events (P2, NEW)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Probe** | `get_macro_calendar({})` → `{daysRequested:60, events:[], is_estimate:true, source_tier:4, status:"unavailable"}` |
| **Impact** | Agents using macro calendar (news-scout, unified-agent macro chain) get empty event list — upcoming FOMC, NFP, CPI events not signalled |
| **Suggested fix** | Check macro calendar data source and fetcher; source_tier:4 suggests all tiers failed |

---

## Active BUG Findings (Re-confirmed This Cycle)

### BUG-1/2 — BCTC VPS Pipeline CRITICAL (P0, WORSENING 53.4h)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical, worsening each cycle |
| **SLA breach** | 3202 min elapsed / 120 min threshold (+117 min since 00:06Z); service down ~53.4h total |
| **Last push** | 2026-06-16 18:02:24 UTC |
| **24h pushes** | 0 |
| **VPS service** | `vn-bctc-fetch: unhealthy`, response 0 ms, VPS uptime 2d 7h 57m |
| **Probe** | `get_sla_status` → `bctc: 3202/120 min CRITICAL`; `get_vps_proxy_health` → bctc STALE (0 24h pushes) |
| **Callers** | bctc-analyst (all cycles), refine_bctc_md, unified-agent (Layer 4), digest-predict (weekly), system-auditor (B-09/B-13 checks) — ≥5 callers |
| **Suggested fix** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; monitor 24h push recovery in `get_vps_proxy_health` |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md`: `outstandingShares` documented as optional with auto-fetch |
| **Affected callers** | `market-watcher/flow/eod.md:59` — `get_insider_signals(code="{TICKER}")` without `outstandingShares` → BROKEN; `bctc-analyst/flow/stage-analyze.md:49` → LIKELY BROKEN |
| **Suggested fix** | Restore `outstandingShares` as optional in Zod schema; implement DB auto-fetch from BCTC table as documented |

### BUG-NEW-C — `get_agent_signals` Missing `agent` Param in 3 Flow Call Sites (P1, EXPANDED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Broken call sites** | (1) `news-scout/flow/stage-bootstrap.md:43` — SELF_SIGNALS_CACHE, `from_agent:"news-scout"`, missing `agent` → L-4 feedback tuning blind; (2) `news-scout/flow/stage-bootstrap.md:57` — SIBLING_WINDOW_CACHE, `from_agent:null`, missing `agent` → cross-sibling dedup disabled; (3) `market-watcher/flow/main.md:54` — SIBLING_RECENT, `from_agent:null`, missing `agent` → gateway corroboration blind |
| **All three are non-fatal** | Callers fall back to empty list; functionality silently disabled not crashed |
| **Suggested fix** | Option A: add `agent: "<calling_agent>"` to each broken site; Option B: make `agent` optional when `from_agent` is provided in the Zod schema (server-side) |

---

## Active ISSUE Findings

### ISSUE-ISM — `get_ism_subcomponents` No Data (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| **Impact** | ISM PMI subcomponents unavailable to news-scout, unified-agent US macro chain |
| **Suggested fix** | Verify `FRED_API_KEY` env var; re-run macroIndicatorRefreshJob to populate ISM series |

### ISSUE-MACRO-CALENDAR — No Macro Events (P2, NEW)

See NEW Findings section above.

### ISSUE-Reuters/TE — Chronic Source Failures (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Reuters RSS: "Ngưng", 28+ consecutive failures, never succeeded; Trading Economics×2: "Ngưng", 28–29 failures, never succeeded post-restart |
| **Impact** | Degraded news coverage; VnExpress/CafeF/Bloomberg remain active |
| **Suggested fix** | Verify Reuters RSS endpoint URL (feeds.reuters.com deprecated); investigate TE geo-blocking or API key |

### ISSUE-BDI — Baltic Dry Index 0 Rows (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_pipeline_health` → `BDI: rows=0, TA not ready` |
| **Suggested fix** | Update BDI fetcher endpoint or data provider |

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `wti_crude_usd 95.5` (79 data points); Brent at $79.54 — $16+ spread physically impossible |
| **Suggested fix** | Force-refresh WTI; check WTI fetcher divergence from Brent source |

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_system_status` → `dow_jones 23750` (49 data points) — COVID-era 2020 value (actual ~42,000+) |
| **Suggested fix** | Force-refresh DJIA from Yahoo Finance or alternative source |

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 80.0% (5 runs), avg 768,321 ms (12.8 min) |
| **Suggested fix** | Review failure logs; consider timeout extension or batching |

---

## Active IMPROVE Findings

### IMPROVE-6 — Bootstrap Enum Contains Deprecated Agents (CARRIED)

| Field | Value |
|-------|-------|
| **Evidence** | Prior cycle confirmed `get_cycle_bootstrap` enum includes `financial-analyst`, `report-analyzer` (deprecated agents not in system-map) |
| **Suggested fix** | Prune deprecated values from Zod enum in `cycleBootstrapTool.ts` |

### IMPROVE-N3 — bctcReparseJob 89.7% Success Rate (CONFIRMED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_cron_health` → 89.7% (107 runs), avg 208,308 ms — stable, not improving |
| **Suggested fix** | Categorize the ~10% failure modes; likely PDF parse errors on edge-case documents |

### IMPROVE-EVN — Energy Grid Using Default Estimate (CONFIRMED)

| Field | Value |
|-------|-------|
| **Evidence** | `get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` |
| **Suggested fix** | Investigate EVN hydro reservoir endpoint for structural change |

### IMPROVE-TA-DOC — `get_technical_indicators` Doc Param Drift (CONFIRMED)

| Field | Value |
|-------|-------|
| **Evidence** | Probe `{ticker:"VNM"}` → `code: Required`; doc `get_technical_indicators.md` documents param as `ticker` |
| **Caller-surface** | 0 affected callers (all callers already use `code`) — doc drift only |
| **Suggested fix** | 1-line fix: rename `ticker` → `code` in tool list doc |

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_system_status` | ⚠️ DEGRADED | SSC cert errors (6× in <2 min); foreign-flow fallback exhausted; Reuters/TE stopped; 10 unresolved errors |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ PASS | 22ms; agent_signals=[VHM verified_decision]; market context fresh with prices |
| `get_market_snapshot` | ✅ PASS | VN-Index 1839.33 +0.48%; source_tier:2 |
| `get_market_breadth` | ⚠️ EARLY-SESSION | 0 advances/declines at 02:05 UTC (market open lag — 403 noTrade, vol=5) |
| `get_macro_snapshot` | ✅ PASS | source_tier:2; oil $79.54 neutral; gold $4203.1 bullish; usdvnd 26120 bearish |
| `get_cron_health` | ✅ MOSTLY OK | bctcReparseJob 89.7%; vnstockTradingStatsRefresh 80%; intelligenceCycleJob currently running (99.3%); all others ≥99% |
| `get_pipeline_health` | ⚠️ DEGRADED | BDI/DAG/DLC/JSH/SIS/VDC/VNH: TA not ready (rows=0); NKG+REE oversold; VEA overbought |
| `get_vps_proxy_health` | ⚠️ DEGRADED | bctc STALE (0 24h pushes, last 2026-06-16 18:02:24); prices/news/sbv: ok |
| `get_sla_status` | ❌ BREACHED | bctc: 3202/120 min CRITICAL; news: 39/30 min HIGH (transient); price/sbv/ff: ok |
| `get_vps_service_health` | ❌ DEGRADED | 4/5 unhealthy (0ms response); data flowing via proxy push — health endpoint broken |
| `get_vps_proxy_health` | ✅ DATA OK | prices 98 items at 02:03:21; foreign-flow 102 items at 02:03:18; sbv 1 item at 02:00:03 |
| `get_week_period` | ✅ PASS | 2026-W25; periodKey=2026-06-15/2026-06-21 |
| `get_earnings_calendar` | ✅ PASS | 41 tickers; 12 overdue (BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) |
| `get_macro_calendar` | ❌ UNAVAILABLE | `events:[], status:"unavailable", is_estimate:true, source_tier:4` — NEW |
| `get_ism_subcomponents` | ❌ NO_DATA | `error:no_data`; FRED_API_KEY missing/series empty |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | EVN hydro endpoint broken; default 70% estimate |
| `get_rate_limit_status` | ✅ PASS | 13 sources all ready/uncalled; no rate limit pressure |
| `get_market_foreign_flow` | ✅ PASS | 11 tickers; net buy +4.4k; coverage note as expected |
| `get_foreign_flow(code missing)` | ❌ SCHEMA | `code: Required` — per-ticker tool; callers should use `get_market_foreign_flow` for aggregate (already fixed in fb-market-poster.md) |
| `get_bctc_refined(test-id)` | ✅ GRACEFUL | `{error:"no refined units found for report_id: test-report-id-probe"}` — correct graceful empty |
| `get_agent_signals(agent="market-watcher")` | ✅ PASS | Returns "Không có tín hiệu mới" correctly |
| `get_agent_signals(from_agent=null)` | ❌ FAIL | `agent: Required` — 2 broken flow sites (market-watcher:54, stage-bootstrap:57) |
| `get_agent_signals(from_agent="news-scout")` | ❌ FAIL | `agent: Required` — 3rd broken call site (stage-bootstrap:43) |
| `get_insider_signals(ticker="VCB")` | ❌ FAIL | `code: Required` + `outstandingShares: Required` — 2 flow callers broken |
| `get_technical_indicators(ticker="VNM")` | ❌ FAIL | `code: Required` — doc drift only (0 affected callers) |
| `get_macro_snapshot` | ✅ PASS | All tier-1 data; signals computed correctly |
| `task_claim(ttl=60)` | ✅ PASS | `{claimed:true}` — min TTL 60s confirmed |
| `task_release` | ✅ PASS | `{ok:true}` |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; monitor 24h. Now **53.4h** down. | ops / dev-vps-crawls | BUG-1/2 |
| **P1** | Fix SSC HOSE TLS cert error: verify `ssc.gov.vn` cert chain; update Node.js CA bundle in mcp-server; or skip-verify on fallback only | dev-mcp-server | BUG-SSC-CERT |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional with DB auto-fetch (documented in tool contract) | dev-mcp-server | BUG-NEW-A |
| **P1** | Fix 3 broken `get_agent_signals` call sites — Option A: add `agent:"news-scout"` at `stage-bootstrap.md:43`, `stage-bootstrap.md:57`; add `agent:"market-watcher"` at `main.md:54` — OR — Option B: make `agent` optional when `from_agent` present in Zod schema | agent-father / dev-mcp-server | BUG-NEW-C |
| **P1** | Verify FRED_API_KEY env var; re-run macroIndicatorRefreshJob to populate ISM series | dev-macro-indicators | ISSUE-ISM |
| **P2** | Investigate VPS health endpoint (`/health`) on all 4 services — likely binding/crash under load; fix divergence from data-push health | dev-vps-crawls | BUG-VPS-HEALTH |
| **P2** | Fix macro calendar source — `get_macro_calendar` returning empty (source_tier:4 all-fail) | dev-macro-indicators | ISSUE-MACRO-CALENDAR |
| **P2** | Force-refresh WTI crude ($95.5 impossible vs Brent $79.54) | dev-macro-indicators | ISSUE-WTI |
| **P2** | Force-refresh DJIA (23,750 → actual ~42,000+) | dev-macro-indicators | ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecated endpoint; TE geo-blocking / API key | dev-mainserver-crawls | ISSUE-Reuters/TE |
| **P2** | Update BDI fetcher endpoint (rows=0) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80%, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Prune deprecated enum from `get_cycle_bootstrap` (`financial-analyst`, `report-analyzer`) | dev-mcp-server | IMPROVE-6 |
| **P3** | Categorize bctcReparseJob 10% failure modes | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for hydro reservoir data | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Update `docs/agents/tools/list/get_technical_indicators.md`: `ticker` → `code` (0 affected callers) | dev-mcp-server | IMPROVE-TA-DOC |

---

## RESOLVED Since Prior Cycle (00:06Z)

*None this cycle.*

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-19-0207.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-19-0006.md` |
| Probes run | 28 tools |
| PASS | 16 |
| FAIL/DEGRADED/NO_DATA | 12 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC — worsened, 53.4h) |
| Active P1 BUGs | 3 (BUG-SSC-CERT new; BUG-NEW-A insider; BUG-NEW-C agent_signals expanded) |
| Active P2 BUGs | 1 (BUG-VPS-HEALTH new) |
| Active P1 ISSUEs | 1 (ISSUE-ISM) |
| Active P2 ISSUEs | 6 (macro-calendar new; Reuters/TE; BDI; WTI; DJIA; vnstock) |
| Active IMPROVEs | 4 |
| New findings | 4 (BUG-SSC-CERT, BUG-VPS-HEALTH, BUG-NEW-C expanded, ISSUE-MACRO-CALENDAR) |
| Resolved since 00:06Z | 0 |
