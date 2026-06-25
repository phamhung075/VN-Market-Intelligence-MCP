# Team MCP Tool Health Recheck — 2026-06-21T18:06Z

**Cycle:** 2026-06-21T18:06Z (UTC Sunday, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-1605.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server restart context:** `mcpServerStartup` last at 10:29:26 UTC; uptime 7h 33m at probe time.

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — market context, 1 alert, 10 recent analyses | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53, breadth 81/203/66, source VnDirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $80.59, gold $4172.9, USD/VND 26120; deltas null (TE dead) | ✅ REACHABLE (data gap) |
| `get_system_status` | `{}` | OK — 10 unresolved errors, 49 open warnings, 79 ⚠ Reuters + TE | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: unhealthy 4d 23h 57m; vn-sbv-fetch: **unhealthy again** (1h 14m) | ✅ REACHABLE |
| `get_sla_status` | `{}` | bctc: 7042/360min — CRITICAL; all others ok | ✅ REACHABLE |
| `get_vps_proxy_health` | `{}` | bctc: last_push=2026-06-16T18:02:24Z, STALE=YES; news/sbv: ok | ✅ REACHABLE |
| `get_ism_subcomponents` | `{}` | ERROR — no_data (FRED_API_KEY absent / NAPMBI HTTP 400) | ❌ BUG |
| `get_cron_health` | `{}` | OK — intelligenceCycleJob 99.7% (2 stalls since prior); vnstockTradingStatsRefresh 85.7% | ✅ REACHABLE |
| `get_macro_calendar` | `{days:60}` | `{"events":[],"status":"unavailable"}` — no calendar data | ❌ ISSUE |
| `get_rate_limit_status` | `{}` | `tradingeconomics.com: Chua goi` — CB blocking; reuters never called | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | OK — BDI/DAG/DLC/JSH/SIS/VDC/VNH TA not ready (0 rows) | ✅ REACHABLE |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN (unchanged from prior cycle) | ✅ HEALTHY |
| `get_recent_fixes` | `{limit:20}` | Newest fix: 2026-05-12 — no new fixes landed since prior cycle | ✅ REACHABLE |
| `task_list_held` | `{}` | 6 locks; `esc-datacov:FPT:Q1-2026:ESC-3` held by bctc-analyst, **no heartbeat since 2026-06-16** | ⚠ ISSUE |

**vn-sbv-fetch status change:** At 16:05 = `healthy (recovered)`. At 18:03 = `unhealthy (uptime 1h 14m)`. Service went down AGAIN ~16:49 UTC. This is a recurring restart pattern tied to ISSUE-1.

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All prior active bugs/issues re-probed from scratch. Commands and outputs cited inline.

---

## ACTIVE BUGS — 5 (BUG-5 NEW)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 6

**Delta vs 16:05 report:**

| Signal | 16:05 | 18:06 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch status | unhealthy, 4d 21h 57m | unhealthy, 4d 23h 57m | +2h |
| SLA breach (actual/target min) | 6921/3333 | 7042/360 | +121 actual; target format changed |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change |
| Q1 tickers QUÁ HẠN | 12 | 12 | Unchanged |
| TA not ready (rows=0) | — | BDI/DAG/DLC/JSH/SIS/VDC/VNH 7 tickers | Confirmed |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms, uptime=4d 23h 57m`
- `get_sla_status`: `bctc: 7042/360min — CRITICAL` (format change noted; actual age ~117h = 6.5× over 18h SLA estimate)
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_pipeline_health`: BDI rows=0, DAG rows=1, DLC rows=0, JSH rows=0, SIS rows=0, VDC rows=0, VNH rows=6 — 7 tickers with TA not ready
- `get_earnings_calendar`: 12 QUÁ HẠN: BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH

**Callers confirmed:**
1. `bctc-analyst` — `get_bctc_full`, `get_bctc_ocf`, `list_stored_pdfs`, `list_flagged_bctc_cells`
2. `market-analyst` — `get_financial_summary` depends on BCTC extract pipeline
3. `bctcPdfPullJob`, `bctcQueueEnricherJob`, `bctcReparseJob` — cron pipeline stalled

**Blast radius: 2 agent flows + 3 cron jobs; all BCTC analysis stalled Day 6. 12 Q1 tickers losing earnings ingestion window daily.**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → call `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead

**Delta vs 16:05:** Failure counter 57 → 79 (+22, ~11/h rate).

**Re-probe evidence (this cycle):**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 79 ⚠`
- `get_rate_limit_status`: `reuters.com` not in rate-limit table (CB layer never called)

**Context:** Per fix #7 (2026-04-30), `vn-reuters-fetch.service` was decommissioned. But the source record is still active and logging failures on every poll cycle.

**Callers (grep confirmed prior cycles):** `news-scout`, `unified-agent`
**Blast radius: news coverage degraded (missing Reuters source)**

**Fix:** Disable Reuters RSS source record in MCP DB/config, or replace with a working Reuters feed URL.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead

**Delta vs 16:05:** Failure counter 57 → 79 each (+22/entry, same ~11/h rate as Reuters).

**Re-probe evidence (this cycle):**
- `get_system_status`: `Trading Economics | Ngưng | Chưa bao giờ | 79 ⚠` (both TE entries)
- `get_rate_limit_status`: `tradingeconomics.com | Chua goi` — never called since restart 10:29 UTC
- `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null,"oilUsdDirection":"unknown"`

**Note on CB state:** In-memory CB shows `tradingEconomics [OK] failures: 0` (reset at restart). DB source_health shows 79 persistent failures. `Chua goi` confirms TE fetch path is not being reached — the fetcher errors BEFORE reaching the rate-limiter registration.

**Callers (grep confirmed):** `market-watcher`, `unified-agent`, `news-scout` via `get_macro_snapshot`
**Blast radius: 3 agent flows; commodity/macro deltas null for all agents**

**Fix:** Trace why `tradingeconomics.com` shows `Chua goi` (never called) despite CB being closed. Check if Chromium in mcp-server container is functional: `docker exec <ctr> chromium --version`. Verify TE site structure / check if the fetcher errors pre-CB in a startup/init path.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data

**Delta vs 16:05:** `macroIndicatorRefreshJob` re-ran at 12:13 UTC (success), no ISM rows produced.

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_system_status`: `[get_ism_subcomponents] no ISM data in fred_series_daily` at 16:02:59 + 23:02:59
- `get_cron_health`: `macroIndicatorRefreshJob: last_run=2026-06-21 12:13, success` — runs but produces no ISM rows because FRED API key absent + NAPMBI HTTP 400

**Callers (grep confirmed):** `bctc-analyst`, `news-scout`, `unified-agent`
**Blast radius: 3 agent flows — ISM/FRED macro signal unavailable**

**Fix:** (1) Set `FRED_API_KEY` in `.env` (free: fred.stlouisfed.org). (2) Verify NAPMBI is valid FRED series — HTTP 400 = invalid series ID. Check current valid series for ISM Manufacturing PMI (may be `NAPMPMI`, `ISM/MAN_PMI`, or similar).

---

### BUG-5 — MEDIUM — NEW — bctc-analyst Orphaned Task Lock

**First observed this cycle.**

**Re-probe evidence:**
- `task_list_held({})`: lock `esc-datacov:FPT:Q1-2026:ESC-3` held by `bctc-analyst`, `claimed_at=2026-06-16T18:11:14Z`, `heartbeat_at=1781633474` (= claimed_at, **no heartbeat updates in 5 days**), `expires_at=2026-06-24T18:11:14Z`
- Context: BCTC pipeline died 2026-06-16T18:02:24Z (same day/hour as this lock claim). bctc-analyst claimed the task then couldn't complete it when the VPS failed.

**Caller-surface impact:**
- Any new `bctc-analyst` cycle that tries to claim `esc-datacov:FPT:Q1-2026:ESC-3` will be blocked until 2026-06-24.
- FPT Q1-2026 coverage task is orphaned for 3 more days.

**Fix:** Run `task_force_release_orphan` for `esc-datacov:FPT:Q1-2026:ESC-3`, then re-trigger bctc-analyst for FPT Q1-2026 once BCTC pipeline is restored (BUG-1 fix first).

---

## ACTIVE ISSUES — 9 (ISSUE-9 NEW)

### ISSUE-1 — MEDIUM — WORSENING — SBV Recurring Service Crash + Zero-Value Loop

**Delta vs 16:05:** vn-sbv-fetch was `healthy` at 16:05, crashed AGAIN at ~16:49 UTC (now `unhealthy, uptime 1h 14m`). This is the 3rd or 4th cycle of: fail → restart → recover → fail within a single server session.

**Re-probe evidence:**
- `get_vps_service_health`: `vn-sbv-fetch: unhealthy, 0ms, uptime=1h 14m`
- `get_system_status`: 5× `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 16:02, 16:32, 17:02, 17:32, 18:02 UTC
- SBV macro data unaffected: `get_macro_snapshot` shows `usdVnd=26120` (fresh from sbv proxy)

**Root hypothesis:** vn-sbv-fetch crashes after too many zero-value rejections (outside VN business hours VCB XML API returns all zeros; the rejection guard is correct, but repeated REJECTED responses may be causing the VPS service to crash or restart.

**Fix (two-part):** (1) Add off-hours gate in VPS push handler to skip SBV pushes outside VN business hours (~00:00–10:00 UTC). This prevents zero-value rejections and stops the crash loop. (2) Investigate whether repeated REJECTED signals are crashing the VPS service, or if the service has an independent crash cause.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback

**Re-probe:** `get_system_status`: `pending_feedback: 67 new items`, `open_warnings: 49 high/critical` — identical to 16:05. No triage this weekend.

**Fix:** Manual triage session needed. Will partially auto-resolve when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Delta vs 16:05:** 2 additional stalls observed at 16:45 and 18:00 UTC (1 more than prior 2h window).

**Re-probe evidence:**
- `get_system_status`: `[intelligence-cycle] previous cycle still running — skipped` at 16:45 UTC and 18:00 UTC
- `get_cron_health`: `intelligenceCycleJob: avg_duration=27,978ms (↑ from 27,873ms), success_rate=99.7%, total_runs=1176`

**Fix:** Add hard 12-minute timeout in `intelligenceCycleJob.ts` to kill runaway cycles before the next 15-min slot.

---

### ISSUE-4 — LOW — CONFIRMED — BDI + 6 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health`: BDI rows=0, DAG rows=1, DLC rows=0, JSH rows=0, SIS rows=0, VDC rows=0, VNH rows=6 — all TA not ready. Linked to BCTC pipeline failure (VPS-side) + BDI bad ticker.

**Fix:** (1) BDI: Replace `^BDI` Yahoo Finance ticker (404) with Baltic Exchange API or Quandl. (2) Other 6 tickers: will recover once BUG-1 BCTC pipeline is restored.

---

### ISSUE-5 — LOW — CONFIRMED — Commodity Price Deltas Null (linked to BUG-3)

**Re-probe:** `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null` — unchanged. Auto-resolves with BUG-3 fix.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 649s Runtime

**Re-probe:** `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), avg_duration=649,220ms, total_runs=7` — identical to 16:05.

**Fix:** Add per-ticker error isolation + 15-min job timeout guard in `vnstockTradingStatsRefresh`.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Returns Empty

**Re-probe:** `get_macro_calendar({days:60})`: `{"events":[],"status":"unavailable"}` — unchanged.

**Callers confirmed (prior cycles):**
- `digest-predict/flow/weekly.md:30`: `get_macro_calendar(days=14)` → `pivot_window_active`
- `alert-commander/flow/stage-bootstrap.md:14`: `get_macro_calendar()` → `pivot_window_active`
**Blast radius: 2 agent flows unable to detect pivot windows**

**Fix:** Trace which source/job populates `macroCalendar` table; if TE-dependent, resolves with BUG-3. Otherwise investigate standalone calendar job.

---

### ISSUE-8 — LOW — MONITORING — windowPartitioner Continuation Truncation

**Status change from 16:05:** Not observed in this cycle's `get_system_status` (last 10 errors from 16:02–18:02 UTC show SBV/cycle stalls only). The 5 occurrences at 14:06:12 UTC (prior cycle) appear to have been an isolated burst, not recurring every cycle.

**Action:** Continue monitoring; classify as IMPROVE rather than active ISSUE until a second occurrence is confirmed.

---

### ISSUE-9 — LOW — NEW — weatherCheckJob Previous Run Blocking

**First observed this cycle.**

**Re-probe evidence:**
- `get_system_status`: `[weatherCheckJob] previous run still in progress — skipping` at 17:00:01 UTC
- `get_cron_health`: `weatherCheckJob: last_run=2026-06-21 17:00:01, last_status=success, avg_duration=1,675ms, success_rate=100.0%`
- Interpretation: The 11:00 UTC run was still in-progress at 17:00 UTC (6 hours later), blocking the next scheduled run. The skipped slot eventually completed per cron_health.
- Pattern: weather check runs every 6h; if a run stalls, the next slot is silently skipped. Climate risk signals unavailable during the stall window.

**Fix:** Add 5-minute timeout guard to `weatherCheckJob` to prevent stale run flags blocking next slot.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Result | Caller Contract | Verdict |
|------|----------------|-----------------|---------|
| Stock prices 57h stale | — | VN market closed since 2026-06-19 (Thu); SLA shows price ok (3/3454min) | NON-ISSUE — expected weekend |
| CafeF/VnEconomy/VnExpress RSS "Suy giảm" 3 errors | 3 consecutive errors each | Transient; sources recovered prior cycle; news SLA ok (38/214min) | NON-ISSUE — transient |
| newsapi: disabled | `disabled | Chưa bao giờ | 0` | Intentional by design | NON-ISSUE — by design |
| ragInsert timeout at 17:08 UTC | `[pollNews] ragInsert failed (non-fatal) — The operation timed out.` | Non-fatal fallback path; news pipeline unaffected | NON-ISSUE — single non-fatal event (monitor) |
| `wti_crude_usd 95.5` vs `oilUsd 80.59` in system_status | Different benchmarks: WTI (tracked) vs Brent (macro) | Expected — system-map uses WTI for tracker, macro uses Brent | NON-ISSUE — different instruments |
| digest-predict/cowork-dispatcher locks with heartbeat=claimed_at | Publish-slot locks don't need ongoing heartbeats | TTL-based, not heartbeat-based | NON-ISSUE — by design |

---

## RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle |
|------|-------------|------------|
| ISSUE-8 windowPartitioner truncation | ISSUE (low) introduced at 14:06 UTC | Not reproduced in 16:02–18:06 UTC window; reclassified to MONITOR/IMPROVE |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 6 (WORSENING: 7042min, 12 QUÁ HẠN, 7 tickers TA dead) |
| BUG HIGH | 2 | BUG-2 Reuters RSS dead (79↑), BUG-3 Trading Economics 2× dead (79↑) |
| BUG MEDIUM | 2 | BUG-4 ISM no data (NAPMBI 400), BUG-5 (NEW) bctc-analyst orphaned lock FPT Q1 |
| ISSUE HIGH | 1 | ISSUE-2 49 open warnings / 67 pending feedback |
| ISSUE MEDIUM | 2 | ISSUE-1 SBV crash loop (WORSENING: 3rd cycle), ISSUE-3 intelligence-cycle stalls |
| ISSUE LOW | 6 | ISSUE-4 BDI+6 TA dead, ISSUE-5 commodity deltas null, ISSUE-6 vnstockTrading 85.7%, ISSUE-7 macro-calendar empty, ISSUE-8 windowPartitioner (MONITOR), ISSUE-9 (NEW) weatherCheckJob blocking |
| NON-ISSUE | 6 | Weekend prices, RSS transient, newsapi disabled, ragInsert non-fatal, WTI/Brent discrepancy, publish-slot locks |
| RESOLVED | 1 | ISSUE-8 windowPartitioner — not reproduced this cycle |
| IMPROVE | 1 | weatherCheckJob timeout guard (ISSUE-9 preventive) |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1, Day 6 CRITICAL, 12 overdue Q1 tickers, losing earnings window daily
2. **`task_force_release_orphan("esc-datacov:FPT:Q1-2026:ESC-3")`** — BUG-5, unblocks FPT Q1 analysis once BCTC pipeline restored
3. **Check/fix FRED_API_KEY + NAPMBI series ID** — BUG-4, free API key, unblocks ISM for 3 agents
4. **Disable/fix Reuters RSS source record** — BUG-2, eliminates ~264/day error log entries from dead source
5. **Add off-hours gate to SBV VPS push handler** — ISSUE-1, stops zero-value rejection crash cycle (service restarts 3+ times/session)
6. **Diagnose why `tradingeconomics.com` shows `Chua goi` (never called) post-restart** — BUG-3, trace TE fetcher error path before rate-limiter registration
7. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, prevents runaway cycle lock-out (2 more stalls this cycle)
8. **Investigate `get_macro_calendar` data source** — ISSUE-7, pivot_window_active unavailable for digest-predict + alert-commander
9. **Add 5-min timeout to `weatherCheckJob`** — ISSUE-9 (NEW), prevents 6h blocking on stale run flag
