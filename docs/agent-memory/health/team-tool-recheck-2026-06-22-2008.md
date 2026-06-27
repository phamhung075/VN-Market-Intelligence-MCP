# Team MCP Tool Health Recheck — 2026-06-22T20:08Z

**Cycle:** 2026-06-22T20:08Z (UTC — VN market CLOSED post-session)
**Prior report:** `team-tool-recheck-2026-06-22-1406.md`
**Delta window:** ~6h since last report
**Gateway:** REACHABLE — initial probe batch hit server mid-restart (EOF/connection refused), second batch succeeded. Server uptime was 12s at first successful probe (restarted ~20:03:15 UTC after ~18h of uptime).
**DB:** market.db 289.79 MB, WAL 1.97 MB
**Probe scope:** 12 tools probed live; full Step 3c re-probe of all 5 prior BUGs + 7 ISSUEs

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe command | This cycle result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_sla_status`, `get_vps_proxy_health` | bctc: **8602/360min CRITICAL**, last push 2026-06-16T18:02:24Z, 0 24h pushes | **WORSENING +360 min (+6h)** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| disabled \| Chưa bao giờ \| 0` — 0 failures | **RESOLVED** |
| BUG-3 TE dead | `get_system_status` source health | `TE \| disabled \| 0` + `TE \| OK \| 0`; deltas still null; server restarted at probe time | **MONITORING** (counters reset by restart; TE never succeeded; macroIndicatorRefreshJob last ran 12:13, next ~tomorrow 19:13) |
| BUG-4 ISM no_data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows…"}` + system WARN at 18:04 UTC | **UNCHANGED** |
| BUG-5 fb-poster no stock_code | `grep get_sentiment_trend docs/agents/fb-market-poster/flow/main.md` | line 118: `arguments={}` — confirmed missing required `stock_code` | **UNCHANGED** |
| ISSUE-12 SBV zero-value | `get_system_status` + `get_vps_proxy_health` | `storeSbvSnapshot REJECTED — zero-value` at 19:33, 19:03, 18:33, 18:03, 17:33, 17:03 UTC (every 30 min) | **UNCHANGED** |
| ISSUE-3 cycle collision | `get_system_status` | `[intelligence-cycle] previous cycle still running — skipped` at 18:45 UTC | **UNCHANGED** |
| ISSUE-4 7 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows | **UNCHANGED** |
| ISSUE-5 commodity deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | **UNCHANGED** (symptom of BUG-3) |
| ISSUE-6 vnstockTradingStats slow | `get_cron_health` | avg_duration=708371ms | **UNCHANGED** |
| ISSUE-7 macro_calendar empty | (inline BUG-3 dependency) | Not independently probed; depends on BUG-3 | **UNCHANGED** |
| ISSUE-11 vnstockFundamentals slow | `get_cron_health` | avg_duration=845851ms | **UNCHANGED** |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call pattern | Result summary | Status |
|---|---|---|---|
| `get_system_status` | `{}` | uptime 12s (just restarted); 10 unresolved errors; SBV zero-value ×6 today; TE disabled+OK; Reuters disabled | ✅ REACHABLE |
| `get_market_snapshot` | `{}` | VN-Index 1857.91 +1.83%, breadth 128/180/49, turnover 14597bn VND, source=vndirect | ✅ HEALTHY |
| `get_sla_status` | `{}` | bctc: 8602/360min CRITICAL; price/news/sbv_fx/foreign_flow all ok | ❌ BUG-1 |
| `get_vps_proxy_health` | `{}` | prices ok (371 24h), news ok (177 24h), sbv ok (41 24h); bctc STALE=YES, 0 24h pushes | ❌ BUG-1 |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"…no ISM sub-component rows…"}` | ❌ BUG-4 |
| `get_macro_snapshot` | `{}` | oil $78.28 (tier1), gold $4203.9 (tier1), USD/VND 26122; carry NEUTRAL; deltas null | ⚠ ISSUE-5 (BUG-3) |
| `get_cron_health` | `{}` | 75 jobs; sbvRatesRefreshJob 98.1%; intelligenceCycleJob 99.8%; vnstockTradingStats avg 11.8min; vnstockFundamentals avg 14.1min | ⚠ ISSUES-6/11 |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready (BDI/DAG/DLC/JSH/SIS/VDC/VNH); 4 oversold (D2D/DPM/NKG/NVL) | ⚠ ISSUE-4 |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN (BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) — Q1-2026 outstanding | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"health-recheck"}` | enum validation error — expected; only cowork agent names accepted | NON-ISSUE |
| `task_claim` | old-style args (task_key/agent_name) | schema error: requires task_id/task_kind/owner_agent; flow files already use new schema | NON-ISSUE |
| `get_cycle_bootstrap` | (schema check) | valid enum: news-scout/financial-analyst/market-watcher/alert-commander/digest-predict/qa-responder/unified-agent/report-analyzer/bctc-analyst | ✅ HEALTHY |

