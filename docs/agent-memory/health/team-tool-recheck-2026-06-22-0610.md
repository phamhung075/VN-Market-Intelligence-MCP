# Team MCP Tool Health Recheck — 2026-06-22T06:10Z

**Cycle:** 2026-06-22T06:10Z (UTC — VN market OPEN 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-22-0410.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~4h 14m (restarted ~2026-06-22T01:56:20Z)
**DB:** market.db 287.77 MB, WAL 0 B
**Probe scope:** 30 tools probed; full STEP 3c re-probe of all 15 prior active findings

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All active bugs/issues from prior report re-probed from scratch. Mark fresh vs stale.

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | vn-bctc-fetch: unhealthy, uptime=5d 12h 2m; SLA 7764/120min CRITICAL; last_push 2026-06-16T18:02:24Z | **WORSENING** +119min |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 55 ⚠` | UNCHANGED (counter 29→55) |
| BUG-3 TE dead | `get_system_status`, `get_macro_snapshot`, `get_macro_calendar` | TE both entries: 55 failures; deltas null; calendar `{"events":[],"status":"unavailable"}` | UNCHANGED (counter 29→55) |
| BUG-4 ISM no FRED_API_KEY | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}` | UNCHANGED |
| BUG-NEW-1 vn_index_cache schema | `grep schema-market-data.ts` | `CREATE TABLE IF NOT EXISTS vn_index_cache ( code TEXT PRIMARY KEY, ... )` — fix FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (2026-06-20) confirmed | **✅ RESOLVED** |
| BUG-NEW-2 fb-market-poster get_sentiment_trend | `grep get_sentiment_trend docs/agents/fb-market-poster/flow/main.md` | Line 118: `call_tool(..."get_sentiment_trend", arguments={})` — no stock_code | UNCHANGED — still broken |
| ISSUE-2 warnings backlog | `get_system_status` DB Audit | `open_warnings: 49, pending_feedback: 67` | UNCHANGED |
| ISSUE-3 cycle stalls | `get_cron_health` | `intelligenceCycleJob: success, last_run 06:00, avg=27446ms` | IMPROVED — no stall this cycle |
| ISSUE-4 7 TA tickers | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows | UNCHANGED |
| ISSUE-5 commodity deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED (linked BUG-3) |
| ISSUE-6 vnstock 85.7% | `get_cron_health` | `vnstockTradingStatsRefresh: 0.86 (85.7%), avg=649220ms, total_runs=7` | UNCHANGED |
| ISSUE-7 macro-calendar empty | `get_macro_calendar({})` | `{"events":[],"status":"unavailable","source_tier":4}` | UNCHANGED (linked BUG-3) |
| ISSUE-11 vnstockFundamentalsRefresh 845s | `get_cron_health` | `avg_duration=845851ms (14.1 min), total_runs=2` | UNCHANGED |
| ISSUE-NEW-1 foreignFlow noise | `get_system_status` | `[fallback] primary endpoint failed` every minute; VPS push healthy | UNCHANGED |
| ISSUE-NEW-2 macro alert noise | `get_alerts` | 4 CRITICAL macro deviations (gold/oil); bidirectional extreme on same day | UNCHANGED |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — agent_signals empty (valid), market_context populated, system_status in 8ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1855.65 +1.71%, breadth 79/205/57, source_tier=2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $79.03, gold $4210.3, USD/VND 26122; deltas null (BUG-3) | ✅ REACHABLE (data gap) |
| `get_system_status` | `{}` | foreign-flow noise + SBV zero-value rejection; Reuters/TE 55×; 49 open_warnings | ✅ REACHABLE |
| `get_cron_health` | `{}` | 75 jobs — all ≥98% except vnstockTradingStatsRefresh (85.7%); all others healthy | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready; 5 oversold signals (D2D/DPM/NKG/NVL/REE) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv: ok; bctc: STALE since 2026-06-16T18:02:24Z (0 pushes 24h) | ⚠ BUG-1 |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy** 0ms; 4 others: healthy | ⚠ BUG-1 |
| `get_sla_status` | `{}` | bctc: 7764/120min **CRITICAL**; news: 36/30min HIGH (minor, transient); price/sbv_fx/foreign_flow: ok | ⚠ BUG-1 + minor |
| `get_alerts` | `{}` | 16 alerts; 4 CRITICAL macro deviations; VIC/VHM price surges +6.95%/+6.96% | ✅ HEALTHY |
| `get_earnings_calendar` | `{}` | 41 tickers; 11 QUÁ HẠN; June not earnings window (next: July) | ✅ HEALTHY |
| `get_agent_signals` | `{from_agent:null, status:"all", hours_back:0.25}` | 14 signals from alert-engine (all-producers mode, correct) | ✅ HEALTHY |
| `get_agent_signals` | `{agent:"news-scout", hours_back:1}` | Empty — no news-scout signals last hour (valid) | ✅ HEALTHY |
| `task_claim` | `{task_id:..., task_kind:"sprint-task", ...}` | Schema validates correctly (health-check is not a valid kind — confirmed enum) | ✅ REACHABLE |
| `get_earnings_calendar` | `{}` | 41 tickers, correct format | ✅ HEALTHY |
| `get_foreign_flow` | `{code:"HPG"}` | OK — neutral, 10-day history, daily zero net for 2026-06-22 (early session) | ✅ HEALTHY |
| `get_market_foreign_flow` | `{}` | OK — 95 tickers, net −6.1k NET SELL, live data | ✅ HEALTHY |
| `get_vn_macro_indicators` | `{}` | OK — IIP June 2026 data, source_tier=1, not estimate | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | ERROR: no_data — FRED_API_KEY missing | ❌ BUG-4 |
| `get_macro_calendar` | `{}` | `{"events":[],"status":"unavailable","source_tier":4}` | ❌ ISSUE-7 |
| `get_bctc_pending_refine` | `{limit:5}` | 5 PDFs pending/partial (VCB/HPG/GVR/HVN refine queued) — BCTC refine backlog | ⚠ linked BUG-1 |
| `get_recent_signals` | `{hours_back:2}` | OK — 14 verified_decision signals from alert-engine, clean | ✅ HEALTHY |
| `get_vps_service_health` | `{}` | 4 healthy, 1 unhealthy (vn-bctc-fetch) | ⚠ BUG-1 |
| `get_pipeline_health` | `{}` | TA health for 41 tickers; 5 oversold signals | ✅ REACHABLE |
| `send_telegram` | schema check only | Requires `message: string` + `channel: enum`; NOT `text` — schema confirms prior | ✅ SCHEMA OK |
| `post_agent_signal` | schema check | Requires from_agent/to_agent/signal_type/payload — reachable | ✅ REACHABLE |

---

## STEP 3c — RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle | Evidence |
|------|-------------|------------|---------|
| BUG-NEW-1 vn_index_cache missing `code` column | MEDIUM — schema failure every 5 min | **✅ RESOLVED** — DDL has `code TEXT PRIMARY KEY`; fix FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH committed 2026-06-20 | `grep vn_index_cache apps/mcp-server/src/infrastructure/db/schema-market-data.ts` → line 137: `code TEXT PRIMARY KEY` confirmed |

---

## ACTIVE BUGS — 5

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 6+

| Signal | 04:10 UTC | 06:10 UTC | Delta |
|--------|-----------|-----------|-------|
| vn-bctc-fetch uptime | 5d 10h 2m | **5d 12h 2m** | +2h |
| SLA breach (actual/SLA) | 7645/120min | **7764/120min** | +119 min |
| Last BCTC VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |
| BCTC refine pending | — | 5 PDFs queued (VCB PARTIAL, HPG/GVR/HVN/HVN PENDING) | Backlog growing |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms, uptime=5d 12h 2m`
- `get_sla_status`: `bctc: 7764/120min — CRITICAL`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_bctc_pending_refine({limit:5})`: 5 PDFs awaiting image-vision refinement; OCR text complete

**Caller surface:** bctc-analyst, refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob, market-analyst (BCTC path)

**Blast radius: CRITICAL.** 6+ days without BCTC ingestion. 11 Q1 watchlist tickers QUÁ HẠN. July earnings window starts in ~9 days — if pipeline not restored, Q2-2026 filings will be missed from day one.

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → run `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead (55 consecutive failures, never successful)

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 55 ⚠`
- Counter grew from 29 (04:10 UTC) to 55 (06:10 UTC) — ~1 failure/3 min confirming continuous polling

**Caller-surface verification:**
```
grep -rE "reuters" docs/agents/*/flow/*.md
```
Result: `docs/agents/system-auditor/flow/main.md`, `docs/agents/dev-mainserver-crawls/knowledge.md`, `docs/agents/tools/list/fetch_and_analyze.md`, `docs/agents/ops-mainserver-fetch/flow/main.md` — 4 files reference Reuters.

**Affected callers: 1 ops flow; fetch_and_analyze tool doc. Core cowork flows (news-scout, unified-agent) receive articles via VnExpress/CafeF RSS which are healthy — direct Reuters impact LOW on cowork.**

**Fix:** Disable the Reuters RSS source record in DB/config — source decommissioned (fix #7 2026-04-30) but circuit-breaker record still fires ~20 errors/hour.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead (55 consecutive failures each, never successful)

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Trading Economics | Ngưng | Chưa bao giờ | 55 ⚠` (both entries)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`
- `get_macro_calendar({})`: `{"events":[],"status":"unavailable","source_tier":4}`

**Caller surface:** unified-agent (chef.md macro layer), market-watcher (macro risk), digest-predict (macro context), news-scout (macro regime), alert-commander (macro deviation) — 5 cowork flows with degraded macro delta / calendar data.

**Blast radius: Commodity deltas null system-wide. Macro calendar empty — agents cannot see upcoming events. 5 cowork flows missing TE data.**

**Fix:** Inspect Chromium scraper path in mcp-server container (`tradingEconomicsChromium.ts`). Confirm Chromium is available and cookies/session are valid. If Chromium blocked, evaluate alternative macro source.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`

**Caller surface:** bctc-analyst/flow/cycle.md, news-scout/flow/cycle.md, unified-agent/flow/chef.md — 3 cowork flows that use ISM PMI sub-components for US macro regime classification.

**Fix:** Set `FRED_API_KEY` env var in mcp-server container (free API: fred.stlouisfed.org/docs/api/api_key.html) → trigger `macroIndicatorRefreshJob`.

---

### BUG-5 (was BUG-NEW-2) — LOW — UNCHANGED — fb-market-poster Calls `get_sentiment_trend({})` Without `stock_code`

**Re-probe evidence (this cycle):**
- `grep get_sentiment_trend docs/agents/fb-market-poster/flow/main.md` → line 118: `call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})`
- Live probe: `call_tool("get_sentiment_trend", {})` → `{"error":"stock_code (or symbol) is required"}`

**Caller-surface verified:**
```
grep -rE "get_sentiment_trend" docs/agents/*/flow/*.md
```
- `docs/agents/fb-market-poster/flow/main.md:118` — calls with `arguments={}` ← **BROKEN** (1 affected caller)
- `docs/agents/unified-agent/flow/market-analysis.md` — explicitly skips aggregate call ← OK

**Caller count: 1 affected caller. 0 other flows broken.**

**Fix:** Update `docs/agents/fb-market-poster/flow/main.md:118` to call per-ticker in watchlist loop (e.g. `{stock_code: ticker}`) or remove sentiment call if aggregate trend not needed. Zone: agent-father.

---

## ACTIVE ISSUES — 8

### ISSUE-2 — HIGH — UNCHANGED — Warning/Feedback Backlog

`get_system_status` DB Audit: `open_warnings: 49 high/critical, pending_feedback: 67 new items`. Partially auto-resolves when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — IMPROVED (no stall this cycle)

`get_cron_health`: `intelligenceCycleJob: last_status=success, last_run=06:00, avg_duration=27446ms`. No stall observed. Monitoring continued.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

`get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 OHLCV rows. UPCOM/HNX feed gaps + BDI `^BDI` Yahoo broken. **Fix:** Audit UPCOM/HNX scraper path; replace `^BDI` Yahoo symbol with direct source.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Deltas Null (symptom of BUG-3)

`get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh Slow + 85.7% Success

`get_cron_health`: `vnstockTradingStatsRefresh: 85.7%, avg=649220ms (10.8 min), total_runs=7`. **Fix:** Per-ticker isolation + timeout; off-peak schedule.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Empty (symptom of BUG-3)

`get_macro_calendar({})`: `{"events":[],"status":"unavailable"}`. Auto-resolves with BUG-3.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh Extremely Slow (845s avg)

`get_cron_health`: `avg_duration=845851ms (14.1 min), total_runs=2`. Risks timing overlap with 15-min cycle slot. **Fix:** Per-ticker timeout + isolation; schedule off-peak (03:00 UTC).

---

### ISSUE-NEW-1 — LOW — UNCHANGED — foreignFlowFetcherJob Error Noise (every minute)

`get_system_status` shows every minute:
```
[fallback] primary endpoint failed — Unable to connect
[fallback] all fallback sources exhausted, returning empty
[foreign-flow-job] fallback activated / all fallbacks exhausted
```
BUT VPS push delivers foreign-flow every minute (101–103 items, healthy). Data SLA: ok (age 0 min). The direct HTTP fallback chain is broken; VPS push is the real pipeline. Error noise crowds out real errors in the system status view.

**Fix:** Suppress `foreignFlowFetcherJob` error logging when VPS push received <5 min ago, OR disable the redundant direct-fetch path entirely (VPS push is authoritative).

---

### ISSUE-NEW-2 — LOW — UNCHANGED — Bidirectional Extreme Macro Alerts (Gold/Oil σ noise)

`get_alerts` shows within 24h: Gold fired `+5.14σ EXTREME HIGH` at 01:00 UTC AND `−5.41σ EXTREME LOW` at 22:30 prior day; Oil fired `+5.3σ EXTREME HIGH` AND `−3.27σ EXTREME LOW` on the same day — both moving within plausible intraday ranges. Short rolling window generates extreme σ readings from normal volatility.

**Fix:** Increase σ rolling window from 2-day to 7-day minimum; or add 4h cooldown between same-asset CRITICAL macro alerts.

---

### IMPROVE-1 — NEW — SBV Zero-Value Rejection (protection working, upstream quality)

`get_system_status` error: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` (1 instance at 06:03:08).
`sbvRatesRefreshJob`: `success_rate=98.2%` (non-fatal, protection catches it).

**Analysis:** The zero-value guard is working correctly. Underlying issue is the SBV endpoint occasionally returning zeros (network blip or API edge case). Good row preserved. Low urgency but worth tracking.

**Caller-surface:** get_macro_snapshot USD/VND uses SBV data. Current value 26122 is valid (not zero). No agent impact.

**Fix (low priority):** Add retry (1× backoff) in `sbvRatesRefreshJob` before accepting a zero-value fetch result; log a WARN rather than ERROR when retry succeeds.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Result | Verification | Verdict |
|------|----------------|--------------|---------|
| `get_cycle_bootstrap({})` (no agent_name) | Validation error | Tool requires `agent_name`; all flow files call with explicit name (docs verified) | NON-ISSUE — probe error |
| `get_agent_signals({hours_back:1})` (no from_agent, no agent) | "agent required" | Inbox mode requires `agent`; market-watcher flow correctly uses `from_agent:null` | NON-ISSUE — probe error; flow correct |
| `get_foreign_flow({})` (no code) | Validation error | Tool requires `code`; fb-market-poster fixed 2026-06-14 (FIX-FB-POSTER-NOARG-MARKET-TOOLS) | NON-ISSUE — fix already landed |
| `task_claim({task_kind:"health-check"})` | Enum error | Enum: cowork-slot\|sprint-task\|dashboard-row\|commit-mutex; probe used invalid kind | NON-ISSUE — probe error |
| `newsapi: disabled` | 0 fetches | Intentional by design — no API key configured | NON-ISSUE — by design |
| Macro delta null | `oilUsdDelta:null` | Symptom of BUG-3 (TE dead) | NON-ISSUE — upstream cause documented |
| News SLA 36/30min | HIGH breach | Transient: 36 min (6 min over) — `pollNewsJob` ran 06:01:04, 3 min before probe | NON-ISSUE — transient gap |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 6+ (WORSENING: 7764/120min, July earnings window in 9d) |
| BUG HIGH | 2 | BUG-2 Reuters RSS dead (55×), BUG-3 Trading Economics 2× dead (55×) |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY (3 cowork flows) |
| BUG LOW | 1 | BUG-5 fb-market-poster get_sentiment_trend({}) broken (1 caller) |
| ISSUE HIGH | 1 | ISSUE-2 49 warnings / 67 feedback backlog |
| ISSUE MEDIUM | 1 | ISSUE-3 intelligence-cycle OK this cycle (watch) |
| ISSUE LOW | 6 | ISSUE-4/5/6/7/11/NEW-1/NEW-2 |
| IMPROVE | 1 | IMPROVE-1 SBV zero-value retry (low urgency) |
| **RESOLVED** | **1** | **BUG-NEW-1 vn_index_cache schema fix ✅ (2026-06-20)** |
| NON-ISSUE | 7 | Probe param errors, by-design, transient gaps |

---

## Recommended Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1 CRITICAL, Day 6+. Then `trigger_bctc_vps_fetch`. July earnings window opens in ~9 days.
2. **Set `FRED_API_KEY` env var** — BUG-4 free API, unblocks ISM for 3 cowork flows.
3. **Disable Reuters RSS source record** — BUG-2, ~20 errors/hour from decommissioned source.
4. **Diagnose TE Chromium path in mcp-server container** — BUG-3, unblocks commodity deltas + macro-calendar for 5 cowork flows.
5. **Fix `docs/agents/fb-market-poster/flow/main.md:118`** — BUG-5, add `stock_code` param or per-ticker loop (agent-father zone).
6. **Suppress foreignFlowFetcherJob error noise** — ISSUE-NEW-1, reduce false positives in system error view.
7. **Macro alert cooldown or wider σ window** — ISSUE-NEW-2.
8. **Per-ticker timeout for vnstockTradingStatsRefresh + vnstockFundamentalsRefresh** — ISSUE-6/11.
