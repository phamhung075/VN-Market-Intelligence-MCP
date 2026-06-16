# Team MCP Tool Health Recheck — 2026-06-16 02:06 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-16 02:03–02:06 UTC (VN market OPEN — 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-16-0007.md` (1h 59min delta)
**Method:** Read-only smoke calls per tool + caller-surface verification. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — uptime 1h 51m at probe start (started ~00:12 UTC); Telegram env SET |
| VN trading window | **OPEN** (02:00–08:59 UTC) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC VPS push dead | `get_vps_proxy_health`: bctc `STALE, last push 2026-06-13 23:45:12, 0 pushes/24h`; `get_sla_status`: bctc **369min/120min CRITICAL** (was 249/360min ok last cycle — SLA now BREACHED); 13 tickers QUÁ HẠN in `get_earnings_calendar` | **ONGOING, WORSENED** (SLA now breached) |
| BUG-3 | `post_agent_signal` schema drift (system-auditor) | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: `from_agent`, `to_agent`, `signal_type`, `payload` — docs/agents/system-auditor/flow/main.md L193/L482/L509 still use wrong schema (grep verified) | **ONGOING, UNCHANGED** |
| BUG-NEW-3 | `bctcReparseJob` at alert threshold | `get_cron_health`: `success_rate=0.81 (80.6%)`, `total_runs=175` (+2 runs; rate stable at threshold) | **ONGOING, STABLE AT THRESHOLD** |
| BUG-NEW-4 | `get_foreign_flow` no-args fail | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)`. `docs/agents/fb-market-poster/flow/main.md:78` confirmed still calls with `{}` this cycle | **ONGOING, UNCHANGED** |
| BUG-NEW-5 | `get_ticker_intelligence` no-args fail | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)`. `docs/agents/fb-market-poster/flow/main.md:81` confirmed still calls with `{}` this cycle | **ONGOING, UNCHANGED** |
| ISSUE-1 | Server restart rate | `get_cron_health`: `mcpServerStartup total_runs=33` (+2 restarts vs prior cycle's 31, over ~2h) — 33 restarts/7d = 4.7/day | **WORSENED** (+2 in 2h) |
| ISSUE-2 | WTI crude inverted $95.5 vs Brent $83.24 | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`, `brent_crude_usd=83.24` — identical | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters RSS + Trading Economics never succeed | `get_system_status` (session 1h51m old): Reuters RSS **18 consecutive failures** / never succeeded; Trading Economics ×2 **18-19 failures** / never succeeded | **WORSENED** (8 → 18 errors vs prior cycle) |
| IMPROVE-1 | `get_cycle_bootstrap` dead enum values | Enum still includes `financial-analyst`, `report-analyzer` | **ONGOING** |
| IMPROVE-2 | 5 dark tickers 0 OHLCV rows | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC `rows=0`, TA not ready | **ONGOING** |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift | `last_run=2026-06-15 12:13:01 UTC`; system-map says `"19:13 UTC daily"` | **ONGOING** |
| IMPROVE-4 | `get_sla_status` BCTC threshold mismatch | SLA threshold NOW shows **120 min** (was 360 min last cycle — changed between restarts); system-map.json expects 168h out-of-window. 120 min threshold correctly BREACHES at 369 min stale | **ONGOING, THRESHOLD SHIFTED** (360 → 120 min since 00:07 cycle; root cause unclear) |
| IMPROVE-5 | Tool docs use `ticker` param, live uses `code` | 0 runtime-affected callers; docs only | **ONGOING** |
| IMPROVE-6 | VEA (inactive) still triggers bctcQueueEnricher noise | Confirmed in `get_system_status` recent errors | **ONGOING** |
| IMPROVE-7 | Off-hours HNX/UPCOM errors pollute error log | N/A this cycle — market is OPEN, no off-hours HNX noise at probe time | **NOT APPLICABLE THIS CYCLE** |

---

## NEW Findings This Cycle

### ISSUE-4 (NEW) — `pushPrices` zero_ohlc rejections at market open for watchlist tickers

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_system_status` RECENT ERRORS at 02:02:30–31 UTC (09:02–03 VN time, i.e. 2–3 min after open): `[pushPrices] unit guard rejected EIB: zero_ohlc: field=high`; same for ELC, FCN, **FPT**, FRT, **GAS**, **VND**, **VNM**, VOS, **VPB**, **VRE**, VTP — 12 tickers total including 6 active watchlist tickers |
| Unit guard logic | `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts` — STOCK_MIN_VND=100; rejects zero values for any OHLCV field. Rejection is CORRECT (guard preventing zero-contamination) |
| Data impact | Limited — prices for affected tickers still show in `get_cycle_bootstrap` market_context (02:02 UTC: FPT=73.6, VNM=59.8, VPB=27.0, VRE=28.5, EIB=21.0) via fallback tier. Primary VPS push stream rejected |
| Root cause hypothesis | VPS sends incomplete OHLCV at market open (high=0 for first bar before first trade executes). Known market-open edge case. Check: does `vn-price-fetch` (restarted at ~01:34 UTC, 29m uptime per ISSUE-5 below) emit zero-high on restart? |
| Caller-surface | `grep "zero_ohlc\|pushPrices" docs/agents` → 0 files (runtime-only; no flow file documents this guard path) |
| Fix | Add `market_open_grace_period` (first 2 min after 09:00 VN) to skip zero_ohlc ERROR logging, or filter VPS push entries where `high == 0 AND time < open + 2min` before calling unit guard |

---

### ISSUE-5 (NEW) — `vn-foreign-flow` and `vn-price-fetch` VPS services marked "unhealthy" during market hours

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_vps_service_health`: `vn-foreign-flow: unhealthy, response=0ms, uptime 10h 57m`; `vn-price-fetch: unhealthy, response=0ms, uptime 29m` (restarted ~01:34 UTC) |
| Contradiction | `get_vps_proxy_health` push log shows both services ARE delivering data: prices last push 02:03:39 (97 items); foreign-flow pushing 102 items every ~30s |
| Interpretation | Health endpoint returns "unhealthy" status or 0ms response means endpoint unreachable/erroring, while the data push pipeline (different path) continues functioning. The "unhealthy" label is from the health check endpoint, NOT the push path |
| Downstream | Data delivery unaffected (confirmed by push log and market_context prices). The "2 unhealthy" summary alert in VPS service health is misleading |
| Fix | Investigate VPS health endpoint for `vn-foreign-flow` and `vn-price-fetch`; decouple "service healthy" from "health endpoint reachable" to avoid false alerts |

---

## RESOLVED Findings

None. No prior BUG or ISSUE has been resolved since the 00:07 UTC cycle.

---

## ACTIVE FINDINGS (all re-confirmed this cycle)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). Weekday-only job — next fire Mon 08:30 UTC |
| Downstream | `vnstock_trading_stats` table stale; `get_sector_comparison`, `get_market_cap`, `get_company_profile` degraded |
| Fix | Add `AbortSignal.timeout(60_000)` per-ticker + job-level 600s hard cap in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` |

---

### BUG-2 (ONGOING, WORSENED) — BCTC VPS push dead: no push since 2026-06-13 23:45 UTC (>50h)

| Field | Value |
|---|---|
| VPS evidence | `get_vps_proxy_health`: `bctc | 2026-06-13 23:45:12 | 0 pushes/24h | STALE YES` |
| SLA | `get_sla_status`: `bctc 369min / 120min → CRITICAL BREACHED` (worsened from "ok" in prior cycle) |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — service up but producing 0 results (silent scraper failure) |
| Earnings impact | `get_earnings_calendar`: 13 tickers QUÁ HẠN (ACV/BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) with no BCTC data; bctc-analyst data frozen since 2026-06-13 |
| Fix | Run `trigger_bctc_vps_fetch`; SSH probe `curl /proxy/bctc-discover/<ticker>` on VPS to diagnose scraper format change vs geo-block |

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor 3 emit sites broken

| Field | Value |
|---|---|
| Live schema | Required: `from_agent (string)`, `to_agent (string)`, `signal_type (enum: urgent_news|price_anomaly|cross_validate|suppress|chain_catalyst|fundamental_validation|price_confirmation|verified_chain|signal_feedback|legal_risk|verified_decision)`, `payload (object)` |
| Flow mismatch | `docs/agents/system-auditor/flow/main.md` L193 (data_stale), L482 (db_integrity_breach), L509 (system_health_report) — passes `{type, ts, tier, summary, checks, overall}` — wrong schema, missing all required fields |
| Re-probe proof | `post_agent_signal({type:"test_probe"})` → MCP -32602: Required: from_agent, to_agent, signal_type, payload (this cycle) |
| Impact | All infra anomaly signals from system-auditor fail silently; signal_queue rows never written; other agents receive no infra health signals |
| Fix | Rewrite 3 emit blocks with: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}` in `docs/agents/system-auditor/flow/main.md` |

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at alert threshold: 80.6%

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `success_rate=0.81 (80.6%)`, `total_runs=175`, `last_run=2026-06-16 00:12:36 success` |
| Threshold | `cronHealthAlertJob` fires BUG-channel Telegram when `success_rate < 80%`. At 80.6% — one failure fires alert |
| Note | Likely exacerbated by BUG-2 (no new PDFs from VPS for >50h); reparse job retries cached PDFs only |

---

### BUG-NEW-4 (ONGOING) — `get_foreign_flow` no-args: fb-market-poster fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)` (this cycle) |
| Caller | `docs/agents/fb-market-poster/flow/main.md:78` → `call_tool(…, "get_foreign_flow", arguments={})` — **1 confirmed broken caller** |
| Fix | Replace line 78 with `get_market_foreign_flow(arguments={})` (no required args, returns market-wide net flow) |

