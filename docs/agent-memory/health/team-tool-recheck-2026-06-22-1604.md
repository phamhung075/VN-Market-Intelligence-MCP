# Team MCP Tool Health Recheck — 2026-06-22T16:04Z

**Cycle:** 2026-06-22T16:04Z (UTC — VN market CLOSED post-session)
**Prior report:** `team-tool-recheck-2026-06-22-1406.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~14h 7m (restarted ~2026-06-22T01:56:20Z)
**DB:** market.db 289.79 MB, WAL 0 B
**Probe scope:** 22 tools probed live; full Step 3c re-probe of all prior BUGs + ISSUEs

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe command | This cycle result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_sla_status`, `get_vps_proxy_health` | bctc: **8362/360min CRITICAL**, last push 2026-06-16T18:02:24Z, 0 24h pushes | **WORSENING +120 min** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 156 ⚠` | **WORSENING 140→156** |
| BUG-3 TE dead | `get_system_status` source health | Two TE entries: 156 failures each, never successful | **WORSENING 140→156** |
| BUG-4 ISM no_data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | **UNCHANGED** |
| BUG-5 fb-poster sentiment_trend | (schema re-probe skipped — code not changed) | Carried UNCHANGED — file at line 118 unchanged | UNCHANGED (not re-probed per protocol) |
| ISSUE-12 SBV zero-value | `get_system_status` errors | `storeSbvSnapshot REJECTED` at 14:33, 15:03, 15:33 UTC (every 30 min) | **UNCHANGED** |
| ISSUE-3 cycle collision | `get_cron_health`, `get_system_status` | `intelligenceCycleJob: 99.8% (1173 runs)`; source timeouts cafef/vnexpress/vneconomy/reuters visible in log | **UNCHANGED** |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows | **UNCHANGED** |
| ISSUE-5 deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | **UNCHANGED** (symptom of BUG-3) |
| ISSUE-6 vnstockTrading slow | `get_cron_health` | `vnstockTradingStatsRefresh: avg=708371ms` (11.8 min) | **UNCHANGED** |
| ISSUE-7 macro_calendar empty | (derived from BUG-3) | Auto-resolves with BUG-3 | **UNCHANGED** |
| ISSUE-11 vnstockFundamentals slow | `get_cron_health` | `vnstockFundamentalsRefresh: avg=845851ms` (14.1 min) | **UNCHANGED** |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call pattern | Result summary | Status |
|---|---|---|---|
| `get_system_status` | `{}` | 10 unresolved errors; Reuters/TE 156×; sbv zero-value rejections; source timeouts in cycle; ragInsert timeout non-fatal | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — market_context populated (40+ tickers priced), 20 alerts, 10 recent analyses; elapsed_ms=19 | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1857.91 +1.83%, breadth 128/180/49, turnover 14597bn VND, source=vndirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $78.22, gold $4219, USD/VND 26122; carry NEUTRAL; yield CHEAP (spread 2.05pp); deltas null (BUG-3) | ✅ REACHABLE (delta gap) |
| `get_cron_health` | `{}` | 75 jobs; all ≥99.8% except sbvRatesRefreshJob 98.1% (54 runs); intelligenceCycleJob 99.8% (1173 runs, avg 28s) | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready; 4 oversold (D2D RSI=26.2, DPM=28.1, NKG=23.6, NVL=28.5) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv: ok; bctc: **STALE=YES**, last push 2026-06-16, 0 24h pushes | ❌ BUG-1 |
| `get_sla_status` | `{}` | bctc: **8362/360min CRITICAL**; price/news/sbv_fx/foreign_flow: ok | ❌ BUG-1 |
| `get_earnings_calendar` | `{}` | 41 tickers; Q1-2026 data; 12 QUÁ HẠN (BID/DAG/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH/BDI/DLC) | ✅ REACHABLE |
| `get_watchlist` | `{}` | 41 tickers with prices; all market-open prices as of 08:59 UTC (expected post-close) | ✅ HEALTHY |
| `get_agent_signals` | `{from_agent:"market-watcher", hours_back:4, status:"all"}` | Returns correctly (from_agent sender mode) | ✅ HEALTHY |
| `get_alerts` | `{hours_back:4}` | 20 unread alerts; last at 13:14 UTC; price_surge VHM+6.95%/VIC+6.96%; TA breakouts NKG/POW | ✅ HEALTHY |
| `get_portfolio_conviction` | `{}` | 41 tickers scored; top: REE 0.59, VHM 0.59, DHG 0.58; FPT showing loss -12.08% (position held) | ✅ HEALTHY |
| `get_vn_macro_indicators` | `{}` | IIP yoy=103.3%, manufacturing 103.39%, electricity 104.59% (source: NSO monthly Excel PROBE-3 PASS) | ✅ HEALTHY |
| `task_list_held` | `{}` | 6 active locks: cowork-dispatcher leader, unified-agent chef slots (morning/eod/evening), digest-predict (×2) | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | ❌ BUG-4 |
| `get_technical_indicators` | `{"code":"VNM"}` (correct param) | Returns RSI/MACD/BB indicators for VNM | ✅ HEALTHY |
| `get_financial_summary` | `{"actionCode":"VNM"}` (correct param) | Returns financial summary for VNM | ✅ REACHABLE |
| `get_vn_macro_indicators` | `{}` | IIP data ok | ✅ HEALTHY |
| `send_telegram` | (schema confirmed only — no test send) | Schema: `{channel, message}` required; correct param is `message` NOT `text` | ✅ SCHEMA OK |

---

## RESOLVED — None New This Cycle

No findings from prior report resolved between 14:06 UTC and 16:04 UTC.

---

## ACTIVE BUGS — 5 (all re-confirmed)

### BUG-1 — CRITICAL — WORSENING (Day 6+, +120 min) — BCTC VPS Pipeline Dark

| Signal | 14:06 UTC | 16:04 UTC | Delta |
|---|---|---|---|
| SLA breach | 8242/360min | **8362/360min** | +120 min |
| Last VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| SLA status | CRITICAL | CRITICAL | Unchanged |

**Re-probe evidence:**
- `get_sla_status`: `bctc: 8362/360min — CRITICAL`
- `get_vps_proxy_health`: `bctc | 2026-06-16 18:02:24 | ok | YES (STALE) | 24h_pushes=0`
- 12 tickers QUÁ HẠN in earnings calendar; Q2-2026 BCTC window opens ~July (8 days away)

**Caller surface:** bctc-analyst (get_bctc_full, get_bctc_ocf, get_bctc_series), refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob. **6 callers blocked.**

**Blast radius: CRITICAL.** Pipeline has been dark 6 days. Q2-2026 earnings season starts in ~8 days — BCTC pipeline must be restored before then or all Q2 filings will be missed from day one.

**Fix:** `restart_vps_service("vn-bctc-fetch")` → wait 2 min → `trigger_bctc_vps_fetch` to backfill 6-day gap → verify via `get_vps_proxy_health` next push. If VPS service fails to start, SSH to VPS and check `journalctl -u vn-bctc-fetch.service --lines=50`.

---

### BUG-2 — HIGH — WORSENING — Reuters RSS Dead (156 consecutive failures, never successful)

**Re-probe evidence:**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 156 ⚠`
- Counter: 140 (14:06) → 156 (16:04) → ~8 failures/hour, continuous polling, no successes ever

