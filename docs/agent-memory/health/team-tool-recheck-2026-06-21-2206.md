# Team MCP Tool Health Recheck — 2026-06-21T22:06Z

**Cycle:** 2026-06-21T22:06Z (UTC Sunday, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-2007.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server restart context:** `mcpServerStartup` last at 21:13:47 UTC (clean shutdown 21:13:35). Uptime ~52 min at probe time.

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — market context, 1 alert (NKG LOW), 10 analyses, elapsed 36ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53 (-0.32%), breadth 81/203/66, source VnDirect, source_tier=2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $80.59, gold $4172.9, USD/VND 26120; deltas still null (TE dead) | ✅ REACHABLE (data gap) |
| `get_system_status` | `{}` | 10 unresolved errors; Reuters+TE 7 ⚠ (reset at restart 21:13); sbv 6× REJECTED errors | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy** (5d 3h 57m); vn-sbv-fetch: **unhealthy** (44m uptime = re-crashed ~21:22 UTC) | ⚠ BUG-1, ISSUE-1 |
| `get_vps_proxy_health` | `{}` | bctc: STALE=YES, last_push=2026-06-16 18:02:24 (unchanged); news/sbv: ok | ⚠ BUG-1 |
| `get_sla_status` | `{}` | bctc: **7283/360min — CRITICAL**; sbv_fx: **49/30min — CRITICAL**; price/news/foreign_flow: ok | ⚠ BUG-1, ISSUE-1 |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}` | ❌ BUG-4 |
| `get_cron_health` | `{}` | intelligenceCycleJob 99.7% (stall 19:15 UTC); sbvRatesRefreshJob 98.2%; vnstockTradingStatsRefresh 85.7% | ✅ REACHABLE |
| `get_vn_macro_indicators` | `{}` | OK — IIP data: all_industry +103.3% YoY, manufacturing +103.39% YoY | ✅ HEALTHY |
| `get_pipeline_health` | `{}` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged | ⚠ ISSUE-4 |
| `get_earnings_calendar` | `{}` | 41 tickers; BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH = 11 QUÁ HẠN | ✅ REACHABLE |
| `get_agent_signals` | `{from_agent:null,"status":"all","hours_back":0.25}` | **"Tín hiệu cho all-producers (1 tin)"** — all-producers path WORKING | ✅ BUG-6 RESOLVED |
| `get_agent_signals` | `{from_agent:"market-watcher","status":"all","hours_back":24}` | "Không có tín hiệu mới" — sender-history mode OK | ✅ HEALTHY |
| `get_market_message_digest` | `{hours_back:24}` | 92 unreviewed messages across 7 days — unchanged | ⚠ ISSUE-2 |
| `get_bctc_refined` | `{report_id:"HPG_Q1_2026"}` | `{"error":"no refined units found"}` — expected (HPG refine not yet run) | ✅ EXPECTED |
| `get_earnings_calendar` | `{}` | OK — calendar data returned, 41 tickers, status clear | ✅ HEALTHY |

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All prior active bugs/issues re-probed from scratch. Commands and outputs cited.

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | Unhealthy 5d 3h 57m; SLA 7283/360min (+118 vs 20:07); last_push unchanged | WORSENING — Day 7+ |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 7 ⚠` — counter **reset to 7** after server restart 21:13 UTC; still failing | UNCHANGED (failure ongoing, counter reset) |
| BUG-3 TE dead | `get_system_status` source health | `Trading Economics \| Ngưng \| Chưa bao giờ \| 7 ⚠` — counter **reset to 7** after restart; still failing | UNCHANGED (failure ongoing, counter reset) |
| BUG-4 ISM no data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` | UNCHANGED |
| BUG-6 get_agent_signals null-path broken | `call_tool("get_agent_signals", {"from_agent": null, "status": "all", "hours_back": 0.25})` | **"Tín hiệu cho all-producers (1 tin)"** — WORKING | **RESOLVED** (server restart 21:13 fixed it) |
| ISSUE-1 SBV crash loop | `get_vps_service_health`, system errors | vn-sbv-fetch: **unhealthy**, 44m uptime = re-crashed at ~21:22 UTC; 6× REJECTED errors in log | WORSENING — 3rd crash in ~24h |
| ISSUE-2 49 warnings | `get_system_status` DB Audit, `get_market_message_digest` | `open_warnings: 49`, `pending_feedback: 67`, 92 unreviewed messages | UNCHANGED |
| ISSUE-3 cycle stalls | `get_system_status` recent errors, `get_cron_health` | Stall at 19:15 UTC; intelligenceCycleJob avg=27872ms | UNCHANGED |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 | UNCHANGED |
| ISSUE-5 deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED (linked to BUG-3) |
| ISSUE-6 vnstock 85.7% | `get_cron_health` | `vnstockTradingStatsRefresh: success_rate=0.86, avg_duration=649220ms, total_runs=7` | UNCHANGED |
| ISSUE-7 macro-calendar | Not re-probed directly | Linked to BUG-3 (TE dead) — expected unchanged | ASSUMED UNCHANGED |
| ISSUE-8/9 monitoring | `get_system_status`, `get_cron_health` | No windowPartitioner errors; weatherCheckJob 100% | NOT REPRODUCED — continue monitoring |

---

## RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle | Evidence |
|------|-------------|------------|---------|
| BUG-6 `get_agent_signals` all-producers null-path broken | BUG MEDIUM — 2 callers broken (market-watcher sibling gate, news-scout SIBLING_WINDOW_CACHE) | **WORKING** — returns "Tín hiệu cho all-producers" | Re-probe: `call_tool("get_agent_signals", {"from_agent": null, "status": "all", "hours_back": 0.25})` → `"Tín hiệu cho all-producers (1 tin)"`. Server restart 21:13:47 UTC is likely delivery vehicle. |

---

## ACTIVE BUGS — 4 (BUG-6 resolved; BUG-1 worsening; BUG-2/3 counter reset but failure ongoing)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 7+

**Delta vs 20:07:** +118 min SLA breach; service still unrecovered. Now 7283 min (121.4h) vs 360 min SLA = **20× over SLA**.

| Signal | 20:07 | 22:06 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch status | unhealthy, 5d 1h 57m | unhealthy, 5d 3h 57m | +2h continuous |
| SLA breach (actual/SLA) | 7165/360min | 7283/360min | +118 actual min |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change |
| BCTC data freshness | ~119h | ~121.4h | Still worsening |
| Overdue Q1 tickers | 12 QUÁ HẠN | 11 QUÁ HẠN (BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) | Unchanged |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms, uptime=5d 3h 57m`
- `get_sla_status`: `bctc: 7283/360min — CRITICAL`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — 7 tickers TA not ready

