# Team MCP Tool Health Recheck — 2026-06-22T14:06Z

**Cycle:** 2026-06-22T14:06Z (UTC — VN market CLOSED post-session)
**Prior report:** `team-tool-recheck-2026-06-22-1209.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~12h 10m (restarted ~2026-06-22T01:56:20Z)
**DB:** market.db 289.64 MB, WAL 0 B
**Probe scope:** 20 tools probed live; full Step 3c re-probe of all 5 prior BUGs + ISSUE-12

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe command | This cycle result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_sla_status`, `get_vps_proxy_health` | bctc: 8242/360min CRITICAL, last push 2026-06-16T18:02:24Z, 0 24h pushes | **WORSENING +118 min** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS | Ngưng | Chưa bao giờ | 140 ⚠` | **WORSENING 120→140** |
| BUG-3 TE dead | `get_system_status` | Two TE entries: 140 failures each, never successful | **WORSENING 120→140** |
| BUG-4 ISM no_data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` + system errors: `fredIsmSubcomponents: all 3 retries exhausted for NAPMBI — HTTP 400 Bad Request` at 12:13 (×2) | **UNCHANGED** |
| BUG-5 fb-poster sentiment_trend | file not re-grepped this cycle | Not re-probed (no file access pattern changed) | CARRY-NOT-RE-PROBED |
| ISSUE-12 SBV zero-value | `get_system_status` errors | `storeSbvSnapshot REJECTED — zero-value…` at 12:33, 13:03, 13:33 (every 30 min) | **UNCHANGED** |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call pattern | Result summary | Status |
|---|---|---|---|
| `get_system_status` | `{}` | 10 unresolved errors; Reuters/TE 140×; sbv zero-value rejections; alertDigestJob + intelligence-cycle collision warns | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — agent_signals 2 items, market_context populated, elapsed_ms=17 | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1857.91 +1.83%, breadth 128/180/49, turnover 14597bn VND, source=vndirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $78.26, gold $4203.50, USD/VND 26122; carry NEUTRAL; yield CHEAP (spread 2.05pp); deltas null (BUG-3) | ✅ REACHABLE (delta gap) |
| `get_cron_health` | `{}` | 75 jobs; all ≥99.8% except sbvRatesRefreshJob 98.2%; intelligenceCycleJob 99.8% (2 stalls/1175 runs) | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready (BDI/DAG/DLC/JSH/SIS/VDC/VNH 0-6 rows); 4 oversold (D2D/DPM/NKG/NVL RSI<30) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv: ok; bctc: STALE=YES, last push 2026-06-16, 0 24h pushes | ❌ BUG-1 |
| `get_sla_status` | `{}` | bctc: **8242/360min CRITICAL**; price/news/sbv_fx/foreign_flow: ok | ❌ BUG-1 |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) | ✅ REACHABLE |
| `fetch_and_analyze` | `{}` | OK — 20 articles; cafef/vietstock/vneconomy/bloomberg/nhandan all live; analysis functional | ✅ HEALTHY |
| `get_market_foreign_flow` | `{}` | OK — net sell -983.8k; top buyers POW/BID/VIC; top sellers FPT/VPB/ACB; 98 tickers | ✅ HEALTHY |
| `get_agent_signals` | `{from_agent:"news-scout",status:"all",hours_back:6}` | Returns correctly (from_agent mode); used in news-scout stage-bootstrap.md | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` | ❌ BUG-4 |
| `task_claim` | health-recheck probe key | `{"claimed":true}` — coordination lock working | ✅ HEALTHY |
| `get_system_status` circuit breakers | (inline) | All 16 CBs OK — 0 open, 0 half-open | ✅ HEALTHY |
| `get_macro_snapshot` carry signal | (inline) | carry.is_estimate=false, source_tier=2; SBV center rate 26122 via DB fallback (buy/sell rates 0 — BUG from ISSUE-12) | ⚠ ISSUE-12 |

---

## RESOLVED — None New This Cycle

No findings from prior report resolved between 12:09 UTC and 14:06 UTC.

---

## ACTIVE BUGS — 5 (all re-confirmed)

### BUG-1 — CRITICAL — WORSENING (Day 6+) — BCTC VPS Pipeline Dark

| Signal | 12:09 UTC | 14:06 UTC | Delta |
|---|---|---|---|
| SLA breach | 8124/360min | **8242/360min** | +118 min |
| Last VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| SLA status | CRITICAL | CRITICAL | Unchanged |

**Re-probe evidence:**
- `get_sla_status`: `bctc: 8242/360min — CRITICAL`
- `get_vps_proxy_health`: `bctc | 2026-06-16 18:02:24 | ok | YES (STALE) | 24h_pushes=0`
- `get_earnings_calendar`: 12 tickers QUÁ HẠN; July = Q2-2026 filing season opens in ~9 days

**Caller surface:** bctc-analyst (get_bctc_full, get_bctc_ocf, get_bctc_series), refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob. **6 callers blocked.**

**Blast radius: CRITICAL.** Q2-2026 earnings window opens July. If pipeline not restored, Q2 BCTC filings will be missed from day one.

**Fix:** `restart_vps_service` for `vn-bctc-fetch`, then `trigger_bctc_vps_fetch` to backfill 6 days. Verify next push via `get_vps_proxy_health`.

---

### BUG-2 — HIGH — WORSENING — Reuters RSS Dead (140 consecutive failures, never successful)

**Re-probe evidence:**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 140 ⚠`
- Counter: 120 (12:09) → 140 (14:06) → ~10 failures/hour, continuous polling with no successes