---

### BUG-NEW-5 (ONGOING) — `get_ticker_intelligence` no-args: fb-market-poster fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)` (this cycle) |
| Caller | `docs/agents/fb-market-poster/flow/main.md:81` → `call_tool(…, "get_ticker_intelligence", arguments={})` — **1 confirmed broken caller** |
| Fix | Replace line 81 with `get_market_snapshot(arguments={})` for market-wide movers, or per-ticker `get_ticker_intelligence({code:ticker})` loop |

---

## Issues (degraded, not broken)

### ISSUE-1 (WORSENED) — Server restart rate: 33 in 7 days (4.7/day, +2 in 2h)

| Field | Value |
|---|---|
| Evidence | `mcpServerStartup total_runs=33` (+2 restarts since 00:07 UTC cycle) |
| Impact | CB failure counters reset each restart; Reuters/TE re-accumulate errors from 0; once-daily jobs may miss fire windows |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $83.24 — $12.26 inversion

| Field | Value |
|---|---|
| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`, `brent_crude_usd=83.24` |
| Impact | Historical auto-tracker table reads wrong WTI; only DB historical series affected (live macro snapshot ok) |

---

### ISSUE-3 (WORSENED) — Reuters RSS + Trading Economics: 18–19 consecutive failures this session

| Field | Value |
|---|---|
| Evidence | `get_system_status` (session 1h51m old): Reuters RSS 18 failures / never succeeded; Trading Economics ×2 18-19 failures / never succeeded |
| Prior | 8 failures per session in 00:07 cycle (1h session) |
| Impact | Missing international news feed; missing TE macro indicators. Bloomberg + VN RSS partially mitigating |
| Note | Structural fetch failure — underlying issue unresolved across all sessions, not just this one |

---

### ISSUE-4 (NEW) — pushPrices zero_ohlc rejections at market open for 12 tickers incl. 6 watchlist

| See NEW Findings section above |

---

### ISSUE-5 (NEW) — VPS vn-foreign-flow + vn-price-fetch health endpoint "unhealthy" (data still flowing)

| See NEW Findings section above |

---

## Improvements (non-blocking)

| ID | Finding | Caller-surface | Fix |
|---|---|---|---|
| IMPROVE-1 | `get_cycle_bootstrap` enum retains dead values: `financial-analyst`, `report-analyzer` | 0 active callers | Remove from Zod enum in tool registration |
| IMPROVE-2 | 5 watchlist tickers with 0 OHLCV rows: BDI/DLC/JSH/SIS/VDC — TA silent for 12% of watchlist | `get_pipeline_health` | Trigger OHLCV backfill or remove from watchlist |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift: system-map says `"19:13 UTC"`, cron runs at 12:13 UTC | `docs/data/system-map.json` | Fix schedule field |
| IMPROVE-4 | `get_sla_status` BCTC threshold mismatch: 120 min (tool, changed from 360 this cycle) vs 168h system-map out-of-window | `get_sla_status({})` | Align SLA tool threshold to system-map.json earnings-window-dependent SLA block |
| IMPROVE-5 | `get_technical_indicators.md` + `get_price_history.md` doc `ticker` param; live API uses `code` | 0 runtime callers affected | Fix param in list docs + market-watcher package example block |
| IMPROVE-6 | VEA (active=false) still processed by bctcQueueEnricher — 40+ WARNs/hour | enricher reads DB watchlist, not system-map.json | Purge VEA from DB watchlist OR add `active=false` filter to enricher query |
| IMPROVE-7 | Off-hours HNX/UPCOM price fetch generates 10+ ERROR log entries per 15-min cycle (market closed) | `intelligenceCycleJob` runs 24/7 | Add market-hours gate to HNX price fetch or downgrade off-hours failures to DEBUG |

---

## Full Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_system_status` | ✅ OK (issues logged) | 16 CBs OK; 10 unresolved errors (foreign-flow fallback + pushPrices rejections); Reuters/TE 18-19 failures |
| `get_cycle_bootstrap` | ✅ OK | `agent_name:"market-watcher"` → 27ms, full context (agent_signals, market_context, system_status) |
| `get_market_snapshot` | ✅ OK | VN-Index 1803.92 +0.26%, source_tier=2 |
| `get_macro_snapshot` | ✅ OK | Carry NEUTRAL, yield CHEAP (spread 2.05pp), is_estimate=false |
| `get_cron_health` | ✅ OK (2 issues) | `vnstockTradingStatsRefresh` crashed 50%; `bctcReparseJob` 80.6% |
| `get_pipeline_health` | ✅ OK (5 dark) | 36/41 TA ready; BDI/DLC/JSH/SIS/VDC rows=0 |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv ok; bctc STALE since 2026-06-13 23:45 |
| `get_vps_service_health` | ⚠️ DEGRADED | 3 healthy, 2 unhealthy (vn-foreign-flow, vn-price-fetch) — data still flowing (ISSUE-5) |
| `get_sla_status` | ⚠️ BREACHED | bctc 369min/120min CRITICAL; all others ok |
| `get_earnings_calendar` | ✅ OK | 28 ĐÃ NỘP, 13 QUÁ HẠN |
| `get_rate_limit_status` | ✅ OK | All 11 sources: 0 wait, ready |
| `task_claim` | ✅ OK | `{"claimed":true}` (probe lock) |
| `task_release` | ✅ OK | `{"ok":true}` |
| `task_list_held` | ✅ OK | 0 orphan locks |
| `get_foreign_flow` | ❌ no-args | MCP -32602 Required: `code` (BUG-NEW-4) |
| `get_ticker_intelligence` | ❌ no-args | MCP -32602 Required: `code` (BUG-NEW-5) |
| `post_agent_signal` | ❌ wrong schema | MCP -32602 Required: from_agent, to_agent, signal_type, payload (BUG-3) |

