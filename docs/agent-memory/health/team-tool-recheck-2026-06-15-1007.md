# Team MCP Tool Health Recheck — 2026-06-15 10:07 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 10:03–10:07 UTC (VN market CLOSED)
**Method:** Read-only smoke calls + schema validation probes + caller-surface grep. No live-state writes.
**Prior report:** `team-tool-recheck-2026-06-15-0808.md` (2h delta)

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded; `get_system_status` responded in <1s |
| vn-market server | **UP** — uptime 1h21m at probe time; last restart 08:42:54 UTC |
| MCP error class | Input-validation errors returned correctly (transport alive) |

---

## STEP 3c — Prior-Report Delta (re-probed this cycle)

| Prior ID | Finding | Re-probe Result | Delta |
|---|---|---|---|
| BUG-1 | `get_foreign_flow({})` schema error in fb-market-poster flow | Flow file grep: 0 matches (call removed) | **RESOLVED** ✅ |
| BUG-2 | `get_ticker_intelligence({})` no-arg call in fb-market-poster flow | Flow file grep: 0 matches (call removed) | **RESOLVED** ✅ |
| ISSUE-3 | BCTC VPS stale | `get_vps_proxy_health`: last push 2026-06-13 23:45, 0 pushes 24h. SLA 1687/360min CRITICAL | **ONGOING** — worsened (see BUG-3 below) |
| ISSUE-4 | `get_market_foreign_flow` all-zeros during market hours | `get_market_foreign_flow({})` → net +1.01M, real top-5 data returned | **RESOLVED** ✅ |
| ISSUE-5 | High server restart rate (22 in 7 days) | `mcpServerStartup: total_runs=23` (was 22 at 08:08) — another restart at 08:42:54 | **ONGOING** |
| ISSUE-6 | `marketEarningYieldJob` missed weekday cadence | `last_run: 2026-06-15 09:30:00, status: success` — ran on-time today | **RESOLVED** ✅ |
| IMPROVE-7 | WTI crude inverted vs Brent (stale) | `get_system_status`: wti_crude_usd=95.5 vs brent=83.03 — still inverted | **ONGOING** |
| IMPROVE-8 | 5 watchlist tickers with 0 OHLCV rows | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC rows=0 unchanged | **ONGOING** |
| IMPROVE-9 | Trading Economics + Reuters RSS disabled | Now showing 13 consecutive failures each (circuit breaker class) | **WORSENED** — see ISSUE-6 below |
| IMPROVE-10 | macroIndicatorRefreshJob docs timezone confusion | Not re-probed (static docs issue) | **ASSUMED ONGOING** |

---

## Active Findings (re-confirmed + new this cycle)

### BUG-1 (NEW) — `vnstockTradingStatsRefresh` crash: 50% success rate, 45+ min runtime

| Field | Value |
|---|---|
| Class | **BUG** |
| Cron | `vnstockTradingStatsRefresh` |
| Evidence | `get_cron_health`: `last_status: crashed`, `success_rate: 0.50 (50.0%)`, `total_runs: 2`, `avg_duration: 2,754,485 ms` (~45 min) |
| Last crash | 2026-06-15 08:30:01 UTC |
| Source | `apps/mcp-server/src/application/usecases/syncVnstockData.ts` (confirmed by grep) |
| Downstream tools | `get_sector_comparison`, `get_market_cap`, `get_company_profile` (all read from vnstock store) |
| Affected agents | market-watcher (`get_sector_comparison`), bctc-analyst (`compare_stocks`, `compare_financials`), unified-agent |
| Caller count | Multiple — see `apps/mcp-server/src/interface/mcp/tools/sector/sectorComparisonTools.ts`, `marketCapTools.ts`, `companyProfileTools.ts` |

**Diagnosis:** Job runs for 45+ minutes then crashes (likely network timeout or OOM during large batch vnstock API fetch). With only 2 total runs and 50% crash rate this restart window, sector comparison data is unreliable.

