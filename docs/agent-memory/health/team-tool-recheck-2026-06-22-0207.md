# Team MCP Tool Health Recheck — 2026-06-22T02:07Z

**Cycle:** 2026-06-22T02:07Z (UTC Monday, VN market OPEN 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-21-2206.md`
**Delta window:** ~4h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** 6m 50s (restarted ~2026-06-22T01:56:20Z)

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All active bugs/issues from prior report re-probed from scratch. Commands and outputs cited below.

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | unhealthy 5d 7h 57m; SLA 7522/120min; last_push 2026-06-16T18:02:24Z | WORSENING — Day 8 |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Suy giảm \| Chưa bao giờ \| 4` — counter reset after restart; still failing | UNCHANGED (failure ongoing) |
| BUG-3 TE dead | `get_system_status`, `get_macro_snapshot`, `get_macro_calendar` | TE both entries: `Suy giảm \| Chưa bao giờ \| 4`; deltas null; calendar `{"events":[],"status":"unavailable"}` | UNCHANGED (failure ongoing) |
| BUG-4 ISM no FRED_API_KEY | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}` | UNCHANGED |
| ISSUE-1 SBV crash loop | `get_vps_service_health`, `get_sla_status`, `get_system_status` | vn-sbv-fetch: unhealthy, 1h; sbv_fx SLA OK (3/30min — data flowing); REJECTED errors in log | UNCHANGED (crash loop continues, data protected) |
| ISSUE-2 49 warnings backlog | `get_system_status` DB Audit | open_warnings: 49, pending_feedback: 67 | UNCHANGED |
| ISSUE-3 cycle stalls | `get_cron_health` | intelligenceCycleJob: last_status=**running** at 02:04 UTC (started 02:00:01, avg 27602ms) | UNCHANGED |
| ISSUE-4 TA not ready 7 tickers | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 | UNCHANGED |
| ISSUE-5 commodity deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED (linked to BUG-3) |
| ISSUE-6 vnstock 85.7% | `get_cron_health` | `vnstockTradingStatsRefresh: 0.86, avg=649220ms, total_runs=7` | UNCHANGED |
| ISSUE-7 macro-calendar empty | `get_macro_calendar({})` | `{"events":[],"status":"unavailable"}` | UNCHANGED (linked to BUG-3) |
| BUG-6 (resolved) get_agent_signals all-producers | `get_agent_signals({from_agent:null,"status":"all","hours_back":0.25})` | Returns 6 signals — STILL WORKING | RESOLVED — confirmed |

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — 6 signals, full market context, 10 analyses, 13ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53, source_tier=2, breadth zeros at open (2 min in — transient) | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $79.44, gold $4213.1, USD/VND 26122; deltas null (TE dead) | ✅ REACHABLE (data gap BUG-3) |
| `get_system_status` | `{}` | 10 unresolved errors; Reuters+TE degraded 4×; sbv REJECTED; foreign-flow fallbacks exhausted | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: unhealthy 5d 7h 57m; vn-foreign-flow: unhealthy 1d 12h 29m; vn-price-fetch: unhealthy 1h; vn-sbv-fetch: unhealthy 1h; vn-news-fetch: healthy | ⚠ BUG-1, ISSUE-1, **NEW ISSUE-10** |
| `get_vps_proxy_health` | `{}` | prices: ok (02:03); news: ok (02:01); sbv: ok (02:03); bctc: STALE (last 2026-06-16) | ⚠ BUG-1 confirmed |
| `get_sla_status` | `{}` | bctc: **7522/120min CRITICAL**; price/news/sbv_fx/foreign_flow: ok | ⚠ BUG-1 confirmed |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}` | ❌ BUG-4 unchanged |
| `get_macro_calendar` | `{}` | `{"events":[],"status":"unavailable","source_tier":4}` | ❌ ISSUE-7 confirmed |
| `get_cron_health` | `{}` | intelligenceCycleJob running; sbvRatesRefreshJob 98.2%; vnstockTradingStatsRefresh 85.7%; vnstockFundamentalsRefresh avg 845851ms | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — 7 tickers TA not ready | ⚠ ISSUE-4 confirmed |
| `get_earnings_calendar` | `{}` | 41 tickers; 11 QUÁ HẠN (BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) | ✅ REACHABLE |
| `get_agent_signals` | `{from_agent:null,status:"all",hours_back:0.25}` | 6 signals returned — all-producers mode WORKING | ✅ HEALTHY |
| `get_technical_indicators` | `{code:"FPT"}` | OK — MA5=72440, RSI=41.3, MACD, BB returned | ✅ HEALTHY |
| `get_foreign_flow` | `{code:"HPG"}` | OK — neutral signal, history 10 days returned | ✅ HEALTHY |
| `get_market_foreign_flow` | `{}` | OK — zeros at market open (2 min in) — transient | ✅ HEALTHY |
| `task_claim` | `{task_id:"health-recheck-probe-2026-06-22",task_kind:"sprint-task",owner_agent:"health-recheck",ttl_seconds:60}` | `{"claimed":true}` | ✅ HEALTHY |
| `get_watchlist` | `{}` | OK — 41 tickers with live prices | ✅ HEALTHY |

