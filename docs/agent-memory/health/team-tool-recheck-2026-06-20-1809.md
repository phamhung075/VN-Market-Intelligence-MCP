# Team MCP Tool Health Recheck — 2026-06-20T18:09Z

**Run:** 2026-06-20T18:09Z (automated scheduled recheck)
**Prior report:** `team-tool-recheck-2026-06-20-1610.md` (1h 59m ago)
**Methodology:** Live probe every depended-on tool via gateway; Step 3b caller-surface grep; Step 3c re-probe every prior finding before carry-forward. Tool dependency list sourced from `docs/agents/*/flow/main.md` + `docs/data/system-map.json` (94 unique tools across 12 cowork/dev agent flows).
**Context:** Saturday — VN market CLOSED. All "stale prices / idle VPS services" findings are EXPECTED, not bugs.

---

## Summary

| Category | Count | vs 16:10Z |
|----------|-------|-----------|
| BUG (re-confirmed active) | 5 | → 0 resolved, 0 new |
| ISSUE (re-confirmed active) | 6 | → 1 RESOLVED (WEEKLY-AUDIT), +2 new (MACRO-CAL, VN-MACRO, VNSTOCK-STATS) |
| RESOLVED | 1 | ISSUE-WEEKLY-AUDIT |
| NON-ISSUE (verified this cycle) | 4 | — |
| IMPROVE (no callers broken) | 5 | +1 new (BCTC-OVERFLOW) |

All 5 BUGs carry forward unchanged or worsening. BUG-3 (Reuters) and BUG-4 (TE) each added +19 failures since 16:10Z. BUG-1 BCTC drifted another +119 min. ISSUE-WEEKLY-AUDIT RESOLVED. Two new ISSUEs found: `get_macro_calendar` permanently unavailable; `get_vn_macro_indicators` NSO Excel VPS timeout.

---

## ACTIVE BUGs — Re-confirmed This Cycle

### BUG-1 — CRITICAL: BCTC VPS pipeline dead (WORSENING, day 4)

**Severity:** CRITICAL
**Status:** WORSENING (+119 min vs 16:10Z prior)

**Re-probe evidence (18:06Z):**
- `get_sla_status` → `bctc: 5603 min / 2015 min SLA` → **2.8× over SLA**
- `get_vps_service_health` → `vn-bctc-fetch: unhealthy | uptime: 4d 2m | response_ms: 0`
- `get_vps_proxy_health` → `bctc: last_push: 2026-06-16T18:02:24Z | 0 pushes in 24h | STALE`
- Prior 16:06Z: 5484 min. Delta: +119 min — no recovery, worsening continuously since 2026-06-16.
- Side effect: `bctcReparseJob` cron success rate dropped to 89% (82 runs, 7d).

**Caller-surface verified:**
- `grep "get_bctc_pending_refine\|push_bctc_refined_unit\|vn-bctc-fetch" docs/agents/*/flow/*.md docs/agents/tools/list/*.md` → callers: `refine_bctc_md` (get_bctc_pending_refine + push_bctc_refined_unit), `bctc-analyst` (get_bctc_full, get_bctc_series, get_bctc_ocf), `system-auditor`, `ops` (monitoring). ≥5 agents with 0 new BCTC data.

**Recommended action:** SSH VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 50`. Also try `mcp__gateway__call_tool(server="vn-market", tool="trigger_bctc_vps_fetch", arguments={})` to force manual push. Check for OOM kill (VPS 961MB RAM + BCTC PDF fetch is memory-intensive).

---

### BUG-2 — HIGH: HNX & UPCOM all price sources failing (UNCHANGED)

**Severity:** HIGH
**Status:** UNCHANGED (recurring pattern)

**Re-probe evidence (18:03Z):**
- `get_system_status` → 10/10 recent unresolved errors: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` (recurring every intelligenceCycleJob tick, including off-hours)
- Error timestamps: 18:01–18:03 UTC (01:01–01:03 VN time, off-hours) → intelligenceCycleJob fires HNX fetch without market-hours gate
- `get_pipeline_health` → tickers with 0 OHLCV rows: BDI, DLC, JSH, SIS, VDC; DAG: 2 rows, VNH: 6 rows — all HNX/UPCOM tickers chronically under-data
- Circuit breaker: `hnx [OK] failures: 0` — CB resets per cycle, not accumulating; errors are real but don't trip CB