**Suggested fix:** Add timeout guard + chunked batch processing in `syncVnstockData.ts`. Check if the 665,597ms `vnstockFundamentalsRefresh` job (11 min, 100% success) overlaps and causes resource contention.

---

### BUG-2 (NEW) — `bctcReparseJob` below 80% alerting threshold

| Field | Value |
|---|---|
| Class | **BUG** |
| Cron | `bctcReparseJob` |
| Evidence | `get_cron_health`: `success_rate: 0.80 (79.9%)`, `avg_duration: 335,147 ms` (5.5 min), `total_runs: 174` |
| Threshold | cronHealthAlertJob fires when `success_rate < 80%`. 79.9% breaches this. |
| Last run | 2026-06-15 08:43:25 UTC (success) |

**Diagnosis:** 174 runs over 7 days with 20.1% failure rate. Likely BCTC parser failures on specific PDF formats or poppler-utils OCR failures. Connected to the broader BCTC pipeline degradation.

**Suggested fix:** Check `bctcReparseJob.ts` error logs for recurring failure patterns (PDF format, encoding errors). Verify `poppler-utils` still present in Docker container.

---

### BUG-3 (ONGOING, WORSENED) — BCTC pipeline dead: SLA CRITICAL + queue enricher returning 0 URLs

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence (SLA) | `get_sla_status`: `bctc | 1687/360 min | CRITICAL` |
| Evidence (VPS) | `get_vps_proxy_health`: `bctc | last push 2026-06-13 23:45:12 | 0 pushes 24h | STALE: YES` |
| Evidence (enricher) | `get_system_status` recent errors: `bctcQueueEnricher: 0 URLs found for ticker X` × 9 items, `0 URLs populated across all 9 item(s)` |
| Evidence (data) | `get_bctc_full(code="VCB")` → `"Chưa có dữ liệu BCTC"` despite VCB filing on 2026-06-13 per `get_earnings_calendar` |
| VPS service status | `vn-bctc-fetch: healthy` (service is UP but not delivering URLs) |
| Affected agents | bctc-analyst (all 6 passes blocked), unified-agent (`get_bctc_full` in chef.md), digest-predict (`get_bctc_full`) |
| Callers confirmed | `docs/agents/tools/package/bctc-analyst.md`, `unified-agent.md`, `digest-predict.md` all call `get_bctc_full` |

**Diagnosis:** VPS `vn-bctc-fetch` service is alive but `bctcQueueEnricher` finds 0 URLs for all tickers — the BCTC discover route (`/proxy/bctc-discover/:ticker`) is returning empty. Either the upstream source (SSC iboard BCTC section) is geo-blocking the VPS, or the URL discovery scraper is broken. Despite 9 tickers having Q1-2026 filings (per earnings calendar: VCB filed 2026-06-13, CTG filed 2026-06-13, etc.), no BCTC data is being extracted.

**Note:** `bctcPdfPullJob` reports 98.6% success rate and `bctcQueueEnricherJob` reports 99.5% success — both report "success" at the job level while producing 0 useful output. This is a fail-closed / silent-failure pattern: the jobs complete without error but return empty data.

**Suggested fix:**
1. SSH into VPS, run manual `curl /proxy/bctc-discover/VCB` to verify geo-block vs parser failure
2. Call `trigger_bctc_vps_fetch` to force a discovery cycle
3. Add a data-quality gate to `bctcQueueEnricherJob`: if 0 URLs returned for ≥3 tickers, log as ERROR (not warn) and fire a BUG Telegram alert

---

### ISSUE-4 (ONGOING) — High server restart rate: 23 restarts in 7 days

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_cron_health`: `mcpServerStartup: total_runs=23` (was 22 at 08:08 — another restart at 08:42:54) |
| Cadence | ~3.3 restarts/day over 7-day window |

**Impact:** Cron job state reset on each restart. Jobs with once-daily windows can miss their fire window if restart happens during it. Root cause not yet identified (OOM? Docker policy? WAL checkpoint?).

**Suggested fix:** Review Docker restart policy and container logs around 08:42 UTC. Check if WAL size (1.47 MB at probe time) correlates with restart triggers.

---

### ISSUE-5 (ONGOING) — WTI crude price inverted vs Brent (stale)

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 pts)` vs `brent_crude_usd=83.03 (23 pts)` |
| Normal spread | WTI historically $2–5 BELOW Brent. Current: WTI $12.47 ABOVE Brent — strongly stale |

