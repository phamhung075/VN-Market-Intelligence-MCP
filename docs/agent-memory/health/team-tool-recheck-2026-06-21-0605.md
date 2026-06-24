# Team MCP Tool Recheck — 2026-06-21 06:05 UTC

**Run by:** health-recheck agent  
**Gateway:** vn-market reachable ✅  
**Probe window:** 2026-06-21 ~06:00–06:07 UTC (VN market CLOSED — off-hours weekend run)  
**Prior report:** `team-tool-recheck-2026-06-21-0406.md`  
**STEP 3c:** All prior findings re-probed this cycle before classification.

---

## Summary

| Class | Count | Worst severity |
|-------|-------|----------------|
| BUG   | 5     | CRITICAL (BCTC pipeline dead — day 5, SLA 2.4×) |
| ISSUE | 7     | HIGH (SBV rejection log noise; 49 open warnings) |
| IMPROVE | 3   | LOW–MEDIUM |
| RESOLVED | 0  | — |

---

## RESOLVED (no longer reproduce)

_None this cycle. All prior findings re-confirmed._

---

## ACTIVE FINDINGS

### BUG-1 — CRITICAL: BCTC pipeline dead (day 5+), SLA breached 2.4× — UNCHANGED

| Field | Value |
|-------|-------|
| Tools | `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status` |
| Evidence (re-confirmed 06:03 UTC) | `vn-bctc-fetch: unhealthy` (VPS uptime 4d 11h 57m). bctc proxy last push `2026-06-16 18:02` (5+ days). `get_sla_status` → **bctc 6322 min / 2735 min SLA → CRITICAL breach 2.4×**. `get_bctc_pending_refine(limit:1)` confirms queue active (VCB Q1-2025 PARTIAL status). |
| Delta vs prior | Unchanged — SLA age grew from 6202→6322 min (+120 min = 2h gap since last cycle). No fix has landed. |
| Caller count | bctc-analyst, refine_bctc_md, cron:bctcReparseJob, cron:bctcPdfPull, cron:bctcQueueEnricher — **5 callers** |
| Impact | No new BCTC PDFs since June 16. Q1-2026 earnings window: 11 tickers QUÁ HẠN (BID, GAS, DAG, DLC, PLX, PPC, SIS, VDC, VEA, VNH, JSH). Pending-refine queue stuck. bctcReparseJob 94.4% (linked). |
| Suggested fix | SSH VPS → `sudo systemctl restart vn-bctc-fetch.service`. Verify with `get_vps_service_health`. Then call `trigger_bctc_vps_fetch` to flush queue. If still unhealthy: `journalctl -u vn-bctc-fetch -n 100` to inspect crash reason. |

---

