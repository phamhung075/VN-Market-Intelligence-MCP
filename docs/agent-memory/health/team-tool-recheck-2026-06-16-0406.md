# Team MCP Tool Health Recheck — 2026-06-16 04:06 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-16 04:04–04:06 UTC (VN market OPEN — 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-16-0206.md` (2h 00min delta)
**Method:** Read-only smoke calls per tool + caller-surface verification. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — uptime 3h 52m at probe time; Telegram env SET |
| VN trading window | **OPEN** (02:00–08:59 UTC) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC VPS push dead | `get_vps_proxy_health`: bctc `STALE, last push 2026-06-13 23:45:12, 0 pushes/24h`; `get_sla_status`: bctc **489min/120min CRITICAL** (was 369/120 — worsening) | **ONGOING, WORSENED** (+120min stale) |
| BUG-3 | `post_agent_signal` schema drift (system-auditor) | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: `from_agent`, `to_agent`, `signal_type`, `payload`; grep confirms L193/L482/L509 still wrong | **ONGOING, UNCHANGED** |
| BUG-NEW-3 | `bctcReparseJob` at alert threshold | `get_cron_health`: `success_rate=0.81 (80.6%)`, `total_runs=175` — identical (no new runs since 00:12:36) | **ONGOING, UNCHANGED** |
| BUG-NEW-4 | `get_foreign_flow` no-args fail | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)`; `docs/agents/fb-market-poster/flow/main.md:78` confirmed still calls `arguments={}` (Read this cycle) | **ONGOING, UNCHANGED** |
| BUG-NEW-5 | `get_ticker_intelligence` no-args fail | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)`; `docs/agents/fb-market-poster/flow/main.md:81` confirmed still calls `arguments={}` (Read this cycle) | **ONGOING, UNCHANGED** |
| ISSUE-1 | Server restart rate 33/7d | `get_cron_health`: `mcpServerStartup total_runs=33` — unchanged (no new restarts this session) | **STABLE, UNCHANGED** |
| ISSUE-2 | WTI crude inverted $95.5 vs Brent $82.92 | `get_system_status`: `wti_crude_usd=95.5`, `brent_crude_usd=82.92` — identical (brent moved $83.24→$82.92) | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters RSS + Trading Economics never succeed | `get_system_status` (session 3h52m): Reuters RSS **44 consecutive failures** / never; TE ×2 **44–45 failures** / never (was 18–19 at 1h51m) | **WORSENED** (rate consistent: ~11 errors/hour per source) |
| ISSUE-4 | `pushPrices` zero_ohlc rejections at market open | `get_system_status` RECENT ERRORS: only `foreign-flow-job` warnings; no zero_ohlc entries | **RESOLVED** — was market-open edge case (02:02 UTC), cleared by 04:04 UTC |
| ISSUE-5 | VPS vn-foreign-flow + vn-price-fetch health endpoint "unhealthy" | `get_vps_service_health`: all 5 healthy (vn-foreign-flow=healthy, vn-price-fetch=healthy, response=0ms) | **RESOLVED** — was transient health-endpoint flap |
| IMPROVE-1 | `get_cycle_bootstrap` dead enum values | `get_cycle_bootstrap({agent_name:"health-recheck"})` → MCP error: enum includes `financial-analyst`, `report-analyzer` — still present | **ONGOING** |
| IMPROVE-2 | 5 dark tickers 0 OHLCV rows | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC rows=0, TA not ready (VEA now 38 rows — no longer dark) | **ONGOING, STABLE** (5 tickers) |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift | `get_cron_health`: last_run=2026-06-15 12:13:01 UTC; system-map says `"19:13 UTC daily"` | **ONGOING** |
| IMPROVE-4 | `get_sla_status` BCTC threshold mismatch | SLA threshold: 120 min (tool) vs 168h (system-map out-of-window) | **ONGOING** |
| IMPROVE-5 | Tool docs use `ticker` param, live uses `code` | 0 runtime callers affected — docs only | **ONGOING** |
| IMPROVE-6 | VEA (inactive) still triggers bctcQueueEnricher noise | VEA in earnings calendar as QUÁ HẠN; system-map.json `active=false` | **ONGOING** |
| IMPROVE-7 | Off-hours HNX/UPCOM errors pollute error log | Market OPEN at probe time — not observable this cycle | **NOT APPLICABLE** |

---

## RESOLVED Findings (this cycle)

| ID | Finding | Resolution proof |
|---|---|---|
| ISSUE-4 | pushPrices zero_ohlc market-open rejections (12 tickers) | `get_system_status` at 04:04 UTC shows no zero_ohlc entries in last 10 errors; only foreign-flow-job warnings present |
| ISSUE-5 | VPS vn-foreign-flow + vn-price-fetch health endpoint false "unhealthy" | `get_vps_service_health`: 5/5 healthy at probe time — both previously-flapping services now report healthy |