**Impact:** Any macro analysis reading `wti_crude_usd` from the auto-tracker (vs `get_macro_snapshot` which uses Brent correctly) will use a materially wrong price.

---

### ISSUE-6 (WORSENED from IMPROVE-9) — Reuters RSS + Trading Economics both failing (13+ consecutive errors)

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_system_status` source health: `Reuters RSS: Ngưng (stopped), 13 errors`. `Trading Economics: Ngưng, 13 errors` × 2 sources |
| Context | Prior report (08:08) classified as IMPROVE (disabled). Now both show active circuit-breaker failures. |
| Affected tools | `fetch_and_analyze` (news quality), `get_macro_snapshot` macro columns (TE data) |

**Impact:** Reduced macro and international news coverage. TE provides CPI/GDP/industrial production data used by macro-snapshot. Reuters provides global market context for news-scout impact chains.

---

## Improvement Opportunities

### IMPROVE-1 — `get_market_hexagram` missing from live server, referenced in digest-predict package doc

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `call_tool(server="vn-market", tool="get_market_hexagram", arguments={})` → `MCP error -32602: Tool get_market_hexagram not found` |
| Caller-surface grep | `grep "get_market_hexagram" docs/agents/**` — 6 matches |
| Active (protected) caller | `docs/agents/unified-agent/flow/chef.md:102` — explicitly handles: `"501 / tool-not-found = expected; treat as market_hexagram=unavailable"` |
| Inactive caller | `docs/agents/digest-predict/flow/daily.md:80` — `daily.md` is unrouted per Sprint 1949-T5 dispatcher |
| Package doc references | `docs/agents/tools/package/digest-predict.md:69,227` — example code only, not flow |
| **Caller-surface verdict** | **0 unprotected active callers** — unified-agent has explicit guard; digest-predict daily.md is dead code |

**Action:** Remove `get_market_hexagram` from `digest-predict.md` package (lines 69, 227) to eliminate doc drift confusion. No runtime fix needed.

---

### IMPROVE-2 — `get_cycle_bootstrap` enum contains legacy agent names

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `call_tool(..., tool="get_cycle_bootstrap", arguments={"agent_name":"health-recheck"})` → schema error reveals enum: `'news-scout' \| 'financial-analyst' \| 'market-watcher' \| 'alert-commander' \| 'digest-predict' \| 'qa-responder' \| 'unified-agent' \| 'report-analyzer' \| 'bctc-analyst'` |
| Issue | `financial-analyst` and `report-analyzer` are legacy names merged into `bctc-analyst` per 2026-05-29 architect brief. Dead enum values. |
| Risk | Low — no active flow calls these names. But schema drift is confusing for new agents. |

**Action:** Remove `financial-analyst` and `report-analyzer` from the `agent_name` enum in `get_cycle_bootstrap` tool schema.

---

### IMPROVE-3 — 5 watchlist tickers with 0 OHLCV rows (TA dark)

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_pipeline_health`: `BDI: rows=0`, `DLC: rows=0`, `JSH: rows=0`, `SIS: rows=0`, `VDC: rows=0` (all TA not ready) |
| Exchanges | BDI=HNX, DLC=UPCOM, JSH=HNX, SIS=HOSE, VDC=UPCOM |

**Impact:** TA alerts disabled for 5/41 watchlist tickers (12%). market-watcher cannot compute RSI/MACD/BB for these.

---

### IMPROVE-4 — macroIndicatorRefreshJob schedule docs timezone confusion (carry-forward)

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `system-map.json` says `19:13 UTC daily` but `get_cron_health` shows `last_run: 2026-06-14 12:13:00` (12:13 UTC = 19:13 VN time UTC+7) |

**Action:** Update `system-map.json` description to `"12:13 UTC (19:13 VN)"` to avoid ops confusion.

---

## Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ OK | Returns signals + market context in 15ms |
| `get_system_status` | ✅ OK | 10 unresolved errors (bctcQueueEnricher) |
| `get_market_snapshot` | ✅ OK | VN-Index 1799.31 +0.43% |
| `get_macro_snapshot` | ✅ OK | Carry NEUTRAL, yield CHEAP (live tier-2) |
| `get_watchlist` | ✅ OK | 41 tickers returned |
| `get_earnings_calendar` | ✅ OK | 41 tickers, 14 QUÁ HẠN (overdue Q1-2026) |
| `get_week_period` | ✅ OK | W25 / 2026-06-15/2026-06-21 |
| `get_agent_signals(agent="market-watcher")` | ✅ OK | Empty (off-market hours — expected) |
| `get_technical_indicators(code="FPT")` | ✅ OK (degraded) | source_tier: 3 (lowest fallback), MA50 unavailable |
| `get_market_context` | ✅ OK | Full watchlist prices + macro + alerts |
| `get_pipeline_health` | ✅ OK | 5 tickers with 0 rows (TA not ready) |
| `get_vps_proxy_health` | ✅ OK | BCTC STALE; prices/news/sbv/ff ok |
| `get_vps_service_health` | ✅ OK | 3 healthy, 2 idle (market closed) |
| `get_cron_health` | ✅ OK | vnstockTradingStatsRefresh CRASHED |
| `get_sla_status` | ✅ OK | bctc CRITICAL 1687/360min |
| `get_market_foreign_flow` | ✅ OK | Net +1.01M, real top-5 data (RESOLVED from prior) |
| `get_market_summary(period="daily")` | ✅ OK | 80 articles, 44 alerts, 0 financial reports |
| `get_bctc_full(code="VCB")` | ⚠️ EMPTY | "Chưa có dữ liệu BCTC" — VCB filed 2026-06-13 |
| `get_bctc_refined(report_id="VCB-2026-Q1")` | ⚠️ EMPTY | No refined units found |
| `get_recent_fixes` | ✅ OK | 20 fixes returned |
| `get_market_hexagram` | ❌ NOT FOUND | Tool absent from server — chef.md has explicit guard |
| `get_foreign_flow({})` | ❌ SCHEMA | `code` param required — callers FIXED (0 in flow file) |
| `emit_pressure_state` | ✅ OK | Returns success with pressure_state_path |
| `log_agent_work({})` | Schema verified | Requires `agent_name` + `status: running\|completed\|error` |
| `send_telegram({})` | Schema verified | Requires `channel: market\|work\|bug` + `message: string` |
| `task_claim({})` | Schema verified | Requires `task_id`, `task_kind: cowork-slot\|sprint-task\|dashboard-row\|commit-mutex`, `owner_agent` |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | 3 | vnstockTradingStatsRefresh crash; bctcReparseJob <80%; BCTC pipeline dead |
| **ISSUE** | 3 | Server restart rate; WTI stale; Reuters/TradingEconomics 13+ failures |
| **IMPROVE** | 4 | get_market_hexagram doc drift; get_cycle_bootstrap enum legacy; 5 dark tickers; macroIndicatorRefreshJob docs |

## Resolved This Cycle (vs 08:08 report)

| Prior ID | Finding | Proof |
|---|---|---|
| BUG-1 | `get_foreign_flow({})` called incorrectly in fb-market-poster | grep fb-market-poster/flow/main.md → 0 matches; call removed |
| BUG-2 | `get_ticker_intelligence({})` called incorrectly in fb-market-poster | grep fb-market-poster/flow/main.md → 0 matches; call removed |
| ISSUE-4 | `get_market_foreign_flow` returning all zeros | Live probe → net +1.01M, real top-5 buyers/sellers |
| ISSUE-6 | `marketEarningYieldJob` missed weekday cadence | `last_run: 2026-06-15 09:30:00, status: success` |
