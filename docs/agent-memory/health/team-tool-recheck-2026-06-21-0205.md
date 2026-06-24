# Team MCP Tool Recheck — 2026-06-21T02:05Z

**Run timestamp:** 2026-06-21T02:05Z  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-21-0010.md`  
**Market status:** CLOSED (Sunday — VN market outside 02:00–08:59 UTC Mon–Fri)  
**Server uptime at probe time:** ~38m (mcpServerStartup last_run: 2026-06-21 02:03:23)

---

## Step 3c — Prior Finding Re-Probes (Mandatory)

All 10 findings from the 00:10Z report re-probed this cycle before carry-forward decision.

| Finding | Prior Status | Re-Probe Command | Re-Probe Result | Delta |
|---------|-------------|-----------------|----------------|-------|
| BUG-1: BCTC VPS Dead | ACTIVE | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | `vn-bctc-fetch: unhealthy \| 4d 7h 57m`; SLA 6081/2494 min CRITICAL; last push 2026-06-16 18:02:24 | **RE-CONFIRMED** (~129h, was 127h) |
| BUG-2: HNX/UPCOM failures | ACTIVE | `get_system_status` + grep `force: true` apps/mcp-server | 10/10 unresolved errors `[hnx]`; grep confirmed 3 files, 6 call-sites still present | **RE-CONFIRMED** unchanged |
| BUG-3: Reuters RSS Dead | ACTIVE | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 9 ⚠` | **RE-CONFIRMED** unchanged |
| BUG-4: TradingEconomics Dead + Phantom Values | ACTIVE | `get_system_status` source health + auto-tracked indicators | 2× `Trading Economics \| Ngưng \| Chưa bao giờ \| 9 ⚠`; `wti_crude_usd:95.5` (79 pts), `dow_jones:23750` (49 pts) | **RE-CONFIRMED** unchanged |
| BUG-5: `get_sentiment_trend` bare-call error | ACTIVE | `get_sentiment_trend({})` + grep flow files | `{"error":"stock_code (or symbol) is required","source_tier":3}`; **NEW: fb-market-poster/flow/main.md:118 confirmed broken caller** | **RE-CONFIRMED + CALLER FOUND** |
| ISSUE-SBV-PARSE: policy rates degraded | ACTIVE | `get_vn_liquidity_state({})`, `get_cron_health` | `lombard_rate_pct:0`, `source:"sbv_rates DB fallback (HTML parse failed)"`; `sbvRatesRefreshJob success_rate:0.98` | **RE-CONFIRMED** unchanged |
| ISSUE-VNSTOCK-STATS: 85.7% success | ACTIVE | `get_cron_health` | `vnstockTradingStatsRefresh: success_rate: 0.86 (85.7%)` | **RE-CONFIRMED** unchanged |
| ISSUE-MACRO-CAL: unavailable | ACTIVE | `get_macro_calendar({"days_ahead":14})` | `{"status":"unavailable","events":[],"daysRequested":60,"is_estimate":true}` — input ignored | **RE-CONFIRMED** unchanged |
| ISSUE-ISM: no FRED_API_KEY | ACTIVE | `get_ism_subcomponents({})` | `{"error":"no_data","message":"...requires FRED_API_KEY"}` | **RE-CONFIRMED** unchanged |
| ISSUE-LIQUIDITY: null sub-fields | ACTIVE | `get_vn_liquidity_state({})` | `lombard_rate_pct:0`, `sjc_price_mn_vnd:0`, `usd_vnd_buy/sell:0`, `omo.net_outstanding:null`, `interbank_1w:null` | **RE-CONFIRMED** unchanged |

**Net change vs 00:10Z:** 0 resolved. BUG-5 upgraded — confirmed 1 affected caller (fb-market-poster). New ISSUE-RESTART-CHURN found.

---

## ACTIVE BUGs — 5 (all re-confirmed)

### BUG-1 — BCTC VPS Dead (CRITICAL — 129+ hours)

