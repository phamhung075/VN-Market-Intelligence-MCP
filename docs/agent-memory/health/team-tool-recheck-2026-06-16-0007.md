# Team MCP Tool Health Recheck — 2026-06-16 00:07 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-16 00:03–00:07 UTC (VN market CLOSED)
**Prior report:** `team-tool-recheck-2026-06-15-2208.md` (2h 01min delta)
**Method:** Read-only smoke calls per tool + caller-surface verification. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — last restart 2026-06-15 23:18:35 UTC (48m 45s uptime at probe start); Telegram env SET |
| MCP validation errors | Returned correctly — transport is healthy |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC VPS push stale | `get_vps_proxy_health`: bctc `STALE, last push 2026-06-13 23:45:12, 0 pushes/24h`; `get_system_status`: `bctcQueueEnricher: 0 URLs populated across all 10 item(s)` (was 9 prior cycle — enricher scope grew by 1) | **ONGOING, WORSENED** (now 48h+ stale; 10 affected items) |
| BUG-3 | `post_agent_signal` schema drift (system-auditor) | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: `from_agent (string)`, `to_agent (string)`, `signal_type (enum)`, `payload (object)`. Grep `docs/agents/system-auditor/flow/main.md`: L193/L482/L509 still pass `{type, ts, tier, summary, checks, overall}` — all required fields absent | **ONGOING, UNCHANGED** |
| BUG-NEW-3 | `bctcReparseJob` at threshold | `get_cron_health`: `success_rate=0.80 (80.3%)`, `total_runs=173` (+2 runs; rate stable at threshold) | **ONGOING, STABLE AT THRESHOLD** |
| BUG-NEW-4 | `get_foreign_flow` no-args fail | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)`. Read `docs/agents/fb-market-poster/flow/main.md:78` → `call_tool(…, "get_foreign_flow", arguments={})` — broken caller confirmed in file | **ONGOING, UNCHANGED** |
| BUG-NEW-5 | `get_ticker_intelligence` no-args fail | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)`. Read `docs/agents/fb-market-poster/flow/main.md:81` → `call_tool(…, "get_ticker_intelligence", arguments={})` — broken caller confirmed in file | **ONGOING, UNCHANGED** |
| ISSUE-1 | Server restart rate | `get_cron_health`: `mcpServerStartup total_runs=31` (+2 since prior cycle at 22:08 UTC) — 31 restarts / 7d = 4.4/day | **WORSENED** (+2 in 2h) |
| ISSUE-2 | WTI crude inverted $95.5 vs Brent $83.68 | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`, `brent_crude_usd=83.68` — unchanged | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters RSS + Trading Economics never succeed | `get_system_status` (session started 23:18:35 UTC, 48m old): Reuters RSS 8 failures / never succeeded; Trading Economics (×2) 8 failures / never succeeded | **ONGOING** — 8 failures each; pattern persists across all sessions |
| IMPROVE-1 | `get_cycle_bootstrap` enum retains dead values | Live enum: `news-scout\|financial-analyst\|market-watcher\|alert-commander\|digest-predict\|qa-responder\|unified-agent\|report-analyzer` — `financial-analyst`/`report-analyzer` have 0 active callers | **ONGOING** |
| IMPROVE-2 | 5 dark tickers 0 OHLCV rows | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC `rows=0`, TA not ready | **ONGOING** |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift | `get_cron_health last_run=2026-06-15 12:13:01 UTC`; system-map.json says `"19:13 UTC daily"` | **ONGOING** |
| IMPROVE-4 | `get_sla_status` BCTC threshold hardcoded 360 min | Returns `bctc 249min/360min ok` — 360 min (6h) vs 168h expected out-of-earnings-window per system-map.json SLA block | **ONGOING** |
| IMPROVE-5 | Tool list docs use `ticker` vs live `code` param | `docs/agents/tools/list/get_technical_indicators.md` and `get_price_history.md` still document `ticker`; live API confirmed requires `code` | **ONGOING** |

---

## NEW Findings This Cycle

### IMPROVE-6 (NEW) — VEA (inactive watchlist) still processed by bctcQueueEnricher

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_system_status`: `bctcQueueEnricher: 0 URLs found for ticker VEA` — fires every 15 min (>40 entries in recent error window); `system-map.json .watchlist[].ticker=="VEA" active=false, note="Removed sprint-054"` |
| Impact | VEA generates WARN noise in system_status.recent_errors and unresolved error count. No market data impact. |
| Caller-surface | `grep "VEA" apps/mcp-server/src` → 52 files; enricher builds watchlist from DB watchlist table, not system-map.json directly. VEA row in DB watchlist not purged after sprint-054 removal. |
| Fix | Purge VEA from `watchlist` DB table OR add `active=false` filter to enricher's watchlist query. |