### BUG-2 — HIGH: Reuters RSS — persistent, never succeeded — UNCHANGED

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Source Health |
| Evidence (re-confirmed) | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 37 ⚠` (failure count grew from 18→37 since prior cycle; server started ~2026-06-16). Root issue unchanged. |
| Delta vs prior | Failure count 18→37 — error accumulating, no fix. |
| Caller count | news-scout pipeline, unified-agent (international macro context) — **2 agent pipelines** |
| Impact | International Reuters coverage permanently dark. Macro/geopolitical signal quality reduced. |
| Suggested fix | Verify Reuters RSS URL alive. Reuters restructured RSS in 2024; prior fix (#7, 2026-04-30) decommissioned `vn-reuters-fetch.service` but direct RSS source record not cleaned up → dead source generating log noise. Remove/disable Reuters RSS source record in mcp-server config. |

---

### BUG-3 — HIGH: Trading Economics 2× dead — UNCHANGED

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Source Health |
| Evidence (re-confirmed) | 2 TE instances: `Trading Economics \| Ngưng \| Chưa bao giờ \| 37 ⚠` each. Failure count 18→37 since prior report. |
| Delta vs prior | Failure count grew; no fix. |
| Caller count | `get_macro_snapshot` (market-watcher, unified-agent), `get_vn_macro_indicators`, macro-health-read skill — **3+ agents** |
| Impact | `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null, oilUsdDirection: "unknown"` in `get_macro_snapshot` (re-confirmed this cycle). Macro regime direction signals degraded. |
| Suggested fix | Check Chromium presence in mcp-server container: `docker exec <mcp-ctr> chromium --version`. If missing: rebuild with Dockerfile. If present: check TE Cloudflare/IP block status. |

---

### BUG-4 — HIGH: ISM subcomponent data absent (FRED_API_KEY unset) — UNCHANGED

| Field | Value |
|-------|-------|
| Tool | `get_ism_subcomponents` |
| Evidence (re-confirmed 06:05 UTC) | `{"error": "no_data", "message": "fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — identical to prior. |
| Delta vs prior | Unchanged. `macroIndicatorRefreshJob` ran 2026-06-20 12:13 UTC (success 100%) but ISM rows still empty → FRED_API_KEY absent in env. |
| Caller count | news-scout, bctc-analyst, unified-agent — **3 agents** (per tool package docs) |
| Impact | ISM Manufacturing PMI sub-components unavailable — macro regime classification missing one key US cycle indicator. |
| Suggested fix | Check `.env` for `FRED_API_KEY`. If absent: obtain free key at fred.stlouisfed.org. If present: inspect `macroIndicatorRefreshJob` log for FRED-specific fetch error path. |

---

### BUG-5 (NEW) — MEDIUM: shippingIndex HTTP 404 — dead Yahoo Finance endpoint

| Field | Value |
|-------|-------|
| Tool / Source | `shippingIndex` fetcher → `get_supply_chain_exposure`, `commodityTrackerRefreshJob` |
| Evidence (new this cycle) | 4 WARN entries in `get_system_status` recent errors: `[shippingIndex] HTTP request failed — Request failed with status code 404` (all at 06:00:01–06:00:02 UTC). Source file: `apps/mcp-server/src/infrastructure/fetchers/shippingIndex.ts` fetches `^BDI`/`^BFIY` from Yahoo Finance chart API. |
| Delta vs prior | Not reported in prior cycle; 404 errors new this cycle. |
| Caller count | `get_supply_chain_exposure` (1 MCP tool, market-watcher package); `commodityTrackerRefreshJob` (cron) — **1 tool + 1 cron** |
| Probe | `grep -r "shippingIndex" apps/mcp-server/src/interface/mcp/tools/` → 1 file: `supplyChainTools.ts`. Grep on fetcher: `apps/mcp-server/src/infrastructure/fetchers/shippingIndex.ts` uses `YAHOO_FINANCE_API_URL` base → `query1.finance.yahoo.com/v8/finance/chart`. 404 suggests symbol `^BDI` or API path changed. |
| Suggested fix | Test Yahoo Finance `^BDI` URL directly: `curl "https://query1.finance.yahoo.com/v8/finance/chart/%5EBDI?range=1d"`. If 404 try `v10` endpoint. Update `YAHOO_FINANCE_API_URL` env or `shippingIndex.ts` URL pattern if Yahoo restructured. |

---

## ISSUES (degraded / not broken)

### ISSUE-1 — MEDIUM: SBV zero-value rejection guard firing every 30 min — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | 3 ERROR entries in recent logs: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 05:02, 05:32, 06:02 UTC. `vn-sbv-fetch` shows **UNHEALTHY** (VPS uptime 1h 15m = recently restarted but still returning zero). sbvRatesRefreshJob success_rate: 98.1%. |
| Impact | Data PROTECTED — rejection guard working. SBV FX rates still fresh (`get_sla_status` sbv_fx age: 4 min = OK). Root cause: VCB XML API returning 0 for FX fields in off-hours. Generates misleading ERROR-level noise. |
| Suggested fix | Add off-hours skip in `sbvRatesRefreshJob.ts`: if UTC hour ∉ [0–10] (VN business hours window), suppress write attempt. Or downgrade rejection log ERROR→WARN when zero-value received outside business hours. |

---

### ISSUE-2 — HIGH: 49 open warnings / 67 pending feedback — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `get_system_status` → `open_warnings: 49 high/critical`, `pending_feedback: 67`. Same count as prior cycle (was trending +2/+2 per prior report; now flat). Last daily audit: 2026-06-20 16:00 UTC. |
| Impact | Accumulated unreviewed signals and feedback. |
| Suggested fix | Dispatch `system-auditor` Tier-2 sweep to drain feedback and close resolved warnings. |

---

### ISSUE-3 — LOW: bctcReparseJob 94.4% success rate (linked to BUG-1) — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `bctcReparseJob: success_rate=0.94 (94.4%), total_runs=71`. |
| Impact | ~4 reparse cycles failed in 7-day window. Likely downstream of BUG-1 (no new PDFs to parse). |
| Suggested fix | Will self-heal once BUG-1 resolved. |

---

### ISSUE-4 — MEDIUM: intelligence-cycle occasional stalls — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `[intelligence-cycle] previous cycle still running — skipped` at 04:45 UTC and 06:00 UTC this cycle. avg_duration 29,160ms (normal), but >15 min spikes occur. |
| Impact | One intelligence cycle skipped per stall — missed price anomaly window. |
| Suggested fix | Add 12 min hard timeout guard to `intelligenceCycleJob`. Investigate VPS latency or DB lock at stall time. |

---

### ISSUE-5 — LOW: HNX/UPCOM price gaps (BDI, DLC, JSH, SIS, VDC, VNH = N/A) — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `get_cycle_bootstrap` market_context → BDI, DLC, JSH, SIS, VDC, VNH show `N/A (as of no price data)`. Circuit breakers OK. |
| Impact | 6 tickers with no price coverage. Small-cap/UPCOM coverage gap — not systemic. |
| Suggested fix | Monitor for recurrence at next market open (Mon 02:00 UTC). If persistent, check VPS SSC-iboard route for HNX/UPCOM symbols. |

---

### ISSUE-6 — LOW: Commodity price deltas null (linked to BUG-3 Trading Economics) — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `get_macro_snapshot` → `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null, oilUsdDirection: "unknown"`. |
| Impact | Macro direction fields show "unknown" for oil/gold/FX. Agents relying on direction classification get degraded signals. |
| Suggested fix | Linked to BUG-3 fix. Short-term: calculate deltas from `tracked_indicators` table history in `commodityTracker.ts`. |

---

### ISSUE-7 (NEW) — LOW: weatherCheckJob stall (previous run still in progress)

| Field | Value |
|-------|-------|
| Evidence (new) | `[weatherCheckJob] previous run still in progress — skipping` at 05:00 UTC. `weatherCheckJob` avg_duration: 1,705ms (normally fast). |
| Impact | One weather check cycle skipped. Low urgency — 6-hour cadence for climate signals. |
| Suggested fix | Monitor for recurrence. If persistent, investigate whether weather API call is hanging (no timeout guard). |

---

## IMPROVE

### IMPROVE-1 — LOW: `get_price_history` docs use `ticker`; live tool requires `code` — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `get_price_history({"ticker": "FPT", "days": 3})` → `Required: code`. `get_price_history({"code": "FPT", "days": 3})` → success. |
| Caller-surface verified | `grep -r "get_price_history" docs/agents/*/flow/*.md` → 0 callers use `ticker`. All runtime callers use `code` correctly. **0 affected runtime callers.** |
| Suggested fix | Update `docs/agents/tools/list/get_price_history.md` param `ticker` → `code`. Update `docs/agents/tools/package/market-watcher.md` examples (use `code: "VCB"` not `tickers: [...])`. |

---

### IMPROVE-2 — MEDIUM: `get_bctc_pending_refine` without `limit` → context overflow risk — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed via `limit:1` probe) | Tool works with `limit: 1` (returns 1 pending report with full window array). Without limit, returns 51 reports = ~235K chars — exceeds context window. `refine_bctc_md` correctly uses `limit:1`. |
| Caller-surface verified | Only `refine_bctc_md` calls this tool; uses `limit:1` ✓. **0 affected runtime callers.** |
| Suggested fix | Add server-side default cap `limit: 10` when unspecified. Update tool doc default example to always include `limit`. |

---

### IMPROVE-3 — LOW: `vnstockTradingStatsRefresh` at 85.7% success, 10.8 min avg runtime — UNCHANGED

| Field | Value |
|-------|-------|
| Evidence (re-confirmed) | `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), total_runs=7, avg_duration=649,220ms`. |
| Impact | Above 80% alert threshold but 1/7 failures; 10.8 min avg risks cycle overlap. |
| Suggested fix | Profile slow path. Consider incremental update instead of full refresh. |

---

## Tool Probe Summary

| Tool | Reachable | Result |
|------|-----------|--------|
| `get_system_status` | ✅ | Full health returned — BUGs/ISSUEs above confirmed |
| `get_cycle_bootstrap(agent_name)` | ✅ | Works; `agent_name` required (callers pass it correctly) |
| `get_market_snapshot` | ✅ | VN-Index 1824.53 (-0.32%), breadth fresh |
| `get_macro_snapshot` | ✅ | Works; delta fields null (BUG-3 linked) |
| `get_agent_signals(from_agent=null)` | ✅ | All-producer mode works; 1 signal returned |
| `get_cron_health` | ✅ | 70+ jobs healthy; 2 degraded (sbvRatesRefreshJob 98.1%, bctcReparseJob 94.4%) |
| `get_vps_service_health` | ✅ | vn-bctc-fetch UNHEALTHY; vn-sbv-fetch UNHEALTHY |
| `get_vps_proxy_health` | ✅ | bctc STALE 5 days — confirms BUG-1 |
| `get_sla_status` | ✅ | bctc CRITICAL 6322/2735 min (2.4×) |
| `get_earnings_calendar` | ✅ | 41 tickers tracked; 11 QUÁ HẠN |
| `get_pipeline_health` | ✅ | 6 tickers TA not ready (0 rows); 5 oversold signals |
| `get_ism_subcomponents` | ✅ (error payload) | no_data — BUG-4 re-confirmed |
| `get_price_history(ticker=...)` | ❌ | Fails — IMPROVE-1 docs drift; 0 runtime callers affected |
| `get_price_history(code=...)` | ✅ | Works |
| `get_bctc_pending_refine(limit:1)` | ✅ | Works; 1 report returned (VCB PARTIAL) |
| `get_week_period` | ✅ | W25, 2026-06-15/2026-06-21 — digest-predict dedup works |
| `task_claim` / `task_release` | ✅ | Both work |
| `get_earnings_calendar` | ✅ | Works |

---

## Cross-check: `get_recent_fixes` vs active BUGs

Confirmed none of BUG-1 through BUG-5 appear in last 10 fixes. All are persistent unresolved issues.

---

_Report generated: 2026-06-21 06:05 UTC_
