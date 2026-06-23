# Team MCP Tool Health Recheck — 2026-06-21T16:05Z

**Cycle:** 2026-06-21T16:05Z (UTC Sunday, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-1410.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server restart context:** `mcpServerStartup` last at 10:29:26 UTC; failure counters (Reuters/TE) now at 57 since restart (~10/h rate unchanged).

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — market context, 1 alert, 10 recent analyses | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53, breadth 81/203/66, source VnDirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $80.59, gold $4172.9, USD/VND 26120; deltas null (TE dead) | ✅ REACHABLE (data gap) |
| `get_system_status` | `{}` | OK — 10 unresolved errors, 49 open warnings, 57 ⚠ on Reuters + TE | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: unhealthy 4d 21h 57m; vn-sbv-fetch: healthy (recovered) | ✅ REACHABLE |
| `get_sla_status` | `{}` | bctc: 6921/3333 min — CRITICAL; all others ok | ✅ REACHABLE |
| `get_vps_proxy_health` | `{}` | bctc: last_push=2026-06-16T18:02:24Z, STALE=YES; news/sbv: ok | ✅ REACHABLE |
| `get_ism_subcomponents` | `{}` | ERROR — no_data (FRED_API_KEY absent/NAPMBI HTTP 400) | ❌ BUG |
| `get_cron_health` | `{}` | OK — intelligenceCycleJob 99.7% (stall at 14:15 UTC); sbvRates 98.2% | ✅ REACHABLE |
| `get_macro_calendar` | `{days:60}` | `{"events":[],"status":"unavailable"}` — no calendar data | ❌ ISSUE |
| `get_rate_limit_status` | `{}` | `tradingeconomics.com: Chua goi` — CB blocking; all 14 hosts ready/never-called | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | OK — BDI/DAG/DLC/JSH/SIS/VDC/VNH TA not ready (0 rows) | ✅ REACHABLE |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN Q1-2026 (BDI newly overdue) | ✅ HEALTHY |
| `get_recent_fixes` | `{limit:20}` | Newest fix: 2026-05-12 — no new fixes landed since prior cycle | ✅ REACHABLE |

**vn-sbv-fetch status change:** At 14:10 = `unhealthy (uptime 1h4m)`. At 16:05 = `healthy`. Service recovered. Zero-value rejection loop continues (VCB API behaviour outside market hours) — data integrity unaffected.

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All prior bugs/issues re-probed from scratch (no byte-copy). Verification commands and outputs quoted inline below.

---

## ACTIVE BUGS — 4 Re-Confirmed

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 5+

**Delta vs 14:10 report:**

| Signal | 14:10 | 16:05 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch status | unhealthy, 4d 20h 2m | unhealthy, 4d 21h 57m | +1h55m |
| SLA breach (actual/target min) | 6803/3216 | 6921/3333 | +118/+117 |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change |
| Q1 tickers QUÁ HẠN | ~11 | 12 (BDI newly added) | +1 |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms, uptime=4d 21h 57m`
- `get_sla_status`: `bctc: 6921/3333min — CRITICAL (2.08× over SLA)`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_earnings_calendar`: BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH = 12 QUÁ HẠN

**Callers (grep confirmed prior cycles):**
1. `bctc-analyst` — `get_bctc_full`, `get_bctc_ocf`, `list_stored_pdfs`, `list_flagged_bctc_cells`
2. `market-analyst` — `get_financial_summary` depends on BCTC extract pipeline
3. `bctcPdfPullJob`, `bctcQueueEnricherJob`, `bctcReparseJob` — cron pipeline stalled
**Blast radius: 2 agent flows + 3 cron jobs; all BCTC analysis stalled Day 5+. 12 Q1 tickers losing ingestion window.**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → call `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead

**Delta vs 14:10:** Counter: 36 → 57 (57 since restart at 10:29 UTC = ~10/h rate, consistent)

**Re-probe evidence (this cycle):**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 57 ⚠`
- CB for reuters: `[OK] failures: 0` (in-memory CB reset on restart; source health tracks DB-persistent counter)

**Callers (grep confirmed):** `news-scout`, `unified-agent`
**Blast radius: news coverage degraded (missing Reuters source)**

**Context:** Per fix #7 (2026-04-30), `vn-reuters-fetch.service` was decommissioned. Direct MCP Reuters fetch also failing. Source record still active and logging failures.

**Fix:** Disable Reuters RSS source record in MCP config, or replace with a working Reuters feed URL.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead

**Delta vs 14:10:** Counter: 36 → 57 each (same rate as Reuters; in-memory CB reset at restart but rate-limit table confirms `Chua goi`)

**Re-probe evidence (this cycle):**
- `get_system_status`: `Trading Economics | Ngưng | Chưa bao giờ | 57 ⚠` (both TE entries)
- `get_rate_limit_status`: `tradingeconomics.com | Chua goi | 0s | Chua goi` — rate limiter confirms TE never called since restart
- `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null,"oilUsdDirection":"unknown"`

**Note on CB discrepancy:** In-memory circuit breaker shows `tradingEconomics [OK] failures: 0` (reset at restart 10:29 UTC). DB source_health shows 57 persistent failures. `Chua goi` in rate-limit confirms TE is not being called — suggests the TE fetch path is not being reached (possible error before the rate-limit registration, or the fetcher fails before queuing).

**Callers (grep confirmed):** `market-watcher`, `unified-agent`, `news-scout` via `get_macro_snapshot`
**Blast radius: 3 agent flows; commodity/macro delta null for all agents**

**Fix:** Check Chromium in mcp-server container (`docker exec <ctr> chromium --version`). Verify TE site structure. Alternatively, trace why `tradingeconomics.com` shows `Chua goi` (never called) even with CB closed — the fetcher may be erroring before reaching the rate limiter.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data

**Delta vs 14:10:** Unchanged (same error, same job run at 12:13 without fix)

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_cron_health`: `macroIndicatorRefreshJob: last_run=2026-06-21 12:13, success` — runs but produces no ISM rows
- System log pattern: `[fredIsmSubcomponents] all 3 retries exhausted for NAPMBI — HTTP 400 Bad Request`

**Callers (grep confirmed):** `bctc-analyst`, `news-scout`, `unified-agent`
**Blast radius: 3 agent flows — ISM/FRED macro signal unavailable**

**Fix:** (1) Set `FRED_API_KEY` in `.env` (free: fred.stlouisfed.org). (2) Verify NAPMBI is a valid FRED series ID — HTTP 400 = invalid series. Replace with correct ID (e.g., NAPMPMI or check FRED for current ISM Manufacturing PMI series name).

---

## ACTIVE ISSUES — 8 Confirmed (ISSUE-8 New This Cycle)

### ISSUE-1 — MEDIUM — UNCHANGED — SBV Zero-Value Rejection Loop

**Delta vs 14:10:** 4 more rejections (at 14:32, 15:02, 15:32, 16:02 UTC). vn-sbv-fetch went from `unhealthy` → `healthy` (service recovered), but rejection loop continues (VCB XML API returns zeros outside VN business hours, guard correctly rejects).

**Re-probe evidence:**
- `get_system_status`: 4× `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 14:32-16:02 UTC
- `get_vps_service_health`: `vn-sbv-fetch: healthy` (recovered from prior unhealthy state)
- `get_macro_snapshot`: USD/VND=26120 — data quality unaffected

**Fix:** Add off-hours gate (skip pushes outside VN business hours ~00:00–10:00 UTC) in SBV VPS push handler, OR add pre-flight zero-value check in `sbvRatesRefreshJob.ts`.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback

**Re-probe:** `get_system_status`: `open_warnings: 49 high/critical`, `pending_feedback: 67 new items` — identical to 14:10. No triage overnight/weekend.

**Fix:** Manual triage. Will partially auto-resolve when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Delta vs 14:10:** 1 additional stall observed at 14:15 UTC (1 cycle skipped since prior report).

**Re-probe evidence:**
- `get_system_status`: `[intelligence-cycle] previous cycle still running — skipped` at 14:15 UTC
- `get_cron_health`: `intelligenceCycleJob: avg_duration=27,873ms, success_rate=99.7% (1176 total runs)`

**Fix:** Add hard 12-minute timeout in `intelligenceCycleJob.ts` to kill runaway cycles.

---

### ISSUE-4 — LOW — CONFIRMED — BDI Shipping Data Stale

**Re-probe:** `get_pipeline_health`: `BDI: rows=0 | TA not ready` — unchanged.

**Fix:** Replace `^BDI` Yahoo Finance ticker (404) with Baltic Exchange official API or Quandl.

---

### ISSUE-5 — LOW — CONFIRMED — Commodity Price Deltas Null (linked to BUG-3)

**Re-probe:** `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null` — unchanged. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 10min Runtime

**Re-probe:** `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), avg_duration=649,220ms, total_runs=7` — identical to 14:10.

**Fix:** Add per-ticker error isolation + 15-min job timeout guard.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Returns Empty

**Re-probe:** `get_macro_calendar({days:60})`: `{"events":[],"status":"unavailable"}` — unchanged. Likely linked to BUG-3 (TE dead) or a separate calendar feed missing.

**Callers (grep confirmed prior cycles):**
- `digest-predict/flow/weekly.md:30`: `get_macro_calendar(days=14)` → `pivot_window_active`
- `alert-commander/flow/stage-bootstrap.md:14`: `get_macro_calendar()` → `pivot_window_active`
**Blast radius: 2 agent flows**

**Fix:** Trace which source populates `macroCalendar` DB table; if TE-dependent, resolves with BUG-3. Otherwise investigate standalone calendar job.

---

### ISSUE-8 — LOW — NEW — windowPartitioner Continuation Truncation

**First observed this cycle** (not in prior 14:10 report).

**Re-probe evidence:**
- `get_system_status`: 5× `[windowPartitioner] continuation window truncated at maxWindowPages` at 14:06:12 UTC VN (= 07:06:12 UTC)
- All 5 occurrences within the same second (single intelligence cycle run)
- `intelligenceCycleJob` marked `success` for that run — truncation is soft (cycle completes but articles/signals are paginated out)

**Caller-surface assessment:**
- `windowPartitioner` is internal to `intelligenceCycleJob.ts`. Downstream consumers: all agents reading `get_agent_signals`, `get_market_snapshot`, `get_recent_signals`. Items past the page limit are silently skipped.
- Blast radius: low in normal operation; risk increases as data volume grows — may cause signal drop during high-news periods.

**Fix (IMPROVE):** Increase `maxWindowPages` config in `intelligenceCycleJob.ts`, or add pagination iteration to process all windows rather than truncating. Log the count of skipped items for monitoring.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Result | Caller Contract | Verdict |
|------|----------------|-----------------|---------|
| `get_cycle_bootstrap({})` no `agent_name` | Zod enum error (expected) | All callers pass `agent_name` | NON-ISSUE — 0 affected callers |
| `get_agent_signals({limit:5})` no agent/from_agent | "agent required in inbox mode" (expected) | All callers pass `agent` or `from_agent` | NON-ISSUE — 0 affected callers |
| Stock prices 55h stale | — | VN market closed Sat-Sun; last session 2026-06-19 Thu; SLA shows price ok (32min/3333min) | NON-ISSUE — expected weekend |
| CafeF/VnEconomy/VnExpress RSS "Suy giảm" | 1 error each | Transient per-cycle blip, 2 min prior successful push | NON-ISSUE — transient |
| newsapi: disabled | `disabled | Chưa bao giờ | 0` | Intentional per system-map, no cron expects it | NON-ISSUE — by design |
| vn-sbv-fetch: `unhealthy → healthy` | Recovered since 14:10 | Service working; data quality unaffected | PARTIAL RESOLVE noted in ISSUE-1 |

---

## RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle |
|------|-------------|------------|
| `vn-sbv-fetch` unhealthy (uptime 1h4m at 14:10) | ISSUE sub-signal | Now `healthy` — service recovered. Zero-value rejection loop continues as separate ISSUE-1. |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 5+ (WORSENING: 6921min SLA, 12 QUÁ HẠN) |
| BUG HIGH | 2 | BUG-2 Reuters RSS dead, BUG-3 Trading Economics 2× dead |
| BUG MEDIUM | 1 | BUG-4 ISM no data (NAPMBI HTTP 400) |
| ISSUE HIGH | 1 | ISSUE-2 49 open warnings / 67 pending feedback |
| ISSUE MEDIUM | 2 | ISSUE-1 SBV rejection noise, ISSUE-3 intelligence-cycle stalls |
| ISSUE LOW | 5 | ISSUE-4 BDI stale, ISSUE-5 commodity deltas null, ISSUE-6 vnstockTrading 85.7%, ISSUE-7 macro-calendar empty, ISSUE-8 (NEW) windowPartitioner truncation |
| NON-ISSUE | 5 | Param probe errors, weekend price staleness, RSS transient blip, newsapi disabled |
| RESOLVED | 1 | vn-sbv-fetch service health (recovered; ISSUE-1 rejection loop separate) |
| IMPROVE | 2 | Doc drift (get_price_history), get_bctc_pending_refine unbounded response |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1, Day 5+ CRITICAL, 12 overdue Q1 tickers, losing earnings window daily
2. **Check/fix FRED_API_KEY + NAPMBI series ID** — BUG-4, free API key, unblocks ISM for 3 agents
3. **Disable/fix Reuters RSS source record** — BUG-2, eliminates ~240/day error log entries from dead source
4. **Diagnose why `tradingeconomics.com` shows `Chua goi` (never called) post-restart** — BUG-3, trace TE fetcher error path before rate-limiter registration
5. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, prevents runaway cycle lock-out
6. **Investigate `get_macro_calendar` data source** — ISSUE-7, pivot_window_active unavailable for digest-predict + alert-commander
7. **Increase `maxWindowPages` in `intelligenceCycleJob.ts`** — ISSUE-8 (NEW), prevent signal truncation on high-news cycles
