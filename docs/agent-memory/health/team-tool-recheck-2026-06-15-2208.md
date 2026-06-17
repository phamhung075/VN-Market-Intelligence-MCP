# Team MCP Tool Health Recheck — 2026-06-15 22:08 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 22:03–22:08 UTC (VN market CLOSED)
**Prior report:** `team-tool-recheck-2026-06-15-2007.md` (2h 01min delta)
**Method:** Read-only smoke calls per tool + caller-surface grep. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — restarted at 21:58:35 UTC (9m 25s uptime at probe time); Telegram env SET |
| MCP error class | Schema validation errors returned correctly (transport healthy) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC VPS push stale | `get_vps_proxy_health`: bctc `STALE, last push 2026-06-13 23:45:12, 0 pushes/24h`. `get_system_status`: bctcQueueEnricher 0 URLs for all 9 items (recurring every 15 min) | **ONGOING, UNCHANGED** (now 46h+ stale) |
| BUG-3 | `post_agent_signal` schema drift (system-auditor) | Grep `docs/agents/system-auditor/flow/main.md`: L193/L482/L509 still use `{type: "data_stale", ...}` payload — wrong fields (`from_agent`, `to_agent`, `signal_type` missing). No code fix deployed | **ONGOING, UNCHANGED** |
| BUG-NEW-3 | `bctcReparseJob` at threshold | `get_cron_health`: `success_rate=0.80 (80.1%)`, `total_runs=171` (+1 run, still at 80%) | **ONGOING, AT THRESHOLD** |
| BUG-NEW-4 | `get_foreign_flow` no-args fail | `call_tool("get_foreign_flow", {})` → `MCP -32602: path:['code'] Required`. `docs/agents/fb-market-poster/flow/main.md:78` still calls with `{}` | **ONGOING, UNCHANGED** |
| BUG-NEW-5 | `get_ticker_intelligence` no-args fail | `call_tool("get_ticker_intelligence", {})` → `MCP -32602: path:['code'] Required`. `docs/agents/fb-market-poster/flow/main.md:81` still calls with `{}` | **ONGOING, UNCHANGED** |
| ISSUE-1 | Server restart rate | `get_cron_health`: `mcpServerStartup total_runs=29` — +1 restart at 21:58:35 UTC vs prior cycle (28 at 20:07 UTC) | **WORSENED** — 29/7d (4.1/day) |
| ISSUE-2 | WTI crude inverted $95.5 vs Brent $83.51 | `get_system_status`: `wti_crude_usd=95.5 (79 data points)` — identical | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters RSS + Trading Economics stopped | `get_system_status` (fresh session after 21:58 restart): Reuters RSS 3 failures, TE 3 failures, neither ever succeeded this session | **ONGOING** — session-level counters reset each restart; pattern persists across all sessions |
| IMPROVE-1 | `get_cycle_bootstrap` legacy enum | Requires `agent_name` from enum still including `financial-analyst`, `report-analyzer` | **ONGOING** |
| IMPROVE-2 | 5 dark tickers 0 OHLCV rows | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC `rows=0`, TA not ready | **ONGOING** |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift | `last_run=2026-06-15 12:13:01 UTC`; system-map says `"19:13 UTC"` | **ONGOING** |
| IMPROVE-4 | `get_sla_status` BCTC threshold 360 min | Still hardcoded at 360 min (6h) vs 168h expected out-of-earnings-window | **ONGOING** |

---

## NEW Finding This Cycle

### IMPROVE-5 (NEW) — Tool list docs use wrong param `ticker` vs live `code`

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Doc files affected | `docs/agents/tools/list/get_technical_indicators.md:9` — param documented as `ticker`; `docs/agents/tools/list/get_price_history.md:9` — param documented as `ticker` |
| Example block drift | `docs/agents/tools/package/market-watcher.md` example uses `{ ticker: "FPT" }` for `get_technical_indicators` |
| Live schema | Both tools require `code: string` (confirmed: `get_technical_indicators({code:"FPT"})` → OK; `get_price_history({code:"FPT", days:7})` → OK; source at `technicalIndicatorTools.ts:526`, `priceHistoryTools.ts:181`) |
| Caller-surface grep | `grep "get_technical_indicators\|get_price_history" docs/agents/market-watcher/flow/cycle.md:77` → uses correct `code` param; `docs/agents/tools/package/market-watcher.md:36,38` table header says `code: string` (correct); only the **example code block** and **list docs** are wrong |
| Runtime impact | **NONE** — all active flow callers already use `code`. Risk: misleads new agent/developer writing new callers. |
| Fix | Update `docs/agents/tools/list/get_technical_indicators.md` and `docs/agents/tools/list/get_price_history.md` param from `ticker` to `code`. Fix example block in `docs/agents/tools/package/market-watcher.md` |

