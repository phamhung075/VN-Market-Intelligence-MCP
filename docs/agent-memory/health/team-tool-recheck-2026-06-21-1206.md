# Team MCP Tool Health Recheck — 2026-06-21T12:06Z

**Cycle:** 2026-06-21T12:06Z (UTC Saturday, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-1006.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server restart note:** `mcpServerStartup` last fired at 10:29:26 UTC — all failure counters reset at that point. Reuters/TE show 17 failures (not 73 from prior report) because the counter restarted ~1.5h ago at ~10/h rate. Underlying issues confirmed broken via fresh re-probes.

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_system_status` | `{}` | OK — circuit breakers clear, SBV rejections in log | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — market context, signals returned | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53, breadth returned | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oilUsdDelta/goldUsdDelta null (TE dead) | ✅ REACHABLE (data gap) |
| `get_cron_health` | `{}` | OK — all jobs ≥98%, sbvRates 98.2%, vnstockTrading 85.7% | ✅ REACHABLE |
| `get_sla_status` | `{}` | OK — bctc CRITICAL 6682/3094 min | ✅ REACHABLE |
| `get_vps_proxy_health` | `{}` | OK — bctc STALE since 2026-06-16; news/sbv healthy | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | OK — vn-bctc-fetch UNHEALTHY 4d 17h 57m | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | OK — 42/42 tickers TA ready, BDI/DAG/DLC/JSH/SIS/VDC/VNH not ready | ✅ REACHABLE |
| `get_earnings_calendar` | `{}` | OK — 41 tickers, 11 QUÁ HẠN (overdue) | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | ERROR — no_data, FRED_API_KEY absent | ❌ BUG |
| `get_technical_indicators` | `{code:"FPT"}` | OK — RSI 41.3, MACD, BB returned | ✅ HEALTHY |
| `get_financial_summary` | `{actionCode:"FPT"}` | OK — Q1-2026 financials returned | ✅ HEALTHY |
| `get_agent_signals` | `{agent:"news-scout",limit:3}` | OK — "Không có tín hiệu mới" (empty, expected) | ✅ HEALTHY |
| `task_list_held` | `{}` | OK — 5 locks: 1 cowork-leader (active hb), 4 stale (no hb) | ✅ REACHABLE |
| `get_recent_fixes` | `{limit:20}` | OK — 20 fixes returned, newest 2026-05-12 | ✅ HEALTHY |

**Caller-surface NON-ISSUEs verified this cycle:**
- `get_cycle_bootstrap` no-arg probe → fails (expected: requires `agent_name`). Grep: all callers pass `agent_name` correctly. **0 affected callers.**
- `get_technical_indicators` with `ticker` param → fails. Grep: all callers use `code` per docs. **0 affected callers.**
- `get_financial_summary` with `ticker` param → fails. Grep: all callers use `actionCode` per docs + tool contract. **0 affected callers.**
- `get_agent_signals` no-arg → fails (expected: `agent` required in inbox mode). Callers pass `agent` correctly per package docs. **0 affected callers.**

---

## ACTIVE BUGS (4 re-confirmed)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 5+

**Status vs prior (10:06):** UNCHANGED / WORSENING (+120 min SLA breach growth)

| Signal | 10:06 | 12:06 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch uptime (unhealthy) | 4d 16h 2m | 4d 17h 57m | +1h55m |
| SLA breach (actual/target min) | 6562/2975 | 6682/3094 | +120/+119 |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms response, uptime=4d 17h 57m`
- `get_sla_status`: `bctc: 6682/3094 min — CRITICAL (2.16× over SLA)`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h pushes=0, STALE=YES`
- `get_cron_health`: `bctcPdfPullJob: success=100%, avg=1ms` — job runs but pulls nothing (VPS dry)

**Callers (grep confirmed, prior cycle):**
1. `bctc-analyst` — primary consumer: `get_bctc_full`, `get_bctc_ocf`, `list_stored_pdfs`, `list_flagged_bctc_cells`
2. `market-analyst` — `get_financial_summary` depends on BCTC extract pipeline populating `financial_reports`
3. `bctcPdfPullJob`, `bctcQueueEnricherJob`, `bctcReparseJob` — cron pipeline stalled
**Blast radius: 2 agent flows + 3 cron jobs; all BCTC analysis stalled**

**Earnings context (worsening):** `get_earnings_calendar` shows 11 tickers QUÁ HẠN (overdue Q1-2026): BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH. Q1 is active filing window. Every day of VPS downtime loses Q1 report ingestion.

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify status → call `trigger_bctc_vps_fetch` to backfill. Then monitor `get_vps_service_health` until healthy.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead

**Status vs prior (10:06):** CONFIRMED STILL BROKEN (counter reset to 17 by server restart at 10:29 UTC; was 73 at 10:06 — same underlying break)

**Re-probe evidence (this cycle):**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 17 ⚠`
- Failure rate ~10-11/h consistent with prior cycles; counter reset by server restart does not represent a fix

**Callers (grep confirmed, prior cycle):**
- News pipeline consumers: `news-scout`, `unified-agent` — `fetch_and_analyze` / news aggregation
**Blast radius: 2 agent pipelines; news coverage degraded (missing Reuters source)**

**Context:** Per `get_recent_fixes` fix #7 (2026-04-30), `vn-reuters-fetch.service` VPS service was decommissioned ("dead feeds.reuters.com URLs, redundant with direct MCP fetch"). The direct MCP fetch is also failing. The source record was not cleaned up and continues to log failures.

**Fix:** Disable Reuters RSS source record in MCP server source config to stop failure log noise, or identify a working Reuters feed URL. No service restart needed.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead

**Status vs prior (10:06):** CONFIRMED STILL BROKEN (counter reset to 17 each by server restart)

**Re-probe evidence (this cycle):**
- `get_system_status`: Both TE instances `Trading Economics | Ngưng | Chưa bao giờ | 17 ⚠`
- `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null,"oilUsdDirection":"unknown"` — commodity deltas unresolvable

**Callers (grep confirmed, prior cycle):**
- `market-watcher`, `unified-agent`, `news-scout` — all use `get_macro_snapshot` for commodity signals
**Blast radius: 3 agent flows; commodity/macro delta data null**

**Fix:** Verify Chromium still present in mcp-server container (`docker exec <ctr> chromium --version`). If missing, reinstall per Dockerfile fix #6. If present, check for TradingEconomics site structure change blocking the scraper.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data

**Status vs prior (10:06):** CONFIRMED UNCHANGED

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_cron_health`: `macroIndicatorRefreshJob: last_run=2026-06-20 12:13, success=100%` — job runs successfully but produces no ISM rows (FRED_API_KEY absent or ISM fetch disabled)

**Callers (grep confirmed, prior cycle):**
- `bctc-analyst`, `news-scout`, `unified-agent` — all have `get_ism_subcomponents` in packages
**Blast radius: 3 agent packages — US monetary chain analysis unavailable**

**Fix:** Set `FRED_API_KEY` in production `.env` (free key: fred.stlouisfed.org). Then trigger `macroIndicatorRefreshJob` to backfill ISM series.

---

## ACTIVE ISSUES (5 re-confirmed + 1 new)

### ISSUE-1 — MEDIUM — UNCHANGED — SBV Zero-Value Rejection Loop

**Re-probe evidence (this cycle):**
- `get_system_status` recent errors: 6× `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` in the ~2h window (10:02, 09:32, 09:02, 08:32, 08:02, 07:32 UTC — every 30 min, matching VPS SBV push cadence)
- `sbvRatesRefreshJob`: success_rate=98.2% (57 total runs) — failures accumulating
- `get_vps_proxy_health`: `sbv: last_push=2026-06-21 12:02:30, 24h_pushes=25, ok` — VPS push healthy
- `get_macro_snapshot`: USD_VND=26120, SBV data current (guard working correctly — data integrity preserved)

**Root cause confirmed:** VCB XML API returns zeros outside business hours. Guard at `storeSbvSnapshot` correctly rejects zero-values. Data quality unaffected. Issue is log/metric noise: ~48 rejection log entries/day.

**Fix:** Add off-hours gate in SBV VPS push handler to skip pushes outside VN business hours (07:00–17:00 ICT / 00:00–10:00 UTC). Alternatively, add pre-flight zero-value check in `sbvRatesRefreshJob.ts` before calling push endpoint.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback

**Re-probe evidence (this cycle):**
- `get_system_status`: `open_warnings: 49 high/critical`, `pending_feedback: 67 new items`
- Count unchanged from 10:06 report — no new warnings added, none resolved

**Fix:** Run `get_alerts` to triage stale alerts; review pending_feedback queue. May partially auto-resolve when BUG-1 (BCTC) and BUG-3 (TE) are fixed.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Re-probe evidence (this cycle):**
- `get_system_status` recent errors: 2× `[intelligence-cycle] previous cycle still running — skipped` at 11:45 and 09:45 UTC
- `intelligenceCycleJob`: avg_duration=28,393ms — healthy on average but occasional spikes cause concurrency skip
- `weatherCheckJob`: 1× `previous run still in progress — skipping` at 11:00 UTC

**Fix:** Add hard 12-minute timeout in `intelligenceCycleJob.ts` to kill runaway cycles and release the in-flight flag. Log + alert on timeout trigger.

---

### ISSUE-4 — LOW — NOT RE-PROBED — BDI Shipping Data Stale

**Status vs prior (10:06):** NOT DIRECTLY RE-PROBED THIS CYCLE
- `commodityTrackerRefreshJob: last_run=2026-06-21 06:00:01, success` — ran but BDI may still be stale
- `get_supply_chain_exposure` was NOT called this cycle (Step 3c flag — will not claim RESOLVED without direct probe)
- **Carry forward with caveat.** Prior evidence: BDI data as of 2026-04-07 (~75 days), Yahoo Finance `^BDI` returning 404.

**Fix:** Investigate alternate BDI source (Baltic Exchange official API, Quandl, OECD). `^BDI` Yahoo Finance ticker broken.

---

### ISSUE-5 — LOW — CONFIRMED — Commodity Price Deltas Null

**Re-probe evidence (this cycle):**
- `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null,"oilUsdDirection":"unknown"`
- Will auto-resolve when BUG-3 (Trading Economics) is fixed. No independent fix needed.

---

### ISSUE-6 (NEW) — LOW — vnstockTradingStatsRefresh Slow + 85.7% Success

**Re-probe evidence (this cycle):**
- `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), avg_duration=649,220ms (10.8 min), total_runs=7`
- Above the 80% alert threshold so no auto-alert fires; 1 failure in 7-day window
- 10.8-minute avg duration creates resource contention risk

**Caller impact:** No direct agent callers; feeds fundamental data for stock profiling.

**Fix:** Investigate why 1/7 runs fail. Add per-ticker error isolation so a single vnstock API error doesn't fail the entire job. Consider adding a 15-minute job timeout guard.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Error | Actual Caller Contract | Verdict |
|------|---------------|----------------------|---------|
| `get_cycle_bootstrap` no-arg | Zod invalid_enum_value: `agent_name` required | All callers pass `agent_name` (grep: 8 call sites) | NON-ISSUE — 0 affected callers |
| `get_technical_indicators` with `ticker` | `code` is required, not `ticker` | All docs/callers use `code` (confirmed `docs/agents/tools/list/get_technical_indicators.md`) | NON-ISSUE — 0 affected callers |
| `get_financial_summary` with `ticker` | `actionCode` is required, not `ticker` | All callers use `actionCode` (`market-analyst/flow/main.md:90`, `tools/package/market-analyst.md:154`) | NON-ISSUE — 0 affected callers |
| `get_agent_signals` no-arg | `agent` required in inbox mode | Callers always pass `agent` or use `from_agent` (sender-history mode) | NON-ISSUE — 0 affected callers |
| Stock prices 51h stale | — | Weekend: VN market closed Sat-Sun; last session 2026-06-19 (Thu). System correctly marks `[STALE]` with market-closed notice | NON-ISSUE — expected behavior |

---

## IMPROVE (Unchanged from prior cycle)

| ID | Item | Caller Impact | Priority |
|----|------|--------------|----------|
| IMPROVE-1 | `get_price_history` docs say `ticker` but live tool uses `code` — doc/schema mismatch in one tool doc | 0 runtime callers affected (callers use `code`) | Low |
| IMPROVE-2 | `get_bctc_pending_refine` has no default limit cap — can return unbounded rows | 0 callers affected (`refine_bctc_md` uses explicit `limit:1`) | Low |

---

## RESOLVED THIS CYCLE

| Item | Prior Status | Resolution |
|------|-------------|------------|
| ISSUE-3 bctcReparseJob sub-100% | ISSUE (prior cycles) | Now at 100% success, 61 runs — GREEN, removed from ISSUE list |

**Note on prior cycle "RESOLVED: orphan lock esc-datacov:FPT:Q1-2026:ESC-3":** Prior 10:06 report called `task_list_held({expired:true})` which only surfaces expired locks. This cycle called `task_list_held({})` — lock IS still held (bctc-analyst, claimed 2026-06-14, expires 2026-06-24, no heartbeat). It will expire naturally in 3 days. Not urgent.

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead day 5+ (worsening) |
| BUG HIGH | 2 | BUG-2 Reuters RSS dead, BUG-3 Trading Economics 2× dead |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED data |
| ISSUE HIGH | 1 | ISSUE-2 49 open warnings / 67 pending feedback |
| ISSUE MEDIUM | 1 | ISSUE-1 SBV rejection noise |
| ISSUE MEDIUM | 1 | ISSUE-3 intelligence-cycle stalls |
| ISSUE LOW | 3 | ISSUE-4 BDI (not re-probed), ISSUE-5 commodity deltas null (linked BUG-3), ISSUE-6 vnstockTrading 85.7% |
| NON-ISSUE | 5 | Param probe failures (expected), weekend price staleness |
| RESOLVED | 1 | bctcReparseJob back to 100% |
| IMPROVE | 2 | Doc drift, no-cap tool |

**Recommended immediate actions (priority order):**
1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1, day 5+ CRITICAL, 11 overdue tickers in active Q1 filing window
2. **Set `FRED_API_KEY` in `.env`** — BUG-4, free key, unblocks ISM for 3 agents
3. **Disable/fix Reuters RSS source record** — BUG-2, eliminates log noise from dead decommissioned source
4. **Check Chromium in mcp-server container** — BUG-3, macro/commodity deltas null for all agents
5. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, prevents runaway cycle lock-out
