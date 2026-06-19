# Team MCP Tool Health Recheck — 2026-06-19T06:05Z

**Cycle:** 2026-06-19T06:05Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-19-0407.md`
**VN Market:** OPEN (02:00–08:59 UTC) — live trading session

---

## Executive Summary

**P0 BUG WORSENING** — BCTC VPS pipeline now 3442 min SLA breach (was 3322 at 04:07Z, +120 min; service down ~57.4h). No recovery.
**3 RESOLVED** — BUG-NEW-C (`get_agent_signals` from_agent mode) fully resolved post-04:54 restart; BUG-SSC-CERT confirmed resolved; BUG-NEW-A `outstandingShares` removed (partial).
**1 NEW BUG** — BUG-SENTIMENT-TREND: `get_sentiment_trend({})` called in `fb-market-poster/flow/main.md:118` without required `stock_code` — tool always errors (1 confirmed caller).
**1 NEW ISSUE** — ISSUE-PUSH-PRICES: `push-prices` ohlcv unit guard rejections firing every ~60s during market hours (ERROR in system_status).
**All other ISSUEs confirmed unchanged** — ISM no-data, macro-calendar unavailable, Reuters/TE chronic (count reset to 15 at restart, was 55), BDI zero, WTI $95.5 stale, DJIA 23,750 stale, vnstock 80%, EVN estimate, foreign-flow-primary dead.

---

## STEP 3c — Prior-Finding Delta (All Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Verifying command / output |
|-----------|-------------|-------|---------------------------|
| BUG-1/2 | BUG P0 | **WORSENED** | `get_sla_status` → `bctc: 3442/120 min CRITICAL` (+120 min); `get_vps_proxy_health` → bctc STALE 0 24h pushes, last 2026-06-16 18:02:24; `vn-bctc-fetch: unhealthy` |
| BUG-NEW-A | BUG P1 | **PARTIALLY RESOLVED** | `get_insider_signals({code:"VCB"})` → PASS ✅; `outstandingShares` no longer required ✅; `get_insider_signals({ticker:"VCB"})` → `code: Required` ❌ — doc/live param mismatch remains |
| BUG-NEW-C | BUG P1 | **FULLY RESOLVED** ✅ | `get_agent_signals({from_agent:"news-scout",status:"all",hours_back:6})` → PASS; `get_agent_signals({from_agent:null,status:"all",hours_back:1})` → 9 signals. All 3 broken call sites (stage-bootstrap.md:43,57; main.md:54) now work. Fix shipped 04:54Z restart. |
| BUG-SSC-CERT | BUG P1 | **CONFIRMED RESOLVED** ✅ | `get_system_status` CB `ssc [OK] failures:0`; no SSC errors in unresolved list; 2 clean cycles confirmed. |
| ISSUE-ISM | ISSUE P1 | **CONFIRMED UNCHANGED** | `get_ism_subcomponents({})` → `{error:"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| ISSUE-MACRO-CALENDAR | ISSUE P2 | **CONFIRMED UNCHANGED** | `get_macro_calendar({})` → `{events:[], status:"unavailable", source_tier:4, is_estimate:true}` |
| ISSUE-FOREIGN-FLOW-PRIMARY | ISSUE P2 | **CONFIRMED** | `get_system_status` → `[WARN] foreign-flow-job: fallback activated` + `all fallbacks exhausted` at 06:01, 06:02 UTC; `get_market_foreign_flow` PASS (VPS push compensating). |
| ISSUE-Reuters/TE | ISSUE P2 | **CONFIRMED ONGOING** | `get_system_status` → Reuters RSS "Ngưng" 15 failures, "Chưa bao giờ"; TE×2 "Ngưng" 15 failures. Count reset at 04:54Z restart (was 55). Never succeeded. |
| ISSUE-BDI | ISSUE P2 | **CONFIRMED** | `get_pipeline_health` → `BDI: rows=0, TA not ready` |
| ISSUE-WTI | ISSUE P2 | **CONFIRMED** | `get_system_status` → `wti_crude_usd 95.5` (79 points) — $16 impossible spread vs Brent $80.1 |
| ISSUE-DJIA | ISSUE P2 | **CONFIRMED** | `get_system_status` → `dow_jones 23750` (49 points) — COVID-era, actual ~42,000+ |
| ISSUE-vnstock | ISSUE P2 | **CONFIRMED** | `get_cron_health` → `vnstockTradingStatsRefresh` 80.0% (5 runs), avg 768,321 ms |
| IMPROVE-6 | IMPROVE | **CONFIRMED** | `get_cycle_bootstrap(agent_name="financial-analyst")` → accepted (deprecated enum not pruned) |
| IMPROVE-N3 | IMPROVE | **CONFIRMED** | `get_cron_health` → `bctcReparseJob` 89.7% (107 runs), avg 202,588 ms — stable |
| IMPROVE-EVN | IMPROVE | **CONFIRMED** | `get_energy_grid_signals` → EVN endpoint broken, using default 70% estimate |
| IMPROVE-TA-DOC | IMPROVE | **CONFIRMED** | `get_technical_indicators` doc param `ticker`; live requires `code`; 0 affected callers |

---

## NEW Findings This Cycle

### BUG-SENTIMENT-TREND — `get_sentiment_trend({})` Missing Required arg in fb-market-poster (P1, NEW)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 — fb-market-poster Step 2b sentiment signal permanently blind; errors silently |
| **Probe** | `get_sentiment_trend({})` → `{"source_tier":3, "error":"Error: stock_code (or symbol) is required"}` |
| **Tool doc** | `docs/agents/tools/list/get_sentiment_trend.md` → `stock_code: string, Required` |
| **Caller-surface** | `docs/agents/fb-market-poster/flow/main.md:118` — `sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` — no `stock_code` → always errors |
| **Caller count** | 1 confirmed affected caller |
| **Working call** | `get_sentiment_trend({stock_code:"FPT"})` → PASS (7-day breakdown returned) |
| **Impact** | Sentiment data absent from every fb-market-poster cycle. Tool returns JSON error (not exception) so agent silently proceeds with no sentiment signal. Post quality degraded. |
| **Suggested fix** | `fb-market-poster/flow/main.md:118`: change `arguments={}` → iterate per-ticker: `{"stock_code": ticker, "window_days": 7}` matching the ticker loop already in Step 2a |

---

### ISSUE-PUSH-PRICES-UNIT-GUARD — OHLCV Rows Rejected Every ~60s (P2, NEW)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Severity** | P2 — some price data not stored; 6 tickers at 0 rows |
| **Probe** | `get_system_status` → `[ERROR] 2026-06-19 06:01:32 push-prices: [push-prices] ohlcv rows rejected by unit guard` |
| **Frequency** | Every ~60s during market hours (price push cycle) |
| **Corroboration** | `get_pipeline_health` → BDI:0, DAG:1, DLC:0, JSH:0, SIS:0, VNH:6 rows |
| **Impact** | TA not ready for 6 tickers; pipeline_health shows "TA not ready" for these tickers |
| **Suggested fix** | Add per-ticker rejection logging in push-prices unit guard; audit guard thresholds vs VPS data range; determine if rejections are legitimate (bad upstream data) or guard miscalibration |

---

## RESOLVED Since Prior Cycle (04:07Z)

### BUG-NEW-C — `get_agent_signals` from_agent Mode — FULLY RESOLVED ✅

- `get_agent_signals({from_agent:"news-scout", status:"all", hours_back:6})` → `"Không có tín hiệu mới"` ✅
- `get_agent_signals({from_agent:null, status:"all", hours_back:1})` → 9 signals returned ✅
- All 3 broken call sites (`stage-bootstrap.md:43,57`; `main.md:54`) now work without `agent` param. Server fix landed at 04:54Z restart.

### BUG-SSC-CERT — CONFIRMED RESOLVED ✅

`ssc` circuit breaker `[OK] failures:0`. No SSC cert errors in 2 consecutive clean cycles. RESOLVED.

### BUG-NEW-A (PARTIAL RESOLUTION) — outstandingShares No Longer Required ✅

`get_insider_signals({code:"VCB"})` → PASS. Callers using `code=` param now unblocked. Residual: doc says `ticker`, live requires `code` — downgraded to P3 doc fix.

---

## Active BUG Findings

### BUG-1/2 — BCTC VPS Pipeline CRITICAL (P0, WORSENING 57.4h)

| Field | Value |
|-------|-------|
| **SLA breach** | 3442 min / 120 min threshold (57.4h, +120 min from 04:07Z) |
| **Last push** | 2026-06-16 18:02:24 UTC |
| **24h pushes** | 0 |
| **VPS service** | `vn-bctc-fetch: unhealthy`, 0ms response, VPS server uptime 2d+ |
| **Callers** | bctc-analyst, refine_bctc_md, unified-agent Layer 4, digest-predict, system-auditor (≥5 callers) |
| **Probe** | `get_sla_status` → `bctc: 3442/120 CRITICAL`; `get_vps_proxy_health` → `bctc STALE`; `get_vps_service_health` → `vn-bctc-fetch: unhealthy` |
| **Suggested fix** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; verify push resumes within 15 min. VPS server IS UP (2d+ uptime) — only the bctc-fetch process crashed. |

### BUG-SENTIMENT-TREND — fb-market-poster `get_sentiment_trend({})` (P1, NEW)

See NEW Findings section above.

### BUG-NEW-A RESIDUAL — `get_insider_signals` doc `ticker` vs live `code` (P3, DOWNGRADED)

| Field | Value |
|-------|-------|
| **Probe** | `get_insider_signals({ticker:"VCB"})` → `code: Required` |
| **Impact** | Any flow using `ticker=` param broken; `code=` works |
| **Suggested fix** | Update `docs/agents/tools/list/get_insider_signals.md` param from `ticker` → `code`; audit all flow files |

---

## Active ISSUE Findings

### ISSUE-ISM — `get_ism_subcomponents` No Data (P1, UNCHANGED)

`{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — ISM PMI subcomponents absent; US macro chain degraded.

### ISSUE-FOREIGN-FLOW-PRIMARY — Direct-fetch Path Dead (P2, ONGOING)

VPS push compensates (data fresh, SLA ok). Direct-fetch WARNs every minute mask real errors in system_status.

### ISSUE-MACRO-CALENDAR — No Macro Events (P2, UNCHANGED)

`events:[], source_tier:4, status:"unavailable"` — FOMC/NFP/CPI events not surfaced to agents.

### ISSUE-Reuters/TE — Chronic Source Failures (P2, ONGOING)

Reuters RSS + Trading Economics (×2) at 15 consecutive failures post-restart. Never succeeded on this server. News coverage degraded.

### ISSUE-BDI — Baltic Dry Index 0 Rows (P2, UNCHANGED)

`get_pipeline_health` → `BDI: rows=0, TA not ready`

### ISSUE-WTI — WTI Crude Auto-track Stale at $95.5 (P2, UNCHANGED)

Impossible $16 spread vs live Brent $80.1. Trend analysis using stale WTI will be wrong.

### ISSUE-DJIA — Dow Jones Auto-track Stale at 23,750 (P2, UNCHANGED)

COVID-era value (~2020). Actual ~42,000+.

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2, UNCHANGED)

5 runs, avg 768,321 ms (12.8 min per run). At the 80% alert threshold exactly.

### ISSUE-PUSH-PRICES-UNIT-GUARD — OHLCV Rejections Every ~60s (P2, NEW)

See NEW Findings section above.

---

## Active IMPROVE Findings

| ID | Finding | Evidence |
|----|---------|---------|
| IMPROVE-6 | Deprecated `financial-analyst`/`report-analyzer` still accepted in `get_cycle_bootstrap` Zod enum | `get_cycle_bootstrap(agent_name="financial-analyst")` → PASS (should fail) |
| IMPROVE-N3 | bctcReparseJob 89.7% success rate (107 runs) — stable low-level failure rate | `get_cron_health` → 89.7%, avg 202,588 ms |
| IMPROVE-EVN | `get_energy_grid_signals` EVN endpoint broken, returning 70% default | "Sử dụng ước tính mặc định (70%)" |
| IMPROVE-TA-DOC | `get_technical_indicators` doc param `ticker` → live requires `code` (0 callers affected) | Probe with `ticker=` fails; `code=FPT` passes |
| IMPROVE-INSIDER-DOC | `get_insider_signals` doc param `ticker` → live requires `code` | `get_insider_signals({ticker:"VCB"})` → `code: Required` |

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_system_status` | ⚠️ DEGRADED | foreign-flow WARNs; push-prices ERROR; sbv zero-guard; Reuters/TE stopped; 10 unresolved |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ PASS | 11ms; agent_signals+market_context+system_status returned |
| `get_market_snapshot` | ✅ PASS | VN-Index 1825.06 -0.30%; breadth 85↑/193↓; source_tier:2 |
| `get_macro_snapshot` | ✅ PASS | oil $80.1 neutral; gold $4155.2 bullish; usdvnd 26120 bearish; source_tier:2 |
| `get_cron_health` | ✅ MOSTLY OK | bctcReparseJob 89.7%; vnstockTradingStats 80%; all others ≥99% |
| `get_pipeline_health` | ⚠️ DEGRADED | BDI/DAG/DLC/JSH/SIS/VNH rows=0 or TA not ready; 5 oversold tickers |
| `get_vps_proxy_health` | ⚠️ BCTC STALE | prices/news/sbv/ff: ok; bctc: STALE 57.4h, 0 24h pushes |
| `get_sla_status` | ❌ BREACHED | bctc: 3442/120 min CRITICAL; news: 33/30 min HIGH |
| `get_vps_service_health` | ⚠️ 1 UNHEALTHY | vn-bctc-fetch unhealthy; 4 others healthy |
| `get_earnings_calendar` | ✅ PASS | 41 tickers; 10 overdue Q1-2026 (BID/DAG/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) |
| `get_macro_calendar` | ❌ UNAVAILABLE | events:[], source_tier:4 |
| `get_ism_subcomponents` | ❌ NO_DATA | FRED_API_KEY missing |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | EVN broken, 70% default |
| `get_market_foreign_flow` | ✅ PASS | 96 tickers; net -1.45M sell; top seller FPT -354k |
| `get_market_context` | ✅ PASS | All watchlist prices fresh (<2 min) |
| `get_alerts(limit=5)` | ✅ PASS | 5 alerts; 20 open in 24h; last Telegram 05:00 UTC |
| `get_agent_signals(agent="market-watcher")` | ✅ PASS | "Không có tín hiệu mới" |
| `get_agent_signals(from_agent="news-scout",status="all",hours_back=6)` | ✅ PASS | **RESOLVED** — previously BUG-NEW-C |
| `get_agent_signals(from_agent=null,status="all",hours_back=1)` | ✅ PASS | 9 signals — **RESOLVED** |
| `get_insider_signals(code="VCB")` | ✅ PASS | "Không có tín hiệu" — no recent insider trades |
| `get_insider_signals(ticker="VCB")` | ❌ FAIL | `code: Required` — doc/live param mismatch (IMPROVE) |
| `get_sentiment_trend({stock_code:"FPT"})` | ✅ PASS | 7-day breakdown returned correctly |
| `get_sentiment_trend({})` | ❌ FAIL | `stock_code required` — fb-market-poster/flow/main.md:118 broken |
| `get_technical_indicators(code="FPT")` | ✅ PASS | RSI 40.3, MACD bearish, BB lower |
| `get_ticker_intelligence(code="FPT")` | ✅ PASS | Price 71,100; evidence 2 fragments |
| `get_week_period` | ✅ PASS | W25, 2026-06-15/2026-06-21 |
| `get_bctc_pending_refine(limit=3)` | ✅ PASS | 3 records returned (VCB PARTIAL, HPG PENDING, GVR PENDING) |
| `task_list_held` | ✅ PASS | 10 locks; 1 expired orphan (`task:FIX-CASCADE-MACRO-CARD-REAL-DETAIL` expired 05:41Z) |
| `get_recent_fixes(limit=20)` | ✅ PASS | 20 fixes returned |
| `get_rate_limit_status` | ✅ PASS | 14 sources; api-finfo.vndirect.com.vn + api.hnx.vn throttled (3s wait) |
| `get_legal_risk_signals` | ✅ PASS | 9 signals — JSH chairman arrested; DIG forced liquidation |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart; verify push resumes. **57.4h down**, VPS server UP, only the bctc-fetch process crashed. | ops / dev-vps-crawls | BUG-1/2 |
| **P1** | `fb-market-poster/flow/main.md:118`: change `get_sentiment_trend(arguments={})` to per-ticker `{"stock_code": ticker, "window_days": 7}` | agent-father | BUG-SENTIMENT-TREND |
| **P1** | Verify `FRED_API_KEY` env var is set; re-run macroIndicatorRefreshJob to populate ISM sub-component series | dev-macro-indicators | ISSUE-ISM |
| **P2** | Audit push-prices unit guard: add per-ticker rejection logging; check if DAG/BDI/DLC/JSH/SIS/VNH are the rejected tickers or separate cohort | dev-mcp-server | ISSUE-PUSH-PRICES |
| **P2** | Fix/remove foreign-flow-job primary endpoint (dead URL); VPS push is canonical source | dev-vps-crawls | ISSUE-FOREIGN-FLOW-PRIMARY |
| **P2** | Fix macro calendar source (all 4 tiers unavailable) | dev-macro-indicators | ISSUE-MACRO-CALENDAR |
| **P2** | Force-refresh WTI crude auto-track ($95.5 → ~$60-70) and DJIA (23,750 → ~42,000+) in macro indicators | dev-macro-indicators | ISSUE-WTI / ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecated endpoint; check TE geo-blocking or API key expiry | dev-mainserver-crawls | ISSUE-Reuters/TE |
| **P2** | Fix BDI fetcher endpoint (rows=0) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80%, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Update `docs/agents/tools/list/get_insider_signals.md`: param `ticker` → `code` | dev-mcp-server | BUG-NEW-A residual |
| **P3** | Prune deprecated `financial-analyst`, `report-analyzer` from `get_cycle_bootstrap` Zod enum | dev-mcp-server | IMPROVE-6 |
| **P3** | Categorize bctcReparseJob 10% failure modes (107 runs, 89.7%) | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN hydro reservoir data endpoint | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Update `get_technical_indicators` doc: param `ticker` → `code` (0 callers affected) | dev-mcp-server | IMPROVE-TA-DOC |

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-19-0605.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-19-0407.md` |
| Probes run | 31 tools |
| PASS | 22 |
| FAIL / DEGRADED / NO_DATA | 9 |
| Active P0 BUGs | 1 (BUG-1/2 BCTC — 57.4h, worsening) |
| Active P1 BUGs | 1 (BUG-SENTIMENT-TREND — NEW) |
| Active P1 ISSUEs | 1 (ISSUE-ISM) |
| Active P2 ISSUEs | 8 (foreign-flow-primary; macro-calendar; Reuters/TE; BDI; WTI; DJIA; vnstock; push-prices NEW) |
| Active IMPROVEs | 5 |
| New findings | 2 (BUG-SENTIMENT-TREND; ISSUE-PUSH-PRICES-UNIT-GUARD) |
| Resolved since 04:07Z | 3 (BUG-NEW-C FULL ✅; BUG-SSC-CERT ✅; BUG-NEW-A partial ✅) |