**Callers confirmed:** bctc-analyst, market-analyst, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob

**Blast radius: Day 7+ CRITICAL. 11 Q1 watchlist tickers losing earnings ingestion. 2 agent flows stalled. BCTC analyst cycle aborted for all overdue tickers.**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — FAILURE ONGOING — Reuters RSS Dead (counter reset; still failing)

**Delta vs 20:07:** Server restarted at 21:13 UTC — consecutive-error counter reset from 99+ to 7. BUT the source is still failing ("Chưa bao giờ" = never succeeded). The root cause is unchanged.

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 7 ⚠`
- Pattern: ~1 failure per 7.5 min since restart at 21:13 UTC

**Callers confirmed (prior cycle grep):** news-scout, unified-agent
**Blast radius: 2 agent flows — news coverage degraded (missing Reuters source). ~10 logged errors/hour.**

**Fix:** Disable Reuters RSS source record in MCP DB/config. Source decommissioned per fix #7 (2026-04-30) but record still active, logging errors.

---

### BUG-3 — HIGH — FAILURE ONGOING — Trading Economics 2× Dead (counter reset; still failing)

**Delta vs 20:07:** Counter reset to 7 (×2 TE entries) after server restart 21:13. Root cause unchanged.

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Trading Economics | Ngưng | Chưa bao giờ | 7 ⚠` (both entries)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — commodity deltas still null

**Callers confirmed:** market-watcher, unified-agent, news-scout (via get_macro_snapshot)
**Blast radius: 3 agent flows — commodity/macro deltas null; macro-calendar empty (ISSUE-7 linked).**

