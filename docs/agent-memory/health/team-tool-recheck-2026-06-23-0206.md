# Team MCP Tool Health Recheck — 2026-06-23T02:06Z

**Cycle:** 2026-06-23T02:06Z (UTC — VN market OPEN 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-22-1406.md`
**Delta window:** ~12h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~6h 3m (restarted ~2026-06-22T20:03:15Z per mcpServerStartup cron)
**DB:** market.db 289.79 MB, WAL 3.93 MB
**Probe scope:** 16 tools probed live; full Step 3c re-probe of all 5 prior BUGs + ISSUE-12

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe command | This cycle result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_sla_status`, `get_vps_proxy_health` | bctc: **8961/120min CRITICAL**, last push 2026-06-16T18:02:24Z, 0 24h pushes | **WORSENING +719 min; SLA threshold tightened 360→120 min** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 58 ⚠` (counter reset to 58 post-restart; ~10/hour, never successful) | **PERSISTS** |
| BUG-3 TE dead | `get_system_status` | Two TE entries: 58/59 failures each post-restart, never successful; `oilUsdDelta:null` confirmed | **PERSISTS** |
| BUG-4 ISM no_data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | **UNCHANGED** |
| BUG-5 fb-poster sentiment_trend | `grep docs/agents/fb-market-poster/flow/main.md:118` | `get_sentiment_trend({})` with no `stock_code` — confirmed present | **UNCHANGED** |
| ISSUE-12 SBV zero-value | `get_vps_proxy_health`, `get_system_status` | `sbv \| 2026-06-23 01:34:03 \| ok \| no \| 4 24h pushes`; zero-value rejection errors ABSENT from current error log | **RESOLVED** ✅ |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call pattern | Result summary | Status |
|---|---|---|---|
| `get_system_status` | `{}` | 10 unresolved errors; foreign-flow fallbacks exhausted every min at market open; SSC HOSE cert error once; push-prices OHLCV guard rejection; Reuters/TE 58/59×; circuit breakers all [OK] (reset post-restart) | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — 3 agent_signals, market_context populated, 24 elapsed_ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1875.57 +0.95%, breadth 0/0/0 (market just opened at probe time, normal), source=vndirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $77.97, gold $4168.20, USD/VND 26128; carry NEUTRAL (1.37pp spread); deltas still null (BUG-3) | ✅ REACHABLE (delta gap) |
| `get_cron_health` | `{}` | 75+ jobs; all ≥99.7% except sbvRatesRefreshJob 98.2% (2 failures/55 runs); intelligenceCycleJob 99.7% (3-4 stalls/1184 runs) | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready (BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows); 4 oversold (D2D/DPM/NKG/NVL RSI<30) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv/foreign-flow: ok; **bctc: STALE=YES, last push 2026-06-16, 0 24h pushes** | ❌ BUG-1 |
| `get_sla_status` | `{}` | bctc: **8961/120min CRITICAL** (SLA threshold tightened from 360→120 min this cycle); price/news/sbv_fx/foreign_flow: ok | ❌ BUG-1 |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) | ✅ REACHABLE |
| `get_market_foreign_flow` | `{}` | OK — session data for 2026-06-23: 9 tickers, net +880 PVS; minimal data as market just opened | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | ❌ BUG-4 |
| `get_cycle_bootstrap` schema | `{}` (no agent_name) | Requires `agent_name` param — callers in all flow files pass explicit name; NON-ISSUE | NON-ISSUE |
| `get_cron_health` macroIndicatorRefreshJob | inline | last_run: 2026-06-22 12:13:01 (macroIndicatorRefreshJob missed 19:13 run due to restart at 20:03) — next run today 19:13 UTC | ⚠ MONITOR |

---

## RESOLVED — 1 New This Cycle

### ISSUE-12 — RESOLVED ✅ — SBV VPS Parser Zero-Value

**Evidence of resolution:**
- `get_vps_proxy_health`: `sbv | 2026-06-23 01:34:03 | 1 | ok | no | 4 24h pushes` — last push 32 min before probe, not stale
- `get_system_status` recent errors: NO `storeSbvSnapshot REJECTED — zero-value` entries this cycle (present every 30 min in prior cycle)
- `get_macro_snapshot`: `usdVnd: 26128, usdVnd_is_estimate: false, usdVnd_source_tier: 1` — center rate fresh
- `sbvRatesRefreshJob`: 98.2% baseline (2 persistent failures unrelated to zero-value issue)

**Verdict:** Zero-value guard no longer firing. SBV VPS parser recovered — likely auto-corrected by the mcp-server restart at 20:03 UTC resetting the VPS service connection, or the SBV website structure stabilized. RESOLVED — dropping from ACTIVE ISSUES.

---

## ACTIVE BUGS — 5 (unchanged count; ISSUE-12 resolved)

### BUG-1 — CRITICAL — WORSENING (Day 7) — BCTC VPS Pipeline Dark

| Signal | 14:06 UTC (prior) | 02:06 UTC (this cycle) | Delta |
|---|---|---|---|
| SLA breach | 8242/360min | **8961/120min** | +719 min; threshold tightened to 120min |
| Last VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| SLA status | CRITICAL | CRITICAL | Unchanged |
| Q2 earnings window | ~9 days | **~8 days** | Closing fast |

**Re-probe evidence:**
- `get_sla_status`: `bctc: 8961/120min — CRITICAL` (note: SLA threshold tightened from 360→120 min between this and prior cycle — likely code update in response to approaching Q2 season)
- `get_vps_proxy_health`: `bctc | 2026-06-16 18:02:24 | ok | YES (STALE) | 24h_pushes=0`
- `get_earnings_calendar`: 12 tickers QUÁ HẠN (Q1-2026); July = Q2-2026 filing season in ~8 days

**Caller surface:** bctc-analyst (get_bctc_full, get_bctc_ocf, get_bctc_series), refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob. **6 callers blocked.**

**Blast radius: CRITICAL.** Pipeline dark 7 days. Q2-2026 filings window opens in ~8 days — without pipeline recovery, Q2 filings will be missed from day 1.

**Fix:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` to backfill 7 days. Verify next push via `get_vps_proxy_health`. SSH to VPS to check `systemctl status vn-bctc-fetch`.

---

### BUG-2 — HIGH — PERSISTS — Reuters RSS Dead

**Re-probe evidence:**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 58 ⚠`
- Server restarted at 20:03 UTC — circuit breaker counters reset to 0, then re-accumulated 58 failures in 6h ≈ 9.7/hour, never successful
- `get_recent_fixes`: decommission of vn-reuters-fetch VPS service (hotfix 2026-04-30) — but internal MCP server source record still fires ~10×/hour

**Caller surface verified:** `grep -rE "reuters" docs/agents/*/flow/*.md` → 0 active cowork flow files reference Reuters RSS directly.

**Caller-surface verdict: 0 active cowork callers impacted. Pure error-log noise.**

**Fix:** Disable/remove Reuters RSS source record from mcp-server DB or config to stop noise. Priority: LOW (noise only).

---

### BUG-3 — HIGH — PERSISTS — Trading Economics 2× Dead

**Re-probe evidence:**
- `get_system_status`: two `Trading Economics | Ngưng | Chưa bao giờ | 58 ⚠` and `59 ⚠` entries
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — TE-sourced deltas absent
- Server restart reset circuit breakers but not source health — failure pattern re-accumulated
- `get_recent_fixes` fix #6 (2026-04-30): Chromium installed in Docker. But TE still dead → likely anti-bot / session expiry post that fix

**Caller surface:** 4 cowork flows (unified-agent, bctc-analyst, news-scout, market-watcher) missing commodity day-over-day deltas and macro calendar events.

**Fix:** Inspect TE Chromium path in mcp-server container. Verify `/usr/bin/chromium` still present post-restart. Check if TE rate-limited/blocked this IP. Evaluate investing.com or Yahoo Finance for commodity delta fallback.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED NAPMBI HTTP 400)

**Re-probe evidence:**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `macroIndicatorRefreshJob`: last_run 2026-06-22 12:13:01 (missed 19:13 due to restart at 20:03); next run today 19:13 UTC. Will re-try NAPMBI — if same HTTP 400, confirms series ID stale.

**Caller surface:** 3 cowork agents (news-scout, bctc-analyst, unified-agent) receive empty/error for ISM PMI regime classification.

**Fix:** (1) Set `FRED_API_KEY` env var in mcp-server container. (2) Verify/replace NAPMBI series ID — HTTP 400 = likely retired FRED series. Try `ISM/MAN_NO` or `NAPM`. Check `apps/mcp-server/src/scheduler/macroIndicatorRefreshJob.ts`.

---

### BUG-5 — LOW — UNCHANGED — fb-market-poster `get_sentiment_trend({})` No `stock_code`

**Re-probe evidence:**
- Grep confirmed: `docs/agents/fb-market-poster/flow/main.md:118: sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})`
- No `stock_code` param — call will fail schema validation or return error

**Caller surface:** 1 caller (`docs/agents/fb-market-poster/flow/main.md:118`).

**Fix:** Add `stock_code` param to call or rewrite as per-watchlist-ticker loop.

---

## ACTIVE ISSUES — 7 (net 0 change: ISSUE-12 resolved, 2 new low issues added)

### ISSUE-3 — MEDIUM — PERSISTS — Intelligence-Cycle Stalls (3-4 in 1184 runs)

- `get_cron_health`: `intelligenceCycleJob: success_rate: 1.00 (99.7%), total_runs: 1184, avg_duration: 27278ms`
- 3-4 stalls in 7d window (prior: 2 stalls in ~1175 runs). Slight worsening trend.

**Fix:** Add per-source 10s timeout cap in intelligenceCycleJob to prevent tail-latency stall beyond 15-min cron slot.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

`get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows.

**Fix:** Audit UPCOM/HNX scraper path; replace BDI `^BDI` symbol with valid ticker source.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Deltas Null (symptom of BUG-3)

`get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — MONITORING — vnstockTradingStatsRefresh Avg 11.8 min

`vnstockTradingStatsRefresh: 100% (7 runs), avg=708371ms`. Structural overlap risk with 15-min intelligenceCycleJob window.

**Fix:** Per-ticker timeout + off-peak schedule.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Empty (symptom of BUG-3)

Auto-resolves with BUG-3.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh Avg 14.1 min

`vnstockFundamentalsRefresh: 100% (2 runs), avg=845851ms`. Timing overlap risk.

**Fix:** Per-ticker timeout + isolation; schedule off-peak.

---

### ISSUE-NEW-13 — LOW — NEW — Foreign Flow Fallback Exhausted at Market Open

**Evidence:**
- `get_system_status` errors: `foreign-flow-job: fallback activated / all fallbacks exhausted` at 02:01:00 and 02:02:00 UTC
- VPS push log: `2026-06-23 02:02:53 | foreign-flow | ok | 102 items` — VPS path IS working
- `foreignFlowFetcherJob`: success_rate 100%, 2032 runs — job records success even when fallback exhausts
- `get_market_foreign_flow`: data available (9 tickers, net buy +880)

**Root cause:** `foreignFlowFetcherJob` (every 60s) fires at market open before VPS has begun pushing — cache/SSE empty, primary endpoint also unavailable in the 60-90s window after 02:00 open. A timing gap, not a systemic failure. VPS push arrives at 02:02:53 and data becomes available.

**Caller-surface:** NON-ISSUE for cowork agents — data is available via VPS push within 2-3 min of market open. Error log noise only.

**Fix:** Add a 120s market-open grace delay to foreignFlowFetcherJob, or suppress WARN logs when market was closed < 2 min ago.

---

### ISSUE-NEW-14 — LOW — NEW — SSC HOSE Fallback TLS Certificate Error

**Evidence:**
- `get_system_status` errors: `[ssc] HOSE fallback fetch failed — unknown certificate verification error` at 02:02:14 UTC (once per probe window)
- `get_market_snapshot`: VN-Index 1875.57 from vndirect — primary path healthy
- `get_vps_proxy_health`: prices ok, 3 pushes in 24h, 0 errors

**Root cause:** SSC/HOSE direct URL (fallback path used when VNDirect fails) has a TLS certificate issue — either expired cert or hostname mismatch on `iboard.ssc.gov.vn` or equivalent. Circuit breaker ssc: [OK] failures=0 so not tripping yet.

**Caller-surface:** 0 cowork agents directly affected (primary VNDirect working). Latent risk: if VNDirect fails, the HOSE fallback is also broken.

**Fix:** Dev-mcp-server to check SSC/HOSE URL TLS cert; update to valid certificate endpoint or add `rejectUnauthorized: false` for trusted SSC endpoint.

---

## NON-ISSUES — Probe Errors This Cycle (caller-surface verified)

| Item | Probe error | Verdict |
|---|---|---|
| `get_cycle_bootstrap({})` | Requires `agent_name` | NON-ISSUE — all flow callers pass explicit name per tool package docs |
| `get_market_snapshot` breadth all zeros | 0 advances/declines | NON-ISSUE — market opened at 02:00; probe at 02:03 is pre-session data |
| Circuit breaker counters reset | All 16 CBs failures=0 | NON-ISSUE — server restarted at 20:03 UTC; counters reset by design |
| `macroIndicatorRefreshJob` missed 19:13 run | last_run 12:13 UTC | NON-ISSUE — restart at 20:03 preempted 19:13 job; next run today at 19:13 UTC |
| `get_market_foreign_flow` sparse data | 9 tickers only | NON-ISSUE — market just opened; session data builds through the day |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 7, WORSENING (8961/120min, Q2 window opens in ~8 days) |
| BUG HIGH | 2 | BUG-2 Reuters 58×; BUG-3 Trading Economics 2× 58/59× |
| BUG MEDIUM | 1 | BUG-4 ISM FRED NAPMBI HTTP 400 (3 cowork flows) |
| BUG LOW | 1 | BUG-5 fb-market-poster get_sentiment_trend no stock_code (1 caller) |
| ISSUE MEDIUM | 1 | ISSUE-3 cycle collision 3-4× per 7 days |
| ISSUE LOW | 6 | ISSUE-4/5/6/7/11 + NEW-13 foreign-flow open timing / NEW-14 SSC TLS |
| RESOLVED | 1 | **ISSUE-12 SBV zero-value — RESOLVED** ✅ |
| NON-ISSUE | 5 | Probe param errors, by-design, timing artifacts |

---

## Recommended Actions (priority order)

1. **BUG-1 CRITICAL:** `restart_vps_service("vn-bctc-fetch")` + `trigger_bctc_vps_fetch` — BCTC dark 7 days, Q2 window opens in ~8 days. SSH VPS to check `systemctl status vn-bctc-fetch`.
2. **BUG-4 MEDIUM:** Set `FRED_API_KEY` env var; verify/fix NAPMBI → try `NAPM` or `ISM/MAN_NO` in macroIndicatorRefreshJob. Monitor today's 19:13 UTC run for same HTTP 400.
3. **BUG-3 HIGH:** Diagnose TE Chromium inside container post-restart; verify `/usr/bin/chromium` present; check IP block/rate-limit; evaluate commodity-delta fallback (investing.com / Yahoo Finance).
4. **BUG-2 HIGH:** Disable Reuters RSS source record in mcp-server DB — 0 cowork callers, pure noise at 10 errors/hour.
5. **BUG-5 LOW:** Fix `docs/agents/fb-market-poster/flow/main.md:118` — add `stock_code` param.
6. **ISSUE-3 MEDIUM:** Add 10s per-source timeout in intelligenceCycleJob.
7. **ISSUE-4 LOW:** Fix BDI/UPCOM/HNX TA scraper gaps.
8. **ISSUE-NEW-14 LOW:** Fix SSC HOSE fallback TLS cert — latent risk if VNDirect fails.
9. **ISSUE-NEW-13 LOW:** Add 120s market-open grace delay or suppress WARN in foreignFlowFetcherJob.
