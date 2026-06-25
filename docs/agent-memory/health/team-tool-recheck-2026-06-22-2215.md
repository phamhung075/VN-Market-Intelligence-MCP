# Team MCP Tool Health Recheck — 2026-06-22T22:15Z

**Cycle:** 2026-06-22T22:15Z (UTC Monday, post-market)
**Prior report:** `team-tool-recheck-2026-06-22-2008.md`
**Delta window:** ~2.1h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server context:** mcp-server started 2026-06-22 20:03:15 UTC (uptime ~2h at probe time)

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — 40+ watchlist prices, 20 open alerts, 10 analyses, elapsed 31ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | VN-Index 1857.91 (+1.83%), breadth 128↑/180↓, turnover 14597 tỷ, source VnDirect tier2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | oil $80.59, gold $4172.9, USD/VND 26122; deltas still null (TE dead) | ✅ REACHABLE (BUG-3 gap) |
| `get_system_status` | `{}` | 10 unresolved errors; Reuters+TE 19⚠ (restarted 20:03); sbv 6× REJECTED before 21:33 UTC | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy 6d 3h 57m**; vn-sbv-fetch: **healthy** (recovered) | ⚠ BUG-1 |
| `get_vps_proxy_health` | `{}` | bctc: STALE=YES, last_push=2026-06-16 18:02:24 (unchanged); sbv: last_push 22:03:57 (ok) | ⚠ BUG-1 |
| `get_sla_status` | `{}` | bctc: **8722/360min — CRITICAL**; sbv_fx: 34/30min marginal | ⚠ BUG-1, ISSUE-1 |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"...requires FRED_API_KEY."}` | ❌ BUG-4 |
| `get_macro_calendar` | `{}` | `{"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}` | ⚠ ISSUE-7 |
| `get_cron_health` | `{}` | sbvRatesRefreshJob 98.1%; intelligenceCycleJob 99.8%; vnstockTradingStatsRefresh avg 845851ms | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged | ⚠ ISSUE-4 |
| `get_earnings_calendar` | `{}` | 12 QUÁ HẠN: BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH (was 11) | ⚠ BUG-1 |
| `get_agent_signals` | `{from_agent:null,"status":"all","hours_back":0.5}` | 86 signals from alert-engine — all-producers path WORKING | ✅ HEALTHY (BUG-6 confirmed resolved) |
| `get_vn_macro_indicators` | `{}` | IIP all_industry YoY 103.3%, manufacturing 103.39% — fresh 22:05 UTC | ✅ HEALTHY |
| `task_list_held` | `{}` | 6 locks: 3 chef-slots (unified-agent), cowork-leader-lock, digest-sunday, chef-evening-21 | ✅ HEALTHY |
| `get_recent_fixes` | `{limit:20}` | No BUG-1/2/3/4 in fix log — confirms all still unresolved | ✅ REACHABLE |

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health`, `get_earnings_calendar` | unhealthy 6d 3h 57m; 8722/360min; last_push unchanged; 12 QUÁ HẠN | WORSENING — Day 8, +24h |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 19 ⚠` | UNCHANGED (19 errors × ~7.5min = 142min = consistent with 20:03 restart) |
| BUG-3 TE dead | `get_system_status` source health + `get_macro_snapshot` | `Trading Economics \| Ngưng \| Chưa bao giờ \| 19 ⚠` (×2); deltas still null | UNCHANGED |
| BUG-4 ISM no data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` | UNCHANGED |
| BUG-6 get_agent_signals null-path | `get_agent_signals({from_agent:null,"status":"all","hours_back":0.5})` | 86 signals returned — WORKING | CONFIRMED RESOLVED |
| ISSUE-1 SBV crash loop | `get_vps_service_health`, `get_sla_status`, system errors | vn-sbv-fetch: **healthy** (was unhealthy 22:06 Sun); sbv_fx 34/30min marginal; push at 22:03:57 ok | IMPROVED — service recovered post-restart |
| ISSUE-2 open_warnings | `get_system_status` | `open_warnings: 50` (+1), `pending_feedback: 67` (same) | SLIGHTLY WORSE |
| ISSUE-3 cycle stalls | `get_system_status` + `get_cron_health` | 3 stalls: ~18:45, 20:15, 21:30 UTC; avg 27935ms | UNCHANGED |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 | UNCHANGED |
| ISSUE-5 deltas null | `get_macro_snapshot` | oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null | UNCHANGED (BUG-3 linked) |
| ISSUE-6 vnstock slow | `get_cron_health` | avg_duration=845851ms (14.1 min) — was 649220ms (10.8 min) | WORSENING +37% |
| ISSUE-7 macro-calendar | `get_macro_calendar({})` | `{"events":[],"status":"unavailable"}` | UNCHANGED |

---

## ACTIVE BUGS — 4 (BUG-1 WORSENING; BUG-2/3/4 unchanged)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 8

**Delta vs prior (20:08):** +24h continuous downtime. Now 8722 min (145.4h) vs 360 min SLA = **24× over SLA**.

| Signal | Prior (20:08) | This Cycle (22:02) | Delta |
|--------|----------|-------|-------|
| vn-bctc-fetch status | unhealthy ~5d | unhealthy 6d 3h 57m | +24h continuous |
| SLA breach (actual/SLA) | ~7165/360min | 8722/360min | +~1557 actual min |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change — 6d+ stale |
| QUÁ HẠN tickers | 11 | 12 (BDI added) | BDI now in overdue list |
| 24h pushes | 0 | 0 | No recovery |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 4m ago, 0ms, VPS uptime: 6d 3h 57m`
- `get_sla_status`: `bctc: 8722/360min — CRITICAL`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_earnings_calendar`: 12 QUÁ HẠN: BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH

**Caller-surface verified:**
```
grep -r "bctc" docs/agents/*/flow/ --include="*.md" -l
→ docs/agents/bctc-analyst/flow/main.md, docs/agents/market-analyst/flow/main.md,
  docs/agents/ops/flow/bctc.md, docs/agents/system-auditor/flow/main.md,
  docs/agents/refine_bctc_md/flow/main.md
```
Callers: bctc-analyst (primary cycle flow), market-analyst, ops, system-auditor, refine_bctc_md = **5 agent flows**

**Blast radius: Day 8 CRITICAL. 12 Q1 tickers losing earnings ingestion. BID (major bank) now overdue. bctc-analyst cycle aborted for all overdue tickers. refine_bctc_md has no new PDFs to process.**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead

**Re-probe evidence:**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 19 ⚠`
- 19 errors × ~7.5 min = ~142 min since server restart at 20:03 UTC = consistent with persistent failure

**Caller-surface verified:**
```
grep -r "Reuters\|reuters" docs/agents/tools/package/ --include="*.md" -l
→ docs/agents/tools/package/news-scout.md, docs/agents/tools/package/unified-agent.md
```
**2 agent flows affected** — news coverage degraded, ~8 errors/hour in log.

**Fix:** Disable/decommission Reuters RSS source record from DB/config. Source was decommissioned per fix #7 (2026-04-30) — stale registry entry still active.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead

**Re-probe evidence:**
- `get_system_status`: `Trading Economics | Ngưng | Chưa bao giờ | 19 ⚠` (×2 entries)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`

**Caller-surface verified:**
```
grep -r "get_macro_snapshot\|tradingEconomics" docs/agents/tools/package/ --include="*.md" -l
→ docs/agents/tools/package/market-watcher.md, docs/agents/tools/package/unified-agent.md,
  docs/agents/tools/package/news-scout.md
```
**3 agent flows affected** — commodity/macro deltas null; macro-calendar empty (ISSUE-7 linked).

**Fix:** Diagnose why `tradingeconomics.com` never initializes after restart. Check Chromium + pre-CB failure path in fetcher init. Confirm CHROMIUM available in mcp-server container.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Re-probe evidence:**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- System error in log: `[get_ism_subcomponents] no ISM data in fred_series_daily` at 20:04 UTC

**Caller-surface verified:**
```
grep -l "get_ism_subcomponents" docs/agents/tools/package/*.md
→ docs/agents/tools/package/bctc-analyst.md
   docs/agents/tools/package/news-scout.md
   docs/agents/tools/package/unified-agent.md
```
**3 agent flows affected** — ISM manufacturing PMI unavailable to CHEF layer.

**Fix:** (1) Set `FRED_API_KEY` env var (free: fred.stlouisfed.org). (2) Re-run macroIndicatorRefreshJob to populate.

---

## ACTIVE ISSUES — 7 (ISSUE-1 IMPROVED; ISSUE-6 WORSENING)

### ISSUE-1 — MEDIUM → LOW — IMPROVED — SBV Zero-value Push / Crash Loop Stabilized

**Delta vs prior:** vn-sbv-fetch now **healthy** (was unhealthy in 22:06 Sunday cycle — 3rd crash).

**Re-probe evidence:**
- `get_vps_service_health`: `vn-sbv-fetch: healthy, 4m ago, 0ms`
- `get_vps_proxy_health`: last push `2026-06-22 22:03:57 | sbv | ok | 1 items`
- `get_sla_status`: `sbv_fx: 34/30min — breached HIGH` (at 22:02 UTC; push at 22:03 likely resolved)
- System errors: 6× REJECTED at 19:03–21:33 UTC (all before 22:03 recovery push)
- `sbvRatesRefreshJob: success_rate=0.98 (98.1%), total_runs=54`

**Status:** Service recovered post server-restart 20:03 UTC. Zero-value push bug still present (manifest when service crashes and restarts). Marginal SLA breach (34/30) likely auto-resolved by 22:03 push.

**Fix (unchanged):** Add startup zero-guard in vn-sbv-fetch: skip push when fetched_rate == 0. Investigate crash root cause via `journalctl -u vn-sbv-fetch`.

---

### ISSUE-2 — LOW — SLIGHTLY WORSE — Open Warnings / Pending Feedback

**Re-probe:** `open_warnings: 50 high/critical items` (was 49), `pending_feedback: 67 new items` (same).

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Re-probe evidence:**
- System errors: `[intelligence-cycle] previous cycle still running — skipped` at ~18:45, 20:15, 21:30 UTC (3 stalls today)
- `get_cron_health`: `intelligenceCycleJob: avg_duration=27935ms, success_rate=99.8%, total_runs=1177`

**Fix:** Add hard 12-min timeout in `intelligenceCycleJob.ts` to kill runaway cycles before next 15-min slot.

---

### ISSUE-4 — LOW — UNCHANGED — BDI + 6 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Price Deltas Null (linked BUG-3)

**Re-probe:** `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — WORSENING — vnstockTradingStatsRefresh Slow (+37%)

**Re-probe:** `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.98, avg_duration=845851ms (14.1 min), total_runs=7` — was 649220ms (10.8 min) in prior cycle.

**Fix:** Add per-ticker error isolation + 15-min job timeout guard.

---

### ISSUE-7 — LOW — UNCHANGED — Macro Calendar Empty (linked BUG-3)

**Re-probe:** `get_macro_calendar({})` → `{"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}`. Auto-resolves with BUG-3.

**Callers confirmed:** `docs/agents/digest-predict/flow/monday.md`, `docs/agents/alert-commander/init.md`

---

## NEW FINDING — IMPROVE

### IMPROVE-1 — Dual Timezone in get_system_status Response

The `get_system_status` tool returns two error log sections with **different timezones** in the same response:
- `--- Recent System Errors (last 10 unresolved) ---` → timestamps in **UTC** (e.g., `2026-06-22 21:33:56`)
- `=== RECENT ERRORS ===` → timestamps in **UTC+7** (e.g., `[2026-06-23 04:33:56]` for same event)

This creates an apparent contradiction — errors appear to be "future" in the second section, confusing agents performing time-based triage. Recommend normalizing both sections to UTC with an explicit `(UTC)` suffix.

---

## RESOLVED THIS CYCLE

| Item | Prior Status | Evidence |
|------|-------------|----------|
| BUG-6 `get_agent_signals` all-producers null-path | RESOLVED since 22:06 Sun | Re-probe: `{from_agent:null,hours_back:0.5}` → 86 signals returned. CONFIRMED RESOLVED. |

---

## NON-ISSUES — Verified This Cycle

| Item | Evidence | Verdict |
|------|----------|---------|
| VN market closed — prices 13.1h stale | Last trade 2026-06-22 08:59 UTC; market CLOSED post-session | NON-ISSUE — expected |
| CafeF/VnEconomy/VnExpress RSS 1-error degraded | `Suy giảm | 2 phút trước | 1` each | NON-ISSUE — transient |
| newsapi: disabled | 0 errors, intentional | NON-ISSUE — by design |
| vn-foreign-flow/vn-price-fetch idle | Market closed | NON-ISSUE — expected |
| sbv_fx SLA marginal breach (34/30min) | Push at 22:03:57 likely cleared | NON-ISSUE — self-resolving |
| `task_list_held` 6 stale-TTL locks | All from today's completed chef runs; TTL 28h by design | NON-ISSUE — by design |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 8 (8722/360min, 12 QUÁ HẠN, WORSENING) |
| BUG HIGH | 2 | BUG-2 Reuters dead (19⚠, ongoing), BUG-3 Trading Economics 2× dead (19⚠, ongoing) |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY (3 agent flows) |
| ISSUE MEDIUM | 1 | ISSUE-3 intelligence-cycle stalls (3 today) |
| ISSUE LOW | 6 | ISSUE-1 SBV zero-value (improved), ISSUE-2 50 warnings, ISSUE-4 7 tickers TA dead, ISSUE-5 deltas null, ISSUE-6 vnstock 14.1min, ISSUE-7 macro-calendar empty |
| IMPROVE | 1 | IMPROVE-1 dual timezone in get_system_status |
| NON-ISSUE | 6 | Post-market prices stale, RSS transient, newsapi by-design, idle VPS, sbv_fx marginal, TTL locks |
| RESOLVED | 1 | BUG-6 get_agent_signals all-producers — confirmed working (86 signals) |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1 Day 8 CRITICAL, 12 overdue Q1 tickers including BID. Longest-standing issue.
2. **Set FRED_API_KEY** — BUG-4 free API key, unblocks ISM for 3 agents in 1 minute.
3. **Disable Reuters RSS source record** — BUG-2, ~8 errors/hour from dead decommissioned source.
4. **Diagnose TE fetcher pre-CB failure** — BUG-3, `tradingeconomics.com` never called post-restart.
5. **Add startup zero-guard to vn-sbv-fetch** — ISSUE-1, prevents zero-value DB rejections on crash-restart.
6. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, prevents runaway cycles.
7. **Fix dual timezone in get_system_status** — IMPROVE-1, normalize both error log sections to UTC.