---

## ACTIVE FINDINGS (all re-confirmed this cycle)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). No subsequent run — weekday-only job, next window Mon 08:30 UTC |
| Downstream | `vnstock_trading_stats` table stale; affects `get_sector_comparison`, `get_market_cap`, `get_company_profile` |
| Fix | Add `AbortSignal.timeout(60_000)` per-ticker + job-level 600s hard cap. File: `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` |

---

### BUG-2 (ONGOING) — BCTC VPS push dead: no push since 2026-06-13 23:45 UTC (>46h)

| Field | Value |
|---|---|
| VPS evidence | `get_vps_proxy_health`: `bctc | 2026-06-13 23:45:12 | 0 pushes/24h | STALE YES` |
| Enricher | `get_system_status`: `bctcQueueEnricher: 0 URLs populated across all 9 item(s)` (10 unresolved WARNs; fires every 15 min) |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — service up but producing 0 results (silent scraper failure) |
| SLA mask | `get_sla_status`: bctc shows `ok / 130 min` — masked by `bctcReparseJob` touching DB from cached PDFs, NOT new VPS pushes |
| Affected tickers (queued) | ACV, BDI, DAG, DLC, JSH, SIS, VDC, VNH, VEA |
| Downstream | bctc-analyst BCTC data frozen since 2026-06-13; earnings data stale for 11 QUÁ HẠN tickers |
| Fix | Run `trigger_bctc_vps_fetch` + SSH probe `curl /proxy/bctc-discover/<ticker>` on VPS to distinguish geo-block vs scraper format change |

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor 3 emit sites broken

| Field | Value |
|---|---|
| Live schema | Required: `from_agent (string), to_agent (string), signal_type (enum), payload (object)` |
| Flow mismatch | `docs/agents/system-auditor/flow/main.md` L193, L482, L509 — passes `{type, ts, tier, summary, checks, overall}` — missing all required fields |
| Grep proof | `grep -n "post_agent_signal" docs/agents/system-auditor/flow/main.md` → L193/L482/L509 confirmed broken this cycle |
| Impact | All infra anomaly signals from system-auditor fail silently; other agents receive no infra health signals |
| Fix | Rewrite 3 emit blocks in `docs/agents/system-auditor/flow/main.md` with correct schema: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}` |

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at alert threshold: 80.1%

| Evidence | `get_cron_health`: `success_rate=0.80 (80.1%)`, `total_runs=171`, last_run=2026-06-15 21:59:05 success |
|---|---|
| Note | `cronHealthAlertJob` fires when `success_rate < 80%`. Currently at 80.1% — one more failure trips alert. Likely exacerbated by BUG-2 (no new PDFs for 46h). |

---

### BUG-NEW-4 (ONGOING) — `get_foreign_flow` no-args: fb-market-poster fails every cycle

| Evidence | `call_tool("get_foreign_flow", {})` → `MCP -32602: path:['code'], expected:string, received:undefined` (re-probed this cycle) |
|---|---|
| Caller | `docs/agents/fb-market-poster/flow/main.md:78` → `call_tool(…, "get_foreign_flow", arguments={})` — **1 broken caller** |
| Fix | Replace line 78 with `get_market_foreign_flow(arguments={})` (no args required; returns market-wide flow). Also fix `docs/agents/tools/list/get_foreign_flow.md` param `ticker` → `code` and update fb-market-poster package doc |

---

### BUG-NEW-5 (ONGOING) — `get_ticker_intelligence` no-args: fb-market-poster fails every cycle

| Evidence | `call_tool("get_ticker_intelligence", {})` → `MCP -32602: path:['code'], expected:string, received:undefined` (re-probed this cycle) |
|---|---|
| Caller | `docs/agents/fb-market-poster/flow/main.md:81` → `call_tool(…, "get_ticker_intelligence", arguments={})` — **1 broken caller** |
| Fix | Replace line 81 with `get_market_snapshot(arguments={})` for market-wide movers, or call `get_ticker_intelligence({code:ticker})` per top-mover from snapshot result |

---

## Issues (degraded, not broken)

### ISSUE-1 (WORSENED) — Server restart rate: 29 in 7 days (+1 since prior cycle)

| Evidence | `mcpServerStartup total_runs=29` (+1 restart at 21:58:35 UTC, i.e. 25 min before this probe) |
|---|---|
| Impact | CB failure counters reset each restart; Reuters/TE re-accumulate errors from 0; once-daily jobs may miss fire windows; agent task locks orphaned |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $83.51 — $11.94 inversion

| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`; `brent_crude_usd=83.51` |
|---|---|
| Impact | Historical auto-tracker table reads wrong WTI. `get_macro_snapshot` uses live Brent (tier-1, ok); only DB historical WTI affected |

