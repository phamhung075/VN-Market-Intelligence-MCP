# Team MCP Tool Health Recheck — 2026-06-19T04:07Z

**Cycle:** 2026-06-19T04:07Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-19-0207.md`
**VN Market:** OPEN (02:00–08:59 UTC) — live trading session

---

## Executive Summary

**P0 BUG WORSENING** — BCTC VPS pipeline now 3322 min SLA breach (was 3202 at 02:07Z, +120 min; service down ~55.4h). No recovery observed.
**2 P0/P1 BUGs UNCHANGED** — `get_insider_signals` schema mismatch (BUG-NEW-A); `get_agent_signals` from_agent-only pattern 3 broken call sites (BUG-NEW-C).
**2 PARTIAL RESOLUTIONS** — BUG-SSC-CERT not seen in this cycle's error window (possibly resolved); BUG-VPS-HEALTH-DIVERGENCE mostly resolved (4/5 services now correctly healthy).
**1 NEW FINDING** — ISSUE-FOREIGN-FLOW-PRIMARY: foreign-flow-job primary endpoint + all fallbacks exhausted every minute (chronic, previously in error log but not separately tracked).
**All other ISSUEs/IMPROVEs confirmed unchanged** — ISM no-data, macro-calendar unavailable, Reuters/TE chronic, BDI zero, WTI $95.5 stale, DJIA 23,750 stale, vnstock 80%, EVN estimate, bctcReparseJob 89.7%.

---

## STEP 3c — Prior-Finding Delta (Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence (this cycle) |
|-----------|-------------|-------|-----------------------|
| BUG-1/2 | BUG P0 | **WORSENED** | `get_sla_status` → `bctc: 3322/120 min CRITICAL` (+120 min from 3202 at 02:07Z); `get_vps_proxy_health` → bctc STALE, 0 24h pushes, last push 2026-06-16 18:02:24 (55.4h ago) |
| BUG-NEW-A | BUG P1 | **CONFIRMED UNCHANGED** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` — same Zod error as prior cycles |
| BUG-NEW-C | BUG P1 | **CONFIRMED UNCHANGED** | `get_agent_signals({from_agent:null, status:"all", hours_back:0.25})` → `agent: Required`; `get_agent_signals({from_agent:"news-scout", status:"all", hours_back:6})` → `agent: Required`. All 3 broken call sites verified. |
| BUG-SSC-CERT | BUG P1 | **POSSIBLY RESOLVED** | `get_system_status` last 10 unresolved errors: no SSC cert errors (all foreign-flow-job + sbv). Circuit breaker `ssc [OK] failures:0`. Prior: 6× SSC cert errors at 02:02 UTC. Not seen in 04:03 UTC window during same market-hours period — likely resolved, but needs 1 more cycle to confirm. |
| BUG-VPS-HEALTH-DIVERGENCE | BUG P2 | **MOSTLY RESOLVED** | `get_vps_service_health` → 4 healthy (vn-foreign-flow, vn-news-fetch, vn-price-fetch, vn-sbv-fetch), 1 unhealthy (vn-bctc-fetch). Prior: 4/5 unhealthy incorrectly. Now only vn-bctc-fetch shows unhealthy — which is correct (service genuinely down). Data-push vs health-endpoint divergence resolved for 3 services. |
| ISSUE-ISM | ISSUE P1 | **CONFIRMED UNCHANGED** | `get_ism_subcomponents({})` → `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| ISSUE-MACRO-CALENDAR | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_macro_calendar({})` → `{events:[], status:"unavailable", is_estimate:true, source_tier:4}` |
| ISSUE-Reuters/TE | ISSUE P2 | **CONFIRMED ONGOING** | `get_system_status` → Reuters RSS "Ngưng" 55 failures, "Chưa bao giờ"; Trading Economics×2 "Ngưng" 55–56 failures. Unchanged. |
| ISSUE-BDI | ISSUE P2 | **CONFIRMED** | `get_pipeline_health` → `BDI: rows=0, TA not ready` |
| ISSUE-WTI | ISSUE P2 | **CONFIRMED** | `get_system_status` → `wti_crude_usd 95.5` (79 data points) vs Brent $79.17 — $16 spread impossible |
| ISSUE-DJIA | ISSUE P2 | **CONFIRMED** | `get_system_status` → `dow_jones 23750` (49 data points) — COVID-era, actual ~42,000+ |
| ISSUE-vnstock | ISSUE P2 | **CONFIRMED** | `get_cron_health` → `vnstockTradingStatsRefresh` 80.0% (5 runs), avg 768,321 ms |
| IMPROVE-6 | IMPROVE | **CONFIRMED** | `get_cycle_bootstrap(agent_name="financial-analyst")` → accepted + returns valid data (deprecated enum accepted but should be pruned) |
| IMPROVE-N3 | IMPROVE | **CONFIRMED** | `get_cron_health` → `bctcReparseJob` 89.7% (107 runs), avg 208,308 ms — stable |
| IMPROVE-EVN | IMPROVE | **CONFIRMED** | `get_energy_grid_signals` → default 70% estimate; EVN endpoint broken |
| IMPROVE-TA-DOC | IMPROVE | **CARRIED** | Not re-probed this cycle — carried forward unchanged |