---

### IMPROVE-7 (NEW) — Off-hours HNX/UPCOM price fetches generate recurring unresolved errors

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_system_status`: 10 unresolved errors in 5-min window at 00:00–00:03 UTC — all `hnx: all UPCOM/HNX price sources failed`. Circuit breakers: `hnx [OK] failures: 0`. Market is CLOSED (outside 02:00–08:59 UTC Mon–Fri). |
| Impact | Pollutes the unresolved error count (10 of 10 most recent errors are off-hours HNX failures). Real errors are buried. |
| Root cause | `intelligenceCycleJob` runs every 15 min regardless of market hours; HNX price fetch is attempted but expected to fail when market is closed; error logged but CB does not trip. |
| Fix | Add market-hours gate to HNX/UPCOM price fetch path (mirror existing `foreignFlowFetcherJob` market-hours guard); or downgrade log level from ERROR to DEBUG for off-hours price failures. |

---

## RESOLVED Findings

None. No prior BUG or ISSUE has been resolved since the 22:08 UTC cycle.

---

## ACTIVE FINDINGS (all re-confirmed this cycle)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). Weekday-only job — next window Mon 08:30 UTC |
| Downstream | `vnstock_trading_stats` table stale; `get_sector_comparison`, `get_market_cap`, `get_company_profile` degraded |
| Caller-surface grep | `grep -r "vnstockTradingStats" apps/mcp-server/src` → 28 files. Key: `sectorComparisonTools.ts`, `marketCapTools.ts`, `companyProfileTools.ts` |
| Fix | Add `AbortSignal.timeout(60_000)` per-ticker + job-level 600s hard cap in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` |

---

### BUG-2 (ONGOING, WORSENED) — BCTC VPS push dead: no push since 2026-06-13 23:45 UTC (>48h)

| Field | Value |
|---|---|
| VPS evidence | `get_vps_proxy_health`: `bctc | 2026-06-13 23:45:12 | 0 pushes/24h | STALE YES` |
| Enricher | `get_system_status`: `bctcQueueEnricher: 0 URLs populated across all 10 item(s)` (worsened from 9 items in prior cycle) |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — service up but producing 0 results (silent scraper failure) |
| SLA masking | `get_sla_status`: bctc shows `249min/360min ok` — masked by `bctcReparseJob` touching DB from cached PDFs, NOT new VPS pushes |
| Earnings impact | `get_earnings_calendar`: 11 tickers QUÁ HẠN (ACV/BDI/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VNH) with no BCTC data; bctc-analyst data frozen since 2026-06-13 |
| Fix | Run `trigger_bctc_vps_fetch`; SSH probe `curl /proxy/bctc-discover/<ticker>` on VPS to diagnose scraper vs geo-block failure |

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor 3 emit sites broken

| Field | Value |
|---|---|
| Live schema | Required: `from_agent (string)`, `to_agent (string)`, `signal_type (enum: urgent_news|price_anomaly|cross_validate|suppress|chain_catalyst|fundamental_validation|price_confirmation|verified_chain|signal_feedback|legal_risk|verified_decision)`, `payload (object)` |
| Flow mismatch | `docs/agents/system-auditor/flow/main.md` L193 (data_stale), L482 (db_integrity_breach), L509 (system_health_report) — all pass `{type, ts, tier, summary, checks, overall}` — wrong schema, missing all required fields |
| Re-probe proof | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: from_agent, to_agent, signal_type, payload (this cycle) |
| Impact | All infra anomaly signals from system-auditor fail silently; orch-state signal_queue rows never written; other agents receive no infra health signals |
| Fix | Rewrite 3 emit blocks with correct schema: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}`. File: `docs/agents/system-auditor/flow/main.md` |

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at alert threshold: 80.3% success

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `success_rate=0.80 (80.3%)`, `total_runs=173`, `last_run=2026-06-15 23:19:13 success` |
| Threshold | `cronHealthAlertJob` fires BUG-channel Telegram when `success_rate < 80%`. At 80.3% — one more failure fires alert. |
| Note | Likely exacerbated by BUG-2 (no new PDFs from VPS for 48h); reparse job cannot retry successfully when source is dry |

---

### BUG-NEW-4 (ONGOING) — `get_foreign_flow` no-args: fb-market-poster fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)` (this cycle) |
| Caller | `docs/agents/fb-market-poster/flow/main.md:78` → `call_tool(…, "get_foreign_flow", arguments={})` — **1 confirmed broken caller** (verified by file read) |
| Fix | Replace line 78 with `get_market_foreign_flow(arguments={})` (no required args; returns market-wide net flow). Update `docs/agents/tools/list/get_foreign_flow.md` param `ticker`→`code` |

---