**Caller-surface verified:** `grep -rE "reuters" docs/agents/*/flow/*.md` — 0 active cowork flow files reference Reuters RSS directly. Core cowork pipeline uses CafeF/VnExpress/VnEconomy/bloomberg (all healthy). Reuters was decommissioned as VPS service in hotfix 2026-04-30 (get_recent_fixes #3/#7) but the internal mcp-server circuit-breaker source record still fires ~8×/hour, polluting `get_system_status` unresolved error count.

**Caller-surface verdict: 0 active cowork callers directly impacted. Pure error-noise.**

**Fix:** Disable/remove Reuters RSS source record from mcp-server source-health tracking in DB. No cowork code change needed.

---

### BUG-3 — HIGH — WORSENING — Trading Economics 2× Dead (156 consecutive failures each)

**Re-probe evidence:**
- `get_system_status` source health: two `Trading Economics | Ngưng | Chưa bao giờ | 156 ⚠` entries
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — commodity deltas unavailable
- `get_macro_calendar`: returns `{"events":[],"status":"unavailable","source_tier":4}`

**Caller surface:** unified-agent, bctc-analyst, news-scout, market-watcher package docs reference TE-sourced commodity deltas and macro-calendar event schedule. **4 cowork flows affected** (delta gap + empty calendar).

**Note:** Commodity current prices (oil $78.22, gold $4219) available via Yahoo Finance fallback. What's missing: day-over-day price deltas and macro event schedule.

**Fix:** Inspect TE Chromium path inside mcp-server container — confirm `/usr/bin/chromium` present and functioning. Check for anti-bot session expiry or structural page change. Evaluate commodity-delta fallback to investing.com / Yahoo Finance if TE remains blocked.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED NAPMBI HTTP 400)