**Fix:** Diagnose why `tradingeconomics.com` is never called post-restart (pre-CB failure in fetcher init path). Check Chromium in mcp-server container.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Delta vs 20:07:** macroIndicatorRefreshJob last ran 12:13 UTC successfully — still no ISM rows.

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_system_status` errors: `[get_ism_subcomponents] no ISM data in fred_series_daily` (20:06 UTC)

**Callers confirmed:** bctc-analyst, news-scout, unified-agent (3 agent flows)

**Fix:** (1) Set `FRED_API_KEY` env var (free: fred.stlouisfed.org). (2) Verify NAPMBI/NAPMPMI series ID valid. (3) Re-run macroIndicatorRefreshJob to populate.

---

## ACTIVE ISSUES — 9 (ISSUE-1 WORSENING — third VPS crash)

### ISSUE-1 — HIGH — WORSENING — SBV VPS Crash Loop (3rd crash in ~24h)

**Delta vs 20:07:** vn-sbv-fetch was `healthy` at 20:07 (had recovered). Now at 22:06: **unhealthy, 44m uptime** = crashed again at approximately 21:22 UTC (9 min after server restart). Zero-value rejections continue every 30 min. SBV FX SLA now breached: 49 min vs 30 min SLA.

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-sbv-fetch: unhealthy, 4m ago, 0ms, VPS uptime: 44m`
- `get_system_status` errors: `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 19:32, 20:02, 20:32, 21:02, 21:32, 22:02 UTC (6 occurrences, every ~30min)
- `get_sla_status`: `sbv_fx: 49/30min — CRITICAL`
- `get_cron_health`: `sbvRatesRefreshJob: success_rate=0.98 (98.2%), total_runs=57`

**Root cause:** SBV VPS service repeatedly crashes (this is the 3rd crash observed in this reporting window). The data-quality guard (`storeSbvSnapshot REJECTED`) is working correctly but zero-value pushes indicate the service crashes and restarts with a zero-init state, then immediately pushes zeros before fetching live data.

**Callers confirmed:** macro_snapshot uses SBV FX rate; carry_trade_signal uses SBV deposit rate; bctc-analyst and news-scout read SBV via get_macro_snapshot.

**Fix (two-part):** (1) Add startup guard in vn-sbv-fetch: skip push if fetched_rate == 0. (2) Investigate crash root cause via `journalctl -u vn-sbv-fetch` on VPS — likely OOM or an unhanded exception at startup.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback / 92 Unreviewed Messages

**Re-probe:** `get_system_status`: `open_warnings: 49 high/critical`, `pending_feedback: 67 new items`. `get_market_message_digest`: 92 messages unreviewed across 7 days.

**Fix:** Manual triage session. Partially auto-resolves when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Delta vs 20:07:** 1 additional stall at 19:15 UTC.

**Re-probe evidence:**
- `get_system_status` errors: `[intelligence-cycle] previous cycle still running — skipped` at 19:15 UTC
- `get_cron_health`: `intelligenceCycleJob: avg_duration=27872ms, success_rate=99.7%, total_runs=1176`

**Fix:** Add hard 12-minute timeout in `intelligenceCycleJob.ts` to kill runaway cycles before next 15-min slot.

---

### ISSUE-4 — LOW — UNCHANGED — BDI + 6 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged.

**Fix:** (1) BDI: Replace `^BDI` Yahoo Finance ticker with Baltic Exchange API. (2) Others: recover when BUG-1 BCTC pipeline restored.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Price Deltas Null (linked to BUG-3)

**Re-probe:** `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — unchanged. Auto-resolves with BUG-3 fix.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 649s Runtime

**Re-probe:** `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.86, avg_duration=649220ms, total_runs=7` — identical.

**Fix:** Add per-ticker error isolation + 15-min job timeout guard.

---

### ISSUE-7 — LOW — ASSUMED UNCHANGED — get_macro_calendar Returns Empty

Not re-probed this cycle (no new data expected — TE still dead). Prior evidence: `{"events":[],"status":"unavailable"}`.

**Callers confirmed:** `digest-predict/flow/weekly.md`, `alert-commander/flow/stage-bootstrap.md`

