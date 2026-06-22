# Team MCP Tool Health Recheck — 2026-06-21T14:10Z

**Cycle:** 2026-06-21T14:10Z (UTC Sunday, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-1206.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server restart context:** `mcpServerStartup` last fired at 10:29:26 UTC — failure counters (Reuters/TE) accumulated 36 failures in ~3.6h since restart at ~10/h rate.

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — market context, 3 alerts, 10 recent analyses | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53, breadth 81/203/66 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — VN-Index, oil, gold, USD/VND live; commodity deltas null (TE dead) | ✅ REACHABLE (data gap) |
| `get_system_status` | `{}` | OK — 10 unresolved errors, 49 open warnings | ✅ REACHABLE |
| `get_cron_health` | `{}` | OK — all jobs ≥85.7%; sbvRates 98.2%; vnstockTrading 85.7% | ✅ REACHABLE |
| `get_sla_status` | `{}` | OK — bctc CRITICAL 6803/3216 min | ✅ REACHABLE |
| `get_vps_proxy_health` | `{}` | OK — bctc STALE since 2026-06-16; news/sbv current | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | OK — vn-bctc-fetch UNHEALTHY; vn-sbv-fetch UNHEALTHY (uptime 1h4m) | ✅ REACHABLE |
| `get_watchlist` | `{}` | OK — 41 tickers, prices stale (expected market-closed) | ✅ HEALTHY |
| `get_agent_signals` | `{agent:"market-watcher",limit:5}` | OK — "Không có tín hiệu mới" | ✅ HEALTHY |
| `get_earnings_calendar` | `{}` | OK — 41 tickers, 10 QUÁ HẠN (overdue Q1-2026) | ✅ HEALTHY |
| `get_pipeline_health` | `{}` | OK — BDI/DAG/DLC/JSH/SIS/VDC/VNH TA not ready (0 rows) | ✅ REACHABLE |
| `get_ism_subcomponents` | `{}` | ERROR — no_data (FRED_API_KEY absent/ISM series failing) | ❌ BUG |
| `get_macro_calendar` | `{}` | `{"events":[],"status":"unavailable"}` — no calendar data | ❌ ISSUE |
| `get_rate_limit_status` | `{}` | OK — 14 hosts, 0 waiting, tradingeconomics.com "never called" (CB open) | ✅ REACHABLE |
| `get_week_period` | `{}` | OK — 2026-W25, periodKey 2026-06-15/2026-06-21 | ✅ HEALTHY |
| `get_vn_macro_indicators` | `{}` | OK — IIP manufacturing YoY 103.3%, sourced NSO | ✅ HEALTHY |
| `get_earnings_calendar` | `{}` | OK — 41 tickers, filing status current | ✅ HEALTHY |
| `get_recent_fixes` | `{limit:20}` | OK — newest fix 2026-05-12 (no new fixes since last cycle) | ✅ REACHABLE |

**Caller-surface NON-ISSUEs re-verified this cycle:**
- `get_cycle_bootstrap` no-arg → Zod error (expected). Grep: all callers pass `agent_name`. **0 affected callers.**
- `get_agent_signals` no args → error "agent required in inbox mode" (expected). All callers pass `agent` or `from_agent`. Grep: `docs/agents/{news-scout,alert-commander,market-watcher,tran-ngoc-bau}/flow/*.md`. **0 affected callers.**
- Stock price staleness 53h → expected: VN market closed Sat-Sun; last session 2026-06-19 (Thu). Correct behavior. **NON-ISSUE.**

---

## ACTIVE BUGS (4 re-confirmed, all unchanged from 12:06 report)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 5+

**Status vs prior (12:06):** WORSENING (+121 min SLA breach growth)

| Signal | 12:06 | 14:10 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch status | unhealthy, 4d 17h 57m | unhealthy, 4d 20h 2m | +2h5m |
| SLA breach (actual/target min) | 6682/3094 | 6803/3216 | +121/+122 |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change |
| bctcPdfPullJob | 100% success, 1ms avg | 100% success, 1ms avg | Unchanged (pulls nothing) |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms response, uptime=4d 20h 2m`
- `get_sla_status`: `bctc: 6803/3216 min — CRITICAL (2.12× over SLA)`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_bctc_pending_refine`: Response exceeded token limit (235,355 chars / 11,948 lines) — massive backlog

**Callers (grep confirmed, prior cycles):**
1. `bctc-analyst` — `get_bctc_full`, `get_bctc_ocf`, `list_stored_pdfs`, `list_flagged_bctc_cells`
2. `market-analyst` — `get_financial_summary` depends on BCTC extract pipeline
3. `bctcPdfPullJob`, `bctcQueueEnricherJob`, `bctcReparseJob` — cron pipeline stalled
**Blast radius: 2 agent flows + 3 cron jobs; all BCTC analysis stalled Day 5+**

**Earnings context:** `get_earnings_calendar` shows 10 tickers still QUÁ HẠN (overdue Q1-2026): BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH. Active Q1 filing window. Every day of VPS downtime loses Q1 ingestion.

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → call `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead

**Status vs prior (12:06):** CONFIRMED STILL BROKEN

**Re-probe evidence (this cycle):**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 36 ⚠` (counter since 10:29 restart, ~10/h)
- Rate: 10 failures/hour consistent across all prior cycles today

**Callers (grep confirmed):**
- `news-scout`, `unified-agent` — Reuters as news source
**Blast radius: news coverage degraded (missing Reuters source)**

**Context:** Per fix #7 (2026-04-30), `vn-reuters-fetch.service` was decommissioned. Direct MCP Reuters fetch also failing. Source record still active and logging failures.

**Fix:** Disable Reuters RSS source record in MCP config, or find a working Reuters feed URL. No restart needed.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead

**Status vs prior (12:06):** CONFIRMED STILL BROKEN

**Re-probe evidence (this cycle):**
- `get_system_status`: Both TE entries `Trading Economics | Ngưng | Chưa bao giờ | 36 ⚠`
- `get_rate_limit_status`: `tradingeconomics.com: Chua goi (never called)` — circuit breaker OPEN, blocking all calls
- `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"oilUsdDirection":"unknown"` — commodity deltas unresolvable

**Callers (grep confirmed):**
- `market-watcher`, `unified-agent`, `news-scout` — commodity deltas via `get_macro_snapshot`
**Blast radius: 3 agent flows; commodity/macro delta null**

**Fix:** Check Chromium in mcp-server container (`docker exec <ctr> chromium --version`). If present, check TE site structure change. May also need CB reset for `tradingEconomics`.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data

**Status vs prior (12:06):** CONFIRMED UNCHANGED

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_cron_health`: `macroIndicatorRefreshJob: last_run=2026-06-21 12:13, success` but produces no ISM rows
- System log: `[fredIsmSubcomponents] all 3 retries exhausted for NAPMBI — HTTP 400 Bad Request` (multiple occurrences)
- NAPMBI series ID may be discontinued/renamed on FRED; HTTP 400 = invalid series

**Callers (grep confirmed):**
- `bctc-analyst`, `news-scout`, `unified-agent` — US monetary chain analysis
**Blast radius: 3 agent packages — ISM/FRED macro signal unavailable**

**Fix:** (1) Set `FRED_API_KEY` in `.env` (free: fred.stlouisfed.org). (2) Verify NAPMBI is a valid FRED series ID — if not, update to correct series (e.g., ISM_PMNP or NAPM). HTTP 400 suggests bad series name.

---

## ACTIVE ISSUES (6 re-confirmed)

### ISSUE-1 — MEDIUM — UNCHANGED — SBV Zero-Value Rejection Loop

**Re-probe evidence (this cycle):**
- `get_system_status` recent errors: 4× `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 14:02, 13:32, 13:02, 12:32 UTC (every 30 min)
- `get_vps_service_health`: `vn-sbv-fetch: unhealthy, uptime=1h 4m` — VPS SBV service just restarted ~13:00 UTC but still returning zeroes
- `sbvRatesRefreshJob`: 98.2% success rate (57 runs)
- `get_macro_snapshot`: USD_VND=26120, SBV data current — guard working, data integrity preserved

**Root cause (confirmed prior cycles):** VCB XML API returns zeros outside VN business hours. Guard at `storeSbvSnapshot` correctly rejects. Data quality unaffected. Issue: ~48 rejection log entries/day + clouding the error log.

**Fix:** Add off-hours gate (skip pushes outside 00:00–10:00 UTC) in SBV VPS push handler, OR add pre-flight zero-value check in `sbvRatesRefreshJob.ts`.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback

**Re-probe evidence (this cycle):**
- `get_system_status`: `open_warnings: 49 high/critical`, `pending_feedback: 67 new items`
- Counts identical to 12:06 report — no triage occurred over weekend

**Fix:** Manual triage of `get_alerts` + feedback queue. Will partially auto-resolve when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Re-probe evidence (this cycle):**
- `get_system_status`: `[intelligence-cycle] previous cycle still running — skipped` at 14:00 UTC
- `intelligenceCycleJob`: avg_duration=27,955ms; occasional spike > 15 min causes concurrency skip

**Fix:** Add hard 12-minute timeout in `intelligenceCycleJob.ts` to kill runaway cycles and release in-flight flag.

---

### ISSUE-4 — LOW — NOT DIRECTLY RE-PROBED — BDI Shipping Data Stale

- `commodityTrackerRefreshJob`: last_run=2026-06-21 06:00, success — but BDI likely still stale (~75 days per prior reports)
- `get_supply_chain_exposure` NOT called this cycle (read-only guardrail: per Step 3c, not re-probing without evidence of fix)
- **Carry forward: no new evidence of resolution**

**Fix:** Replace `^BDI` Yahoo Finance ticker (returning 404) with Baltic Exchange official API or Quandl.

---

### ISSUE-5 — LOW — CONFIRMED — Commodity Price Deltas Null (linked to BUG-3)

- `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null,"oilUsdDirection":"unknown"`
- Will auto-resolve when BUG-3 (Trading Economics) is fixed.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 10min Runtime

**Re-probe evidence (this cycle):**
- `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), avg_duration=649,220ms (10.8 min), total_runs=7`
- Above 80% alert threshold; risk: long-running job contributes to resource contention

**Fix:** Add per-ticker error isolation + 15-min job timeout guard.

---

## ISSUE-7 (NEW THIS CYCLE) — LOW — get_macro_calendar Returns Empty

**Re-probe evidence (this cycle):**
- `get_macro_calendar({days:60})`: `{"daysRequested":60,"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}`
- No calendar events available for next 60 days

**Callers (grep confirmed):**
- `digest-predict/flow/weekly.md:30`: `get_macro_calendar(days=14)` → `upcoming_events`, `pivot_window_active`
- `alert-commander/flow/stage-bootstrap.md:14`: `get_macro_calendar()` → extract `pivot_window_active`
**Blast radius: 2 agent flows — macro pivot window detection unavailable**

**Root cause hypothesis:** Likely a downstream data source (TradingEconomics or a calendar API) not feeding calendar data — possibly linked to BUG-3 (TE dead). Could also be a separate economic calendar feed.

**Fix:** Investigate which data source populates `get_macro_calendar`. If TE-dependent, will resolve with BUG-3. Otherwise trace `macroCalendar` DB table populate job.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Error | Caller Contract | Verdict |
|------|---------------|-----------------|---------|
| `get_agent_signals({limit:5})` no agent/from_agent | "agent required in inbox mode" | All callers pass `agent` or `from_agent` (grep: news-scout/flow/stage-bootstrap.md:43,56; market-watcher/flow/main.md:53; alert-commander/flow/stage-signals.md:31,60; tran-ngoc-bau/flow/audit-signals.md:6) | NON-ISSUE — 0 affected callers |
| `get_cycle_bootstrap({})` no agent_name | Zod enum error | All callers pass `agent_name` (docs/agents/tools/list/get_cycle_bootstrap.md) | NON-ISSUE — 0 affected callers |
| Stock prices 53h stale | — | VN market closed Sat-Sun; last session Thu 2026-06-19; SLA price metric shows 65min (VnDirect live) | NON-ISSUE — expected |

---

## RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle |
|------|-------------|------------|
| (none) | — | No items resolved since 12:06 report |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead day 5+ (worsening) |
| BUG HIGH | 2 | BUG-2 Reuters RSS dead, BUG-3 Trading Economics 2× dead |
| BUG MEDIUM | 1 | BUG-4 ISM no data (NAPMBI HTTP 400 + FRED_API_KEY) |
| ISSUE HIGH | 1 | ISSUE-2 49 open warnings / 67 pending feedback |
| ISSUE MEDIUM | 2 | ISSUE-1 SBV rejection noise, ISSUE-3 intelligence-cycle stalls |
| ISSUE LOW | 4 | ISSUE-4 BDI stale, ISSUE-5 commodity deltas null, ISSUE-6 vnstockTrading 85.7%, ISSUE-7 (NEW) macro-calendar empty |
| NON-ISSUE | 3 | Param probe errors (expected), weekend price staleness |
| RESOLVED | 0 | None this cycle |
| IMPROVE | 2 | Doc drift (get_price_history), get_bctc_pending_refine unbounded response |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1, Day 5+ CRITICAL, 10 overdue Q1 tickers losing ground daily
2. **Check/fix FRED_API_KEY + NAPMBI series ID** — BUG-4, free API key, unblocks ISM for 3 agents
3. **Disable/fix Reuters RSS source record** — BUG-2, eliminates log noise from decommissioned source
4. **Check Chromium in mcp-server container + TradingEconomics CB** — BUG-3, commodity deltas null for all agents
5. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, prevents runaway cycle lock-out
6. **Investigate `get_macro_calendar` data source** — ISSUE-7 (NEW), pivot_window_active unavailable for digest-predict + alert-commander