---

## NEW Findings This Cycle

### ISSUE-FOREIGN-FLOW-PRIMARY — foreign-flow-job All Fallbacks Exhausted Every Minute (P2, PROMOTED TO TRACKED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Severity** | P2 — data degraded on primary path; VPS proxy compensating |
| **Evidence** | `get_system_status` → `[WARN] foreign-flow-job: [foreign-flow-job] fallback activated` + `all fallbacks exhausted` at 04:01, 04:02 UTC (repeating every minute); `[WARN] fallback: [fallback] primary endpoint failed — Unable to connect` |
| **Compensating path** | `get_vps_proxy_health` → foreign-flow pushes arriving OK at ~30s interval (101 items, 04:04:15); `get_market_foreign_flow` returns valid data. VPS proxy working. |
| **Impact** | foreign-flow-job's own direct-fetch path is completely dead. Agents relying on the job's scrape path get stale/empty. VPS proxy compensates but is not mirrored by the job. |
| **Caller-surface** | `market-watcher/flow/cycle.md` → `get_foreign_flow(code=...)` per ticker (reads from DB populated by VPS proxy — likely OK); `trigger_foreign_flow_vps_fetch` in system-auditor (triggers VPS push — OK). The direct-job path failure is a background data-quality risk. |
| **Suggested fix** | Investigate foreign-flow-job primary endpoint URL and fallback source list; VPS proxy data is arriving so the source IS accessible via VPS — align job to use VPS proxy output as primary, or remove broken direct-fetch path |

---

## RESOLVED Since Prior Cycle (02:07Z)

### BUG-VPS-HEALTH-DIVERGENCE — RESOLVED

`get_vps_service_health` now reports 4/5 healthy accurately. The 3 services that were falsely "unhealthy" at 02:07Z (market-open surge load) now show correctly healthy with active data flows confirmed. `vn-bctc-fetch` correctly shows unhealthy (service genuinely down). Health endpoint divergence resolved.

### BUG-SSC-CERT — PENDING CONFIRM (likely resolved)

No SSC certificate errors in 04:03 UTC window (same market-hours period where they fired at 02:02). Will carry for 1 more cycle before declaring resolved.

---

## Active BUG Findings (Re-confirmed This Cycle)