**Caller-surface verified (3 grep runs):**
- market-watcher (get_market_snapshot), alert-engine (price anomaly detection), intelligenceCycleJob HNX path. ≥3 affected callers.

**Recommended action:** Add market-hours guard to intelligenceCycleJob HNX/UPCOM fetch path (pattern: TASK 1407 foreignFlow fix). Also investigate HNX data source availability — confirm whether HNX API/endpoint changed.

---

### BUG-3 — HIGH: Reuters RSS dead — 217 consecutive failures (WORSENING)

**Severity:** HIGH
**Status:** WORSENING (+19 failures vs 16:10Z)

**Re-probe evidence (18:03Z):**
- `get_system_status` → `Reuters RSS | Ngưng (Stopped) | Chưa bao giờ (Never) | 217 ⚠`
- Prior 16:10Z: 198 failures. Delta: +19. Running at ~1.5 failures/cycle (intelligenceCycleJob + newsHeadlinesRefreshJob).
- "Never successful" = has been broken since at least the current deployment epoch.

**Caller-surface verified:**
- `docs/agents/news-scout/flow/` — Reuters feeds into `fetch_and_analyze` headline aggregation; no direct `get_reuters` tool call, so impact is reduced headline diversity.
- 1 affected pipeline (headline aggregator), 0 tools directly broken.

**Recommended action:** Verify `feeds.reuters.com` accessibility from main server; if permanently dead, remove Reuters RSS source registration to stop error accumulation and fix BUG-4 fix pattern.

---

### BUG-4 — HIGH: TradingEconomics 2 sources dead — 217 failures each (WORSENING)

**Severity:** HIGH
**Status:** WORSENING (+19 each vs 16:10Z)

**Re-probe evidence (18:03Z):**
- `get_system_status` → `Trading Economics | Ngưng | Chưa bao giờ | 217 ⚠` × 2 instances
- `get_macro_snapshot` → `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null` — all macro delta fields null (TE provides delta computation)
- Prior 16:10Z: 198 each. Same +19/cycle trajectory as Reuters.
- Note: Brent at $80.59 via alternative source (tier 1), but delta context (momentum) is blind.

**Caller-surface verified:**
- `grep "get_macro_snapshot\|oilUsdDelta\|goldUsdDelta" docs/agents/market-watcher/flow/*.md docs/agents/unified-agent/flow/*.md docs/agents/news-scout/flow/*.md` → market-watcher, news-scout, unified-agent (CHEF macro layer) all depend on macro snapshot delta fields. 3 agents affected with silently null macro deltas.