**Severity:** CRITICAL  
**Duration:** Since 2026-06-16 18:02:24 UTC — now **~129 hours** (5.4 days)

| Check | Result |
|-------|--------|
| `get_vps_service_health` | `vn-bctc-fetch: unhealthy \| response_ms:0 \| uptime:4d 7h 57m` |
| `get_vps_proxy_health` | `bctc: last_push: 2026-06-16 18:02:24 \| STALE: YES \| 0 pushes 24h` |
| `get_sla_status` | `bctc: 6081/2494 min \| breached: CRITICAL` |
| Data freshness | `BCTC: 4 ngày trước \| 101.4h \| !! Rất cũ` |
| `get_earnings_calendar` | 12 tickers QUÁ HẠN (overdue Q1-2026): BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH |

**Affected callers:** bctc-analyst (primary consumer), refine_bctc_md (PDF pipeline), system-auditor (SLA monitor)  
**Impact:** Zero BCTC financial data ingestion for 5.4+ days. 12 overdue tickers unextracted during active Q1-2026 earnings window.  
**Action:** SSH to Vinahost VPS → restart `vn-bctc-fetch` service → verify push logs resume.  
**Dispatch:** `dev-vps-crawls`

---

### BUG-2 — HNX / UPCOM Price Source Failures + Root Cause Confirmed

**Severity:** HIGH  
**Re-probe:** `get_system_status` → 10/10 unresolved errors are `[hnx]` class at 02:00–02:02 UTC  
**Grep re-verification:** `grep -n "force: true" apps/mcp-server/src/interface/mcp/tools/**/*.ts`