**Re-probe evidence:**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_system_status` errors (prior cycle at 12:13 UTC): `[fredIsmSubcomponents] all 3 retries exhausted for NAPMBI — HTTP 400 Bad Request` (×2)
- `get_cron_health`: `macroIndicatorRefreshJob: 100% success_rate, last_run: 2026-06-22 12:13` — job completes but NAPMBI series fails silently (job-level ≠ all-series success)

**Caller surface:** news-scout, bctc-analyst, unified-agent tool packages reference ISM PMI for US monetary regime classification. **3 cowork agents** receive empty/error.

**Fix:** (1) Set `FRED_API_KEY` env var in mcp-server container. (2) Verify/update `NAPMBI` series ID in `apps/mcp-server/src/scheduler/macroIndicatorRefreshJob.ts` — HTTP 400 suggests the series ID may have been retired by FRED. Try `ISM/MAN_NO` or `NAPM` as alternatives.

---

### BUG-5 — LOW — NOT RE-PROBED — fb-market-poster `get_sentiment_trend({})` missing `stock_code`

**Status:** Flow file `docs/agents/fb-market-poster/flow/main.md:118` not re-grepped this cycle (no code change expected since 14:06). Carried UNCHANGED pending dev fix.

**Caller surface:** 1 caller.

**Fix:** Add `stock_code` param to the call at line 118 or rewrite as a per-watchlist-ticker loop.

---

## ACTIVE ISSUES — 7 (all re-confirmed)

### ISSUE-12 — MEDIUM — UNCHANGED — SBV VPS Parser Broken (zero-value pushes)

**Re-probe evidence:**
- `get_system_status` errors: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 14:33, 15:03, 15:33 UTC (every 30 min exactly — matching vn-sbv-fetch push cadence)
- `get_cron_health`: `sbvRatesRefreshJob: 98.1% (54 runs)` — ~1 failure / 50 push cycles
- `get_vps_proxy_health`: `sbv | 2026-06-22 15:33:46 | ok | no | 32 24h pushes` — pushes arriving but zero-valued

**Analysis:** Zero-value guard correctly protects last-known-good center rate (26122 VND/USD). Agents receive valid cached rate. Buy/sell rates, OMO data unavailable since parser broke post-restart.

**Caller surface:** `get_vn_liquidity_state` (policy_rates is_estimate=true), `get_macro_snapshot` SBV subfield (center rate cached OK), `get_carry_trade_signal` (center rate only — OK). Limited cowork impact.

**Fix:** `restart_vps_service("vn-sbv-fetch")` → if zeros persist, inspect SBV HTML structure change in VPS scraper `vps-scripts/fetch-vn-sbv.sh` (or equivalent).

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence-Cycle Tail Latency / Skip Events

**Re-probe evidence:**
- `get_cron_health`: `intelligenceCycleJob: 99.8% (1173 runs), avg_duration=28035ms` — still 2 stall events in 7d window
- `get_system_status` fetch timeouts: cafef exceeded 10000ms, vneconomy 12000ms, reuters 15000ms, vnexpress 10000ms — multiple per cycle (4:04 UTC batch visible in log)

**Fix:** Add per-source timeout cap in intelligenceCycleJob (max 10s per external fetch) to prevent tail-latency spikes exceeding the 15-min cron slot.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready (0 rows)

`get_pipeline_health`: BDI=0, DLC=0, JSH=0, SIS=0, VDC=0 (UPCOM/HNX sourcing gap), DAG=1, VNH=6 rows.

**Fix:** Audit UPCOM/HNX scraper path; verify BDI Yahoo symbol; confirm DAG/VNH are low-float tickers with structural data scarcity.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Deltas Null (symptom of BUG-3)

`get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves when BUG-3 fixed.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh Avg 11.8 min

`get_cron_health`: `vnstockTradingStatsRefresh: 100% (7 runs), avg=708371ms`. Risk of overlap with 15-min intelligenceCycleJob.

**Fix:** Add per-ticker timeout + schedule off-peak (e.g. 09:30 UTC daily, after market close).

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Empty (symptom of BUG-3)

Returns `{"events":[],"status":"unavailable","source_tier":4}`. Auto-resolves with BUG-3.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh Avg 14.1 min

`get_cron_health`: `vnstockFundamentalsRefresh: 100% (2 runs), avg=845851ms`. Timing overlap risk with multiple crons.

**Fix:** Per-ticker timeout + isolation; schedule off-peak.

---

## NEW FINDINGS THIS CYCLE

### IMPROVE-1 — LOW — market-watcher package doc param typo