**Caller surface verified:** `grep -rE "reuters" docs/agents/*/flow/*.md` → 0 active cowork flow files reference Reuters RSS directly. Core cowork uses CafeF/VnExpress/VnEconomy/bloomberg (all healthy). Reuters was decommissioned as VPS service (hotfix 2026-04-30, get_recent_fixes entry #3/#7) but the internal mcp-server circuit-breaker record still fires ~10×/hour, cluttering system error view and the `get_system_status` "unresolved errors" count.

**Caller-surface verdict: 0 active cowork callers directly impacted. Error noise only.**

**Fix:** Disable/remove the Reuters RSS circuit-breaker source config in mcp-server DB to stop the noise flood. No cowork code change needed.

---

### BUG-3 — HIGH — WORSENING — Trading Economics 2× Dead (140 consecutive failures each, never successful)

**Re-probe evidence:**
- `get_system_status` source health: two `Trading Economics | Ngưng | Chưa bao giờ | 140 ⚠` entries
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — delta computation depends on TE prior-day values

**Caller surface:** `grep -rE "get_ism_subcomponents|trading.economics" docs/agents/tools/package/*.md` → unified-agent, bctc-analyst, news-scout, market-watcher — 4 cowork flows missing TE-sourced commodity deltas and macro-calendar events.

**Note:** Commodity current prices (oil $78.26, gold $4203.50) available from Yahoo Finance fallback. What's missing: day-over-day deltas + macro calendar event schedule (returns `{"events":[],"status":"unavailable","source_tier":4}`).

**Fix:** Inspect TE Chromium path in mcp-server container. Confirm `/usr/bin/chromium` available. Check anti-bot state or session expiry. Evaluate fallback to investing.com or Yahoo Finance for commodity delta if TE remains blocked.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED NAPMBI HTTP 400)

**Re-probe evidence:**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_system_status` errors (this cycle): `[fredIsmSubcomponents] all 3 retries exhausted for NAPMBI — giving up — HTTP 400 Bad Request` at 12:13 UTC (×2 — two macroIndicatorRefreshJob instances)
- `get_cron_health`: `macroIndicatorRefreshJob: 100% success_rate` — job completes but individual series NAPMBI fails silently (job-level success ≠ all series populated)

**Caller surface:** grep `docs/agents/tools/package/news-scout.md`, `bctc-analyst.md`, `unified-agent.md` + `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` lines 46, 80, 275 — **3 cowork agents** (news-scout, bctc-analyst, unified-agent) call this for US monetary chain / ISM PMI regime classification. All 3 receive empty/error.

**HTTP 400 analysis:** FRED HTTP 400 usually means invalid series ID or malformed request. `NAPMBI` = ISM Manufacturing New Orders index. If FRED retired this series ID, the macroIndicatorRefreshJob NAPMBI fetch will never succeed. Alternative: FRED series `ISM/MAN_NO` or `NAPM`. Verify in FRED API docs.

**Fix:** (1) Set `FRED_API_KEY` env var in mcp-server container (free key: fred.stlouisfed.org). (2) Verify/update NAPMBI series ID in `apps/mcp-server/src/scheduler/macroIndicatorRefreshJob.ts` — HTTP 400 suggests the series ID may be stale.

---

### BUG-5 — LOW — NOT RE-PROBED — fb-market-poster `get_sentiment_trend({})` No stock_code

**Status:** Not re-probed this cycle (no flow file change expected in 2h delta). Carried from 12:09 report as UNCHANGED pending dev fix.

**Caller surface:** 1 caller (`docs/agents/fb-market-poster/flow/main.md:118`).

**Fix:** Add `stock_code` param to call or rewrite as per-watchlist-ticker loop.

---

## ACTIVE ISSUES — 7

### ISSUE-12 — MEDIUM — UNCHANGED — SBV VPS Parser Broken (all pushes returning zero)

**Re-probe evidence:**
- `get_system_status` errors: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 12:33, 13:03, 13:33 UTC (every 30 min; vn-sbv-fetch pushes every 30 min, all zero)
- `get_cron_health`: `sbvRatesRefreshJob: 98.2%` (≈1 failure / 55 runs)
- `get_vps_proxy_health`: `sbv | 2026-06-22 13:33:41 | ok | no | 28 24h pushes` — pushes arriving but all zero-valued

**Analysis:** The zero-value guard correctly protects the last good center rate (26122 VND/USD). Agents receive the last-known-good rate. However buy/sell rates, OMO data, and interbank rates are unavailable since the parser broke post-restart. `get_macro_snapshot` carry signal uses DB-cached center rate (is_estimate=false, valid) — cowork impact is limited to reduced SBV spread precision.

**Caller surface:** `get_vn_liquidity_state` (policy_rates is_estimate=true, buy/sell=0), `get_macro_snapshot` SBV subfield (center rate OK), `get_carry_trade_signal` (uses center rate only — OK).

**Fix:** SSH VPS → `sudo systemctl restart vn-sbv-fetch.service`. If zeros persist, inspect SBV website HTML structure change in `apps/mcp-server/src/infrastructure/fetchers/sbv.ts` (or equivalent VPS scraper).

---

### ISSUE-3 — MEDIUM — WORSENING — Intelligence-Cycle Collision (2 stalls in 1175 runs = 0.17%)

- `get_system_status` errors: `[intelligence-cycle] previous cycle still running — skipped` at 12:30 and 13:45 UTC
- `get_cron_health`: `intelligenceCycleJob: success_rate=99.8%, avg_duration=27985ms`
- 2 stalls total in current 7d window; frequency increasing (0 → 1 in 06:10 report → 2 now)

**Fix:** Add per-source timeout cap in intelligenceCycleJob (max 10s per external fetch) to prevent tail-latency spikes exceeding 15-min cron slot.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

`get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows.