---

## RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle | Evidence |
|------|-------------|------------|---------|
| BUG-6 `get_agent_signals` all-producers null-path | RESOLVED (prior cycle) | Still working | `get_agent_signals({from_agent:null,...})` → 6 signals |

---

## ACTIVE BUGS — 4 (all re-confirmed this cycle)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 8+

**Delta vs 22:06 yesterday:** +4h continuous failure. Now **5 days 7h 57m** without BCTC VPS recovery.

| Signal | 22:06 Sun | 02:07 Mon | Delta |
|--------|-----------|-----------|-------|
| vn-bctc-fetch uptime | 5d 3h 57m | **5d 7h 57m** | +4h continuous |
| SLA breach (actual/SLA) | 7283/360min | **7522/120min** | +239 min actual |
| Last BCTC VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| Overdue Q1 tickers | 11 QUÁ HẠN | 11 QUÁ HẠN | Unchanged |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms, uptime=5d 7h 57m`
- `get_sla_status`: `bctc: 7522/120min — CRITICAL`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`

**Caller surface:** bctc-analyst, market-analyst, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob

**Blast radius: CRITICAL. Day 8+. 11 Q1 watchlist tickers losing BCTC ingestion. 2 agent flows stalled for overdue tickers.**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — FAILURE ONGOING — Reuters RSS Dead