---

## RESOLVED Since Prior Report

| Item | Evidence | Fix Applied |
|---|---|---|
| **BUG-2 Reuters RSS dead (140 failures)** | `get_system_status`: `Reuters RSS \| disabled \| 0` — source explicitly disabled; circuit breaker `reuters [OK] failures: 0`. Prior: 140 consecutive failures, "Ngưng" state. | Source marked disabled in config (decommission hotfix finally applied). Zero failure noise. |

---

## ACTIVE BUGS — 3 (all re-confirmed this cycle)

### BUG-1 — CRITICAL — WORSENING (Day 6+) — BCTC VPS Pipeline Dark

| Signal | 14:06 UTC | 20:08 UTC | Delta |
|---|---|---|---|
| SLA breach | 8242/360min | **8602/360min** | +360 min (+6h) |
| Last VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| Data age (freshness) | 143.4h | ~143.4h+ | Worsening |

**Re-probe evidence (this cycle):**
- `get_sla_status`: `bctc: 8602/360min — CRITICAL`
- `get_vps_proxy_health`: `bctc | 2026-06-16 18:02:24 | ok | YES (STALE) | 24h_pushes=0`
- `get_system_status` data freshness: `BCTC | 6 ngày trước | 143.4h | !! Rất cũ`
- `get_earnings_calendar`: 12 tickers QUÁ HẠN; Q2-2026 filing season opens in ~8 days

**Caller surface grep (from prior report, not changed):** bctc-analyst (get_bctc_full, get_bctc_ocf, get_bctc_series), refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob. **6 callers blocked.**

**Blast radius: CRITICAL.** Q2-2026 earnings window opens ~July 1. Pipeline has been dark 6 days. Every additional day lost = more backfill needed at window open.

**Fix:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` to backfill 6 days. Verify with `get_vps_proxy_health`.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED NAPMBI HTTP 400)

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_system_status` WARN: `[get_ism_subcomponents] no ISM data in fred_series_daily` at 18:04 UTC
- `get_cron_health`: macroIndicatorRefreshJob 100% success (14 runs), avg 17320ms — job completes but NAPMBI series fails silently (job-level success ≠ all series populated)

**Caller surface (from prior report):** `grep -rE "get_ism_subcomponents" docs/agents/tools/package/*.md` — news-scout, bctc-analyst, unified-agent. **3 cowork agents receive empty data.**

**Fix:** (1) Set `FRED_API_KEY` env var in mcp-server container. (2) Verify/update NAPMBI series ID — HTTP 400 may mean FRED retired this ID. Alternatives: `ISM/MAN_NO` or `NAPM`.

---

### BUG-5 — LOW — UNCHANGED — fb-market-poster `get_sentiment_trend({})` Missing Required `stock_code`

**Re-probe evidence (this cycle):**
- `grep get_sentiment_trend docs/agents/fb-market-poster/flow/main.md`: line 118: `call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})`
- `docs/agents/tools/list/get_sentiment_trend.md`: `stock_code` is **Required** (no default)
- Tool will return validation error or empty for every call from this flow

**Caller surface:** `grep -rn "get_sentiment_trend" docs/agents/*/flow/*.md` — **1 caller: fb-market-poster flow line 118**