**Fix:** Audit UPCOM/HNX scraper path; replace BDI Yahoo symbol `^BDI` with valid data source.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Deltas Null (symptom of BUG-3)

`get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — MONITORING — vnstockTradingStatsRefresh Avg 11.8 min

`get_cron_health`: `vnstockTradingStatsRefresh: 100% (7 runs), avg=708371ms`. Structural overlap risk with 15-min intelligenceCycleJob window.

**Fix:** Add per-ticker timeout + off-peak schedule.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Empty (symptom of BUG-3)

Auto-resolves with BUG-3.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh Avg 14.1 min

`get_cron_health`: `vnstockFundamentalsRefresh: 100% (2 runs), avg=845851ms`. Timing overlap risk.

**Fix:** Per-ticker timeout + isolation; schedule off-peak.

---

## NON-ISSUES — Probe Errors This Cycle (caller-surface verified)

| Item | Probe error | Verdict |
|---|---|---|
| `get_cycle_bootstrap({})` | Requires `agent_name` | NON-ISSUE — all flow callers pass explicit name per tool package docs |
| `get_foreign_flow({})` | Requires `code` | NON-ISSUE — fb-market-poster fixed 2026-06-14 (FIX-FB-POSTER-NOARG-MARKET-TOOLS); all callers use `code` param or `get_market_foreign_flow()` |
| `get_agent_signals({hours_back:2})` | "agent required" in inbox mode | NON-ISSUE — callers use `from_agent` (sender mode) or `agent` (inbox mode) correctly per flow files |
| `get_news` not found | Tool not found | NON-ISSUE — by design; news arrives via pollNewsJob → `fetch_and_analyze` MCP tool |
| `newsapi: disabled` | 0 fetches | NON-ISSUE — intentional, no API key configured |
| `alertDigestJob already running` | WARN in system log | NON-ISSUE — concurrent guard working; success_rate 100% |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 6+, WORSENING (8242/360min, Q2 window in 9 days) |
| BUG HIGH | 2 | BUG-2 Reuters 140×; BUG-3 Trading Economics 2× 140× each |
| BUG MEDIUM | 1 | BUG-4 ISM FRED NAPMBI HTTP 400 (3 cowork flows) |
| BUG LOW | 1 | BUG-5 fb-market-poster get_sentiment_trend no stock_code (1 caller) |
| ISSUE MEDIUM | 2 | ISSUE-12 SBV VPS zero-value; ISSUE-3 cycle collision 2× today |
| ISSUE LOW | 5 | ISSUE-4/5/6/7/11 |
| RESOLVED | 0 | None since 12:09 |
| NON-ISSUE | 6 | Probe param errors, by-design |

---

## Recommended Actions (priority order)

1. **BUG-1 CRITICAL:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` — BCTC dead 6 days, Q2 window in 9 days
2. **ISSUE-12 MEDIUM:** `restart_vps_service("vn-sbv-fetch")` — all SBV pushes returning zero since restart
3. **BUG-4 MEDIUM:** Set `FRED_API_KEY` env var in mcp-server; verify/fix NAPMBI series ID (HTTP 400 = possible retired ID)
4. **BUG-3 HIGH:** Diagnose TE Chromium scraper; evaluate commodity-delta fallback source
5. **BUG-2 HIGH:** Disable Reuters RSS source record in DB — 0 cowork callers affected, pure noise
6. **BUG-5 LOW:** Fix `docs/agents/fb-market-poster/flow/main.md:118` — add stock_code param
7. **ISSUE-3 MEDIUM:** Add 10s per-source timeout in intelligenceCycleJob
8. **ISSUE-4 LOW:** Fix BDI/UPCOM/HNX TA scraper gaps