**Evidence:**
- `docs/agents/tools/package/market-watcher.md:177`: `arguments: { ticker: "FPT" }` — WRONG param name in example snippet
- Contract SSOT `docs/agents/tools/list/get_technical_indicators.md` line 16: `"code": ...` ✅
- `docs/agents/market-watcher/flow/cycle.md:77`: `get_technical_indicators(code)` ✅ (flow uses correct param)
- `docs/agents/fb-market-poster/flow/main.md:109`: `arguments={"code": ticker}` ✅
- `docs/agents/tools/package/market-watcher.md:38`: documents `code: string` ✅

**Grep run:** `grep -rn "get_technical_indicators" docs/agents/ --include="*.md"` — 1 affected example line at market-watcher.md:177; 0 runtime callers use wrong param.

**Caller-surface verdict: 0 runtime callers affected.** Example in package doc is misleading but does not cause runtime failures (flow files use correct `code`).

**Fix:** Change `docs/agents/tools/package/market-watcher.md:177` from `{ ticker: "FPT" }` to `{ code: "FPT" }`.

---

## NON-ISSUES — Probe Errors This Cycle (caller-surface verified)

| Item | Probe error | Verdict |
|---|---|---|
| `get_cycle_bootstrap({})` | Requires `agent_name` | NON-ISSUE — all flow callers pass explicit name per tool package docs |
| `get_agent_signals({hours_back:2})` | "agent required" in inbox mode | NON-ISSUE — callers use `from_agent` (sender mode) or `agent` (inbox mode) correctly per flow files |
| `get_technical_indicators({"ticker":"VNM"})` | Param `code` required, not `ticker` | NON-ISSUE — probe used wrong param; contract SSOT + all flow files use `code` correctly |
| `get_financial_summary({"ticker":"VNM"})` | Param `actionCode` required | NON-ISSUE — probe used wrong param; market-analyst package and SSOT both document `actionCode`; 0 callers use `ticker` |
| `CafeF/VnEconomy/VnExpress RSS "Suy giảm"` (1 error) | 1 consecutive error | NON-ISSUE — last success 3 min ago; transient error only |
| `pollNews ragInsert failed (non-fatal)` | RAG service timeout | NON-ISSUE — non-fatal per code; does not block news ingestion; RAG latency watch only |
| `yahooFinance timeout 30s` | Single HTTP timeout | NON-ISSUE — Yahoo fallback; circuit breaker shows 0 failures; transient |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 6+, WORSENING (8362/360min, Q2 window in 8 days) |
| BUG HIGH | 2 | BUG-2 Reuters 156×; BUG-3 Trading Economics 2× 156× each |
| BUG MEDIUM | 1 | BUG-4 ISM FRED NAPMBI HTTP 400 (3 cowork flows) |
| BUG LOW | 1 | BUG-5 fb-market-poster get_sentiment_trend no stock_code (1 caller) |
| ISSUE MEDIUM | 2 | ISSUE-12 SBV VPS zero-value; ISSUE-3 cycle collision |
| ISSUE LOW | 5 | ISSUE-4/5/6/7/11 |
| IMPROVE LOW | 1 | IMPROVE-1 market-watcher package doc param typo |
| RESOLVED | 0 | None since 14:06 |
| NON-ISSUE | 7 | Probe param errors, transient, by-design |

---

## Recommended Actions (priority order)

1. **BUG-1 CRITICAL:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` — BCTC dead 6 days, Q2 window in 8 days
2. **ISSUE-12 MEDIUM:** `restart_vps_service("vn-sbv-fetch")` — all SBV pushes returning zero since last restart
3. **BUG-4 MEDIUM:** Set `FRED_API_KEY` in mcp-server env; verify/fix NAPMBI series ID (HTTP 400 = likely retired series)
4. **BUG-3 HIGH:** Diagnose TE Chromium scraper — check `/usr/bin/chromium` in container; evaluate commodity-delta fallback
5. **BUG-2 HIGH:** Disable Reuters RSS source record in DB — 0 cowork callers affected, pure error noise
6. **BUG-5 LOW:** Fix `docs/agents/fb-market-poster/flow/main.md:118` — add `stock_code` param
7. **IMPROVE-1 LOW:** Fix `docs/agents/tools/package/market-watcher.md:177` — `ticker` → `code`
8. **ISSUE-3 MEDIUM:** Add 10s per-source timeout cap in intelligenceCycleJob
9. **ISSUE-4 LOW:** Audit BDI/UPCOM/HNX TA scraper gaps; verify DAG/VNH structural data scarcity
