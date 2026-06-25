# Team MCP Tool Health Recheck — 2026-06-23T04:03Z

**Cycle:** 2026-06-23T04:03Z (UTC — VN market OPEN 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-23-0206.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~7h 59m (started 2026-06-22T20:03:15Z)
**DB:** market.db 289.79 MB, WAL 3.24 MB
**Probe scope:** 19 tools probed live; full Step 3c re-probe of all 5 prior BUGs and key ISSUEs

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe command / grep | This cycle result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_sla_status`, `get_vps_proxy_health`, `get_vps_service_health` | bctc: **9082/120min CRITICAL**; vn-bctc-fetch UNHEALTHY (0ms); last push 2026-06-16T18:02:24Z; 0 24h pushes | **WORSENING +121 min** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 86 ⚠` (~14 failures/h since restart at 20:03 UTC) | **PERSISTS** |
| BUG-3 TE dead | `get_system_status` + `get_macro_calendar` | Two TE entries: 86/87× failures post-restart, never successful; `get_macro_calendar` → events=[], status=unavailable; `oilUsdDelta:null` persists | **PERSISTS** |
| BUG-4 ISM no_data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` — identical error | **UNCHANGED** |
| BUG-5 fb-poster sentiment_trend | `grep docs/agents/fb-market-poster/flow/main.md:118` | `call_tool(..., tool="get_sentiment_trend", arguments={})` — no `stock_code` still present at line 118 | **UNCHANGED** |
| ISSUE-3 cycle stalls | `get_cron_health` intelligenceCycleJob | `success_rate: 1.00 (99.8%), total_runs: 1187` (was 99.7% at 1184 runs) — marginal improvement; 1 "previous cycle still running — skipped" in current error window | **PERSISTS (slight improve)** |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows — same 7 tickers | **UNCHANGED** |
| ISSUE-6 vnstockTrading slow | `get_cron_health` | `vnstockTradingStatsRefresh: avg=708371ms` (same) | **UNCHANGED** |
| ISSUE-11 vnstockFundamentals slow | `get_cron_health` | `vnstockFundamentalsRefresh: avg=845851ms` (same) | **UNCHANGED** |
| ISSUE-NEW-13 FF open timing | `get_system_status` recent errors | `foreign-flow-job: fallback activated / all fallbacks exhausted` at 04:01 and 04:02 UTC; VPS push ok simultaneously | **PERSISTS** |
| ISSUE-NEW-14 SSC HOSE TLS | `get_system_status` recent errors | Not present in current error window (prior was at 02:02 UTC post-market-open) | **NOT REPRODUCED — monitor** |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call pattern | Result summary | Status |
|---|---|---|---|
| `get_system_status` | `{}` | 10 unresolved errors; FF fallback exhausted 04:01/04:02 UTC; CafeF/VnEconomy/VnExpress RSS 1 error each (degraded); Reuters 86×; TE 86/87×; circuit breakers all [OK] | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — 4 agent_signals, market_context populated (41 watchlist prices fresh), 11ms elapsed | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1872.05 +0.76%, breadth 111/158/67, HOSE turnover 13116.85bn (-10.1%) | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $77.60, gold $4156.80, USD/VND 26128; carry NEUTRAL (1.37pp); deltas still null (BUG-3 symptom) | ✅ REACHABLE (delta gap) |
| `get_cron_health` | `{}` | 75+ jobs; all ≥98%; intelligenceCycleJob 99.8%/1187 runs; foreignFlowFetcherJob 100%/2030 runs; sbvRatesRefreshJob 98.2%/55 | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready (BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6); 4 oversold (D2D/DPM/NKG/NVL RSI<30) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv/foreign-flow: ok with recent pushes; **bctc: STALE=YES, last push 2026-06-16T18:02:24Z, 0 24h pushes** | ❌ BUG-1 |
| `get_vps_service_health` | `{}` | vn-price-fetch/news-fetch/foreign-flow/sbv: healthy; **vn-bctc-fetch: UNHEALTHY (0ms response, 0 uptime returned)** | ❌ BUG-1 |
| `get_sla_status` | `{}` | bctc: **9082/120min CRITICAL**; price/news/sbv_fx/foreign_flow: all ok | ❌ BUG-1 |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) | ✅ REACHABLE |
| `get_market_foreign_flow` | `{}` | OK — 2026-06-23 session (96 tickers); net -1.54M shares, HPG top seller, VIC top buyer | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | ❌ BUG-4 |
| `get_macro_calendar` | `{}` | `{"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}` | ⚠ ISSUE-7 (BUG-3 symptom) |
| `get_vn_macro_indicators` | `{}` | OK — IIP manufacturing YoY +3.39%, YTD +9.04%; source NSO monthly Excel PROBE-3 PASS | ✅ HEALTHY |
| `task_list_held` | `{}` | 5 locks: 3 unified-agent cowork-slots (2026-06-22 chef-morning/eod/evening all claimed), 1 cowork-leader-lock, 1 digest-predict. All within TTL. | ✅ HEALTHY |
| `get_watchlist` | `{}` | 41 tickers, prices fresh as of 04:02 UTC; 7 tickers N/A (price data gaps — BDI/DLC/JSH/SIS/VDC match ISSUE-4) | ✅ REACHABLE |
| `get_recent_signals` | `{}` | 7 signals in last 15min; all from alert-engine; VIC/VNM/KBC/HVN/NVL/NKG/DPM verified_decision | ✅ HEALTHY |
| `get_alerts` | `{limit:5}` | 5 recent alerts returned; latest HVN/KBC news_mention 03:56 UTC; NVL oversold RSI=27.9 | ✅ HEALTHY |
| `get_cycle_bootstrap({})` | `{}` (no agent_name) | Schema error — requires `agent_name`. All flow callers supply it correctly. | NON-ISSUE |

---

## ACTIVE BUGS — 5 (unchanged count; no new BUGs, no resolutions)

### BUG-1 — CRITICAL — WORSENING (Day 7) — BCTC VPS Pipeline Dark

| Signal | 02:06 UTC (prior) | 04:03 UTC (this cycle) | Delta |
|---|---|---|---|
| SLA breach | 8961/120min | **9082/120min** | +121 min |
| VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| vn-bctc-fetch service | UNHEALTHY | UNHEALTHY (0ms) | Unchanged |
| Q2 filing window | ~8 days | **~7 days** | Closing fast |

**Re-probe evidence:**
- `get_sla_status`: `bctc: 9082/120min — CRITICAL`
- `get_vps_proxy_health`: `bctc | 2026-06-16 18:02:24 | ok | YES (STALE) | 24h_pushes=0`
- `get_vps_service_health`: `vn-bctc-fetch | unhealthy | 3m ago | 0ms`
- `get_agent_work_log(bctc-analyst)`: last run 2026-06-17T00:13:39Z (6+ days ago); cycles c059-c062 show ACV/CTG/VCB/D2D/VNM all BLOCKED or DB empty
- `get_earnings_calendar`: 12 tickers QUÁ HẠN; Q2-2026 season begins ~2026-07-01

**Caller surface:** bctc-analyst (get_bctc_full/ocf/series), refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob. **6 callers blocked.**

**Blast radius: CRITICAL.** Pipeline dark 7 days. Q2-2026 filings window opens in ~7 days — without recovery, all Q2 filings will be missed from day 1.

**Fix:** SSH VPS → `systemctl status vn-bctc-fetch` → `systemctl restart vn-bctc-fetch`. Then call `restart_vps_service("vn-bctc-fetch")` + `trigger_bctc_vps_fetch` to confirm recovery and backfill queued PDFs.

---

### BUG-2 — HIGH — PERSISTS — Reuters RSS Dead

**Re-probe evidence (2026-06-23T04:03Z):**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 86 ⚠` (was 58 at 02:06 UTC; +28 failures in ~2h ≈ 14/h; counter restarts from 0 on server restart, never succeeds)
- `get_recent_fixes #7` confirmed VPS vn-reuters-fetch was decommissioned 2026-04-30 (dead feeds.reuters.com URLs). Internal MCP RSS poller still fires ~14×/hour against dead URL.

**Caller-surface verified:** `grep -rE "reuters" docs/agents/*/flow/*.md` → 0 active cowork flow files. **0 affected callers. Pure error-log noise.**

**Fix:** Disable/remove Reuters RSS source record from mcp-server news source config. Priority: LOW (noise only, not blocking).

---

### BUG-3 — HIGH — PERSISTS — Trading Economics 2× Dead + Commodity Deltas Absent

**Re-probe evidence (2026-06-23T04:03Z):**
- `get_system_status`: two `Trading Economics | Ngưng | Chưa bao giờ | 86 ⚠` and `87 ⚠` entries (was 58/59 at 02:06 UTC; same accumulation pattern)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — confirmed absent
- `get_macro_calendar`: `events=[], status="unavailable"` — TE macro calendar empty
- Auto-tracked indicators show `wti_crude_usd: 95.5` (79 data points, deeply stale vs live ~$77.6) and `dow_jones: 23750` (49 data points, deeply stale vs current ~$42k) — both are TE-sourced series not refreshing

**Caller surface:** 4 cowork flows (unified-agent, bctc-analyst, news-scout, market-watcher) missing commodity day-over-day deltas and macro calendar. **4 affected callers.**

**Fix:** Inspect TE Chromium path in running mcp-server container — verify `/usr/bin/chromium` present and Chromium can reach tradingeconomics.com. Check for IP block / rate-limit. Evaluate investing.com or Yahoo Finance as commodity delta fallback.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED NAPMBI HTTP 400)

**Re-probe evidence (2026-06-23T04:03Z):**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — identical error text
- `get_cron_health macroIndicatorRefreshJob`: last_run 2026-06-22 12:13:01 (missed 19:13 UTC run due to server restart at 20:03); next run today 19:13 UTC

**Caller surface:** news-scout, bctc-analyst, unified-agent receive empty/error for ISM PMI regime classification. **3 affected callers.**

**Fix:** (1) Confirm `FRED_API_KEY` is set in mcp-server container env. (2) Verify/replace NAPMBI series ID — try `NAPM` or `ISM/MAN_NO` in `macroIndicatorRefreshJob.ts`. Monitor today's 19:13 UTC run output.

---

### BUG-5 — LOW — UNCHANGED — fb-market-poster `get_sentiment_trend({})` Missing `stock_code`

**Re-probe evidence (2026-06-23T04:03Z):**
- `grep docs/agents/fb-market-poster/flow/main.md:118`: `sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` — no `stock_code` param present

**Caller surface:** 1 caller (`docs/agents/fb-market-poster/flow/main.md:118`). Call will fail schema validation on every fb-market-poster cycle.

**Fix:** Add `stock_code` param or rewrite as per-watchlist-ticker loop. Exact line: `docs/agents/fb-market-poster/flow/main.md:118`.

---

## ACTIVE ISSUES — 7 (unchanged; ISSUE-14 not reproduced this cycle)

### ISSUE-3 — MEDIUM — PERSISTS (slight improve) — Intelligence-Cycle Stalls

- `get_cron_health`: `intelligenceCycleJob: success_rate: 1.00 (99.8%), total_runs: 1187, avg_duration: 27909ms`
- Prior: 99.7% / 1184 runs → marginal improvement. Current error window shows 1 "previous cycle still running — skipped" at 04:00 UTC.
- Avg 27.9s duration with 15-min (900s) slot — not structurally problematic but long tails can cause overlaps.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

`get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows. Same 7 tickers as prior. Watchlist prices also show N/A for same tickers. **Fix:** Audit UPCOM/HNX scraper path for BDI/DLC/JSH/SIS/VDC; DAG has 1 row (likely HOSE API intermittent).

---

### ISSUE-5 — LOW — PERSISTS — Commodity Deltas Null (BUG-3 symptom)

`get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Additionally, auto-tracked indicator table shows wti_crude_usd=95.5 (79 pts, stale) and dow_jones=23750 (49 pts, deeply stale) — both TE-sourced. Auto-resolves with BUG-3 fix.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh Avg 11.8 min

`get_cron_health`: `vnstockTradingStatsRefresh: avg=708371ms, 7 runs, 100%`. Potential structural overlap with 15-min intelligenceCycleJob window. **Fix:** Per-ticker timeout + off-peak schedule.

---

### ISSUE-7 — LOW — PERSISTS — get_macro_calendar Empty (BUG-3 symptom)

`get_macro_calendar({})`: `events=[], status="unavailable", source_tier=4`. Auto-resolves with BUG-3 fix.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh Avg 14.1 min

`get_cron_health`: `vnstockFundamentalsRefresh: avg=845851ms, 2 runs, 100%`. **Fix:** Per-ticker timeout + isolation; schedule off-peak.

---

### ISSUE-NEW-13 — LOW — PERSISTS — Foreign Flow Fallback Exhausted at Market Open

**Evidence (re-confirmed):**
- `get_system_status` recent errors: `fallback: primary endpoint failed` + `foreign-flow-job: all fallbacks exhausted` at 04:01 and 04:02 UTC
- VPS push log simultaneously shows: `2026-06-23 04:03:03 | foreign-flow | ok | 103 items` — VPS path healthy
- `foreignFlowFetcherJob`: 100% success (2030 runs) — job masks errors as success when VPS path covers

**Root cause:** Direct-fetch path (bgapidatafeed.vps.com.vn) unavailable; job exhausts fallbacks and logs WARN every 60s regardless. VPS push path delivers data independently — no agent impact.

**Fix:** Add market-hours-aware suppression for WARN when VPS proxy health shows foreign-flow ok; or deprioritize/disable direct-fetch when VPS is healthy.

---

### ISSUE-NEW-14 — LOW — NOT REPRODUCED — SSC HOSE Fallback TLS Error

**Re-probe (2026-06-23T04:03Z):**
- `get_system_status` recent errors: No SSC HOSE TLS certificate error in current window (prior was at 02:02 UTC immediately after market open)
- `get_market_snapshot`: VN-Index 1872.05 from vndirect primary — healthy

**Verdict:** TLS error may be intermittent at market open transition only. No recurrence in this 2h window. Downgrading to MONITOR — will re-promote to ISSUE if reproduced in next open-hour probe.

---

## NON-ISSUES — Probe Errors This Cycle (caller-surface verified)

| Item | Probe error | Verdict |
|---|---|---|
| `get_cycle_bootstrap({})` | Requires `agent_name` param | NON-ISSUE — probe artifact; all 9 cowork agent flow callers pass explicit name per tool package docs |
| `get_foreign_flow({})` | Requires `code` (ticker) param | NON-ISSUE — correct per-ticker API; fb-market-poster uses `get_market_foreign_flow` for aggregate |
| `get_bctc_full({ticker:"CTG"})` | Requires `code` not `ticker` param | NON-ISSUE — probe arg mismatch; schema uses `code` correctly in all flow callers |
| `get_news` | Tool not found | NON-ISSUE — no such tool; agents use `get_agent_signals`, `get_market_message_digest`, `get_market_context` |
| CafeF/VnEconomy/VnExpress RSS degraded 1× | 1 consecutive error each | NON-ISSUE — transient; news pipeline SLA ok (last news 7 min ago), all RSS sources active with recent successes |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 7, WORSENING (9082/120min, Q2 window ~7 days away) |
| BUG HIGH | 2 | BUG-2 Reuters 86× dead (0 callers); BUG-3 Trading Economics 86/87× dead (4 callers) |
| BUG MEDIUM | 1 | BUG-4 ISM FRED NAPMBI HTTP 400 (3 callers) |
| BUG LOW | 1 | BUG-5 fb-poster get_sentiment_trend no stock_code (1 caller) |
| ISSUE MEDIUM | 1 | ISSUE-3 cycle stalls (1187 runs, 99.8%) |
| ISSUE LOW | 6 | ISSUE-4/5/6/7/11/NEW-13 (unchanged); ISSUE-NEW-14 NOT REPRODUCED this cycle |
| RESOLVED | 0 | No new resolutions this cycle |
| NON-ISSUE | 5 | Probe param errors; by-design; timing artifacts |

---

## Recommended Actions (priority order — unchanged from prior cycle)

1. **BUG-1 CRITICAL:** SSH VPS → `systemctl status vn-bctc-fetch` + `systemctl restart vn-bctc-fetch`. Call `restart_vps_service("vn-bctc-fetch")` + `trigger_bctc_vps_fetch`. Verify via `get_vps_proxy_health`. **Q2 window in ~7 days.**
2. **BUG-4 MEDIUM:** Confirm `FRED_API_KEY` in container env; fix NAPMBI series ID; monitor 19:13 UTC run today.
3. **BUG-3 HIGH:** Diagnose TE Chromium in container (verify `/usr/bin/chromium`, check IP block); add commodity-delta fallback source.
4. **BUG-2 HIGH:** Disable Reuters RSS source in mcp-server config — 0 callers, 14 noise errors/hour.
5. **BUG-5 LOW:** Fix `docs/agents/fb-market-poster/flow/main.md:118` — add `stock_code` param.
6. **ISSUE-3 MEDIUM:** Add 10s per-source timeout in intelligenceCycleJob.
7. **ISSUE-4 LOW:** Fix BDI/UPCOM/HNX TA scraper gaps.
8. **ISSUE-NEW-13 LOW:** Add market-open grace delay or suppress WARN when VPS foreign-flow healthy.
9. **ISSUE-NEW-14 MONITOR:** Watch next market-open window for SSC HOSE TLS recurrence.