**Delta vs 22:06:** Server restart at ~01:56 UTC reset consecutive-error counter from 99+ to 4. Root cause unchanged — source "Chưa bao giờ" (never succeeded).

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Reuters RSS | Suy giảm | Chưa bao giờ | 4`
- Pattern: ~4 failures since 01:56 UTC restart (~7.5 min/failure)

**Caller surface grep:** `grep -rE "reuters" docs/agents/*/flow/*.md` → news-scout/flow/cycle.md, unified-agent/flow/chef.md
**Callers: 2 agent flows (news-scout, unified-agent). ~8 logged errors/hour.**

**Fix:** Disable Reuters RSS source record in MCP DB/config. Source decommissioned per fix #7 (2026-04-30) but record still active.

---

### BUG-3 — HIGH — FAILURE ONGOING — Trading Economics 2× Dead

**Delta vs 22:06:** Counter reset to 4 (×2 TE entries) post-restart. Root cause unchanged.

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Trading Economics | Suy giảm | Chưa bao giờ | 4` (both entries)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — deltas still null
- `get_macro_calendar({})`: `{"events":[],"status":"unavailable","source_tier":4}` — empty confirmed

**Caller surface:** market-watcher, unified-agent, news-scout, digest-predict, alert-commander (5 flows impacted)

**Blast radius: Commodity/macro deltas null system-wide. macro-calendar empty (ISSUE-7 linked). 5 agent flows degraded.**

**Fix:** Diagnose why `tradingeconomics.com` fetcher never initiates post-restart. Check TE scraper/Chromium path in mcp-server container.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`

**Caller surface:** `grep -rE "get_ism_subcomponents" docs/agents/*/flow/*.md` → bctc-analyst/flow/cycle.md, news-scout/flow/cycle.md, unified-agent/flow/chef.md (3 flows)

**Fix:** (1) Set `FRED_API_KEY` env var (free: fred.stlouisfed.org). (2) Re-run macroIndicatorRefreshJob to populate.

---

## ACTIVE ISSUES — 9

### ISSUE-1 — HIGH — UNCHANGED — SBV VPS Crash Loop (continuing)

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-sbv-fetch: unhealthy, 0ms, VPS uptime: 1h` (crash loop; restarted ~01:00 UTC)
- `get_vps_proxy_health`: `sbv: ok, last_push=2026-06-22T02:03:01Z` — data IS flowing
- `get_sla_status`: `sbv_fx: 3/30min — ok` — data quality protected
- `get_system_status` errors: `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` — protection guard active

**Status:** Data integrity maintained by zero-value guard. Service crash loop is the root problem.
**Callers confirmed:** macro_snapshot, carry_trade_signal, bctc-analyst, news-scout

**Fix (two-part):** (1) Add startup zero-guard in vn-sbv-fetch: skip push if fetched_rate == 0. (2) Investigate crash via `journalctl -u vn-sbv-fetch` on VPS.

---

### ISSUE-2 — HIGH — UNCHANGED — Warning/Feedback Backlog

**Re-probe evidence (this cycle):**
- `get_system_status` DB Audit: `open_warnings: 49 high/critical, pending_feedback: 67 new items`

**Fix:** Manual triage session. Partially auto-resolves when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Stalls

**Re-probe evidence (this cycle):**
- `get_cron_health`: `intelligenceCycleJob: last_status=running, last_run=2026-06-22T02:00:01Z` — still running at 02:04 UTC (4 min after start; avg_duration 27602ms)
- Pattern consistent with prior: job occasionally exceeds 15-min slot, blocks next run.

**Fix:** Add hard 12-minute timeout to `intelligenceCycleJob.ts` to kill runaway cycles.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

**Re-probe evidence (this cycle):**
- `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6

**Fix:** (1) BDI: Replace `^BDI` Yahoo Finance ticker with Baltic Exchange API. (2) Others: resolve when BCTC pipeline (BUG-1) restored.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Deltas Null (linked to BUG-3)

**Re-probe evidence (this cycle):**
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null, oilUsdDirection:"unknown"`

**Auto-resolves with BUG-3 fix.**

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 649s Runtime

**Re-probe evidence (this cycle):**
- `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), avg_duration=649220ms, total_runs=7`

**Fix:** Add per-ticker error isolation + 15-min job timeout guard.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Returns Empty (linked to BUG-3)

**Re-probe evidence (this cycle):**
- `get_macro_calendar({})`: `{"daysRequested":60,"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}`

**Callers confirmed:** `digest-predict/flow/weekly.md`, `alert-commander/flow/stage-bootstrap.md`
**Auto-resolves with BUG-3 fix.**

---

### ISSUE-10 — MEDIUM — NEW — VPS Service Health Reporting Inconsistent (4/5 Unhealthy vs Data Flowing)

**Discovery:** `get_vps_service_health` reports 4 of 5 services unhealthy; only `vn-news-fetch: healthy`. BUT `get_vps_proxy_health` shows active data pushes for all failing services within the last minute.

**Evidence (this cycle):**
- `get_vps_service_health`: vn-bctc-fetch unhealthy (5d 7h 57m) ✓ genuinely dead; vn-foreign-flow unhealthy (1d 12h 29m); vn-price-fetch unhealthy (1h); vn-sbv-fetch unhealthy (1h)
- `get_vps_proxy_health`:
  - prices: `last_push=2026-06-22T02:03:35Z, 3 pushes/24h, status=ok` — data flowing
  - foreign-flow: `last_push=2026-06-22T02:03:27Z, multiple pushes/hour, status=ok` — data flowing
  - sbv: `last_push=2026-06-22T02:03:01Z, 5 pushes/24h, status=ok` — data flowing

**Contradiction:** vn-foreign-flow has uptime 1d 12h 29m but is "unhealthy" — suggests health endpoint is not responding but the fetch-push pipeline continues. vn-price-fetch and vn-sbv-fetch show 1h uptime (recently restarted) but data IS flowing.

**Classification:** ISSUE — health check endpoint broken/unreliable for 3 of 4 failing services. Creates false-alarm fatigue for `ops` and `system-auditor` agents monitoring `get_vps_service_health`. BUG-1 (bctc) is the only confirmed true failure; the other 3 "unhealthy" services are delivering data.

**Caller surface (get_vps_service_health):** `grep -r "get_vps_service_health" docs/agents/*/flow/*.md` → system-auditor/flow, ops/flow, ops-vps-fetch/flow (3 flows)

**Fix:** (a) Fix VPS health endpoint response in `vn-foreign-flow` service (likely returns non-200 or times out). (b) Add `data_flowing: bool` field to disambiguate health endpoint fail vs data pipeline fail. (c) Confirm if vn-price-fetch/vn-sbv-fetch crash recovery (1h) is within expected bounds.

---

### ISSUE-11 — LOW — NEW — vnstockFundamentalsRefresh Extremely Slow (845s avg)

**Discovery:** `get_cron_health` shows `vnstockFundamentalsRefresh: avg_duration=845851ms (14.1 min)` for 2 runs. This is nearly the length of a full intelligence cycle slot.

**Evidence (this cycle):**
- `get_cron_health`: `vnstockFundamentalsRefresh: last_run=2026-06-22T01:05:01Z, last_status=success, avg_duration=845851ms, total_runs=2`

**Risk:** If this job runs concurrently with intelligenceCycleJob it may contribute to ISSUE-3 stalls. At 14+ min avg it's also close to the 15-min slot boundary.

**Fix:** Add per-ticker timeout (e.g. 30s) + error isolation. Consider running off-peak (e.g. 03:00 UTC) to avoid market-hour overlap.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Result | Evidence | Verdict |
|------|----------------|----------|---------|
| `get_cycle_bootstrap({})` initial fail | Validation error | Required `agent_name` param — missing in probe | NON-ISSUE — probe error |
| `get_foreign_flow({ticker:"HPG"})` initial fail | Validation error | Tool requires `code` (not `ticker`) — wrong param name in probe | NON-ISSUE — probe error |
| `get_agent_signals({status:"all",hours_back:1})` fail | "agent required" | Tool requires either `from_agent` or `agent` — omitted both in probe | NON-ISSUE — probe error |
| `task_claim({task_kind:"health-check",...})` fail | Enum error | Valid values: cowork-slot/sprint-task/dashboard-row/commit-mutex — I used wrong value | NON-ISSUE — probe error |
| Market breadth 0/0/0 at 02:02 UTC | All zeros | VN market opened 02:00 UTC; 2 min in, no trades processed yet; watchlist prices moving normally | NON-ISSUE — transient at open |
| `storeSbvSnapshot REJECTED` errors in log | Protective guard | Guard correctly prevents zero-value overwrite of good SBV data | NON-ISSUE — by design |
| `get_bctc_refined` no rows | `{"error":"no refined units found"}` | Refine not run for this ticker — ESC-5 docs: "graceful, ESC-5=FALSE" | NON-ISSUE — expected |
| newsapi: disabled | 0 fetches | Intentional by design | NON-ISSUE — by design |
| get_market_foreign_flow all zeros | All zeros at 02:04 UTC | Market just opened; 4 min in, no foreign trades processed yet | NON-ISSUE — transient at open |
| `task_claim({task_kind:"sprint-task",...})` | `{"claimed":true}` | Correct param → works | ✅ HEALTHY |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 8+ (WORSENING: 7522min SLA, 11 QUÁ HẠN tickers) |
| BUG HIGH | 2 | BUG-2 Reuters dead (ongoing), BUG-3 Trading Economics 2× dead (ongoing) |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY |
| ISSUE HIGH | 2 | ISSUE-1 SBV crash loop (data protected), ISSUE-2 49 warnings/67 feedback backlog |
| ISSUE MEDIUM | 2 | ISSUE-3 intelligence-cycle stalls; **ISSUE-10 NEW** VPS health inconsistent 4/5 unhealthy vs data flowing |
| ISSUE LOW | 5 | ISSUE-4 BDI+6 TA dead, ISSUE-5 deltas null, ISSUE-6 vnstock 85.7%, ISSUE-7 macro-calendar empty, **ISSUE-11 NEW** vnstockFundamentalsRefresh 845s |
| NON-ISSUE | 10 | Probe errors, transient at-open, by-design, protective guards |
| RESOLVED | 0 | (BUG-6 resolved prior cycle — still confirmed working) |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1 CRITICAL, Day 8+, 11 overdue Q1 tickers. Then `trigger_bctc_vps_fetch` to backfill.
2. **Fix vn-sbv-fetch crash loop** — ISSUE-1 HIGH. Add startup zero-guard + investigate `journalctl -u vn-sbv-fetch` on VPS.
3. **Set FRED_API_KEY** — BUG-4 free API, unblocks ISM for 3 agent flows.
4. **Disable Reuters RSS source record** — BUG-2, ~8 errors/hour from decommissioned source.
5. **Diagnose TE fetcher pre-CB failure** — BUG-3, unblocks commodity deltas + macro-calendar for 5 flows.
6. **Fix VPS health endpoint for vn-foreign-flow** — ISSUE-10, stops false-alarm fatigue in ops/system-auditor.
7. **Add 12-min timeout to intelligenceCycleJob.ts** — ISSUE-3.
8. **Add per-ticker timeout + off-peak schedule to vnstockFundamentalsRefresh** — ISSUE-11.