### BUG-NEW-5 (ONGOING) — `get_ticker_intelligence` no-args: fb-market-poster fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)` (this cycle) |
| Caller | `docs/agents/fb-market-poster/flow/main.md:81` → `call_tool(…, "get_ticker_intelligence", arguments={})` — **1 confirmed broken caller** (verified by file read) |
| Fix | Replace line 81 with `get_market_snapshot(arguments={})` for market-wide movers, or call `get_ticker_intelligence({code:ticker})` per ticker from snapshot result |

---

## Issues (degraded, not broken)

### ISSUE-1 (WORSENED) — Server restart rate: 31 in 7 days (4.4/day)

| Field | Value |
|---|---|
| Evidence | `mcpServerStartup total_runs=31` (+2 restarts since prior cycle at 22:08 UTC, over 2h) |
| Downstream | CB failure counters reset each restart; Reuters/TE re-accumulate errors from 0; once-daily jobs may miss fire windows |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $83.68 — $11.94 inversion

| Field | Value |
|---|---|
| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`, `brent_crude_usd=83.68` |
| Impact | Historical auto-tracker table reads wrong WTI. `get_macro_snapshot` uses live Brent (tier-1, ok); only DB historical WTI affected |

---

### ISSUE-3 (ONGOING) — Reuters RSS + Trading Economics never succeed across sessions

| Field | Value |
|---|---|
| Evidence | `get_system_status` (session started 23:18:35 UTC, 48m old): Reuters RSS 8 failures, never succeeded; Trading Economics (×2) 8 failures, never succeeded |
| Impact | Missing international news from Reuters; missing TE macro indicators. Bloomberg + VN RSS sources partially mitigating. |
| Note | Structural failure — counters reset per restart but failures persist from session start each time |

---

## Improvements (non-blocking)

| ID | Finding | Caller-surface | Fix |
|---|---|---|---|
| IMPROVE-1 | `get_cycle_bootstrap` enum retains dead values: `financial-analyst`, `report-analyzer` | 0 active callers use these values | Remove from Zod enum in tool registration |
| IMPROVE-2 | 5 tickers with 0 OHLCV rows: BDI/DLC/JSH/SIS/VDC — TA silent for 12% of watchlist | `get_pipeline_health` | Trigger OHLCV backfill or remove from watchlist |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift: system-map says `"19:13 UTC"`, runs at `12:13 UTC` | `docs/data/system-map.json` | Fix schedule field |
| IMPROVE-4 | `get_sla_status` BCTC threshold hardcoded 360 min (6h) vs 168h out-of-earnings-window | `get_sla_status({})` | Update SLA check to use seasonal threshold from system-map.json BCTC SLA block |
| IMPROVE-5 | `get_technical_indicators.md` and `get_price_history.md` document `ticker` param; live API uses `code` | 0 affected runtime callers (all flow files already use `code`) | Fix param name in list docs; fix example block in market-watcher package doc |
| IMPROVE-6 (NEW) | VEA (active=false) still processed by bctcQueueEnricher — 40+ WARNs per hour | `bctcQueueEnricher` reads DB watchlist table; VEA not purged after sprint-054 | Purge VEA from DB watchlist or add `active=false` filter to enricher |
| IMPROVE-7 (NEW) | Off-hours HNX/UPCOM price fetch generates 10+ unresolved ERROR log entries per 15-min cycle | `intelligenceCycleJob` runs 24/7; no market-hours gate on HNX fetch | Add market-hours gate to HNX price fetch or downgrade off-hours failures to DEBUG |

---

## Full Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_cycle_bootstrap` | ✅ OK | Requires valid `agent_name` enum; `agent_name:"market-watcher"` → 24ms, full context (agent_signals, market_context, system_status) |
| `get_system_status` | ✅ OK (10 unresolved) | All 16 circuit breakers OK; 10 unresolved = off-hours HNX errors (IMPROVE-7) + VEA WARNs (IMPROVE-6) |
| `get_market_snapshot` | ✅ OK | VN-Index 1799.31 +0.43%, source_tier=2 |
| `get_macro_snapshot` | ✅ OK | Carry NEUTRAL (is_estimate=false), yield CHEAP; all tier-1/2 sources ok |
| `get_cron_health` | ✅ OK (2 issues) | `vnstockTradingStatsRefresh` crashed 50%; `bctcReparseJob` 80.3% |
| `get_pipeline_health` | ✅ OK (5 dark) | 36/41 TA ready; BDI/DLC/JSH/SIS/VDC rows=0 |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv ok; bctc STALE since 2026-06-13 23:45 |
| `get_vps_service_health` | ✅ OK | 3 healthy, 2 idle (market closed) |
| `get_sla_status` | ✅ OK (masked) | news breached 33/30min; bctc 249/360min ok (masked by reparse) |
| `get_earnings_calendar` | ✅ OK | 30 ĐÃ NỘP, 11 QUÁ HẠN |
| `get_cron_health` | ✅ OK | 70 jobs returned; `bctcReparseJob` at 80.3%; `vnstockTradingStatsRefresh` crashed |
| `get_agent_signals` | ✅ OK | Requires `agent (string)`; `{agent:"news-scout", limit:5}` → empty (no new signals — expected off-hours) |
| `task_claim` | ✅ OK | `{"claimed":true}` — probe lock acquired and released cleanly |
| `task_release` | ✅ OK | `{"ok":true}` |
| `task_list_held` | ✅ OK | 10 held locks (cowork-slots + sprint tasks — normal) |
| `get_recent_fixes` | ✅ OK | 20 fixes; no fix for any active BUG in this report |
| `get_foreign_flow` | ❌ no-args | `{}` → MCP -32602 Required: `code` (BUG-NEW-4) |
| `get_ticker_intelligence` | ❌ no-args | `{}` → MCP -32602 Required: `code` (BUG-NEW-5) |
| `post_agent_signal` | ❌ wrong schema | `{type:"test_probe"}` → MCP -32602 Required: from_agent, to_agent, signal_type, payload (BUG-3) |