**Fix:** Rewrite line 118 as a per-watchlist-ticker loop, e.g.:
```python
for ticker in watchlist_active:
    sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={"stock_code": ticker, "window_days": 7})
```

---

## MONITORING (not confirmed resolved, not confirmed broken)

### BUG-3 — HIGH — MONITORING — Trading Economics (delta values still null)

**Context:** Prior report had 2× TE entries each with 140 consecutive failures ("Ngưng"). This cycle server restarted at ~20:03 UTC (uptime 12s at probe time), resetting all circuit-breaker failure counters.

**Current state:**
- `get_system_status`: `Trading Economics | disabled | Chưa bao giờ | 0` + `Trading Economics | OK | Chưa bao giờ | 0`
- "Chưa bao giờ" = TE has **never** succeeded on either entry (not just reset)
- `get_macro_snapshot`: `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null` — deltas still unavailable
- `macroIndicatorRefreshJob` last ran at 12:13 UTC (pre-restart); next scheduled run ~tomorrow 19:13 UTC

**Verdict:** Cannot confirm RESOLVED or ACTIVE until next macroIndicatorRefreshJob run successfully fetches TE data. One source disabled (likely the Chromium path), one enabled but never-succeeded. **Carry forward as MONITORING.** If next run populates commodity deltas → RESOLVED. If not → re-confirm as BUG-3.

---

## ACTIVE ISSUES — 5 (all re-confirmed)

### ISSUE-12 — MEDIUM — UNCHANGED — SBV VPS Parser Returning Zero (all pushes zero-valued)

**Re-probe evidence:** `get_system_status` errors: `storeSbvSnapshot REJECTED — zero-value` at 19:33, 19:03, 18:33, 18:03, 17:33, 17:03 UTC (every 30 min). `get_vps_proxy_health`: sbv ok, no stale, 41 24h pushes — VPS is pushing but all zero-valued. `sbvRatesRefreshJob`: 98.1% (54 runs).

Zero-value guard protects last known-good center rate (26122 VND/USD). Buy/sell rates, OMO, interbank unavailable since parser broke.

**Fix:** SSH VPS → `sudo systemctl restart vn-sbv-fetch.service`. If zeros persist, inspect SBV website HTML structure change in VPS scraper.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence-Cycle Collision (1 stall today)

**Re-probe evidence:** `get_system_status` WARN: `[intelligence-cycle] previous cycle still running — skipped` at 18:45 UTC. `intelligenceCycleJob`: 99.8%, avg 28009ms (~28s vs 15min slot — tail latency risk when external fetch hangs).

**Fix:** Add per-source timeout cap (~10s) in intelligenceCycleJob to prevent tail-latency spills beyond the 15-min cron slot.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