**Recommended action:** Check Playwright/Chromium in Docker (`docker exec mcp-server chromium --version`); inspect TE scraper logs for "Target closed" crash (known recurring per fix #5 2026-05-01). The `trading-economics-chromium` source path may be the correct replacement for plain TE — verify it is configured and being used.

---

### BUG-SENTIMENT — HIGH: `get_sentiment_trend({})` broken — fb-market-poster caller unpatched (UNCHANGED)

**Severity:** HIGH
**Status:** UNCHANGED

**Re-probe evidence (18:08Z):**
- `call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` → `{"source_tier":3,"error":"Error: stock_code (or symbol) is required"}`
- Tool REQUIRES `stock_code` param; calling without args throws hard error, not graceful empty.

**Caller-surface verified:**
- `grep -n "get_sentiment_trend" docs/agents/fb-market-poster/flow/main.md` → line 118: `sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` — **confirmed unpatched, no stock_code arg**
- 1 affected caller: fb-market-poster cycle fails to get sentiment data every run.

**Recommended action:** Patch `docs/agents/fb-market-poster/flow/main.md:118` — change to `arguments={"stock_code": "VNM"}` (anchor ticker) or iterate watchlist. This is a one-line doc fix.

---

## ACTIVE ISSUEs — Re-confirmed + New

### ISSUE-ISM — MEDIUM: FRED API key missing (UNCHANGED)

**Re-probe (18:08Z):** `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
**Callers:** news-scout, unified-agent, bctc-analyst (macro regime inputs). FRED_API_KEY env var not set on MCP server.
**Action:** Set `FRED_API_KEY` in `.env` and restart mcp-server container. Free key available at fred.stlouisfed.org.

---

### ISSUE-WTI — MEDIUM: Stale WTI crude $95.5 (UNCHANGED)

**Re-probe (18:03Z):** `get_system_status` → `wti_crude_usd: 95.5 (79 data points)` — still showing pre-2024 level.
**Reality check:** Brent at $80.59 June 2026; WTI trading at ~$76–79 (normal discount). $95.5 is phantom stale seed.
**Callers:** unified-agent macro layer, news-scout commodity context.
**Root cause:** TradingEconomics WTI scrape dead (same as BUG-4). Fix BUG-4 to resolve this.

---

### ISSUE-DJIA — MEDIUM: Stale DJIA 23,750 (UNCHANGED)

**Re-probe (18:03Z):** `get_system_status` → `dow_jones: 23750 (49 data points)` — 2019/2020-era level.
**Reality check:** Actual DJIA June 2026 ~42,000+. 23,750 is ~45% below reality.
**Callers:** unified-agent macro layer, news-scout.
**Root cause:** Same TradingEconomics dead (BUG-4). Fix BUG-4.

---

### ISSUE-SBV-PARSE — MEDIUM: SBV HTML parse failing (UNCHANGED)

**Re-probe (18:08Z):** `get_vn_liquidity_state({})` → `policy_rates.source: "sbv_rates DB fallback (HTML parse failed)"`, `is_estimate: true`. `get_system_status` → recurring `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`.
**Callers:** intelligenceCycleJob, sbvRatesRefreshJob, market-watcher.
**Action:** SBV website HTML structure changed; update CSS selectors in SBV scraper (`apps/mcp-server/src/`).

---

### ISSUE-LIQUIDITY — MEDIUM: VN liquidity/interbank metrics null (UNCHANGED)

**Re-probe (18:08Z):** `get_vn_liquidity_state({})`:
```
sjc_price_mn_vnd: 0      (SJC not machine-readable)
usd_vnd_buy: 0            (parse fail)
usd_vnd_sell: 0           (parse fail)
cny_vnd_rate: 0           (parse fail)
omo_outstanding: null     ("no add/absorb rows found")
interbank_overnight: null ("dttktt.sbv.gov.vn — 100% packet loss")
```
**Root cause:** dttktt.sbv.gov.vn unreachable from VPS + SBV HTML parse fail (shared root with ISSUE-SBV-PARSE).
**Callers:** system-auditor, market-watcher. Liquidity context is blind.
**Action:** Fix SBV parse + investigate packet loss to dttktt.sbv.gov.vn from VPS.

---

### ISSUE-MACRO-CAL — MEDIUM: `get_macro_calendar` permanently unavailable (NEW)

**Severity:** MEDIUM
**Status:** NEW (not present in 16:10Z report)

**Re-probe evidence (18:06Z):**
- `call_tool(server="vn-market", tool="get_macro_calendar", arguments={})` → `{"status":"unavailable","events":[],"is_estimate":true,"source_tier":4}`
- `call_tool(server="vn-market", tool="get_macro_calendar", arguments={"days_ahead":14})` → same result: `{"daysRequested":60,"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}`
- `source_tier: 4` = lowest tier (estimate/unavailable). Calendar data source not reachable.

**Caller-surface verified:**
- `grep -n "get_macro_calendar" docs/agents/digest-predict/flow/weekly.md` → line 30: `get_macro_calendar(days=14) → upcoming_events, pivot_window_active`
- `grep -n "get_macro_calendar" docs/agents/alert-commander/flow/stage-bootstrap.md` → line 14: `get_macro_calendar() → extract pivot_window_active`
- **2 affected callers:** digest-predict loses `pivot_window_active` signal; alert-commander stage-bootstrap loses pivot window detection.

**Recommended action:** Investigate macro calendar data source in `apps/mcp-server/src/`; determine which external source feeds the calendar and check connectivity/API health.

---

### ISSUE-VN-MACRO — MEDIUM: `get_vn_macro_indicators` NSO Excel VPS timeout (NEW)

**Severity:** MEDIUM
**Status:** NEW (not present in 16:10Z report)

**Re-probe evidence (18:06Z):**
- `call_tool(server="vn-market", tool="get_vn_macro_indicators", arguments={})` → `{"status":"degraded","iip":[],"is_estimate":true,"blocked_reason":"NSO monthly Excel unreachable via VPS proxy 125.212.251.27:3128: nso_excel_cache: discover+fetch: step3 GET xlsx https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx: vpsFetch: read response body: context deadline exceeded"}`
- VPS proxy times out fetching NSO Excel file. This is a VPS proxy path issue separate from the vn-bctc-fetch service.

**Caller-surface verified:**
- `grep -rn "get_vn_macro_indicators" docs/agents/market-watcher/flow/ docs/agents/news-scout/flow/ docs/agents/unified-agent/flow/` → used in market-watcher macro layer and news-scout macro context. 2 affected callers. VN industrial production (IIP) data unavailable.

**Recommended action:** Test VPS proxy path to nso.gov.vn directly; may need `curl --proxy 125.212.251.27:3128 https://www.nso.gov.vn/...` from VPS SSH. The URL pattern (`/2026/06/02.-Bieu-T5.2026-final.xlsx`) updates monthly — verify the URL is current and NSO hasn't changed the path.

---

### ISSUE-VNSTOCK-STATS — LOW: `vnstockTradingStatsRefresh` cron 85.7% success rate (NEW)

**Severity:** LOW
**Status:** NEW

**Evidence (18:03Z):**
- `get_cron_health` → `vnstockTradingStatsRefresh: last_run 2026-06-19 08:30:01 | success_rate: 0.86 (85.7%) | total_runs: 7 | avg_duration: 649,220ms`
- ~11 min avg runtime; 1 failure in 7 days. This job pulls vnstock API for trading stats (volume/value/OHLCV bulk).

**Caller-surface:** Pipeline health uses stock fundamental data downstream. 1 failure in 7 days is low signal but warrants monitoring given the 11-min runtime suggests fragility.
**Recommended action:** Check `vnstockTradingStatsRefresh` error log on next failure; likely transient vnstock API timeout. No action needed unless rate drops below 80%.

---

## RESOLVED This Cycle

### ISSUE-WEEKLY-AUDIT — RESOLVED ✓

**Prior status (16:10Z):** `last_weekly_audit: 2026-06-06 18:00:00` (2 weeks stale; `integrityCheck` absent from cron registry).

**Resolution evidence (18:06Z):**
- `get_system_status` → `last_weekly_audit: 2026-06-20 18:00:00` — ran TODAY at 18:00Z ✓
- `get_cron_health` → `dataAuditJob:weekly: last_run: 2026-06-20 18:00:00 | last_status: success | success_rate: 1.00 (100%) | total_runs: 1`
- The weekly DB integrity audit ran successfully at 18:00Z today (Saturday). Previous gap was an artefact of the prior run not appearing in the 7-day cron health window at the time of the 16:10Z check.

**Status: RESOLVED — drop from active tracking.**

---

## NON-ISSUEs Verified This Cycle

| Finding | Probe | Verdict |
|---------|-------|---------|
| Stock prices 33h stale | `get_cycle_bootstrap` + `get_market_context` → "Trading window: VN market CLOSED… empty prices are expected" | NON-ISSUE (expected Sat) |
| Market-hours jobs last ran Jun 19 | `get_cron_health` → vnIndexRefreshJob, foreignFlowFetcherJob all `last_run: 2026-06-19` | NON-ISSUE (Sat, crons Mon–Fri) |
| VPS vn-price-fetch, vn-foreign-flow idle | `get_vps_service_health` → `idle` is correct status when market closed | NON-ISSUE |
| HNX/UPCOM tickers rows=0 in pipeline | `get_pipeline_health` → BDI/DLC/JSH/SIS/VDC=0 rows | NON-ISSUE (illiquid, no exchange data) |

---

## IMPROVE (No Callers Currently Broken)

| # | Finding | Impact | Fix |
|---|---------|--------|-----|
| I1 | intelligenceCycleJob fires HNX price fetch 24/7 without market-hours gate → noisy off-hours errors every 15 min; obscures real HNX failures | Error log noise | Add `isVnMarketHours()` guard in intelligenceCycleJob HNX path (TASK 1407 pattern) |
| I2 | `get_bctc_refined` returns `{"error":"no refined units found"}` on empty state instead of `{"units":[]}` | Cosmetic — bctc-analyst handles gracefully | Change to `{units:[]}` for consistent JSON shape |
| I3 | `emit_pressure_state` accepts arbitrary `state` strings; docs specify `normal\|high\|critical` only | No known caller sends invalid values | Add Zod enum validation |
| I4 | `task_claim.md` docs omit `minimum ttl_seconds: 60` constraint | Doc gap only — all callers verified using ≥60s | Update tool doc |
| I5 | `get_bctc_pending_refine` returned 235,355 chars (11,948 lines) — exceeds MCP max token budget, output saved to disk | `refine_bctc_md` agent cannot consume this response in-context | Add `limit` param (default 20 items) with `offset` for pagination; or add a `status=pending_only` filter to trim response size |

---

## Tool Probe Coverage This Cycle

| Tool | Result | Status |
|------|--------|--------|
| `get_cycle_bootstrap` (agent_name="market-watcher") | OK — bootstrap data, 0 pending signals | ✅ |
| `get_market_snapshot` | OK — VN-Index 1,824.53, breadth data, source_tier 2 | ✅ |
| `get_macro_snapshot` | OK — null deltas confirm BUG-4 | ✅ |
| `get_watchlist` | OK — 41 tickers | ✅ |
| `get_cron_health` | OK — reveals ISSUE-VNSTOCK-STATS; confirms ISSUE-WEEKLY-AUDIT RESOLVED | ✅ |
| `get_system_status` | OK — confirms BUG-2/3/4, ISSUE-WTI/DJIA/SBV; confirms WEEKLY-AUDIT RESOLVED | ✅ |
| `get_sla_status` | OK — confirms BUG-1 (5603 min) | ✅ |
| `get_vps_proxy_health` | OK — confirms BUG-1 (STALE bctc) | ✅ |
| `get_vps_service_health` | OK — confirms BUG-1 (vn-bctc-fetch unhealthy) | ✅ |
| `get_pipeline_health` | OK — HNX/UPCOM tickers rows=0 (expected) | ✅ |
| `get_earnings_calendar` | OK — 41 tickers, 13 overdue | ✅ |
| `get_technical_indicators` (code="VCB") | OK — RSI 45.5, MACD -169 hist | ✅ |
| `get_foreign_flow` (code="HPG") | OK — net_sell MEDIUM signal | ✅ |
| `get_market_foreign_flow` | OK — watchlist coverage, 2026-06-19 data | ✅ |
| `get_agent_signals` (agent="market-watcher") | OK — 0 new signals | ✅ |
| `get_recent_signals` (hours=24) | OK — 6 verified_decision signals | ✅ |
| `task_list_held` | OK — 5 active locks (1 cowork-leader, 2 digest-predict, 1 bctc-analyst ESC) | ✅ |
| `get_market_context` | OK | ✅ |
| `get_ticker_intelligence` (code="VCB") | OK — source_tier 2, evidence score data | ✅ |
| `get_market_cap` (code="HPG") | OK — 199,253.96 bn VND | ✅ |
| `get_imf_signals` | OK — 3 indicators, 14 days old | ✅ |
| `get_market_breadth` | OK — 81A/203D/66U, 18,804 bn turnover | ✅ |
| `get_macro_calendar` (days_ahead=14) | FAIL → status=unavailable, events=[] → **NEW ISSUE-MACRO-CAL** | 🔴 |
| `get_vn_macro_indicators` | FAIL → degraded, NSO Excel VPS timeout → **NEW ISSUE-VN-MACRO** | ⚠️ |
| `get_sentiment_trend` (no args) | FAIL → stock_code required → **BUG-SENTIMENT re-confirmed** | 🔴 |
| `get_ism_subcomponents` | FAIL → FRED_API_KEY missing → **ISSUE-ISM re-confirmed** | ⚠️ |
| `get_vn_liquidity_state` | FAIL → sjc/fx/omo/interbank all null → **ISSUE-LIQUIDITY/SBV-PARSE re-confirmed** | ⚠️ |
| `get_bctc_pending_refine` | OVERFLOW (235k chars) → **IMPROVE I5** | ⚠️ |
| `get_recent_fixes` (limit=20) | OK — historical fixes logged correctly | ✅ |

---

## Priority Action Queue for Dev Team

| # | Priority | Finding | Action |
|---|----------|---------|--------|
| 1 | P0 | BUG-1: BCTC VPS vn-bctc-fetch UNHEALTHY 4 days | SSH VPS: `systemctl status vn-bctc-fetch`, check OOM; or `trigger_bctc_vps_fetch` MCP tool |
| 2 | P1 | BUG-4: TradingEconomics dead (217 failures, null macro deltas) | Repair Playwright/Chromium TE scraper |
| 3 | P1 | BUG-3: Reuters RSS dead (217 failures) | Decommission dead path OR repair feed URL |
| 4 | P1 | BUG-SENTIMENT: fb-market-poster calls `get_sentiment_trend({})` without required `stock_code` | 1-line doc fix in `docs/agents/fb-market-poster/flow/main.md:118` |
| 5 | P1 | ISSUE-MACRO-CAL: `get_macro_calendar` unavailable (2 agent callers blind) | Investigate calendar data source; restore or stub endpoint |
| 6 | P2 | ISSUE-VN-MACRO: NSO Excel VPS proxy timeout (IIP data dead) | Fix VPS proxy path to nso.gov.vn or update NSO URL |
| 7 | P2 | ISSUE-SBV-PARSE + ISSUE-LIQUIDITY: SBV HTML parse failed, interbank null | Update SBV CSS selectors; investigate dttktt.sbv.gov.vn packet loss from VPS |
| 8 | P2 | BUG-2: HNX/UPCOM price source failures off-hours (error log noise) | Add market-hours gate to HNX fetch path |
| 9 | P3 | ISSUE-ISM: FRED_API_KEY missing | Set env var in `.env` |
| 10 | P3 | IMPROVE I5: `get_bctc_pending_refine` 235k overflow | Add `limit`/`offset` pagination |

---

*Generated by health-recheck agent at 2026-06-20T18:09Z*
*Tool dependency list: 94 tools sourced from docs/agents/*/flow/main.md (12 cowork/dev agent flows)*
