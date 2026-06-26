# Team MCP Tool Recheck — 2026-06-21T00:10Z

**Run timestamp:** 2026-06-21T00:10Z  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-20-2210.md`  
**Market status:** CLOSED (Sunday — VN market outside 02:00–08:59 UTC Mon–Fri)  
**Server uptime at probe time:** 50m 21s (restarted ~23:12 UTC 2026-06-20)

---

## Step 3c — Prior Finding Re-Probes (Mandatory)

All findings from the 22:10Z report re-probed this cycle before carry-forward decision.

| Finding | Prior Status | Re-Probe Command | Re-Probe Result |
|---------|-------------|-----------------|----------------|
| BUG-1: BCTC VPS Dead | ACTIVE | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | **RE-CONFIRMED** — `vn-bctc-fetch: unhealthy \| 4d 5h 57m uptime`; SLA 5962/2375 min CRITICAL; last push 2026-06-16 18:02:24 |
| BUG-2: HNX/UPCOM failures | ACTIVE | `get_system_status` (unresolved errors) | **RE-CONFIRMED + ROOT CAUSE FOUND** — 10/10 unresolved errors are `[hnx] all HNX/UPCOM price sources failed`; traced to `force:true` in 3 tool files (see below) |
| BUG-3: Reuters RSS Dead | ACTIVE | `get_system_status` source health | **RE-CONFIRMED** — `Reuters RSS \| Ngưng \| Chưa bao giờ \| 9 ⚠` (counter reset after server restart, same failure pattern) |
| BUG-4: TradingEconomics Dead + Phantom Values | ACTIVE | `get_system_status` source health + auto-tracked indicators | **RE-CONFIRMED** — 2× `Trading Economics \| Ngưng \| Chưa bao giờ \| 9 ⚠`; `wti_crude_usd:95.5` (79 pts), `dow_jones:23750` (49 pts) still in DB |
| BUG-5: get_sentiment_trend bare-call error | ACTIVE | `get_sentiment_trend({})` | **RE-CONFIRMED** — `{"error":"Error: stock_code (or symbol) is required","source_tier":3}` |
| ISSUE-SBV-PARSE: job crashed | ACTIVE | `get_cron_health`, `get_vn_liquidity_state` | **PARTIALLY IMPROVED** — `sbvRatesRefreshJob: last_status: success` (no longer crashing); BUT `lombard_rate_pct:0`, policy_rates `source:"sbv_rates DB fallback (HTML parse failed)"`, `vn-sbv-fetch` VPS unhealthy (44m uptime), zero-value rejection at 00:02:05 UTC |
| ISSUE-VNSTOCK-STATS: 85.7% success | ACTIVE | `get_cron_health` | **RE-CONFIRMED** — `vnstockTradingStatsRefresh: success_rate: 0.86 (85.7%)` unchanged |
| ISSUE-MACRO-CAL: unavailable | ACTIVE | `get_macro_calendar({"days_ahead":14})` | **RE-CONFIRMED** — `{"status":"unavailable","events":[],"is_estimate":true,"daysRequested":60}` — input param ignored |
| ISSUE-ISM: no FRED_API_KEY | ACTIVE | `get_ism_subcomponents({})` | **RE-CONFIRMED** — `{"error":"no_data","message":"...requires FRED_API_KEY"}` |
| ISSUE-LIQUIDITY: null sub-fields | ACTIVE | `get_vn_liquidity_state({})` | **RE-CONFIRMED** — `lombard_rate_pct:0`, `sjc_price_mn_vnd:0`, `usd_vnd_buy/sell:0`, `omo.net_outstanding:null`, `interbank_1w:null` |

**Net change vs 22:10Z:** 0 resolved. ISSUE-SBV-PARSE partially improved (job not crashing but data still degraded). BUG-2 root cause newly identified this cycle.

---

## ACTIVE BUGs — 5 (all re-confirmed)

### BUG-1 — BCTC VPS Dead (CRITICAL — 127+ hours)

**Severity:** CRITICAL  
**Duration:** Since 2026-06-16 18:02:24 UTC — now **~127 hours** (5+ days)

| Check | Result |
|-------|--------|
| `get_vps_service_health` | `vn-bctc-fetch: unhealthy \| response_ms:0 \| uptime:4d 5h 57m` |
| `get_vps_proxy_health` | `bctc: last_push: 2026-06-16 18:02:24 \| STALE: YES \| 0 pushes 24h` |
| `get_sla_status` | `bctc: 5962/2375 min \| breached: CRITICAL` |
| `get_earnings_calendar` | 12 tickers QUÁ HẠN (overdue Q1-2026): BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH |

**Affected callers:** bctc-analyst (primary consumer), refine_bctc_md (PDF pipeline), system-auditor (SLA monitor)  
**Impact:** Zero BCTC financial data ingestion for 5+ days. Entire earnings analysis pipeline stalled. 12 overdue tickers unextracted during active Q1-2026 earnings window.  
**Action:** SSH to Vinahost VPS → restart `vn-bctc-fetch` service → verify push logs resume. Dispatch: `dev-vps-crawls`.

---

### BUG-2 — HNX / UPCOM Price Source Failures + Root Cause Identified

**Severity:** HIGH  
**Root cause found this cycle:** Three MCP tool handlers call `fetchHnxPrices`/`fetchUpcomPrices` with `{ force: true }`, bypassing the `isTradingSession()` guard in `hnx.ts:297,384`. The HNX API and VnDirect fallback both return empty outside trading hours → `logger.error("[hnx] all HNX price sources failed")` fires every time these tools are invoked off-hours.

| Caller file | Lines | Tool served |
|-------------|-------|-------------|
| `apps/mcp-server/src/interface/mcp/tools/sector/sectorRotationTools.ts` | 181, 188 | `get_sector_rotation` |
| `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts` | 160, 163 | portfolio conviction tool |
| `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` | 244, 253 | `get_market_snapshot` |

**Grep verification:** `grep -rn "force: true" apps/mcp-server/src/interface/mcp/tools/` → confirmed 3 files, 6 call-sites.

**Evidence:** 10/10 recent system errors are `[hnx]` class. Error fires at 00:00–00:02 UTC Sunday (00:xx UTC = 07:xx VN time, well outside market hours 02:00–08:59 UTC Mon–Fri).

**Suggested fix (dev-mcp-server / dev-stock-price):**  
When `force:true` AND `!isTradingSession()` AND both sources return empty → log at DEBUG/INFO not ERROR (market closed = expected empty). Alternatively, return last stored price from DB cache rather than attempting live fetch.

**Impact on agents:** market-watcher calls `get_sector_rotation` in off-hours mode, kinh-dich calls portfolio tools, news-scout bootstrap calls `get_market_snapshot` — all generate ERROR-level noise, clogging the unresolved errors queue.

---

### BUG-3 — Reuters RSS Dead (Never Fetched)

**Severity:** HIGH  
**Evidence this cycle:** `Reuters RSS | Ngưng | Chưa bao giờ | 9 ⚠` (9 failures in 50m since server restart)  
**Prior cycle:** 19 failures, same pattern  
**Status:** Decommissioned from VPS (fix #7, 2026-04-30) but MCP main-server still attempts direct fetch and fails every cycle. Circuit breaker reports `OK (0 failures)` — inconsistency with source health showing 9 failures (CB tracks network-layer vs source health tracks fetch success).  
**Affected callers:** Monitoring noise — news pipeline unaffected (RSS decommissioned). But the failing source adds noise to system health view.  
**Suggested fix:** Remove Reuters from the main-server source health poller or set it as `disabled` (same as `newsapi`).

---

### BUG-4 — TradingEconomics Dead + Phantom Stale Macro Values (HIGH RISK)

**Severity:** HIGH  
**Evidence this cycle:** 2× `Trading Economics | Ngưng | Chưa bao giờ | 9 ⚠` (stream + Chromium paths)  
**Phantom values still in DB:**
- `wti_crude_usd: 95.5` (79 data points — stale, current market ~$80)
- `dow_jones: 23750` (49 data points — stale, current market ~38000+)

**Risk:** These values are returned by `get_system_status` auto-tracked indicators and consumed by macro regime logic in news-scout, market-watcher, bctc-analyst, unified-agent. The `wti_crude_usd:95.5` is materially wrong (real Brent: $80.59). Agents may be calibrating oil-shock signals on stale data.

**Affected callers (grepped from flow files):** news-scout (regime classification), market-watcher (macro overlay), bctc-analyst (T-20 oil→CPI pass-through), unified-agent (narrative macro section).

**Suggested fix:** (a) Fix TradingEconomics Chromium scraper (main-server has Chromium available per recent fix). (b) Add freshness guard: if `wti_crude_usd` last updated >48h → mark `is_estimate:true` and block from regime signals.

---

### BUG-5 — `get_sentiment_trend` Requires Undocumented Required Parameter

**Severity:** MEDIUM  
**Re-probe this cycle:** `get_sentiment_trend({})` → `{"error":"Error: stock_code (or symbol) is required","source_tier":3}`  
**Status:** Unchanged from prior cycle.  
**Caller surface check:** grep `docs/agents/*/flow/*.md` for `get_sentiment_trend` — tool is listed in tool packages but bare-call pattern is not documented as failing.  
**Suggested fix:** Either (a) make `stock_code` optional with a portfolio-wide default, or (b) add `stock_code` as required in tool doc SSOT (`docs/agents/tools/list/get_sentiment_trend.md`).

---

## ACTIVE ISSUEs — 5 (all re-confirmed)

### ISSUE-SBV-PARSE — SBV Rates Degraded (Partially Improved)

| Field | Prior Cycle (22:10Z) | This Cycle (00:10Z) |
|-------|---------------------|---------------------|
| `sbvRatesRefreshJob.last_status` | `crashed` | `success` (improved) |
| `success_rate` | ~98% | `0.98 (98.1%)` |
| `policy_rates.source` | DB fallback | DB fallback (HTML parse still failing) |
| `lombard_rate_pct` | `0` (wrong) | `0` (still wrong — expect ~4.5%) |
| `vn-sbv-fetch` VPS health | not checked | `unhealthy` (44m uptime) |
| Zero-value rejection | observed | `storeSbvSnapshot REJECTED — zero-value` at 00:02:05 |

Job no longer crashing, but HTML parse for policy rates still failing → `lombard_rate_pct:0` data integrity risk persists.

---

### ISSUE-VNSTOCK-STATS — 85.7% Success Rate (Unchanged)

`vnstockTradingStatsRefresh: success_rate: 0.86 (85.7%)` — 1 failure out of 7 runs (7-day window). Long-running job (avg 649s). Intermittent VNstock API failures.

---

### ISSUE-MACRO-CAL — `get_macro_calendar` Unavailable + `days_ahead` Param Ignored

`get_macro_calendar({"days_ahead":14})` → `{"status":"unavailable","events":[],"daysRequested":60,"is_estimate":true}` — input param `days_ahead:14` is silently replaced by hardcoded `60`. Calendar has never been populated. Affects digest-predict and unified-agent macro event scheduling.

---

### ISSUE-ISM — ISM Sub-components Missing (FRED_API_KEY Not Configured)

`get_ism_subcomponents({})` → `no_data` error. ISM PMI sub-components (new orders, employment, prices paid) permanently absent until `FRED_API_KEY` env var is set. Used by macro regime classification in 3+ agents.

---

### ISSUE-LIQUIDITY — `get_vn_liquidity_state` Multiple Null/Zero Sub-fields

| Sub-component | Status | Reason |
|---------------|--------|--------|
| `policy_rates.lombard_rate_pct` | `0` (wrong) | SBV HTML parse failed → DB fallback missing field |
| `sjc_gold_gap.sjc_price_mn_vnd` | `0` | No SJC crawler row in DB |
| `fx_coupling.usd_vnd_buy/sell/cny` | `0` | Buy/sell/CNY absent from VCB fetch |
| `omo.net_outstanding_bn_vnd` | `null` | OMO HTML: no add/absorb rows found |
| `interbank_1w.rate_1w_pct` | `null` | `dttktt.sbv.gov.vn` unreachable (100% packet loss) |

Only `fx_coupling.usd_vnd_center` (26120) and `dxy` (100.849) are non-estimate.

---

## Resolved This Cycle — 0

No findings resolved. All prior active findings re-confirmed.

---

## Tools Verified Healthy This Cycle

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ Healthy | Returns agent_signals + market_context + system_status in 25ms |
| `get_system_status` | ✅ Healthy | Full CB + DB + source table returned |
| `get_market_snapshot` | ✅ Healthy | VN-Index 1824.53 (-0.32%); HOSE/HNX prices returned (stale weekend) |
| `get_macro_snapshot` | ✅ Reachable | Partial data (TradingEconomics dead — see BUG-4) |
| `get_watchlist` | ✅ Healthy | 41 tickers returned |
| `get_cron_health` | ✅ Healthy | 70+ crons; all success_rate ≥ 85% |
| `get_pipeline_health` | ✅ Healthy | 5 tickers TA-not-ready (BDI, DAG, DLC, JSH, SIS, VDC, VNH — no price data) |
| `get_vps_proxy_health` | ✅ Healthy | news/sbv pushes active; bctc stale (BUG-1) |
| `get_vps_service_health` | ✅ Reachable | 2 unhealthy: vn-bctc-fetch (BUG-1), vn-sbv-fetch (ISSUE-SBV) |
| `get_sla_status` | ✅ Healthy | 2 breaches: bctc CRITICAL, news HIGH (marginal 34/30 min) |
| `get_earnings_calendar` | ✅ Healthy | 41 tickers, 12 overdue |
| `get_agent_signals` | ✅ Healthy | from_agent=null → all-producers mode works; agent= inbox mode works |
| `get_recent_fixes` | ✅ Healthy | 20 fixes returned; none covering active bugs |
| `get_recent_signals` | ✅ Healthy | 6 VERIFIED_DECISION signals returned |
| `task_list_held` | ✅ Healthy | 5 locks; 1 bctc-analyst ESC guard (normal), cowork-dispatcher mutex (normal) |
| `get_macro_snapshot` | ✅ Reachable | oil/gold/usdvnd fresh; TradingEconomics paths dead |

---

## IMPROVEs — 6 (Unchanged from prior cycle)

| ID | Finding | Recommendation |
|----|---------|----------------|
| IMP-1 | `get_cycle_bootstrap` enum includes legacy `financial-analyst` + `report-analyzer` (merged → `bctc-analyst` 2026-05-29). Confirmed by schema error this cycle. | Remove stale enum values from tool schema; update `docs/agents/tools/list/get_cycle_bootstrap.md` |
| IMP-2 | SBV HTML parse fragility — OMO + policy rates fall back to DB when HTML structure changes | Add structured SBV API fallback or alerting when HTML parse yields zero for `lombard_rate_pct` |
| IMP-3 | `get_macro_calendar` returns `unavailable` with no ETA; `days_ahead` param silently ignored (returns 60) | Document population trigger; fix `daysRequested` to echo input |
| IMP-4 | `get_vn_liquidity_state` IRS gap marked "permanent" but system-map has no DD-6 note | Add `"irs": {"source": "unavailable-permanent", "reason": "HNX OTC not machine-readable"}` to system-map.json |
| IMP-5 | Phantom stale TradingEconomics values (`wti:95.5`, `dow:23750`) returned without freshness warning | Add `stale_since` / `is_estimate:true` flag in auto-tracked indicators when source dead >24h |
| IMP-6 | `dttktt.sbv.gov.vn` 100% packet loss from VPS → interbank 1w permanently null | Investigate alternative interbank rate source (e.g. direct SBV portal scrape from main server) |

---

## Priority Action Queue

1. **[CRITICAL] BUG-1** — `vn-bctc-fetch` VPS dead 127h. SSH Vinahost VPS → restart service → verify pushes resume. **Dispatch: `dev-vps-crawls`**

2. **[HIGH] BUG-4** — TradingEconomics 9 consecutive failures + phantom stale macro values misleading agents. Fix Chromium scraper; add staleness guard. **Dispatch: `dev-mainserver-crawls` + `dev-mcp-server`**

3. **[HIGH] BUG-2** — HNX/UPCOM error spam root cause confirmed. Fix: downgrade ERROR→DEBUG/INFO in `fetchHnxPrices`/`fetchUpcomPrices` when `force:true` + outside market hours + both sources empty. Files: `sectorRotationTools.ts:181,188`, `portfolioTools.ts:160,163`, `marketTools.ts:244,253`. **Dispatch: `dev-mcp-server`**

4. **[HIGH] BUG-3** — Reuters RSS dead (never fetched, 9+ failures per restart). Disable from main-server source poller or route via VPS. **Dispatch: `dev-mainserver-crawls`**

5. **[MEDIUM] ISSUE-ISM** — Configure `FRED_API_KEY` env var → ISM PMI data populates automatically. **Dispatch: `ops` or `pm`**

6. **[MEDIUM] BUG-5** — Fix `get_sentiment_trend` bare-call or document required `stock_code`. **Dispatch: `dev-mcp-server`**

7. **[MEDIUM] ISSUE-SBV-PARSE** — SBV HTML parse still failing for policy rates (`lombard_rate_pct:0`). Fix parser or add fallback. **Dispatch: `dev-vps-crawls`**

---

*Generated by health-recheck routine at 2026-06-21T00:10Z*