---

## Caller-Surface Verification (STEP 3b — this cycle)

```
# BUG-NEW-4 get_foreign_flow (re-probed):
call_tool("get_foreign_flow", {}) → MCP -32602 Required: code (string) — CONFIRMED
Read docs/agents/fb-market-poster/flow/main.md:78
  → call_tool(server="vn-market", tool="get_foreign_flow", arguments={}) — CONFIRMED BROKEN (1 caller)

# BUG-NEW-5 get_ticker_intelligence (re-probed):
call_tool("get_ticker_intelligence", {}) → MCP -32602 Required: code (string) — CONFIRMED
Read docs/agents/fb-market-poster/flow/main.md:81
  → call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={}) — CONFIRMED BROKEN (1 caller)

# BUG-3 post_agent_signal (re-probed):
call_tool("post_agent_signal", {type:"test_probe"}) → MCP -32602 Required: from_agent, to_agent, signal_type, payload — CONFIRMED
grep docs/agents/system-auditor/flow/main.md → L193, L482, L509 use wrong schema {type,ts,tier,...} (no fix deployed)

# BUG-2 BCTC (re-probed):
get_vps_proxy_health → bctc STALE: 2026-06-13 23:45:12, 0 pushes/24h — CONFIRMED
get_sla_status → bctc 369/120 CRITICAL — WORSENED (was 249/360 ok)

# BUG-1 vnstockTradingStatsRefresh (re-probed):
get_cron_health → last_status=crashed, success_rate=0.50, total_runs=2 — CONFIRMED UNCHANGED

# ISSUE-3 Reuters/TE (re-probed):
get_system_status → Reuters RSS 18 consecutive failures; TE ×2 18-19 failures — WORSENED (was 8)

# ISSUE-4 pushPrices zero_ohlc (new this cycle):
get_system_status RECENT ERRORS: 12 tickers rejected at 02:02 UTC (EIB/FPT/GAS/VNM/VPB/VRE +6 others)
grep "pushPrices|zero_ohlc" docs/agents → 0 files (runtime-only guard, no flow-file caller affected)
grep "pushPrices|zero_ohlc" apps/mcp-server/src → 16 files (guard code present, working correctly)
Market context confirms fallback prices available for all affected watchlist tickers

# ISSUE-5 VPS service health (new this cycle):
get_vps_service_health → vn-foreign-flow: unhealthy 0ms; vn-price-fetch: unhealthy 29m uptime
get_vps_proxy_health push log → foreign-flow 102 items/30s, prices 97 items/push (data flowing)
Contradiction: health endpoint unhealthy ≠ data delivery broken
```

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | **6** | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC VPS dead >50h + SLA CRITICAL; BUG-3 `post_agent_signal` schema drift (3 sites); BUG-NEW-3 `bctcReparseJob` 80.6%; BUG-NEW-4 `get_foreign_flow` no-args; BUG-NEW-5 `get_ticker_intelligence` no-args |
| **ISSUE** | **5** | ISSUE-1 server restarts 33/7d (worsened); ISSUE-2 WTI crude inverted $12.26; ISSUE-3 Reuters/TE 18-19 failures (worsened); ISSUE-4 pushPrices zero_ohlc 12 tickers at open (NEW); ISSUE-5 VPS health endpoint unhealthy vs data flowing (NEW) |
| **IMPROVE** | **7** | IMPROVE-1 bootstrap enum; IMPROVE-2 5 dark tickers; IMPROVE-3 job schedule doc; IMPROVE-4 SLA threshold mismatch; IMPROVE-5 tool-list param drift; IMPROVE-6 VEA enricher noise; IMPROVE-7 HNX off-hours error noise |