| Caller file | Lines | Tool served |
|-------------|-------|-------------|
| `apps/mcp-server/src/interface/mcp/tools/sector/sectorRotationTools.ts` | 174, 181, 188 | `get_sector_rotation` |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts` | 157, 160, 163 | portfolio conviction tools |
| `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` | 218, 225, 235 | `get_market_snapshot` |

**Root cause:** `force: true` bypasses `isTradingSession()` guard. HNX/UPCOM APIs return empty outside market hours (Mon–Fri 02:00–08:59 UTC) → `logger.error("[hnx] all HNX/UPCOM price sources failed")` fires on every off-hours invocation. HOSE calls also use `force: true` but HOSE source tolerates off-hours differently.

**Suggested fix:** When `force:true` AND `!isTradingSession()` AND both live sources return empty → fall back to last DB-cached price (don't log ERROR; log DEBUG). Files: `sectorRotationTools.ts:181,188`, `portfolioTools.ts:160,163`, `marketTools.ts:218,235`. **Dispatch: `dev-mcp-server` or `dev-stock-price`**

---

### BUG-3 — Reuters RSS Dead (Never Fetched)

**Severity:** HIGH  
**Re-probe:** `get_system_status` → `Reuters RSS | Ngưng | Chưa bao giờ | 9 ⚠` (9 failures in 38m since server restart)  
**Status:** Decommissioned from VPS (fix #7, 2026-04-30) but main-server still polls it and fails every intelligence cycle. CB shows OK (0 failures) — inconsistency vs source health table (9 failures) persists.  
**Suggested fix:** Set Reuters to `disabled` in the main-server source health poller (same as `newsapi`). **Dispatch: `dev-mainserver-crawls`**

---

### BUG-4 — TradingEconomics Dead + Phantom Stale Macro Values (HIGH RISK)

**Severity:** HIGH  
**Re-probe:** `get_system_status` → 2× `Trading Economics | Ngưng | Chưa bao giờ | 9 ⚠`  
**Phantom values still in DB (unchanged from 00:10Z):**
- `wti_crude_usd: 95.5` (79 data points) — real market Brent: $80.59 (~19% over-stated)
- `dow_jones: 23750` (49 data points) — real market: ~38000+ (~38% under-stated)
- `brent_crude_usd: 80.59` (23 data points) — appears fresh (brent from different source)

**Affected callers (flow-file grep):** news-scout (regime classification), market-watcher (macro overlay), bctc-analyst (oil→CPI pass-through T-20), unified-agent (narrative macro section)  
**Suggested fix:** (a) Fix TradingEconomics Chromium scraper on main-server (Chromium available). (b) Add freshness guard: if last-updated >48h → flag `is_estimate:true` and suppress from regime signals. **Dispatch: `dev-mainserver-crawls` + `dev-mcp-server`**

---

### BUG-5 — `get_sentiment_trend` Broken Bare-Call in fb-market-poster (UPGRADED: caller confirmed)

**Severity:** HIGH (upgraded from MEDIUM — confirmed daily-cron caller)  
**Re-probe:** `get_sentiment_trend({})` → `{"error":"Error: stock_code (or symbol) is required","source_tier":3}`  
**Caller-surface grep:** `grep -r "get_sentiment_trend" docs/agents/`

| File | Line | Pattern | Status |
|------|------|---------|--------|
| `docs/agents/fb-market-poster/flow/main.md` | 118 | `arguments={}` (bare call) | **BROKEN** |
| `docs/agents/unified-agent/flow/market-analysis.md` | 7 | Correctly notes: "requires `stock_code` — skip here" | OK (skip pattern) |
| `docs/agents/tools/package/unified-agent.md` | 62 | `stock_code: string (req)` | Correctly documented |
| `docs/agents/tools/list/get_sentiment_trend.md` | 15 | `stock_code | Yes | —` | SSOT correct |

**Caller count:** 1 affected caller with broken pattern (`fb-market-poster/flow/main.md:118`)  
**Impact:** fb-market-poster fails to retrieve sentiment trend on every daily run.  
**Fix:** Update `docs/agents/fb-market-poster/flow/main.md:118` — either call per-ticker (iterate watchlist stocks and call per `stock_code`) or remove the bare call and log data unavailable. **Dispatch: `dev-mcp-server` or flow-file patch**

---

## ACTIVE ISSUEs — 6 (5 re-confirmed + 1 new)

### ISSUE-SBV-PARSE — SBV Policy Rates Degraded (Partially Improved — Unchanged)

| Field | This Cycle (02:05Z) | Delta |
|-------|-------------------|-------|
| `sbvRatesRefreshJob.last_status` | `success` | Unchanged (improved from prior crash) |
| `success_rate` | `0.98 (98.1%)` | Unchanged |
| `policy_rates.source` | `"sbv_rates DB fallback (HTML parse failed)"` | Unchanged |
| `lombard_rate_pct` | `0` (wrong — expect ~4.5%) | Unchanged |
| `vn-sbv-fetch` VPS health | `healthy` (was unhealthy at 00:10Z) | **IMPROVED** |
| Zero-value rejection | `storeSbvSnapshot REJECTED — zero-value` at 02:02:10 | Unchanged |

Job no longer crashing and VPS service now healthy — but HTML parse for policy rates still failing → `lombard_rate_pct:0` data integrity risk persists.

---

### ISSUE-VNSTOCK-STATS — 85.7% Success Rate (Unchanged)

`vnstockTradingStatsRefresh: success_rate: 0.86 (85.7%)` — 1 failure out of 7 runs (7-day window), avg duration 649s. Intermittent VNstock API failures.

---

### ISSUE-MACRO-CAL — `get_macro_calendar` Unavailable + `days_ahead` Param Ignored (Unchanged)

Re-probe: `get_macro_calendar({"days_ahead":14})` → `{"status":"unavailable","events":[],"daysRequested":60,"is_estimate":true}` — input `days_ahead:14` silently replaced by hardcoded `60`. Calendar never populated. Affects digest-predict and unified-agent macro event scheduling.

---

### ISSUE-ISM — ISM Sub-components Missing (Unchanged)

Re-probe: `get_ism_subcomponents({})` → `{"error":"no_data","message":"...requires FRED_API_KEY"}`. ISM PMI sub-components permanently absent until `FRED_API_KEY` env var is configured. Used by macro regime classification in 3+ agents.

---

### ISSUE-LIQUIDITY — `get_vn_liquidity_state` Multiple Null/Zero Sub-fields (Unchanged)

| Sub-component | Value | Reason |
|---------------|-------|--------|
| `policy_rates.lombard_rate_pct` | `0` (wrong) | SBV HTML parse failed → DB fallback missing field |
| `sjc_gold_gap.sjc_price_mn_vnd` | `0` | No SJC crawler row in DB |
| `fx_coupling.usd_vnd_buy/sell/cny` | `0` | Buy/sell/CNY absent from VCB fetch |
| `omo.net_outstanding_bn_vnd` | `null` | OMO HTML: no add/absorb rows found |
| `interbank_1w.rate_1w_pct` | `null` | `dttktt.sbv.gov.vn` unreachable (100% packet loss) |

Only `fx_coupling.usd_vnd_center` (26120) and `dxy` (100.849) are non-estimate.

---

### NEW: ISSUE-RESTART-CHURN — High Unclean Server Restart Rate

**Severity:** MEDIUM (new finding this cycle)  
**Source:** `get_cron_health` → `mcpServerStartup: total_runs:61` vs `mcpServerCleanShutdown: total_runs:30` (7-day window)  
**Analysis:**
- 61 startups / 7 days = ~8.7 restarts/day
- 30 clean shutdowns / 61 startups = **49% clean ratio** → ~31 unclean restarts in 7 days (~4.4/day)
- `restartCadenceAlertJob: success_rate:1.00, total_runs:608` — monitoring runs but 49% clean ratio suggests OOM or watchdog kills, not graceful lifecycle
- **Observed impact this cycle:** Initial parallel probe batch hit 3× EOF errors (server restarted mid-batch at 02:03 UTC)
- `bctcReparseJob: success_rate:0.94 (94.4%)` — below-threshold success rate may be partly explained by restart interruptions

**Suggested action:** Check Docker container memory limits, OOM kill logs (`dmesg` / Docker inspect), and watchdog policy. If OOM-driven: tune memory or identify leak. `restartCadenceAlertJob` should alert when unclean ratio exceeds threshold. **Dispatch: `ops`**

---

## Resolved This Cycle — 0

No findings resolved. All prior active findings re-confirmed. `vn-sbv-fetch` VPS service now healthy (partial improvement in ISSUE-SBV-PARSE but data still degraded).

---

## Tools Verified Healthy This Cycle

| Tool | Status | Evidence |
|------|--------|---------|
| `get_cycle_bootstrap` | ✅ Healthy | Returns in 19ms; agent_signals + market_context + system_status all present |
| `get_system_status` | ✅ Healthy | Full CB + DB + source table returned |
| `get_vps_service_health` | ✅ Reachable | 2 healthy (news, sbv), 2 idle (market closed), 1 unhealthy (bctc — BUG-1) |
| `get_vps_proxy_health` | ✅ Healthy | news/sbv pushes active; bctc stale (BUG-1) |
| `get_sla_status` | ✅ Healthy | 4 ok, 1 breached (bctc CRITICAL) |
| `get_earnings_calendar` | ✅ Healthy | 41 tickers, 12 overdue |
| `get_cron_health` | ✅ Healthy | 70+ crons; all success_rate ≥ 85.7% |
| `get_ism_subcomponents` | ✅ Reachable | Returns structured error (no data — config issue, not tool failure) |
| `get_macro_calendar` | ✅ Reachable | Returns structured unavailable (no data — not tool failure) |
| `get_vn_liquidity_state` | ✅ Reachable | Returns structured partial data with is_estimate flags |

**Watch — RSS degradation (transient):** CafeF RSS, VnEconomy RSS, VnExpress RSS all showed `Suy giảm` with 1 consecutive failure at probe time. Server uptime was only 38m — first-poll failures after restart are expected. Not escalating to BUG; re-check next cycle.

---

## IMPROVEs — 6 (Unchanged from prior cycle + IMP-1 caller surface updated)

| ID | Finding | Caller surface verified | Recommendation |
|----|---------|------------------------|----------------|
| IMP-1 | `get_cycle_bootstrap` enum still includes `financial-analyst` + `report-analyzer` (`getCycleBootstrap.ts:20,26`, `cycleBootstrapTool.ts:27,28`; tests at `1563-get-cycle-bootstrap.test.ts:35,41` assert them) | 0 flow-file callers use deprecated names — test files lock them in | Remove from enum + update tests when agent sunset is confirmed |
| IMP-2 | SBV HTML parse fragility — OMO + policy rates fall back to DB when HTML structure changes | Callers: ISSUE-LIQUIDITY + ISSUE-SBV-PARSE | Add structured SBV API fallback or alerting when `lombard_rate_pct` resolves to 0 |
| IMP-3 | `get_macro_calendar` returns `unavailable` with no ETA; `days_ahead` param silently ignored (returns 60) | Callers: digest-predict, unified-agent | Document population trigger; fix `daysRequested` to echo input param |
| IMP-4 | `get_vn_liquidity_state` IRS gap marked "permanent" but system-map has no DD-6 note | Callers: market-watcher, bctc-analyst | Add `"irs": {"source": "unavailable-permanent", "reason": "HNX OTC not machine-readable"}` to system-map.json |
| IMP-5 | Phantom stale TradingEconomics values (`wti:95.5`, `dow:23750`) returned without freshness warning | Callers: news-scout, market-watcher, bctc-analyst, unified-agent | Add `stale_since` / `is_estimate:true` flag in auto-tracked indicators when source dead >24h |
| IMP-6 | `dttktt.sbv.gov.vn` 100% packet loss from VPS → interbank 1w permanently null | Callers: market-watcher, bctc-analyst (liquidity overlay) | Investigate alternative interbank rate source (direct SBV portal scrape from main server) |

---

## Priority Action Queue (cumulative)

1. **[CRITICAL] BUG-1** — `vn-bctc-fetch` VPS dead 129h. SSH Vinahost VPS → restart service → verify pushes resume. **Dispatch: `dev-vps-crawls`**

2. **[HIGH] BUG-5** *(upgraded this cycle)* — `fb-market-poster/flow/main.md:118` calls `get_sentiment_trend({})` bare — always fails. Fix: iterate watchlist tickers per `stock_code` or remove call. **Dispatch: `dev-mcp-server`** (or direct flow file patch)

3. **[HIGH] BUG-4** — TradingEconomics 9 consecutive failures + phantom stale macro values misleading agents. Fix Chromium scraper; add staleness guard. **Dispatch: `dev-mainserver-crawls` + `dev-mcp-server`**

4. **[HIGH] BUG-2** — HNX/UPCOM error spam root cause confirmed. Fix: downgrade ERROR→DEBUG when `force:true` + off-hours + both sources empty; fall back to DB cache. Files: `sectorRotationTools.ts:181,188`, `portfolioTools.ts:160,163`, `marketTools.ts:218,235`. **Dispatch: `dev-mcp-server`**

5. **[HIGH] BUG-3** — Reuters RSS dead (9+ failures per restart). Disable from main-server source poller. **Dispatch: `dev-mainserver-crawls`**

6. **[MEDIUM] ISSUE-RESTART-CHURN** *(new)* — 49% unclean restart ratio (31/61 in 7d). Check Docker OOM logs + watchdog policy. **Dispatch: `ops`**

7. **[MEDIUM] ISSUE-ISM** — Configure `FRED_API_KEY` env var → ISM PMI data populates automatically. **Dispatch: `ops` or `pm`**

8. **[MEDIUM] ISSUE-SBV-PARSE** — SBV HTML parse still failing for policy rates (`lombard_rate_pct:0`). Fix parser or add VPS-side fallback. **Dispatch: `dev-vps-crawls`**

---

*Generated by health-recheck routine at 2026-06-21T02:05Z*