---

## NEW Findings This Cycle

### ISSUE-6 (NEW) — `foreign-flow-job` internal fallback exhaustion every minute during market hours

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_system_status` RECENT ERRORS at 04:02–04:04 UTC: `[foreign-flow-job] fallback activated` → `[foreign-flow-job] all fallbacks exhausted` × 3 consecutive minutes; `[fallback] primary endpoint failed — Unable to connect` each minute |
| VPS push pipeline | **UNAFFECTED** — `get_vps_proxy_health` push log: foreign-flow 101–102 items every ~30s; `foreignFlowFetcherJob` success_rate=1.00 (100%), total_runs=1,947 |
| Root cause | `foreign-flow-job` is the mcp-server's INTERNAL polling fetcher (direct HTTP to VPS from server side), separate from the push receiver. The internal URL calls are failing — likely VPS returning errors/unreachable on the server's outbound network path, while the VPS→server PUSH direction works fine |
| Data impact | Agents reading `get_foreign_flow({code})` may receive empty/stale data if the internal fallback path is the serving path. Push-pipeline data (aggregated in DB from VPS push) remains fresh. `get_market_foreign_flow({})` likely unaffected (uses push data) |
| Caller-surface | `grep "get_foreign_flow" docs/agents` → fb-market-poster L78 calls `get_foreign_flow({})` (no code arg — schema fail). Market-watcher cycle.md Step 1 calls `get_market_foreign_flow` (correct no-arg tool). No agent calls `get_foreign_flow({code})` correctly except dynamically |
| Fix | Investigate outbound connectivity from mcp-server to VPS at `/proxy/foreign-flow`; check if the internal job URL differs from VPS push URL. Consider retiring internal poll and relying exclusively on push pipeline |

---

## ACTIVE FINDINGS (all re-confirmed this cycle)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). Weekday-only — next fire Mon 08:30 UTC |
| Downstream | `vnstock_trading_stats` table stale; `get_sector_comparison`, `get_market_cap`, `get_company_profile` degraded |
| Caller-surface | All agents calling `get_sector_comparison` / `get_market_cap` (market-watcher, bctc-analyst, news-scout) may receive stale data |
| Fix | Add `AbortSignal.timeout(60_000)` per-ticker + job-level 600s hard cap in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` |

---

### BUG-2 (ONGOING, WORSENED) — BCTC VPS push dead: no push since 2026-06-13 23:45 UTC (>54h)

| Field | Value |
|---|---|
| VPS evidence | `get_vps_proxy_health`: `bctc | 2026-06-13 23:45:12 | 0 pushes/24h | STALE YES` — identical (no recovery) |
| SLA | `get_sla_status`: `bctc 489min / 120min → CRITICAL BREACHED` (up from 369/120 in 02:06 UTC cycle) |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — service up but 0 results (silent scraper failure) |
| Earnings impact | `get_earnings_calendar`: 13 tickers QUÁ HẠN (ACV/BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) with no BCTC data; bctc-analyst data frozen since 2026-06-13 (>2 days) |
| Caller-surface | bctc-analyst every cycle; refine_bctc_md; get_bctc_pending_refine consumers |
| Fix | Run `trigger_bctc_vps_fetch`; SSH probe `curl /proxy/bctc-discover/<ticker>` on VPS to diagnose scraper format change vs geo-block |

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor 3 emit sites broken

| Field | Value |
|---|---|
| Live schema | Required: `from_agent (string)`, `to_agent (string)`, `signal_type (enum)`, `payload (object)` |
| Flow mismatch | `docs/agents/system-auditor/flow/main.md` L193 (`type:"data_stale"`), L482 (`type:"db_integrity_breach"`), L509 (`type:"system_health_report"`) — all use wrong top-level schema |
| Re-probe proof | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: from_agent, to_agent, signal_type, payload |
| Impact | All infrastructure anomaly signals from system-auditor fail silently; signal_queue rows never written |
| Caller-surface | 3 confirmed broken sites in `docs/agents/system-auditor/flow/main.md` L193, L482, L509 |
| Fix | Rewrite 3 emit blocks: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}` |

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at alert threshold: 80.6%

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `success_rate=0.81 (80.6%)`, `total_runs=175`, `last_run=2026-06-16 00:12:36 success` — no new runs |
| Threshold | `cronHealthAlertJob` fires BUG-channel at `success_rate < 80%`. One more failure → alert fires |
| Note | Exacerbated by BUG-2 (no new PDFs from VPS since 2026-06-13); re-parse job retries cached PDFs only |

---

### BUG-NEW-4 (ONGOING) — `get_foreign_flow` no-args: fb-market-poster L78 fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)` |
| Caller | `docs/agents/fb-market-poster/flow/main.md:78` → `call_tool(server="vn-market", tool="get_foreign_flow", arguments={})` — **1 confirmed broken caller** (verified by file read this cycle) |
| Fix | Replace L78 with `get_market_foreign_flow(arguments={})` — no required args, returns market-wide net flow |

