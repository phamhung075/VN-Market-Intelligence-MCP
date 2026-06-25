# Team MCP Tool Health Recheck — 2026-06-23T00:09Z

**Cycle:** 2026-06-23T00:09Z (UTC Tuesday, post-market / overnight)
**Prior report:** `team-tool-recheck-2026-06-22-2215.md`
**Delta window:** ~1h 54m since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime:** ~4h 6m (restarted 2026-06-22 20:03:15 UTC)

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_system_status` | `{}` | 10 unresolved errors; Reuters+TE 39⚠; sbv 5× REJECTED (21:03–00:03 UTC); 0 open circuits | ✅ REACHABLE |
| `get_cron_health` | `{}` | sbvRatesRefreshJob 98.2%; intelligenceCycleJob 99.8% (27750ms avg); vnstockTradingStatsRefresh 708371ms | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — 41 watchlist prices, 20 open alerts, 10 analyses, elapsed 20ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | VN-Index 1857.91 (+1.83%), breadth 128↑/180↓, turnover 14597 tỷ, VnDirect tier2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | oil $78.17, gold $4208.6, USD/VND 26122; oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null | ✅ REACHABLE (BUG-3 gap) |
| `get_watchlist` | `{}` | 41 tickers returned — prices stale (market closed, expected) | ✅ HEALTHY |
| `get_earnings_calendar` | `{}` | 12 QUÁ HẠN: BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH — unchanged | ⚠ BUG-1 |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy**, 6d 6h 2m; sbv: healthy; news: healthy; price/foreign-flow: idle | ⚠ BUG-1 |
| `get_vps_proxy_health` | `{}` | bctc: STALE=YES, last_push=2026-06-16T18:02:24Z, 0 24h pushes; news/sbv: ok | ⚠ BUG-1 |
| `get_sla_status` | `{}` | bctc: **8842/360min CRITICAL**; price/news/sbv_fx/foreign_flow: ok | ⚠ BUG-1 |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows … requires FRED_API_KEY"}` | ❌ BUG-4 |
| `get_macro_calendar` | `{}` | `{"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}` | ⚠ ISSUE-7 |
| `get_pipeline_health` | `{}` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged | ⚠ ISSUE-4 |
| `get_vn_macro_indicators` | `{}` | IIP all_industry YoY 103.3%; manufacturing 103.39% — fresh | ✅ HEALTHY |
| `get_market_breadth` | `{}` | 128↑/180↓/49→, ceiling 5, floor 3, 14597 tỷ (-22.4%) | ✅ HEALTHY |
| `get_recent_signals` | `{hours_back:24}` | 86 verified_decision signals from alert-engine, all read | ✅ HEALTHY |
| `get_bctc_pending_refine` | `{limit:5}` | 5 PDFs pending/partial: VCB Q1 (PARTIAL), HPG Q4-2025, GVR Q1, HPG Q1, HVN Q1 | ✅ REACHABLE (BUG-1 backlog) |

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health`, `get_earnings_calendar` | unhealthy 6d 6h 2m; 8842/360min; last_push 2026-06-16 (unchanged); 12 QUÁ HẠN | **WORSENING — Day 9, +120min** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 39 ⚠` | UNCHANGED (39 errors ≈ 4h since 20:03 restart) |
| BUG-3 TE dead | `get_system_status` + `get_macro_snapshot` | `Trading Economics \| Ngưng \| Chưa bao giờ \| 39 ⚠` (×2); deltas still null | UNCHANGED |
| BUG-4 ISM no data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"…requires FRED_API_KEY."}` | UNCHANGED |
| ISSUE-1 SBV crash loop | `get_vps_service_health`, system errors | vn-sbv-fetch: healthy; but 5× REJECTED at 21:03–00:03 UTC (ongoing) | ONGOING — errors continue |
| ISSUE-2 open_warnings | `get_system_status` | `open_warnings: 50`, `pending_feedback: 67` | UNCHANGED |
| ISSUE-3 cycle stalls | `get_system_status` + `get_cron_health` | 3 stalls visible: 18:45, 21:30, 22:45 UTC; avg 27750ms | ONGOING |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 | UNCHANGED |
| ISSUE-5 deltas null | `get_macro_snapshot` | oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null | UNCHANGED (BUG-3 linked) |
| ISSUE-6 vnstock slow | `get_cron_health` | vnstockTradingStatsRefresh: 708371ms (11.8min), total_runs=7; vnstockFundamentalsRefresh: 845851ms | IMPROVED slightly (was 845851ms/14.1min for TradingStats in prior) |
| ISSUE-7 macro-calendar | `get_macro_calendar({})` | `{"events":[],"status":"unavailable"}` | UNCHANGED |
| IMPROVE-1 dual timezone | `get_system_status` | Two error sections still show UTC vs UTC+7 timestamps | UNCHANGED |

---

## ACTIVE BUGS — 4 (BUG-1 WORSENING; BUG-2/3/4 unchanged)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 9

**Delta vs prior (22:15):** +120min. Now 8842min (147.4h) vs 360min SLA = **24.6× over SLA**.

| Signal | Prior (22:15) | This Cycle (00:09) | Delta |
|--------|----------|-------|-------|
| vn-bctc-fetch status | unhealthy 6d 3h 57m | **unhealthy 6d 6h 2m** | +2h 5m |
| SLA breach | 8722/360min | **8842/360min** | +120min actual |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change |
| QUÁ HẠN tickers | 12 | 12 | Unchanged |
| 24h pushes | 0 | 0 | No recovery |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 18s ago, 0ms, VPS uptime: 6d 6h 2m`
- `get_sla_status`: `bctc: 8842/360min — breached CRITICAL`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_bctc_pending_refine`: 5 PDFs in queue (VCB Q1 PARTIAL, HPG Q4-2025, GVR Q1, HPG Q1, HVN Q1) — refine backlog accumulating with no new ingest

**Caller-surface (from prior cycle grep, still valid):**
```
grep -r "bctc" docs/agents/*/flow/ --include="*.md" -l
→ bctc-analyst, market-analyst, ops, system-auditor, refine_bctc_md — 5 agent flows
```
**Blast radius: Day 9 CRITICAL. 12 Q1 tickers losing earnings. bctc-analyst cycle aborted for all QUÁ HẠN tickers. refine_bctc_md has no new PDFs.**

**Fix:** `SSH VPS → sudo systemctl restart vn-bctc-fetch.service → verify via get_vps_service_health → trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead

**Re-probe evidence:**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 39 ⚠`
- 39 errors × ~6min = ~234min ≈ 3.9h since 20:03 restart. Source has never succeeded.

**Caller-surface (prior cycle grep):**
```
grep -r "Reuters\|reuters" docs/agents/tools/package/ --include="*.md" -l
→ news-scout.md, unified-agent.md — 2 agent flows
```

**Fix:** Remove/disable the Reuters RSS source record — decommissioned per fix #7 (2026-04-30), stale entry still generating errors.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead

**Re-probe evidence:**
- `get_system_status`: `Trading Economics | Ngưng | Chưa bao giờ | 39 ⚠` (×2 entries)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`

**Caller-surface (prior cycle grep):**
```
grep -r "get_macro_snapshot\|tradingEconomics" docs/agents/tools/package/ --include="*.md" -l
→ market-watcher.md, unified-agent.md, news-scout.md — 3 agent flows
```

**Fix:** Diagnose TE fetcher pre-CB failure path post-restart. Confirm Chromium available in container. Check pre-init failure sequence in fetcher source.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Re-probe evidence:**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- System error: `[get_ism_subcomponents] no ISM data in fred_series_daily` at 22:04 UTC

**Caller-surface (prior cycle grep):**
```
grep -l "get_ism_subcomponents" docs/agents/tools/package/*.md
→ bctc-analyst.md, news-scout.md, unified-agent.md — 3 agent flows
```

**Fix:** Set `FRED_API_KEY` env var (free at fred.stlouisfed.org) → re-run macroIndicatorRefreshJob.

---

## ACTIVE ISSUES — 7

### ISSUE-1 — MEDIUM — ONGOING — SBV Zero-value Push Loop

**Re-probe evidence:**
- `get_system_status` recent errors: 5× `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 21:03, 21:33, 22:03, 22:33, 23:03, 23:33 UTC
- `get_vps_service_health`: vn-sbv-fetch: **healthy**
- `get_vps_proxy_health`: sbv last_push 2026-06-22 23:34:00 — service alive and pushing, but zero-value guard firing every ~30min
- `sbvRatesRefreshJob`: success_rate 98.2%, 55 total runs

**Status:** Service is alive (pushes succeed some cycles), but zero-value guard fires every ~30min. Root cause: SBV source returning 0 for rates intermittently, guard correctly rejecting. However each rejection shows as ERROR in the log, inflating the error tally and masking real errors.

**Fix:** Add startup zero-guard in vn-sbv-fetch: log as WARN not ERROR on zero-value rejection (reduce noise). Investigate SBV source returning 0 rates.

---

### ISSUE-2 — LOW — UNCHANGED — Open Warnings / Pending Feedback

**Re-probe:** `open_warnings: 50 high/critical items` (unchanged from 22:15), `pending_feedback: 67 new items` (unchanged). No progress on clearing warning backlog.

---

### ISSUE-3 — MEDIUM — ONGOING — Intelligence Cycle Concurrency Stalls

**Re-probe evidence:**
- `get_system_status`: `[intelligence-cycle] previous cycle still running — skipped` at 18:45, 21:30, 22:45 UTC (3 stalls in this window, same pattern)
- `get_cron_health`: `intelligenceCycleJob: avg_duration=27750ms (27.75s), success_rate=99.8%, total_runs=1183`

Note: avg 27.75s is well under 15min, so stalls are caused by occasional outlier long-running cycles (>15min), not systematic slowness. Rate 99.8% = ~2 failures in 1183 runs (acceptable) but the 3 stalls today suggest today's cycles are hitting something heavy intermittently.

**Fix:** Add hard 12-min timeout guard in `intelligenceCycleJob.ts` to kill runaway cycles before the next 15-min slot fires.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health`: BDI=0 rows, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged from prior cycles. These tickers have insufficient OHLCV history for RSI14 to be meaningful.

**Caller:** market-watcher cycle.md calls get_pipeline_health to assess TA signal availability.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Price Deltas Null (linked BUG-3)

**Re-probe:** `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves when BUG-3 (Trading Economics) is fixed.

---

### ISSUE-6 — LOW — IMPROVED — vnstock Jobs Slow

**Re-probe:**
- `vnstockTradingStatsRefresh`: avg_duration=708371ms (11.8min), total_runs=7, success_rate=1.00 — **improved** from 845851ms (14.1min) in prior
- `vnstockFundamentalsRefresh`: avg_duration=845851ms (14.1min), total_runs=2 — still very slow

Both jobs run longer than a typical cron slot; vnstockFundamentalsRefresh at 14.1min is at risk of overlapping adjacent crons.

**Fix:** Add per-ticker error isolation + 15-min job timeout guard to prevent overlap.

---

### ISSUE-7 — LOW — UNCHANGED — Macro Calendar Empty (linked BUG-3)

**Re-probe:** `get_macro_calendar({})` → `{"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}`. Auto-resolves with BUG-3.

**Callers confirmed (prior cycle):** `docs/agents/digest-predict/flow/monday.md`, `docs/agents/alert-commander/init.md`

---

## IMPROVE

### IMPROVE-1 — UNCHANGED — Dual Timezone in get_system_status Response

The `get_system_status` tool returns two error log sections in the same response using **different timezones**:
- `--- Recent System Errors (last 10 unresolved) ---` → UTC timestamps (e.g., `2026-06-22 23:34:00`)
- `=== RECENT ERRORS ===` → UTC+7 timestamps (e.g., `[2026-06-23 06:34:00]` for the same event)

This makes errors appear "future-dated" in the second section, confusing agents doing time-based triage. Recommend normalizing both sections to UTC with an explicit `(UTC)` tag.

---

## RESOLVED THIS CYCLE

None. No new resolutions since prior cycle.

Prior-resolved items (carried forward for reference):
- **BUG-6** `get_agent_signals` all-producers null-path — RESOLVED (confirmed 22:15 cycle, remains resolved)

---

## NON-ISSUES — Verified This Cycle

| Item | Evidence | Verdict |
|------|----------|---------|
| VN market closed — prices 15h stale | Last trade 2026-06-22 08:59 UTC; `Trading window: CLOSED` | NON-ISSUE — expected |
| CafeF/VnEconomy/VnExpress RSS 3-error degraded | `Suy giảm | 2 phút trước | 3` each | NON-ISSUE — transient RSS retry |
| newsapi: disabled | 0 errors, intentional | NON-ISSUE — by design |
| vn-price-fetch / vn-foreign-flow idle | Market closed | NON-ISSUE — expected |
| BCTC pending-refine queue (5 PDFs) | VCB/HPG/GVR/HVN in queue — PDFs from before VPS died | NON-ISSUE — refine-bctc_md can still process existing queue |
| Cron jobs all green | 100% success_rate across 60+ cron jobs, only sbvRatesRefreshJob at 98.2% | NON-ISSUE — sbv rate explained by zero-value guard |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 9 (8842/360min, 12 QUÁ HẠN, WORSENING) |
| BUG HIGH | 2 | BUG-2 Reuters dead (39⚠, Day 9+), BUG-3 Trading Economics 2× dead (39⚠, Day 9+) |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY (3 agent flows) |
| ISSUE MEDIUM | 2 | ISSUE-1 SBV zero-value loop (ONGOING), ISSUE-3 intel-cycle stalls (3 today) |
| ISSUE LOW | 5 | ISSUE-2 50 warnings, ISSUE-4 7 tickers TA dead, ISSUE-5 deltas null, ISSUE-6 vnstock slow (improved), ISSUE-7 macro-calendar empty |
| IMPROVE | 1 | IMPROVE-1 dual timezone in get_system_status |
| NON-ISSUE | 6 | Post-market prices, RSS transient, newsapi by-design, VPS idle, refine queue, sbv rate |
| RESOLVED | 0 | No new resolutions this cycle |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → `sudo systemctl restart vn-bctc-fetch.service`** — BUG-1 Day 9 CRITICAL, 12 overdue Q1 tickers. Has been failing for 147.4h. Then `trigger_bctc_vps_fetch` to backfill.
2. **Set `FRED_API_KEY` env var** — BUG-4 free API key, unblocks ISM for 3 agents in under 1 minute.
3. **Remove Reuters RSS source record from DB** — BUG-2, dead decommissioned source generating ~10 errors/hour log noise.
4. **Diagnose TE fetcher pre-CB init failure** — BUG-3, Trading Economics never contacts source after restart. Check Chromium init in container.
5. **Downgrade SBV zero-value rejection from ERROR to WARN** — ISSUE-1, reduces log noise and makes real errors visible.
6. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, kills runaway cycles before 15-min slot fires.
7. **Add per-ticker timeout to vnstock jobs** — ISSUE-6, vnstockFundamentalsRefresh at 14.1min risks cron overlap.
8. **Normalize get_system_status to UTC throughout** — IMPROVE-1, eliminates false "future" timestamps confusing agents.
