# Team MCP Tool Health Recheck — 2026-06-22T00:04Z

**Cycle:** 2026-06-22T00:04Z (UTC Monday early morning, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-2206.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime:** 2h 49m 35s (last restart: 2026-06-21T21:13:47Z clean shutdown 21:13:35)

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_system_status` | `{}` | OK — 10 unresolved errors; sbv 6× REJECTED (21:32→00:02 UTC); Reuters+TE 26 ⚠; DB 287.68 MB; WAL 3.93 MB | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — 2 agent signals, market context, system status. elapsed 54ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53 (-0.32%), breadth 81/203/66, source VnDirect, source_tier=2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $81.72, gold $4164.6, USD/VND 26120; deltas still null (BUG-3) | ✅ REACHABLE (data gap) |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy** (5d 5h 57m); vn-sbv-fetch: **healthy**; others idle/healthy | ⚠ BUG-1, ISSUE-1 |
| `get_vps_proxy_health` | `{}` | bctc: STALE YES (last_push=2026-06-16 18:02:24, 24h_pushes=0); sbv: ok (00:02:57 transport ok, data rejected) | ⚠ BUG-1, ISSUE-1 |
| `get_sla_status` | `{}` | bctc: **7402/360min — CRITICAL**; price/news/sbv_fx/foreign_flow: ok (sbv_fx uses push-ts, unreliable) | ⚠ BUG-1 |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` | ❌ BUG-4 |
| `get_cron_health` | `{}` | All crons ≥86% success; intelligenceCycleJob 99.7% (stall 23:45 UTC); sbvRatesRefreshJob 98.2%; vnstockTradingStatsRefresh 85.7% | ✅ REACHABLE |
| `get_earnings_calendar` | `{}` | OK — 41 tickers; 11 QUÁ HẠN (BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — 7 tickers TA not ready | ⚠ ISSUE-4 |
| `get_agent_signals` | `{from_agent:null,"status":"all","hours_back":0.25}` | "Tín hiệu cho all-producers (3 tin)" — all-producers mode WORKING | ✅ BUG-6 STILL RESOLVED |
| `get_macro_calendar` | `{}` | `{"events":[],"status":"unavailable","is_estimate":true,"source_tier":4}` | ⚠ ISSUE-7 (BUG-3 linked) |
| `get_market_message_digest` | `{hours_back:24}` | 86 unreviewed messages across 7 days (was 92 at 22:06) | ⚠ ISSUE-2 |
| `task_list_held` | `{}` | 6 locks: cowork-leader active (heartbeat 1782085876), digest-predict × 4 cowork-slots, unified-agent × 1 cowork-slot | ✅ NORMAL |

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All prior active bugs/issues re-probed from scratch this cycle. No byte-copy from prior report.

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | Unhealthy 5d 5h 57m; SLA 7402/360min (+119 vs 22:06); last_push 2026-06-16 18:02:24 unchanged; 24h_pushes=0 | WORSENING — Day 7.2+ |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 26 ⚠` — counter advanced to 26 post-restart cycle | UNCHANGED — failure ongoing |
| BUG-3 TE dead | `get_system_status` source health | `Trading Economics \| Ngưng \| Chưa bao giờ \| 26 ⚠` (both entries) | UNCHANGED — failure ongoing |
| BUG-4 ISM no data | `get_ism_subcomponents({})` | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` | UNCHANGED |
| BUG-6 all-producers (RESOLVED) | `get_agent_signals({from_agent:null,"status":"all","hours_back":0.25})` | "Tín hiệu cho all-producers (3 tin)" | STILL RESOLVED — confirmed working |
| ISSUE-1 SBV crash loop | `get_vps_service_health`, `get_system_status` errors | vn-sbv-fetch **healthy** (recovered); but 6× storeSbvSnapshot REJECTED every 30 min (21:32–00:02 UTC); sbv_fx SLA "ok" uses push-ts (unreliable) | PARTIAL: service running, zero-value push bug persists |
| ISSUE-2 49 warnings | `get_system_status`, `get_market_message_digest` | `open_warnings: 49`, `pending_feedback: 67`, 86 messages (was 92) | MARGINALLY IMPROVED: −6 messages |
| ISSUE-3 cycle stalls | `get_system_status` errors, `get_cron_health` | `[intelligence-cycle] previous cycle still running — skipped` at 23:45:01 UTC; avg_duration 27944ms (1173 runs) | UNCHANGED |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — identical | UNCHANGED |
| ISSUE-5 deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED (linked BUG-3) |
| ISSUE-6 vnstock 85.7% | `get_cron_health` | `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), avg_duration=649220ms, total_runs=7` | UNCHANGED |
| ISSUE-7 macro-calendar | `get_macro_calendar({})` | `{"events":[],"status":"unavailable"}` | UNCHANGED (linked BUG-3) |
| ISSUE-8 windowPartitioner | `get_system_status` errors | Not present this cycle | NOT REPRODUCED — continue monitoring |
| ISSUE-9 weatherCheckJob stall | `get_system_status` errors | `[weatherCheckJob] previous run still in progress — skipping` at 06:00:01 UTC | RE-APPEARED — continue monitoring |

---

## RESOLVED FINDINGS

| Item | Prior Status | This Cycle | Evidence |
|------|-------------|------------|---------|
| BUG-6 `get_agent_signals` all-producers null-path | RESOLVED at 22:06 cycle | STILL RESOLVED | `call_tool("get_agent_signals", {from_agent: null, status: "all", hours_back: 0.25})` → "Tín hiệu cho all-producers (3 tin)" — working. Callers use `from_agent: null` (market-watcher/flow/main.md:53, news-scout/flow/stage-bootstrap.md:56). |

---

## ACTIVE BUGS — 4

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 7.2+

**Delta vs 22:06:** +119 min SLA breach. Now 7402/360min (20.6× SLA). vn-bctc-fetch has been unhealthy for 5 days 5 hours 57 minutes continuously — the service has never restarted on its own in 7 days.

| Signal | 22:06 | 00:04 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch uptime (unhealthy) | 5d 3h 57m | 5d 5h 57m | +2h |
| SLA breach (actual/SLA) | 7283/360min | 7402/360min | +119 min |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | Unchanged |
| 24h push count | 0 | 0 | Unchanged |
| Overdue Q1 tickers | 11 | 11 | Unchanged |

**Re-probe evidence:**
- `get_vps_service_health` → `vn-bctc-fetch | unhealthy | 3m ago | 0ms | 5d 5h 57m`
- `get_sla_status` → `bctc: 7402/360min — CRITICAL`
- `get_vps_proxy_health` → `bctc: last_push=2026-06-16 18:02:24, 24h_pushes=0, STALE=YES`
- `get_pipeline_health` → BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6

**Callers confirmed (≥5):** bctc-analyst flow, market-analyst flow, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob.

**Blast radius:** Day 7.2+ CRITICAL. 11 Q1 watchlist tickers without earnings data ingestion. 7 tickers with zero TA candles. bctc-analyst cycle aborted for all overdue tickers. bctcPdfPullJob completes but pulls 0 PDFs.

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → call `trigger_bctc_vps_fetch` to backfill missed PDFs.

---

### BUG-2 — HIGH — ONGOING — Reuters RSS Dead

**Delta vs 22:06:** Counter advanced to 26 ⚠ (was 7 immediately post-restart at 22:06). Source still never succeeded.

**Re-probe:** `get_system_status` → `Reuters RSS | Ngưng | Chưa bao giờ | 26 ⚠`

**Callers confirmed (grep: docs/agents):** news-scout (stage-fetch), unified-agent (via get_cycle_bootstrap news context) — 2 agent flows.
**Blast radius:** ~10 error logs/hour; degraded news coverage (Reuters source entirely absent from ingestion).

**Fix:** Disable the Reuters RSS source record in the MCP DB/config. Source was decommissioned per fix #7 (2026-04-30) but the active record remains, producing continuous error spam.

---

### BUG-3 — HIGH — ONGOING — Trading Economics 2× Dead

**Delta vs 22:06:** Both TE source entries now at 26 ⚠ failures (were 7 at 22:06 post-restart).

**Re-probe:**
- `get_system_status` → `Trading Economics | Ngưng | Chưa bao giờ | 26 ⚠` (×2)
- `get_macro_snapshot` → `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` (side-effect confirmed)
- `get_macro_calendar` → `{"events":[],"status":"unavailable"}` (side-effect confirmed)

**Callers confirmed:** market-watcher, unified-agent, news-scout (via get_macro_snapshot/get_macro_calendar) — 3 agent flows.
**Blast radius:** Commodity deltas null for all macro contexts; macro-calendar empty; digest-predict and alert-commander lose macro-calendar input.

**Fix:** Diagnose why `tradingeconomics.com` never fires post-restart (pre-CB failure in fetcher init path). Check Chromium container in mcp-server (`trading-economics-chromium` source).

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Re-probe:** `get_ism_subcomponents({})` → `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`

Note: `macroIndicatorRefreshJob` ran successfully at 12:13 UTC (2026-06-21) — but still no ISM rows. Confirms `FRED_API_KEY` is absent in the env.

**Callers confirmed:** bctc-analyst, news-scout, unified-agent (3 agent flows per tool doc).
**Fix:** (1) Obtain FRED_API_KEY (free: fred.stlouisfed.org). (2) Set in `.env` on server. (3) Re-run `macroIndicatorRefreshJob` to populate `fred_series_daily`.

---

## ACTIVE ISSUES — 7

### ISSUE-1 — HIGH — DEGRADED — SBV Zero-Value Push Loop

**Delta vs 22:06:** vn-sbv-fetch recovered to "healthy" status (was 3rd crash in prior cycle). However storeSbvSnapshot REJECTED errors continue at ~30 min intervals (6 occurrences in this 2h window). The sbv_fx SLA metric shows "ok" (4/30min) but this metric uses push-timestamp, not accepted-write-timestamp — **the metric is unreliable** when every push is rejected by the quality guard.

**Re-probe:**
- `get_vps_service_health` → `vn-sbv-fetch | healthy | 3m ago | 0ms | -`
- `get_system_status` errors → `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 00:02:57, 23:32:56, 23:02:55, 22:32:55, 22:02:53, 21:32:53 UTC (every ~30 min)
- `get_vps_proxy_health` → `sbv | 2026-06-22 00:02:57 | 1 | ok` — transport succeeds but content rejected by DB quality guard
- `get_sla_status` → `sbv_fx | 4 | 30 | ok` (unreliable — uses push-ts not accepted-write-ts)

**Root cause:** vn-sbv-fetch crashes, restarts with zero-init FX state, pushes 0.0 VND rate before fetching live data. Quality guard (`storeSbvSnapshot REJECTED`) correctly prevents DB corruption. True SBV data freshness in the DB is unknown — last valid accepted write time not surfaced by any tool.

**Callers confirmed:** get_macro_snapshot (carry_trade_signal, macro context used by market-watcher, news-scout, unified-agent, bctc-analyst).
**Fix (two-part):** (1) Add startup zero-guard in vn-sbv-fetch: `if fetched_rate == 0 { skip_push; sleep 30s; retry }`. (2) Investigate crash root cause via `journalctl -u vn-sbv-fetch` on VPS — suspected OOM or unhandled exception at startup.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback / 86 Unreviewed Messages

**Re-probe:** `get_system_status` → `open_warnings: 49 high/critical`, `pending_feedback: 67 new items`. `get_market_message_digest` → 86 unreviewed messages (marginal improvement from 92 at 22:06; −6 messages).
**Fix:** Manual triage session. Will partially auto-resolve when BUG-1/BUG-3 fixed (those bugs generate recurring errors that feed the warning queue).

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Re-probe:** `get_system_status` → `[intelligence-cycle] previous cycle still running — skipped` at 23:45:01 UTC. `get_cron_health` → `intelligenceCycleJob: avg_duration=27944ms, success_rate=99.7%, total_runs=1173`.
**Fix:** Add hard 12-minute timeout in `intelligenceCycleJob.ts` to kill runaway cycles before next 15-min slot.

---

### ISSUE-4 — LOW — UNCHANGED — BDI + 6 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health` → BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 (identical to prior).
**Fix:** (1) BDI: Replace `^BDI` Yahoo Finance ticker with a valid Baltic Exchange API source. (2) DAG/DLC/JSH/SIS/VDC/VNH: will recover when BUG-1 BCTC pipeline is restored (these tickers have overdue BCTC → no candles).

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Price Deltas Null (BUG-3 linked)

**Re-probe:** `get_macro_snapshot` → `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3 fix.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 649s Runtime

**Re-probe:** `get_cron_health` → `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), avg_duration=649220ms, total_runs=7`.
**Fix:** Add per-ticker error isolation + 15-min job timeout guard to prevent slow tickers from failing entire runs.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Returns Empty (BUG-3 linked)

**Re-probe:** `get_macro_calendar({})` → `{"daysRequested":60,"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}`.
**Callers confirmed:** `docs/agents/digest-predict/flow/weekly.md`, `docs/agents/alert-commander/flow/stage-bootstrap.md` — 2 agent flows.
**Fix:** Auto-resolves with BUG-3 (Trading Economics source restore).

---

## MONITORING

| Item | Occurrence | Status |
|------|-----------|--------|
| weatherCheckJob stall | `[weatherCheckJob] previous run still in progress — skipping` at 06:00:01 UTC | Re-appeared this cycle. weatherCheckJob success_rate 100% (45 runs) — job completes but occasionally overlaps. Continue monitoring. |
| pollNews ragInsert timeout | `[pollNews] ragInsert failed (non-fatal) — The operation timed out` at 06:17:52 UTC | Non-fatal single event. RAG service insert timeout. pollNewsJob success_rate 99.9% (1478 runs). Continue monitoring. |
| ISSUE-8 windowPartitioner truncation | — | Not reproduced. Continue monitoring. |

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | Probe Result | Evidence | Verdict |
|------|-------------|----------|---------|
| `get_agent_signals` probe error (no `from_agent` key) | `Error: "agent" is required when using inbox mode` | I omitted `from_agent` entirely rather than passing `null`. Flow files use `from_agent: null` (explicit null = all-producers mode). Re-probe with `{from_agent:null}` → WORKING. Grep: market-watcher/flow/main.md:53, news-scout/flow/stage-bootstrap.md:56 both use `null`. | NON-ISSUE — probe error only; caller-surface verified: 0 affected callers |
| Stock prices 63.1h stale | All prices as of 2026-06-19 09:00 | VN market closed — Monday 00:04 UTC; last trade day = Friday 2026-06-19; price SLA ok (19/3815min) | NON-ISSUE — expected weekend |
| CafeF/VnEconomy/VnExpress RSS 1-error degraded | `Suy giảm | 3 phút trước | 1` each | Transient per-cycle blip; news SLA 30/30min (borderline ok) | NON-ISSUE — transient |
| newsapi: disabled | 0 errors, `disabled` | Intentional by design | NON-ISSUE — by design |
| vn-price-fetch / vn-foreign-flow idle | `idle` | VN market closed; expected off-hours | NON-ISSUE — by design |
| bctcPdfPullJob 100% success | Cron success | Transport succeeds; 0 PDFs pulled — root is BUG-1 VPS service | NON-ISSUE for the cron itself |
| task_list_held (6 locks) | All valid heartbeats | cowork-leader active hb, 5 normal cowork-slots | NON-ISSUE — normal coordination |
| macro_deviation CRITICAL alerts (2) | Brent +5.3σ, Gold -5.41σ | Alerts fired and notified correctly | NON-ISSUE — correct system behavior |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 7.2+ (WORSENING: 7402min SLA, 20.6×, 11 overdue Q1 tickers, 7 TA dead) |
| BUG HIGH | 2 | BUG-2 Reuters dead (26 ⚠, ~10 errors/h), BUG-3 Trading Economics 2× dead (26 ⚠) |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY (3 agent flows degraded) |
| ISSUE HIGH | 2 | ISSUE-1 SBV zero-value push loop (6×/2h, quality guard active, SBV SLA metric unreliable), ISSUE-2 49 warnings / 67 feedback / 86 msgs |
| ISSUE MEDIUM | 1 | ISSUE-3 intelligence-cycle stalls (~1/h, avg 27.9s) |
| ISSUE LOW | 4 | ISSUE-4 BDI+6 TA dead, ISSUE-5 commodity deltas null (BUG-3), ISSUE-6 vnstock 85.7%, ISSUE-7 macro-calendar empty (BUG-3) |
| MONITORING | 3 | weatherCheckJob stall (re-appeared), pollNews ragInsert timeout (non-fatal), windowPartitioner (not reproduced) |
| NON-ISSUE | 8 | Probe error, weekend prices, RSS transient, newsapi by-design, idle VPS, bctcPdfPull transport ok, cowork locks normal, macro deviation alerts correct |
| RESOLVED (confirmed) | 1 | BUG-6 get_agent_signals all-producers null-path — STILL WORKING |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1 CRITICAL Day 7.2+. 11 overdue Q1 tickers, SLA 20.6×. Longest-standing unresolved issue; simple restart likely sufficient.
2. **Fix vn-sbv-fetch zero-value push** — ISSUE-1 HIGH. Add startup zero-guard (skip push if fetched_rate == 0) + investigate crash cause via `journalctl -u vn-sbv-fetch` on VPS.
3. **Set FRED_API_KEY** — BUG-4 MEDIUM. Free key (fred.stlouisfed.org), unblocks ISM for 3 agents.
4. **Disable Reuters RSS source record** — BUG-2 HIGH. Kills ~10 error logs/hour from decommissioned source.
5. **Diagnose TE fetcher pre-CB failure** — BUG-3 HIGH. Unblocks commodity deltas + macro-calendar for 3 agents.
6. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3 MEDIUM. Prevents runaway cycles.