---

### BUG-NEW-5 (ONGOING) — `get_ticker_intelligence` no-args: fb-market-poster L81 fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)` |
| Caller | `docs/agents/fb-market-poster/flow/main.md:81` → `call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={})` — **1 confirmed broken caller** (verified by file read this cycle) |
| Fix | Replace L81 with `get_market_snapshot(arguments={})` for market-wide movers, or loop `get_ticker_intelligence({code:ticker})` per watchlist ticker |

---

## Issues (degraded, not broken)

### ISSUE-1 (STABLE) — Server restart rate: 33 in 7 days (4.7/day)

| Field | Value |
|---|---|
| Evidence | `mcpServerStartup total_runs=33` — unchanged this session (no new restarts in 3h52m) |
| Note | restartCadenceAlertJob running OK; session currently stable at 3h52m uptime |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $82.92 — $12.58 inversion

| Field | Value |
|---|---|
| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`, `brent_crude_usd=82.92` |
| Impact | Auto-tracked historical series reads wrong WTI; live macro snapshot may compensate via other sources |

---

### ISSUE-3 (WORSENED) — Reuters RSS + Trading Economics: 44–45 consecutive failures (3h 52m session)

| Field | Value |
|---|---|
| Evidence | `get_system_status` (session 3h52m): Reuters RSS 44 failures/never succeeded; TE ×2 44–45 failures/never succeeded |
| Rate | ~11.3 failures/hour per source — consistent with prior cycle rate |
| Impact | Missing international news feed; missing TE macro indicators |
| Structural | Failure pattern persists across server restarts — underlying URL/auth issue |

---

### ISSUE-6 (NEW) — `foreign-flow-job` internal fallback exhaustion every minute

| See NEW Findings section above |

---

## Improvements (non-blocking)

| ID | Finding | Caller-surface | Fix |
|---|---|---|---|
| IMPROVE-1 | `get_cycle_bootstrap` enum retains dead values: `financial-analyst`, `report-analyzer` | 0 active callers (no agent uses these names) | Remove from Zod enum in tool registration |
| IMPROVE-2 | 5 watchlist tickers with 0 OHLCV rows: BDI/DLC/JSH/SIS/VDC — TA silent for 12% of watchlist | `get_pipeline_health` | Trigger OHLCV backfill or remove from watchlist |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift: system-map says `"19:13 UTC"`, cron last ran at 12:13 UTC | `docs/data/system-map.json` | Fix schedule field in system-map to `"12:13 UTC daily"` |
| IMPROVE-4 | `get_sla_status` BCTC threshold 120 min vs system-map 168h out-of-window | `get_sla_status({})` | Align SLA tool threshold to system-map earnings-window-dependent block (168h normal, 24h earnings-window) |
| IMPROVE-5 | Tool docs `get_technical_indicators.md` + `get_price_history.md` use `ticker` param; live API uses `code` | 0 runtime callers affected | Fix param name in list docs + market-watcher package example block |
| IMPROVE-6 | VEA (active=false in system-map) still in earnings calendar as QUÁ HẠN + processed by bctcQueueEnricher | enricher reads DB watchlist, not system-map.json | Purge VEA from DB watchlist OR add `active=false` filter to enricher query |
| IMPROVE-7 | Off-hours HNX/UPCOM price fetch generates ERROR log entries per 15-min cycle (market closed) | `intelligenceCycleJob` runs 24/7 | Add market-hours gate to HNX/UPCOM fetch or downgrade off-hours failures to DEBUG |

---

## Full Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_system_status` | ✅ OK (issues logged) | 16 CBs OK; foreign-flow-job fallback errors 3+ min/min; Reuters/TE 44-45 failures |
| `get_cycle_bootstrap` | ⚠️ DEGRADED | Schema error for non-enum agent names; dead enum values (`financial-analyst`, `report-analyzer`) |
| `get_market_snapshot` | ✅ OK | VN-Index 1804.25 +0.27%, source_tier=2 |
| `get_macro_snapshot` | ✅ OK (implied by foreignFlowFetcherJob 100%) | Not directly called this cycle; ISSUE-3 TE failures may affect macro data |
| `get_cron_health` | ✅ OK (2 bugs) | `vnstockTradingStatsRefresh` crashed 50%; `bctcReparseJob` 80.6% |
| `get_pipeline_health` | ✅ OK (5 dark) | 36/41 TA ready; BDI/DLC/JSH/SIS/VDC rows=0 |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv/foreign-flow ok; bctc STALE since 2026-06-13 23:45 |
| `get_vps_service_health` | ✅ OK | 5/5 healthy (resolved since 02:06 cycle) |
| `get_sla_status` | ⚠️ BREACHED | bctc 489/120min CRITICAL; all others ok |
| `get_earnings_calendar` | ✅ OK | 28 ĐÃ NỘP, 13 QUÁ HẠN |
| `task_claim` | ✅ OK | `{"claimed":true}` |
| `task_release` | ✅ OK | `{"ok":true}` |
| `get_foreign_flow` | ❌ no-args | MCP -32602 Required: `code` (BUG-NEW-4) |
| `get_ticker_intelligence` | ❌ no-args | MCP -32602 Required: `code` (BUG-NEW-5) |
| `post_agent_signal` | ❌ wrong schema | MCP -32602 Required: from_agent, to_agent, signal_type, payload (BUG-3) |