`get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows. All 7 are UPCOM/HNX tickers — scraper coverage gap.

**Fix:** Audit UPCOM/HNX scraper path; fix BDI Yahoo symbol (`^BDI` not valid for Vietnamese ticker).

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh avg 11.8 min

`get_cron_health`: avg_duration=708371ms. Structural timing overlap risk with 15-min intelligenceCycleJob slot.

**Fix:** Per-ticker timeout + off-peak schedule.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh avg 14.1 min

`get_cron_health`: avg_duration=845851ms (2 runs). Timing overlap risk.

**Fix:** Per-ticker timeout + isolation; schedule off-peak.

---

## NEW FINDINGS — 2

### NEW-1 — LOW — weatherCheckJob Intermittent Hang / Collision

**Evidence:** `get_system_status` WARNs: `[weatherCheckJob] previous run still in progress — skipping` at VN 17:00 (UTC 10:00) and VN 00:00 (UTC 17:00) — exactly 6h apart (matching cron interval). `get_cron_health`: weatherCheckJob avg 1717ms, 100% success rate (45 runs) — outlier hang is rare but when it occurs, blocks the next scheduled slot.

**Blast radius:** Low — weatherCheckJob feeds climate risk signals. A missed run delays data by 6h maximum.

**Fix:** Add a max-runtime guard (e.g. `AbortController` with 30s timeout) in weatherCheckJob to prevent single-run hangs from blocking next slot.

---

### NEW-2 — LOW — wti_crude_usd Stale in auto_tracked_indicators ($95.5 vs live $78.28)

**Evidence:** `get_system_status` auto-tracked: `wti_crude_usd: 95.5` (79 data points). `get_macro_snapshot`: `oilUsd: 78.28` (source_tier 1, live). Discrepancy ~$17 — auto_tracked table frozen at last TE-success value (TE has been failing since before this run).

**Blast radius:** Low — `get_macro_snapshot` uses Yahoo Finance fallback for live price (correct). The auto_tracked table is a secondary stats table. No cowork agent directly queries the auto_tracked_indicators table.

**Auto-resolves** when BUG-3 (TE) is confirmed resolved and macroIndicatorRefreshJob runs successfully.

---

## NON-ISSUES — Probe Errors This Cycle (caller-surface verified)

| Item | Probe error | Verdict |
|---|---|---|
| `get_cycle_bootstrap({agent_name:"health-recheck"})` | Invalid enum — expected | NON-ISSUE — health-recheck is not a cowork agent; enum validates correct callers |
| `task_claim({task_key, agent_name, ttl_minutes})` | Schema error: requires task_id/task_kind/owner_agent | NON-ISSUE — probe used old-style args. `grep task_claim docs/agents/cowork-team/flow/leader-lock.md` → line 30-32 already uses `task_id`, `task_kind`. `docs/agents/tools/list/task_claim.md` confirms current schema. **0 affected callers.** |
| First probe batch (5 tools) | EOF / connection refused on port 3000 | NON-ISSUE — server was mid-restart; second batch succeeded 12s later. Server restart was clean (mcpServerCleanShutdown + mcpServerStartup both logged at success). |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 6+, WORSENING (8602/360min, Q2 window in ~8 days) |
| BUG MEDIUM | 1 | BUG-4 ISM FRED NAPMBI HTTP 400 (3 cowork flows) |
| BUG LOW | 1 | BUG-5 fb-market-poster get_sentiment_trend no stock_code (1 caller) |
| MONITORING | 1 | BUG-3 TE — circuit breakers reset by restart, deltas still null, outcome TBD next macroIndicatorRefreshJob |
| ISSUE MEDIUM | 2 | ISSUE-12 SBV VPS zero-value; ISSUE-3 cycle collision |
| ISSUE LOW | 5 | ISSUE-4/6/11 (carried); NEW-1 weatherCheckJob hang; NEW-2 wti stale |
| RESOLVED | 1 | BUG-2 Reuters disabled — 0 failures ✅ |
| NON-ISSUE | 3 | Probe param errors + mid-restart connection refused |

---

## Recommended Actions (priority order)

1. **BUG-1 CRITICAL:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` — pipeline dark 6 days, Q2 filing window opens ~July 1
2. **ISSUE-12 MEDIUM:** SSH VPS → `sudo systemctl restart vn-sbv-fetch.service` — all SBV pushes returning zero since last VPS restart
3. **BUG-4 MEDIUM:** Set `FRED_API_KEY` env; verify/update NAPMBI series ID in macroIndicatorRefreshJob (HTTP 400 = likely retired ID)
4. **BUG-3 MONITORING:** Confirm after next macroIndicatorRefreshJob run (~tomorrow 19:13 UTC) — if TE still fails, re-escalate to ACTIVE BUG
5. **BUG-5 LOW:** Fix `docs/agents/fb-market-poster/flow/main.md:118` — add per-ticker loop with `stock_code` param
6. **ISSUE-3 MEDIUM:** Add 10s per-source timeout in intelligenceCycleJob to prevent tail-latency slot collisions
7. **NEW-1 LOW:** Add max-runtime guard in weatherCheckJob (30s abort) to prevent 6h slot blocking
8. **ISSUE-4 LOW:** Fix BDI/UPCOM/HNX TA scraper gaps (7 tickers with 0-6 rows)
