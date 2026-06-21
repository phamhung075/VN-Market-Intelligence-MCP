# Team MCP Tool Health Recheck — 2026-06-21T10:06Z

**Cycle:** 2026-06-21T10:06Z (UTC Saturday, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-0806.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Latency | Status |
|------|-------------|--------|---------|--------|
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — signals, market_context returned | <2s | ✅ HEALTHY |
| `get_system_status` | `{}` | OK — 49 warnings, BCTC/Reuters/TE dead | <2s | ✅ REACHABLE |
| `get_sla_status` | `{}` | OK — bctc 6562/2975min breach | <2s | ✅ REACHABLE |
| `get_vps_proxy_health` | `{}` | OK — bctc STALE since 2026-06-16 18:02 | <2s | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | OK — vn-bctc-fetch unhealthy 4d16h | <2s | ✅ REACHABLE |
| `get_cron_health` | `{}` | OK — bctcReparse 100%, vnstockTrading 85.7% | <2s | ✅ REACHABLE |
| `get_rate_limit_status` | `{}` | OK — tradingeconomics "Chua goi" | <2s | ✅ REACHABLE |
| `get_market_snapshot` | `{}` | OK — VN-Index, foreign flow returned | <2s | ✅ HEALTHY |
| `get_watchlist` | `{}` | OK — watchlist tickers returned | <2s | ✅ HEALTHY |
| `get_agent_signals` | `{from_agent:null,status:"all",hours_back:1}` | OK — signals returned | <2s | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oilUsdDelta:null, goldUsdDelta:null | <2s | ✅ REACHABLE (data gap) |
| `get_ism_subcomponents` | `{}` | ERROR — no_data, FRED_API_KEY missing | <1s | ❌ BUG |
| `get_fed_liquidity_spread` | `{}` | OK — EFFR-IORB spread returned | <2s | ✅ HEALTHY |
| `task_list_held` | `{expired:true}` | OK — `{"locks":[],"count":0}` | <1s | ✅ HEALTHY |
| `get_market_context` | `{}` | OK — trading_window returned | <2s | ✅ HEALTHY |
| `get_insider_signals` | `{}` | OK — insider activity returned | <2s | ✅ HEALTHY |
| `get_open_chain_findings` | `{}` | OK — chain findings returned | <2s | ✅ HEALTHY |
| `get_legal_risk_signals` | `{}` | OK — legal signals returned | <2s | ✅ HEALTHY |
| `get_crisis_early_warning` | `{}` | OK — crisis signals returned | <2s | ✅ HEALTHY |
| `get_sector_rotation` | `{}` | OK — sector leaders/laggards returned | <2s | ✅ HEALTHY |
| `get_earnings_calendar` | `{}` | OK — filing deadlines returned | <2s | ✅ HEALTHY |
| `get_prediction_markets` | `{}` | OK — accuracy metrics returned | <2s | ✅ HEALTHY |
| `get_signal_effectiveness` | `{}` | OK — agent accuracy returned | <2s | ✅ HEALTHY |
| `get_alert_accuracy` | `{}` | OK — false positive rate returned | <2s | ✅ HEALTHY |
| `get_positions` | `{}` | OK — portfolio positions returned | <2s | ✅ HEALTHY |
| `get_portfolio_risk` | `{}` | OK — VaR returned | <2s | ✅ HEALTHY |
| `search_similar_context` | `{query:"test",context:{},limit:1}` | OK — matches returned | <2s | ✅ HEALTHY |
| `list_stored_pdfs` | `{}` | OK — PDF list returned (stale, no new since BCTC dead) | <2s | ✅ REACHABLE |
| `get_recent_fixes` | `{limit:10}` | OK — fix list returned | <2s | ✅ HEALTHY |
| `get_pipeline_health` | `{}` | OK — pipeline status returned | <2s | ✅ REACHABLE |
| `get_investment_clock_phase` | `{}` | OK — clock phase returned | <2s | ✅ HEALTHY |

---

## ACTIVE BUGS (4 re-confirmed)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 5+

**Status vs prior (08:06):** UNCHANGED / WORSENING (+120 min SLA breach growth)

| Signal | 08:06 | 10:06 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch uptime (unhealthy) | 4d 13h 57m | 4d 16h 2m | +2h5m |
| SLA breach (actual/target min) | 6442/2855 | 6562/2975 | +120/+120 |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change |

**Evidence:**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, uptime=4d 16h 2m`
- `get_sla_status`: bctc SLA breach = 6562 min actual vs 2975 min target = **2.21× over SLA**
- `get_vps_proxy_health`: `bctc proxy: last_push=2026-06-16T18:02:24Z, STALE=YES`
- `list_stored_pdfs`: PDF catalog frozen at 2026-06-16 entries

**Callers (Step 3b grep confirmed):**
1. `docs/agents/tools/package/bctc-analyst.md` — `get_bctc_full`, `get_bctc_ocf`, `list_stored_pdfs`, `list_flagged_bctc_cells`
2. `docs/agents/bctc-analyst/flow/main.md` — ESC-5 uses `get_bctc_refined`
3. `apps/mcp-server/src/scheduler/bctcReparseJob.ts` — cron processes BCTC PDFs
4. `apps/mcp-server/src/scheduler/bctcPdfPull.ts` — cron pulls from VPS proxy
5. `apps/mcp-server/src/scheduler/bctcQueueEnricher.ts` — enriches BCTC queue
**Blast radius: 5 callers — all BCTC analysis stalled**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify healthy → run `trigger_bctc_vps_fetch` to backfill

---

### BUG-2 — HIGH — WORSENING — Reuters RSS Dead

**Status vs prior (08:06):** WORSENING (53 → 73 failures, +20 in 2h)

**Evidence:**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 73 ⚠`
- Source never returns data; failure counter incrementing ~10/h

**Callers (Step 3b):**
1. `docs/agents/tools/package/news-scout.md` — `fetch_and_analyze` depends on news sources
2. `docs/agents/tools/package/unified-agent.md` — news aggregation pipeline
**Blast radius: 2 agent pipelines + news quality degraded**

**Context:** Per `get_recent_fixes` fix #7 (2026-04-30), `vn-reuters-fetch.service` was decommissioned. The source record was not cleaned up — still generating failure log noise.

**Fix:** Remove or disable Reuters RSS source record in data configuration to stop counter accumulation. No service restart needed — service intentionally decommissioned.

---

### BUG-3 — HIGH — WORSENING — Trading Economics 2× Dead

**Status vs prior (08:06):** WORSENING (53 → 73 failures each, +20 each in 2h)

**Evidence:**
- `get_system_status`: Both TE instances show `Ngưng | Chưa bao giờ | 73 ⚠`
- `get_rate_limit_status`: `tradingeconomics.com: Chua goi` — circuit breaker stopped all calls
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null, oilUsdDirection:"unknown"`

**Callers (Step 3b):**
1. `docs/agents/tools/package/market-watcher.md` — uses `get_macro_snapshot`
2. `docs/agents/tools/package/unified-agent.md` — uses `get_macro_snapshot`
3. `docs/agents/tools/package/news-scout.md` — uses `get_macro_snapshot`
**Blast radius: 3 agents; commodity/macro data null for all analysis**

**Fix:** Per fix #6 (2026-04-30), Chromium 147 installed in mcp-server. Verify still present: `docker exec <ctr> chromium --version`. If missing, reinstall. If present, check TE scraper for site structure change.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data

**Status vs prior (08:06):** UNCHANGED

**Evidence:**
- `get_ism_subcomponents`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_cron_health`: `macroIndicatorRefreshJob: success_rate=1.00 (100%), last_run=2026-06-21 19:13` — job runs but produces no ISM rows (FRED_API_KEY absent)

**Callers (Step 3b grep confirmed):**
1. `docs/agents/tools/package/bctc-analyst.md` — `get_ism_subcomponents`
2. `docs/agents/tools/package/news-scout.md` — `get_ism_subcomponents`
3. `docs/agents/tools/package/unified-agent.md` — `get_ism_subcomponents`
**Blast radius: 3 agent packages — US monetary chain analysis unavailable**

**Fix:** Set `FRED_API_KEY` in production `.env` (free key from fred.stlouisfed.org). Then run `macroIndicatorRefreshJob` manually to backfill ISM series.

---

## ACTIVE ISSUES (5)

### ISSUE-1 — MEDIUM — PARTIALLY RESOLVED — SBV Zero-Value Rejection Loop

**Status vs prior (08:06):** PARTIAL IMPROVEMENT — vn-sbv-fetch back to HEALTHY (was UNHEALTHY 44min at 08:06)

- `get_vps_service_health`: `vn-sbv-fetch: healthy` ✅
- `get_system_status` log window: `storeSbvSnapshot REJECTED` at 10:02, 09:32, 09:02, 08:32, 08:02 UTC — fires every 30 min (every VPS push)
- **Root cause:** VCB XML API returns zeros outside business hours (~07:00-17:00 VN time). Guard correctly blocks zero-writes. Data quality unaffected — `sbv_fx age: 19 min` (fresh). Two-layer guard working as designed (sbvRatesJob.ts pre-flight + sbv.ts:storeSbvSnapshot independent check).
- **Noise impact:** 48 rejection log entries/day; WORK channel alert every occurrence
- **Fix:** Add off-hours skip gate in VPS push handler or SBV fetch script. Reduce SBV push cadence to VN business hours only.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback

**Status vs prior (08:06):** UNCHANGED

- `get_system_status`: `open_warnings: 49 high/critical`, `pending_feedback: 67`
- No new high/critical warnings added this cycle (count unchanged)
- **Fix:** Run `get_alerts` to triage and dismiss stale warnings; review pending_feedback queue.

---

### ISSUE-3 — LOW — IMPROVED — bctcReparseJob 100%

**Status vs prior (08:06):** IMPROVED (97% → 100%, 67 → 61 runs in window)

- `get_cron_health`: `bctcReparseJob: success_rate=1.00, total_runs=61`
- Note: total_runs decreased (67→61) as 7-day window rolled off some older failures — improvement is real
- **No action needed.** Monitoring only.

---

### ISSUE-4 — MEDIUM — UNCHANGED — Intelligence Cycle Stalls

**Status vs prior (08:06):** UNCHANGED

- `get_system_status` recent errors: 3 intelligence-cycle skips at 07:15, 08:30, 09:45 UTC visible
- `intelligenceCycleJob: avg_duration=28,433ms` (28.4s) — avg healthy but spikes to 15+ min cause concurrency skip
- Module-level flag blocks new runs while prior cycle in flight
- **Fix:** Add hard 12-min timeout in `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts` to cap runaway cycles. Log + alert on timeout.

---

### ISSUE-5 — LOW — NOT RE-PROBED — BDI Shipping Data Stale

**Status vs prior (08:06):** NOT DIRECTLY RE-PROBED THIS CYCLE (Step 3c flag)

- Prior evidence: BDI data as of 2026-04-07 (75 days stale), Yahoo Finance `^BDI` returning 404
- `commodityTrackerRefreshJob: last_run=2026-06-21 06:00:01, success` — ran this morning
- `get_supply_chain_exposure` was NOT called this cycle to verify BDI freshness
- **Carry forward with caveat:** ISSUE-5 status unconfirmed for this cycle.
- **Fix:** Investigate alternate BDI source. `^BDI` Yahoo Finance ticker is broken; try Baltic Exchange official API or quandl/OECD alternative.

---

### ISSUE-6 — LOW — CONFIRMED — Commodity Price Deltas Null

**Status vs prior (08:06):** CONFIRMED (directly linked to BUG-3 TE dead)

- `get_macro_snapshot`: `"oilUsdDelta":null,"goldUsdDelta":null,"usdVndDelta":null,"oilUsdDirection":"unknown"`
- Will auto-resolve when BUG-3 (Trading Economics) is fixed. No independent fix needed.

---

## RESOLVED THIS CYCLE

| Item | Prior Status | Resolution |
|------|-------------|------------|
| Orphan lock `esc-datacov:FPT:Q1-2026:ESC-3` | ACTIVE (held 08:06) | `task_list_held({expired:true})` → `{"locks":[],"count":0}` — expired naturally |
| vn-sbv-fetch restart loop | UNHEALTHY 44min (08:06) | Back to HEALTHY at 10:03 UTC — restart loop ended |

---

## IMPROVE (Unchanged)

| ID | Item | Caller Impact | Priority |
|----|------|--------------|----------|
| IMPROVE-1 | `get_price_history` docs say `ticker` but live tool uses `code` — doc/schema mismatch | 0 runtime callers affected | Low |
| IMPROVE-2 | `get_bctc_pending_refine` has no default limit cap — can return unbounded results | 0 runtime callers affected (refine_bctc_md uses limit:1 explicitly) | Low |
| IMPROVE-3 | `vnstockTradingStatsRefresh` at 85.7% success (1/7 fail in window; 10.8 min avg) — above 80% alert threshold, no alert yet | 1 cron job, no agent callers | Low |

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead day 5+ |
| BUG HIGH | 2 | BUG-2 Reuters RSS, BUG-3 TE 2× dead |
| BUG MEDIUM | 1 | BUG-4 ISM no_data |
| ISSUE HIGH | 1 | ISSUE-2 49 warnings / 67 feedback |
| ISSUE MEDIUM | 2 | ISSUE-1 SBV rejection noise, ISSUE-4 cycle stalls |
| ISSUE LOW | 3 | ISSUE-3 bctcReparse 100% (monitoring), ISSUE-5 BDI (not re-probed), ISSUE-6 commodity deltas null |
| RESOLVED | 2 | Orphan lock expired, vn-sbv-fetch restart loop ended |
| IMPROVE | 3 | Doc drift, no-cap tool, cron 85.7% |

**Recommended immediate actions (priority order):**
1. SSH VPS → restart `vn-bctc-fetch.service` (BUG-1, day 5+, CRITICAL)
2. Set `FRED_API_KEY` in `.env` (BUG-4, free, unblocks ISM for 3 agents)
3. Remove stale Reuters RSS source record (BUG-2, eliminates log noise)
4. Check Chromium in mcp-server container (BUG-3, macro/commodity data null for all agents)