---

## Caller-Surface Verification (STEP 3b — this cycle)

```
# BUG-NEW-4 get_foreign_flow (re-probed):
call_tool("get_foreign_flow", {}) → MCP -32602 Required: code (string) — CONFIRMED
Read docs/agents/fb-market-poster/flow/main.md L78:
  foreign_flow = call_tool(server="vn-market", tool="get_foreign_flow", arguments={})
  → CONFIRMED BROKEN (1 caller, file read this cycle)

# BUG-NEW-5 get_ticker_intelligence (re-probed):
call_tool("get_ticker_intelligence", {}) → MCP -32602 Required: code (string) — CONFIRMED
Read docs/agents/fb-market-poster/flow/main.md L81:
  ticker_intel = call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={})
  → CONFIRMED BROKEN (1 caller, file read this cycle)

# BUG-3 post_agent_signal (re-probed):
call_tool("post_agent_signal", {type:"test_probe"}) → MCP -32602 Required: from_agent, to_agent, signal_type, payload — CONFIRMED
grep docs/agents/system-auditor/flow/main.md → L193 (data_stale), L482 (db_integrity_breach), L509 (system_health_report) use wrong schema
Grep output confirmed 3 sites, none with required top-level fields

# BUG-2 BCTC (re-probed):
get_vps_proxy_health → bctc STALE: 2026-06-13 23:45:12, 0 pushes/24h — CONFIRMED
get_sla_status → bctc 489/120 CRITICAL — WORSENED (369→489min)
get_earnings_calendar → 13 QUÁ HẠN (ACV/BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) — UNCHANGED

# BUG-1 vnstockTradingStatsRefresh (re-probed):
get_cron_health → last_status=crashed, success_rate=0.50, total_runs=2, avg_duration=2,754,485ms — CONFIRMED UNCHANGED

# ISSUE-3 Reuters/TE (re-probed):
get_system_status → Reuters RSS 44 consecutive failures; TE ×2 44-45 failures — WORSENED (18-19→44-45 at 3h52m)

# ISSUE-4 pushPrices zero_ohlc (re-probed):
get_system_status RECENT ERRORS: no zero_ohlc entries at 04:04 UTC — RESOLVED (was market-open edge case)

# ISSUE-5 VPS health endpoints (re-probed):
get_vps_service_health → 5/5 healthy including vn-foreign-flow + vn-price-fetch — RESOLVED

# ISSUE-6 foreign-flow-job internal (new):
get_system_status RECENT ERRORS 04:02-04:04: [foreign-flow-job] fallback activated/exhausted every minute — NEW
foreignFlowFetcherJob success_rate=1.00 (push receiver OK — internal poll broken)
grep "get_market_foreign_flow" docs/agents/market-watcher/flow/cycle.md → uses correct tool (unaffected)
grep "get_foreign_flow" docs/agents/fb-market-poster/flow/main.md L78 → already BUG-NEW-4
```

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | **6** | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC VPS dead >54h + SLA CRITICAL; BUG-3 `post_agent_signal` schema drift (3 sites); BUG-NEW-3 `bctcReparseJob` 80.6%; BUG-NEW-4 `get_foreign_flow` no-args; BUG-NEW-5 `get_ticker_intelligence` no-args |
| **ISSUE** | **4** | ISSUE-1 server restarts 33/7d; ISSUE-2 WTI crude inverted $12.58; ISSUE-3 Reuters/TE 44-45 failures; ISSUE-6 foreign-flow-job internal fallback exhaustion (NEW) |
| **IMPROVE** | **7** | IMPROVE-1 bootstrap dead enum; IMPROVE-2 5 dark tickers; IMPROVE-3 job schedule doc; IMPROVE-4 SLA threshold mismatch; IMPROVE-5 tool-list param drift; IMPROVE-6 VEA enricher noise; IMPROVE-7 HNX off-hours error noise |
| **RESOLVED** | **2** | ISSUE-4 pushPrices zero_ohlc (market-open edge case); ISSUE-5 VPS health endpoint false unhealthy |