---

### ISSUE-3 (ONGOING) — Reuters RSS + Trading Economics never succeed across sessions

| Evidence | `get_system_status` (fresh session): Reuters RSS 3 failures / never succeeded; Trading Economics (×2) 3 failures / never succeeded |
|---|---|
| Impact | Missing international news from Reuters; missing TE macro indicators. Bloomberg + VN RSS sources partially mitigating |
| Note | Per-session state resets on restart; underlying fetch failure is structural, not transient |

---

## Improvements (non-blocking)

| ID | Finding | Fix |
|---|---|---|
| IMPROVE-1 | `get_cycle_bootstrap` enum retains `financial-analyst`, `report-analyzer` (0 active callers) | Remove dead values from Zod enum in tool registration |
| IMPROVE-2 | 5 watchlist tickers with 0 OHLCV rows: BDI/DLC/JSH/SIS/VDC — TA silent for 12% of watchlist | Trigger OHLCV backfill or remove from watchlist if truly no data source |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule in system-map says `"19:13 UTC"` but cron runs at 12:13 UTC | Fix `docs/data/system-map.json` cron schedule field |
| IMPROVE-4 | `get_sla_status` BCTC threshold hardcoded 360 min (6h) vs 168h out-of-earnings-window | Update SLA check to use seasonal threshold from `system-map.json` BCTC SLA block |
| IMPROVE-5 (NEW) | `docs/agents/tools/list/get_technical_indicators.md` and `get_price_history.md` document `ticker` param; live API uses `code` | Fix param name in list docs; fix example block in market-watcher package doc |

---

## Full Tool Probe Summary