---

## Caller-Surface Verification (STEP 3b — this cycle)

```
# BUG-NEW-4 get_foreign_flow (re-probed):
call_tool("get_foreign_flow", {}) → MCP -32602 Required: code (string) — CONFIRMED
grep pattern "get_foreign_flow" docs/agents/fb-market-poster/flow/main.md:78
→ Read L78: call_tool(server="vn-market", tool="get_foreign_flow", arguments={}) — CONFIRMED BROKEN (1 caller)

# BUG-NEW-5 get_ticker_intelligence (re-probed):
call_tool("get_ticker_intelligence", {}) → MCP -32602 Required: code (string) — CONFIRMED
Read docs/agents/fb-market-poster/flow/main.md:81
→ call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={}) — CONFIRMED BROKEN (1 caller)

# BUG-3 post_agent_signal (re-probed):
call_tool("post_agent_signal", {type:"test_probe"}) → MCP -32602 Required: from_agent, to_agent, signal_type, payload — CONFIRMED
grep "post_agent_signal" docs/agents/system-auditor/flow/main.md
→ L193 (data_stale emit), L482 (db_integrity_breach emit), L509 (system_health_report emit) — 3 broken sites
Verified: live schema enum = urgent_news|price_anomaly|cross_validate|suppress|chain_catalyst|fundamental_validation|
           price_confirmation|verified_chain|signal_feedback|legal_risk|verified_decision

# BUG-2 BCTC pipeline (re-probed):
get_vps_proxy_health → bctc STALE: 2026-06-13 23:45:12, 0 pushes/24h — CONFIRMED
get_system_status → bctcQueueEnricher: 0 URLs populated across all 10 item(s) — CONFIRMED (worsened from 9)

# BUG-1 vnstockTradingStatsRefresh (re-probed):
get_cron_health → last_status=crashed, success_rate=0.50 (50.0%), total_runs=2 — CONFIRMED UNCHANGED

# IMPROVE-6 VEA enricher noise (new this cycle):
grep "VEA" docs/agents → data/system-map.json: active=false, note="Removed sprint-054"
get_system_status: bctcQueueEnricher: 0 URLs found for ticker VEA (in unresolved errors)
grep "VEA" apps/mcp-server/src: 52 files — enricher reads DB watchlist, not system-map.json

# IMPROVE-7 HNX off-hours error noise (new this cycle):
get_system_status: 10 unresolved errors, all hnx/UPCOM "all price sources failed" 00:00-00:03 UTC
get_system_status circuit breakers: hnx [OK] failures: 0 — CB healthy, error is log-level noise
intelligenceCycleJob last_run: 2026-06-16 00:00:01 success — job succeeds but generates error log
```

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | **6** | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC VPS dead >48h; BUG-3 `post_agent_signal` schema drift (3 sites); BUG-NEW-3 `bctcReparseJob` 80.3%; BUG-NEW-4 `get_foreign_flow` no-args; BUG-NEW-5 `get_ticker_intelligence` no-args |
| **ISSUE** | **3** | ISSUE-1 server restarts 31/7d (worsened); ISSUE-2 WTI crude inverted; ISSUE-3 Reuters/TE never succeed |
| **IMPROVE** | **7** | IMPROVE-1 bootstrap enum; IMPROVE-2 5 dark tickers; IMPROVE-3 job schedule doc; IMPROVE-4 SLA threshold; IMPROVE-5 tool-list param drift; IMPROVE-6 VEA enricher noise (NEW); IMPROVE-7 HNX off-hours error noise (NEW) |