### BUG-1/2 — BCTC VPS Pipeline CRITICAL (P0, WORSENING 55.4h)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical, worsening each cycle |
| **SLA breach** | 3322 min elapsed / 120 min threshold (+120 min since 02:07Z); service down ~55.4h total |
| **Last push** | 2026-06-16 18:02:24 UTC |
| **24h pushes** | 0 |
| **VPS service** | `vn-bctc-fetch: unhealthy`, response 0 ms, VPS uptime 2d 10h 2m |
| **Backlog** | `get_bctc_pending_refine` → 235K chars / 11,947 lines of pending BCTC refine work |
| **Probe** | `get_sla_status` → `bctc: 3322/120 min CRITICAL`; `get_vps_proxy_health` → bctc STALE (0 24h pushes) |
| **Callers** | bctc-analyst (all cycles), refine_bctc_md, unified-agent (Layer 4), digest-predict (weekly), system-auditor (B-09/B-13 checks) — ≥5 callers |
| **Suggested fix** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; monitor 24h push recovery. VPS uptime is 2d+ so server is up — service process specifically crashed or blocked. |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Probe** | `get_insider_signals({ticker:"VCB"})` → `code: Required` + `outstandingShares: Required (number)` |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md`: param is `ticker` (not `code`); `outstandingShares` documented as optional with auto-fetch from BCTC table |
| **Caller-surface** | `market-watcher/flow/eod.md:59` — `get_insider_signals(code="{TICKER}")` without `outstandingShares` → BROKEN; `bctc-analyst/flow/stage-analyze.md:49` → LIKELY BROKEN |
| **Suggested fix** | Restore `outstandingShares` as optional in Zod schema; implement DB auto-fetch as documented; align param name `code` vs `ticker` |

### BUG-NEW-C — `get_agent_signals` Missing `agent` Param in 3 Flow Call Sites (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Broken call sites** | (1) `news-scout/flow/stage-bootstrap.md:43` — SELF_SIGNALS_CACHE, `from_agent:"news-scout"`, missing `agent` → L-4 feedback tuning permanently blind; (2) `news-scout/flow/stage-bootstrap.md:57` — SIBLING_WINDOW_CACHE, `from_agent:null`, missing `agent` → cross-sibling dedup disabled; (3) `market-watcher/flow/main.md:54` — SIBLING_RECENT, `from_agent:null`, missing `agent` → gateway corroboration blind |
| **Root cause** | Server Zod schema enforces `agent` as unconditionally Required; doc (`get_agent_signals.md:15`) states `agent` is "Omittable in sender-history mode (from_agent=string) or all-producers mode (from_agent=null)" — server doesn't implement the conditional |
| **All three non-fatal** | Callers fall back to empty list; functionality silently disabled not crashed |
| **Grep verified** | `grep -rn 'get_agent_signals' docs/agents/*/flow/*.md` → alert-commander and tran-ngoc-bau both use `agent:"..."` ✅; news-scout ×2 ❌; market-watcher ×1 ❌ |
| **Suggested fix** | Option A (fast): add `agent: "<calling_agent>"` to each broken call site in flow files; Option B (correct): make `agent` optional when `from_agent` provided in Zod schema — both callers test fine when `agent` is passed |

---

## Active ISSUE Findings

### ISSUE-ISM — `get_ism_subcomponents` No Data (P1, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| **Impact** | ISM PMI subcomponents unavailable to news-scout, unified-agent US macro chain |
| **Suggested fix** | Verify `FRED_API_KEY` env var is set; re-run macroIndicatorRefreshJob |

### ISSUE-FOREIGN-FLOW-PRIMARY — Direct-fetch Path Dead (P2, NEW THIS CYCLE)

See NEW Findings section above.

### ISSUE-MACRO-CALENDAR — No Macro Events (P2, UNCHANGED)

| Field | Value |
|-------|-------|
| **Evidence** | `{daysRequested:60, events:[], is_estimate:true, source_tier:4, status:"unavailable"}` |
| **Impact** | Agents using macro calendar get empty event list — FOMC, NFP, CPI events not surfaced |
| **Suggested fix** | Check macro calendar data source and all 4 tiers; source_tier:4 means all tiers failed |

### ISSUE-Reuters/TE — Chronic Source Failures (P2, ONGOING)

| Field | Value |
|-------|-------|
| **Evidence** | Reuters RSS: "Ngưng", 55 consecutive failures, never succeeded post-restart; Trading Economics×2: "Ngưng", 55–56 failures |
| **Impact** | Degraded news coverage; VnExpress/CafeF/Bloomberg remain active |
| **Suggested fix** | Verify Reuters RSS endpoint URL (feeds.reuters.com deprecated); investigate TE geo-blocking or API key expiry |

### ISSUE-BDI — Baltic Dry Index 0 Rows (P2, UNCHANGED)

`get_pipeline_health` → `BDI: rows=0, TA not ready`

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2, UNCHANGED)

`get_system_status` → `wti_crude_usd 95.5` (79 data points); Brent at $79.17 — $16.33 spread physically impossible.

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2, UNCHANGED)

`get_system_status` → `dow_jones 23750` (49 data points) — COVID-era 2020 value (actual ~42,000+).

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2, UNCHANGED)

`get_cron_health` → 80.0% (5 runs), avg 768,321 ms (12.8 min avg).

---

## Active IMPROVE Findings

### IMPROVE-6 — Bootstrap Enum Contains Deprecated Agents (CONFIRMED)

`get_cycle_bootstrap(agent_name="financial-analyst")` → accepted and returns valid data. Deprecated agents (`financial-analyst`, `report-analyzer`) not in system-map still accepted. Should be pruned from Zod enum in `cycleBootstrapTool.ts`.

### IMPROVE-N3 — bctcReparseJob 89.7% Success Rate (CONFIRMED)

`get_cron_health` → 89.7% (107 runs), avg 208,308 ms — stable, not improving since first flagged.

### IMPROVE-EVN — Energy Grid Using Default Estimate (CONFIRMED)

`get_energy_grid_signals` → `Hồ chứa: Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)`.

### IMPROVE-TA-DOC — `get_technical_indicators` Doc Param Drift (CARRIED)

Doc says `ticker`; live schema requires `code`. 0 affected callers — doc-only fix.

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_system_status` | ⚠️ DEGRADED | foreign-flow-job fallbacks exhausted every minute; sbv zero-value guard; Reuters/TE stopped; 10 unresolved errors; no SSC cert errors this window |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ PASS | 21ms; market context fresh; agent_signals returned |
| `get_cycle_bootstrap(agent_name="financial-analyst")` | ✅ PASS (IMPROVE) | Deprecated enum accepted — should be pruned |
| `get_market_snapshot` | ✅ PASS | VN-Index 1829.89 -0.03%; source_tier:2; breadth 93↑/151↓ |
| `get_macro_snapshot` | ✅ PASS | source_tier:2; oil $79.17 neutral; gold $4176.4 bullish; usdvnd 26120 bearish |
| `get_cron_health` | ✅ MOSTLY OK | bctcReparseJob 89.7%; vnstockTradingStatsRefresh 80%; intelligenceCycleJob 99.4% (963 runs); all others ≥99% |
| `get_pipeline_health` | ⚠️ DEGRADED | BDI/DAG/DLC/JSH/SIS/VDC/VNH: TA not ready (rows=0); 4 tickers oversold |
| `get_vps_proxy_health` | ⚠️ BCTC STALE | prices/news/sbv: ok; bctc: STALE 55.4h; foreign-flow: active |
| `get_sla_status` | ❌ BREACHED | bctc: 3322/120 min CRITICAL; price/news/sbv/ff: ok |
| `get_vps_service_health` | ⚠️ 1 UNHEALTHY | vn-bctc-fetch unhealthy (correct — service down); other 4 healthy ✅ (was 4/5 unhealthy at 02:07Z — resolved) |
| `get_earnings_calendar` | ✅ PASS | 41 tickers; 12 overdue Q1-2026 |
| `get_macro_calendar` | ❌ UNAVAILABLE | `events:[], status:"unavailable", source_tier:4` — unchanged |
| `get_ism_subcomponents` | ❌ NO_DATA | FRED_API_KEY missing/series empty — unchanged |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | EVN hydro 70% default |
| `get_market_foreign_flow` | ✅ PASS | 96 tickers; net sell -6.7k; coverage watchlist only |
| `get_foreign_flow(code="HPG")` | ✅ PASS | Source_tier:2; direction neutral; data returned |
| `get_vn_macro_indicators` | ✅ PASS | IIP data returned; source "NSO monthly Excel" |
| `get_recent_signals` | ✅ PASS | 4 signals in 15-min window; all from alert-engine |
| `get_agent_signals(agent="market-watcher")` | ✅ PASS | "Không có tín hiệu mới" |
| `get_agent_signals(from_agent=null)` | ❌ FAIL | `agent: Required` — market-watcher flow/main.md:54 broken |
| `get_agent_signals(from_agent="news-scout")` | ❌ FAIL | `agent: Required` — stage-bootstrap.md:43,57 broken |
| `get_insider_signals(ticker="VCB")` | ❌ FAIL | `code: Required` + `outstandingShares: Required` — BUG-NEW-A unchanged |
| `get_vps_proxy_health` | ✅ DATA OK | prices/news/sbv flowing; bctc stale |
| `task_claim` | ✅ PASS | `{claimed:true}` confirmed |
| `task_release` | ✅ PASS | `{ok:true}` confirmed |
| `post_agent_signal` | ✅ SCHEMA OK | Enum validation works correctly (invalid type rejected) |
| `get_bctc_pending_refine` | ⚠️ LARGE BACKLOG | 11,947 lines returned — significant pending refine queue |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; monitor 24h. Now **55.4h down** (VPS server up 2d+ — process specifically crashed). | ops / dev-vps-crawls | BUG-1/2 |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional with DB auto-fetch; align param name `code`/`ticker` | dev-mcp-server | BUG-NEW-A |
| **P1** | Fix 3 broken `get_agent_signals` sites — Option A (fast, flow-side): add `agent:"news-scout"` to `stage-bootstrap.md:43,57`; add `agent:"market-watcher"` to `main.md:54` — OR — Option B (clean, server-side): make `agent` optional in Zod when `from_agent` provided | agent-father / dev-mcp-server | BUG-NEW-C |
| **P1** | Verify FRED_API_KEY env var; re-run macroIndicatorRefreshJob to populate ISM series | dev-macro-indicators | ISSUE-ISM |
| **P2** | Investigate foreign-flow-job primary source — dead endpoint. Align to use VPS proxy as primary or remove broken direct-fetch path. | dev-vps-crawls | ISSUE-FOREIGN-FLOW-PRIMARY |
| **P2** | Fix macro calendar source (`get_macro_calendar` all 4 tiers failing) | dev-macro-indicators | ISSUE-MACRO-CALENDAR |
| **P2** | Force-refresh WTI crude ($95.5 impossible vs Brent $79.17) | dev-macro-indicators | ISSUE-WTI |
| **P2** | Force-refresh DJIA (23,750 → actual ~42,000+) | dev-macro-indicators | ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecated endpoint; TE geo-blocking / API key | dev-mainserver-crawls | ISSUE-Reuters/TE |
| **P2** | Update BDI fetcher endpoint (rows=0) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80%, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Prune deprecated enum from `get_cycle_bootstrap` (`financial-analyst`, `report-analyzer`) | dev-mcp-server | IMPROVE-6 |
| **P3** | Categorize bctcReparseJob 10% failure modes | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for hydro reservoir data | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Update `docs/agents/tools/list/get_technical_indicators.md`: `ticker` → `code` (0 affected callers) | dev-mcp-server | IMPROVE-TA-DOC |

---

## RESOLVED Since Prior Cycle (02:07Z)

### BUG-VPS-HEALTH-DIVERGENCE — RESOLVED

`get_vps_service_health` now correctly shows 4/5 healthy. The 3 services falsely reporting unhealthy at 02:07Z (market-open load) now show correctly: vn-foreign-flow ✅, vn-price-fetch ✅, vn-sbv-fetch ✅. Only vn-bctc-fetch remains unhealthy — which is accurate (service genuinely down).

### BUG-SSC-CERT — PENDING CONFIRM (1 more cycle needed)

No SSC cert errors in this cycle's 04:03 UTC error window. Circuit breaker `ssc [OK] failures:0`. Prior: 6 errors at 02:02 UTC. Will confirm resolution next cycle.

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-19-0407.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-19-0207.md` |
| Probes run | 27 tools |
| PASS | 17 |
| FAIL/DEGRADED/NO_DATA | 10 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC — worsened, 55.4h) |
| Active P1 BUGs | 2 (BUG-NEW-A insider; BUG-NEW-C agent_signals) |
| Active P1 ISSUEs | 1 (ISSUE-ISM) |
| Active P2 ISSUEs | 7 (foreign-flow-primary NEW; macro-calendar; Reuters/TE; BDI; WTI; DJIA; vnstock) |
| Active IMPROVEs | 4 |
| New findings | 1 (ISSUE-FOREIGN-FLOW-PRIMARY — promoted to tracked) |
| Resolved since 02:07Z | 1 confirmed (BUG-VPS-HEALTH); 1 pending confirm (BUG-SSC-CERT) |