**Fix:** Trace macro-calendar data source. Likely TE-dependent → auto-resolves with BUG-3.

---

### ISSUE-8 — LOW — MONITORING — windowPartitioner Continuation Truncation

Not reproduced this cycle. Continue monitoring.

---

### ISSUE-9 — LOW — MONITORING — weatherCheckJob Previous Run Blocking

Not reproduced this cycle. `weatherCheckJob: 100% success` in cron_health. Continue monitoring.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Result | Evidence | Verdict |
|------|----------------|----------|---------|
| Stock prices 61.1h stale | STALE | VN market closed — Sunday 2026-06-21; last trade day = Friday 2026-06-19; price SLA ok (1954/3695min) | NON-ISSUE — expected weekend |
| CafeF/VnEconomy/VnExpress RSS 1-error degraded | `Suy giảm \| 3 phút trước \| 1` each | Transient per-cycle blip; news SLA ok (280/455min) | NON-ISSUE — transient |
| newsapi: disabled | 0 errors | Intentional by design | NON-ISSUE — by design |
| vn-price-fetch idle | idle | VN market closed; expected | NON-ISSUE — expected weekend |
| vn-foreign-flow idle | idle | VN market closed; expected | NON-ISSUE — expected weekend |
| newsHeadlinesRefreshJob 20s timeout (21:30 UTC) | 1× WARN | success_rate 99.8% (461 runs); single sporadic timeout | NON-ISSUE — transient |
| base_rate=0 WARN `foreign_flow_institutional/bullish/5` | 1× WARN at 19:07 | Defaulting to 1.0 is correct fallback; single event | NON-ISSUE — single fallback |
| `get_bctc_refined` no rows for HPG_Q1_2026 | `{"error":"no refined units found"}` | Refine not yet run for HPG — ESC-5 docs: "no rows → ESC-5=FALSE, graceful" | NON-ISSUE — expected |
| `task_claim` probe with wrong args | Validation error | My probe used wrong args; bctc-analyst ESC gate uses correct `{task_id, task_kind, owner_agent, ttl_seconds}` | NON-ISSUE — probe error, not tool bug |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 7+ (WORSENING: 7283min SLA, 20×, 11 QUÁ HẠN tickers) |
| BUG HIGH | 2 | BUG-2 Reuters dead (ongoing, counter reset), BUG-3 Trading Economics 2× dead (ongoing, counter reset) |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY |
| ISSUE HIGH | 2 | ISSUE-1 SBV crash loop WORSENING (3rd crash, SLA breached), ISSUE-2 49 warnings / 67 feedback / 92 msgs |
| ISSUE MEDIUM | 1 | ISSUE-3 intelligence-cycle stalls (~1/h) |
| ISSUE LOW | 5 | ISSUE-4 BDI+6 TA dead, ISSUE-5 commodity deltas null, ISSUE-6 vnstock 85.7%, ISSUE-7 macro-calendar empty, ISSUE-8/9 MONITORING |
| NON-ISSUE | 9 | Weekend prices, RSS transient, newsapi by-design, idle VPS, newsHeadlines timeout, base_rate fallback, bctc_refined no rows, task_claim probe error, vn-price-fetch idle |
| RESOLVED | 1 | BUG-6 get_agent_signals all-producers null-path — WORKING after server restart 21:13 UTC |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1, Day 7+ CRITICAL, 11 overdue Q1 tickers, 7 tickers TA dead. Longest-standing issue.
2. **Fix vn-sbv-fetch crash loop** — ISSUE-1 WORSENING, 3rd crash in ~24h. Add startup zero-guard + investigate crash root cause via `journalctl -u vn-sbv-fetch`.
3. **Set FRED_API_KEY** — BUG-4 free API key, unblocks ISM for 3 agents.
4. **Disable Reuters RSS source record** — BUG-2, kills ~10/h error log rate from dead decommissioned source.
5. **Diagnose TE fetcher pre-CB failure** — BUG-3, `tradingeconomics.com: Chưa gọi` post-restart; unblocks commodity deltas + macro-calendar.
6. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, prevents runaway cycles.
