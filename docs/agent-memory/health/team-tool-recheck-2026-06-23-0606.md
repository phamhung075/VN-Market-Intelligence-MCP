# Team MCP Tool Health Recheck — 2026-06-23T06:06Z

**Cycle:** 2026-06-23T06:06Z (UTC — VN market OPEN 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-23-0403.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~10h 3m (restarted ~2026-06-22T20:03:15Z)
**DB:** market.db 289.79 MB, WAL 0 B
**Probe scope:** 15 tools probed live; full Step 3c re-probe of all 5 prior BUGs + ISSUE-12 + ISSUE-3

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe command | This cycle result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status` | vn-bctc-fetch unhealthy, last push 2026-06-16 18:02:24, 0 24h pushes, SLA 9203/120min | **WORSENING +961 min vs 14:06 UTC yesterday** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 113 ⚠` (counter reset on server restart; continuous failure) | **UNCHANGED (continuous)** |
| BUG-3 TE dead | `get_system_status`, `get_macro_snapshot` | Two TE entries: 113/114 failures; oilUsdDelta/goldUsdDelta/usdVndDelta all null | **UNCHANGED (continuous)** |
| BUG-4 ISM no_data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | **UNCHANGED** |
| BUG-5 fb-poster sentiment_trend | `grep docs/agents/fb-market-poster/flow/main.md` | Line 118: `arguments={}` — `stock_code` still missing | **UNCHANGED** |
| ISSUE-12 SBV zero-value | `get_vps_proxy_health`, `get_system_status` | sbv 12 24h pushes (ok), but `storeSbvSnapshot REJECTED — zero-value` errors persist | **UNCHANGED** |
| ISSUE-3 cycle collision | `get_cron_health` | intelligenceCycleJob: 99.8%, avg 28052ms, 1187 runs | **UNCHANGED** |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call pattern | Result summary | Status |
|---|---|---|---|
| `get_system_status` | `{}` | 10 unresolved errors (all foreign-flow); Reuters/TE 113-114×; BCTC 153.4h stale; 50 open high/critical warnings | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — 1 agent_signal, market_context populated, elapsed_ms=13 | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1881.85 +1.29%, breadth 123/170/50, turnover 16253bn VND, source=vndirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $77.02, gold $4137, USD/VND 26128; carry NEUTRAL; yield CHEAP; deltas null (BUG-3) | ✅ REACHABLE (delta gap) |
| `get_cron_health` | `{}` | 75+ jobs; all ≥99.8% except sbvRatesRefreshJob 98.2%; intelligenceCycleJob 99.8% (ISSUE-3) | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready (BDI=0/DAG=1/DLC=0/JSH=0/SIS=0/VDC=0/VNH=6); 4 oversold (D2D/DPM/NKG/NVL RSI<30) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv/foreign-flow: ok; bctc: STALE=YES, last push 2026-06-16, 0 24h pushes | ❌ BUG-1 |
| `get_vps_service_health` | `{}` | vn-bctc-fetch UNHEALTHY (6d 11h 57m uptime); 4 others healthy | ❌ BUG-1 |
| `get_sla_status` | `{}` | bctc: **9203/120min CRITICAL**; price/news/sbv_fx/foreign_flow: ok | ❌ BUG-1 |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) | ✅ REACHABLE |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows."}` | ❌ BUG-4 |
| `get_agent_signals` | `{from_agent:"news-scout",status:"all",hours_back:6}` | "Không có tín hiệu mới" (no signals — normal if news-scout hasn't run) | ✅ HEALTHY |
| `task_claim` | `{task_id:"health-recheck-probe-2026-06-23",task_kind:"sprint-task",ttl_seconds:60}` | `{"claimed":true}` — coordination lock working | ✅ HEALTHY |
| `task_release` | `{task_id:"health-recheck-probe-2026-06-23"}` | `{"ok":true}` | ✅ HEALTHY |
| `get_rate_limit_status` | `{}` | 14 sources; 3 in "Chờ" (wait=1s): cafef, vneconomy, vnexpress — normal rate limiting | ✅ HEALTHY |

---

## STEP 3b — Caller-Surface Verification

| Finding | Grep run | Result |
|---|---|---|
| BUG-5 `get_sentiment_trend` no stock_code | `grep -rn "get_sentiment_trend" docs/agents/**/*.md` | `docs/agents/fb-market-poster/flow/main.md:118: arguments={}` — 1 broken caller. Tool doc `docs/agents/tools/list/get_sentiment_trend.md` confirms `stock_code \| string \| Yes`. `market-analysis.md:7` also documents this requirement. |
| BUG-2 Reuters no callers | `grep -rE "reuters" docs/agents/*/flow/*.md` → 0 matches | 0 affected cowork callers — error noise only |
| BUG-6 foreign-flow direct fetch dead | `get_vps_proxy_health` push log | VPS push path delivering 103 items/min; direct fetch dead but data still flows via VPS. Error noise: all 10 `unresolved_errors` slots consumed by this job. |
| `task_claim` enum | Probe used `task_kind:"health-probe"` → rejected | NON-ISSUE — my probe used invalid enum. Live callers use `sprint-task` / `commit-mutex` (both valid per flow files). Caller-surface: 0 affected. |

---

## ACTIVE BUGS — 6 (5 re-confirmed + 1 new)

### BUG-1 — CRITICAL — WORSENING (Day 7) — BCTC VPS Pipeline Dark

| Signal | Prior (14:06 UTC 2026-06-22) | This cycle (06:06 UTC 2026-06-23) | Delta |
|---|---|---|---|
| SLA breach | 8242/120min | **9203/120min** | +961 min |
| Last VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| Service status | unhealthy | **unhealthy** | Unchanged |
| VPS uptime | — | 6d 11h 57m | — |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch | unhealthy | 4m ago | 0ms | 6d 11h 57m`
- `get_vps_proxy_health`: `bctc | 2026-06-16 18:02:24 | ok | YES (STALE) | 24h_pushes=0`
- `get_sla_status`: `bctc: 9203/120min — CRITICAL`
- `get_earnings_calendar`: 12 QUÁ HẠN tickers; Q2-2026 window opens July 1 (~8 days)

**Caller surface:** bctc-analyst (`get_bctc_full`, `get_bctc_ocf`, `get_bctc_series`), `refine_bctc_md`, `bctcPdfPullJob`, `bctcQueueEnricherJob`, `bctcReparseJob` — **6 callers blocked**.

**Blast radius: CRITICAL.** Q1 overdue filings for BID, GAS, PLX, VEA, PPC cannot be parsed. Q2-2026 window opens July 1 — zero days of buffer remain.

**Fix:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` for backfill. Verify via `get_vps_proxy_health` (expect 24h_pushes > 0 within 5 min).

---

### BUG-2 — HIGH — CONTINUOUS — Reuters RSS Dead

**Re-probe evidence:**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 113 ⚠`
- Counter reset after server restart at 2026-06-22T20:03:15Z. 113 new failures in ~10h = ~11/hour. Continuous, never successful.

**Caller surface (this cycle):** `grep -rE "reuters" docs/agents/*/flow/*.md` → **0 matches**. Cowork flows use CafeF/VnExpress/VnEconomy/Bloomberg (all healthy). Reuters RSS decommissioned as VPS service but circuit-breaker record remains active in mcp-server, consuming error slots and polluting `get_system_status` output.

**Fix:** Disable/remove Reuters RSS circuit-breaker source config in mcp-server DB. No cowork code change needed.

---

### BUG-3 — HIGH — CONTINUOUS — Trading Economics 2× Dead

**Re-probe evidence:**
- `get_system_status`: `Trading Economics | Ngưng | Chưa bao giờ | 113 ⚠` and `| 114 ⚠` (two entries, counter reset post-restart)
- `get_macro_snapshot`: `"oilUsdDelta":null,"oilUsdDirection":"unknown","goldUsdDelta":null,"goldUsdDirection":"unknown","usdVndDelta":null,"usdVndDirection":"unknown"`
- `get_rate_limit_status`: `tradingeconomics.com | Chua goi | 0s` — zero outbound calls from main server (TE path fully broken)

**Caller surface:** unified-agent, news-scout, bctc-analyst, market-watcher — **4 cowork flows** missing commodity day-over-day deltas and macro calendar events. Current prices (oil/gold/USD-VND) available via Yahoo Finance fallback (source_tier=1 confirmed).

**Fix:** Inspect TE Chromium scraper in VPS `vn-price-fetch` (or equivalent). Confirm `/usr/bin/chromium` available, anti-bot not tripped. Evaluate investing.com or Yahoo Finance for commodity deltas as interim fallback.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED NAPMBI HTTP 400)

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})` → `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_cron_health`: `macroIndicatorRefreshJob: 100% success_rate, avg=17320ms` — job completes but NAPMBI series fetch returns HTTP 400 silently (job-level success ≠ series populated)

**Caller surface:** unified-agent, bctc-analyst, news-scout — **3 cowork agents** blocked on ISM PMI regime classification.

**Fix:** (1) Set `FRED_API_KEY` env var in mcp-server container. (2) Verify NAPMBI series ID — HTTP 400 = invalid/retired series. Try `ISM/MAN_NO` or `NAPM` as replacements in `macroIndicatorRefreshJob.ts`.

---

### BUG-5 — LOW — UNCHANGED — fb-market-poster `get_sentiment_trend` missing required `stock_code`

**Re-probe evidence (this cycle):**
- `grep -n "get_sentiment_trend" docs/agents/fb-market-poster/flow/main.md` → line 118: `arguments={}`
- `docs/agents/tools/list/get_sentiment_trend.md`: `stock_code | string | Yes | — | Stock ticker code`
- `docs/agents/unified-agent/flow/market-analysis.md:7`: "`get_sentiment_trend()` requires `stock_code` param — NOT portfolio-wide. Skip here; call per-ticker only on event trigger."`

**Caller-surface:** 1 caller with broken pattern. All other callers pass `stock_code`.

**Fix:** `docs/agents/fb-market-poster/flow/main.md:118` — replace `arguments={}` with a per-watchlist-ticker loop or remove the call and source sentiment from the unified-agent MARKET dish instead.

---

### BUG-6 — MEDIUM — NEW — foreign-flow-job Direct Fetch Dead (All Fallbacks Exhausted Every Minute)

**Discovery evidence (this cycle — not in prior report):**
- `get_system_status` DB STATUS: 10 unresolved errors, ALL from foreign-flow:
  ```
  [2026-06-23 06:01–06:03] [WARN] fallback: primary endpoint failed
  [2026-06-23 06:01–06:03] [WARN] fallback: all fallback sources exhausted, returning empty
  [2026-06-23 06:01–06:03] [WARN] foreign-flow-job: fallback activated
  [2026-06-23 06:01–06:03] [WARN] foreign-flow-job: all fallbacks exhausted
  ```
- `get_vps_proxy_health` push log: foreign-flow VPS pushes healthy — `103 items` every minute
- `get_cron_health`: `foreignFlowFetcherJob: 100% success_rate, avg=234ms, 2033 runs` — job-level success masking endpoint failure

**Analysis:** Main server direct fetch path for foreign flow is broken (primary + all fallbacks dead). VPS push path is delivering data (sole active path). Architecture: dual-path design, main-server fetch path fully broken but VPS push compensates. Impact: (1) all 10 `unresolved_errors` slots consumed by this recurring noise, crowding out genuine new errors; (2) zero resilience if VPS push also fails. `foreignFlowFetcherJob` reports 100% success because the job completes (even when returning empty), masking the broken endpoint from cron health monitoring.

**Caller-surface:** `get_market_foreign_flow` returns data correctly via VPS-pushed DB values — **0 immediate cowork data impact**. Risk: error-slot starvation for real new issues.

**Fix:** (1) Identify and fix/disable broken primary+fallback endpoints in `foreignFlowFetcherJob` (or stub them out if VPS push is the canonical path). (2) Consider not counting "all fallbacks empty" as a successful job run — log it as `partial`.

---

## ACTIVE ISSUES — 4 (re-confirmed)

### ISSUE-12 — MEDIUM — UNCHANGED — SBV VPS Parser Zero-value

**Re-probe:** `get_vps_proxy_health`: `sbv | 2026-06-23 05:34:11 | ok | no | 12 24h_pushes` — pushes arriving, not stale. Yet `get_system_status` shows `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` every 30 min. Center rate protected at 26128 VND/USD. Buy/sell/OMO rates unavailable.

**Fix:** SSH VPS → `sudo systemctl restart vn-sbv-fetch.service`. If zeros persist, inspect SBV website HTML structure change in VPS scraper.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Collision

**Re-probe:** `get_cron_health`: `intelligenceCycleJob: success_rate 99.8%, avg_duration=28052ms, 1187 runs`. 28s average vs 15-min slot is fine, but tail-latency spikes cause 0.2% stalls.

**Fix:** Add per-source 10s timeout cap in intelligenceCycleJob.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows.

**Fix:** Audit UPCOM/HNX scraper path; replace BDI Yahoo Finance symbol.

---

### ISSUE-6 — LOW — MONITORING — vnstockTradingStatsRefresh Avg 11.8 min

**Re-probe:** `get_cron_health`: `vnstockTradingStatsRefresh: 100%, avg=708371ms`. Overlap risk with intelligenceCycleJob.

---

## NON-ISSUES This Cycle

| Probe | Error | Verdict |
|---|---|---|
| `get_cycle_bootstrap({})` no agent_name | Invalid: agent_name required | NON-ISSUE — all callers pass explicit name per package docs |
| `task_claim({task_kind:"health-probe"})` | Invalid enum | NON-ISSUE — my probe used bad enum; live callers use `sprint-task`/`commit-mutex` — both valid |
| `get_agent_signals(news-scout, 6h)` empty | "Không có tín hiệu mới" | NON-ISSUE — news-scout may not have run in window |
| `newsapi: disabled` | 0 fetches | NON-ISSUE — intentional, no API key |
| `alertDigestJob` 100% success despite warnings | Normal concurrent guard | NON-ISSUE |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 7, WORSENING (9203/120min, Q2 window in 8 days) |
| BUG HIGH | 2 | BUG-2 Reuters 113×; BUG-3 Trading Economics 2× 113-114× |
| BUG MEDIUM | 2 | BUG-4 ISM FRED NAPMBI (3 cowork flows); BUG-6 NEW foreign-flow direct fetch dead (error-slot starvation) |
| BUG LOW | 1 | BUG-5 fb-market-poster get_sentiment_trend no stock_code (1 caller) |
| ISSUE MEDIUM | 2 | ISSUE-12 SBV zero-value; ISSUE-3 cycle collision |
| ISSUE LOW | 2 | ISSUE-4 TA gaps; ISSUE-6 vnstock stats timing |
| RESOLVED | 0 | None this cycle |
| NON-ISSUE | 5 | Probe param errors, by-design |

---

## Recommended Actions (priority order)

1. **BUG-1 CRITICAL — NOW:** `restart_vps_service("vn-bctc-fetch")` then `trigger_bctc_vps_fetch` — Day 7, Q2 window opens July 1
2. **ISSUE-12 MEDIUM:** `restart_vps_service("vn-sbv-fetch")` — SBV zero-value pushes ongoing
3. **BUG-6 MEDIUM (NEW):** Fix/stub broken foreign-flow primary+fallback endpoints — error-slot starvation crowding out real issues
4. **BUG-4 MEDIUM:** Set `FRED_API_KEY` + fix NAPMBI series ID — 3 cowork flows affected
5. **BUG-3 HIGH:** Diagnose TE Chromium scraper on VPS; wire commodity-delta fallback
6. **BUG-2 HIGH:** Disable Reuters RSS circuit-breaker record in DB — 0 callers, pure noise
7. **BUG-5 LOW:** Fix `docs/agents/fb-market-poster/flow/main.md:118` — add stock_code per-ticker loop
8. **ISSUE-3 MEDIUM:** Add 10s per-source timeout in intelligenceCycleJob