| Tool | Status | Notes |
|---|---|---|
| `get_cycle_bootstrap` | ✅ OK | Requires valid enum `agent_name`; `agent_name:"news-scout"` → 76ms, full context |
| `get_system_status` | ✅ OK | Returns 10 unresolved (all bctcQueueEnricher WARNs); source health shows Reuters/TE degraded post-restart |
| `get_market_snapshot` | ✅ OK | VN-Index 1799.31 +0.43%, source_tier=2 |
| `get_macro_snapshot` | ✅ OK | Carry NEUTRAL, yield CHEAP, all tier-2; is_estimate=false |
| `get_cron_health` | ✅ OK (2 issues) | `vnstockTradingStatsRefresh` crashed; `bctcReparseJob` 80.1% |
| `get_pipeline_health` | ✅ OK (5 dark) | 36/41 TA ready; BDI/DLC/JSH/SIS/VDC rows=0 |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv ok; bctc STALE since 2026-06-13 |
| `get_vps_service_health` | ✅ OK | 3 healthy, 2 idle (market closed) |
| `get_sla_status` | ✅ OK (masked) | All 5 ok; bctc 130 min (masked by reparse, not real VPS push) |
| `get_earnings_calendar` | ✅ OK | 27 ĐÃ NỘP, 11 QUÁ HẠN (ACV/BDI/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VNH) |
| `get_watchlist` | ✅ OK | 41 tickers; 5 showing N/A (expected dark tickers) |
| `get_agent_signals` | ✅ OK | Requires `agent: string`; `agent="news-scout"` → empty (no signals) |
| `get_technical_indicators` | ✅ w/ `code` | `{code:"FPT"}` → OK, RSI=48.4, MACD, BB all returned |
| `get_price_history` | ✅ w/ `code` | `{code:"FPT", days:7}` → OK, 6 candles returned |
| `fetch_and_analyze` | ✅ OK | 20 items analyzed; news pipeline healthy |
| `task_claim` | ✅ OK | `{"claimed":true}` — coordination lock working |
| `task_release` | ✅ OK | `{"ok":true}` |
| `task_list_held` | ✅ OK | 11 held locks (cowork-slots + sprint tasks — normal) |
| `get_ticker_intelligence` | ❌ no-args | `{}` → MCP -32602 Required (BUG-NEW-5) |
| `get_foreign_flow` | ❌ no-args | `{}` → MCP -32602 Required (BUG-NEW-4) |
| `get_recent_fixes` | ✅ OK | 20 fixes returned; no BCTC VPS fix in history |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | **6** | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC VPS push dead (>46h); BUG-3 `post_agent_signal` schema drift (system-auditor); BUG-NEW-3 `bctcReparseJob` 80.1%; BUG-NEW-4 `get_foreign_flow` no-args; BUG-NEW-5 `get_ticker_intelligence` no-args |
| **ISSUE** | 3 | ISSUE-1 server restarts 29/7d; ISSUE-2 WTI crude inverted; ISSUE-3 Reuters/TE never succeed |
| **IMPROVE** | 5 | IMPROVE-1 bootstrap enum; IMPROVE-2 5 dark tickers; IMPROVE-3 job schedule doc; IMPROVE-4 SLA threshold; IMPROVE-5 tool-list param drift |

---

## Caller-Surface Verification (STEP 3b)

```
# BUG-NEW-5 get_ticker_intelligence (re-probed):
call_tool("get_ticker_intelligence", {}) → MCP -32602 Required (re-confirmed)
grep "get_ticker_intelligence" docs/agents/fb-market-poster/flow/main.md
→ L81: call_tool(…, "get_ticker_intelligence", arguments={}) — CONFIRMED BROKEN
grep "get_ticker_intelligence" docs/agents/tools/package/market-watcher.md
→ L207: uses {code:...} — correct caller, UNAFFECTED

# BUG-NEW-4 get_foreign_flow (re-probed):
call_tool("get_foreign_flow", {}) → MCP -32602 Required (re-confirmed)
grep "get_foreign_flow" docs/agents/fb-market-poster/flow/main.md
→ L78: call_tool(…, "get_foreign_flow", arguments={}) — CONFIRMED BROKEN

# BUG-3 post_agent_signal system-auditor (re-probed via grep):
grep -n "post_agent_signal" docs/agents/system-auditor/flow/main.md
→ L193, L482, L509 — 3 broken emit sites (uses {type,ts,tier,...} wrong schema)

# BUG-2 BCTC pipeline (re-probed):
get_vps_proxy_health → bctc STALE: 2026-06-13 23:45:12 (unchanged)
get_system_status → bctcQueueEnricher: 0 URLs populated across all 9 item(s)

# BUG-1 vnstockTradingStatsRefresh (re-probed):
get_cron_health → last_status=crashed, success_rate=0.50, total_runs=2 (unchanged)

# IMPROVE-5 tool-list param drift (re-probed):
call_tool("get_technical_indicators", {code:"FPT"}) → OK (code is correct param)
call_tool("get_price_history", {code:"FPT", days:7}) → OK (code is correct param)
docs/agents/tools/list/get_technical_indicators.md:9 → "ticker" (WRONG)
docs/agents/tools/list/get_price_history.md:9 → "ticker" (WRONG)
grep "get_technical_indicators\|get_price_history" docs/agents/market-watcher/flow/cycle.md:77
→ uses get_technical_indicators(code) — flow callers CORRECT; 0 runtime-affected callers
```
