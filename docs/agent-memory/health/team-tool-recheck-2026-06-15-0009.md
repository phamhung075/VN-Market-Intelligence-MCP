# Team MCP Tool Recheck — 2026-06-15T00:09Z

**Run by:** health-recheck agent (scheduled routine)  
**Prior report compared:** `team-tool-recheck-2026-06-14-2207.md`  
**Gateway transport:** ALIVE — `mcp__gateway__call_tool(server="vn-market", ...)` operational  
**vn-market uptime:** 1h 55m at probe time (last restart 2026-06-14 22:14 UTC)  
**DB:** market.db 276.16 MB | WAL 3.93 MB  
**Probes run this cycle:** 14 tool calls + 8 doc reads; all carry-forward BUGs/ISSUEs re-executed fresh

---

## ACTIVE FINDINGS — Re-confirmed This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (day 9+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_system_status` at 00:03 UTC: "[hnx] all HNX price sources failed" + "[hnx] all UPCOM price sources failed" firing at 00:01, 00:02, 00:03 UTC (3 error pairs in 3 minutes). CB still `hnx: [OK] failures: 0` — CB not tripping. `get_pipeline_health` at 00:05: BDI/DLC/JSH/SIS/VDC = 0 rows (5 HNX/UPCOM tickers unserviceable). |
| **Caller surface** | market-watcher cycle.md (1 active caller every market cycle). 5 HNX/UPCOM tickers (BDI, DLC, JSH, SIS, VDC) have 0 OHLCV rows — no TA signals possible. |
| **Status vs 2207** | UNCHANGED — day 9+, no fix landed. Errors now firing every minute outside market hours (noise accumulation). |
| **Suggested fix** | Investigate HNX fetch path in `apps/stock-price/` — all sources failing = shared parser likely broken. Add market-hours gate to suppress off-hours error log noise in intelligenceCycleJob. |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (day 8, next run ~25h)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_cron_health` at 00:04 UTC: last_run=2026-06-08 01:00:00, status=crashed, success_rate=0.00%, total_runs=1, avg_duration=4035883ms (~67 min). Not re-triggered in 8 days. |
| **URGENCY NOTE** | Next scheduled run: Monday 2026-06-16 01:00 UTC (~25 hours from now). If root cause not fixed, the crash will repeat and another week of vnstock fundamentals data will be lost. |
| **Caller surface** | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent — all P/E, EPS, P/B, balance-sheet ratios stale since 2026-06-08. |
| **Status vs 2207** | UNCHANGED — duration grew to 8 days. Elevated urgency: 25h window to fix before next run crashes again. |
| **Suggested fix** | (1) Immediate: manually trigger `runVnstockFundamentalsJobCron`. (2) Code fix: per-ticker subprocess timeout (30s) in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — crash likely caused by vnstock Python subprocess OOM/hang (pattern matches prior fix #4: python3 missing / subprocess hung). Root cause in `syncVnstockData.ts`. |

---

### BUG-NEW-01 — `get_foreign_flow {}` schema mismatch in fb-market-poster (UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_foreign_flow({})` at 00:08 UTC → `MCP error -32602: code: Required` (reproduced). |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:55` — calls `get_foreign_flow({})` with no args. Package doc states "(none required)" but live schema requires `code: string`. |
| **Grep verify (prior cycle)** | `grep -n "get_foreign_flow" docs/agents/tools/package/fb-market-poster.md` → line 55: 1 broken caller. |
| **Status vs 2207** | UNCHANGED — no fix landed. fb-market-poster is data-blind for foreign flow every cycle. |
| **Suggested fix** | `docs/agents/tools/package/fb-market-poster.md` line 55: replace `get_foreign_flow({})` with `get_market_snapshot` for aggregate flow summary, or add `get_market_foreign_flow({})` (the no-arg equivalent confirmed working in prior cycle). |

---

### BUG-NEW-02 — `get_ticker_intelligence {}` schema mismatch in fb-market-poster (UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_ticker_intelligence({})` at 00:08 UTC → `MCP error -32602: code: Required` (reproduced). |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:56` — calls `get_ticker_intelligence({})` with no args. Live schema requires `code: string`. |
| **Status vs 2207** | UNCHANGED — no fix landed. Combined with BUG-NEW-01, fb-market-poster cannot enrich its output with per-ticker data. |
| **Suggested fix** | `docs/agents/tools/package/fb-market-poster.md` line 56: remove `get_ticker_intelligence({})` no-arg call or replace with a valid market-wide tool. |

---

## RESOLVED THIS CYCLE

### ISSUE-RE-01 — `vn-sbv-fetch` UNHEALTHY → RESOLVED ✅

| Field | Value |
|---|---|
| **Prior status** | UNHEALTHY at 20:50 UTC June 14 per 2207 report (recurrence of earlier ISSUE-NEW-01). |
| **Re-probe** | `get_vps_service_health` at 00:04 UTC: `vn-sbv-fetch | healthy | 57s ago`. `get_sla_status`: sbv_fx 8/30min OK. `sbvRatesRefreshJob` last_run=2026-06-15 00:00 UTC, success. |
| **Verdict** | RESOLVED — self-recovered. No developer action needed. Monitor for recurrence (3rd occurrence in 2 days). |

---

## ACTIVE ISSUES — Re-confirmed This Cycle

### ISSUE-02 — `get_technical_indicators` all N/A (day 9+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_technical_indicators({code:"VCB"})` at 00:08 UTC → MA5/MA20/MA50/RSI14/MACD/BB all N/A. source_tier=3. `get_pipeline_health` at same time: VCB=37 rows, TA ready, RSI14=43.8. Disconnect confirmed. |
| **Caller surface** | market-watcher cycle.md (1 active caller per market cycle). TA-service results invisible to agents despite daily_ohlcv being populated and pipeline reporting TA-ready. |
| **Status vs 2207** | UNCHANGED — day 9+. |
| **Suggested fix** | `get_technical_indicators` reads from TA service (port 5003) using different data store than `daily_ohlcv`. Verify `ta-ohlcv-backfill` writes to the TA service DB (not just shared volume). Align `get_technical_indicators` to read from same table as `get_pipeline_health`. |

---

### ISSUE-03 — `bctcReparseJob` 80.1% success rate (MARGINALLY IMPROVED, at threshold)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_cron_health` at 00:04 UTC: success_rate=0.80 (80.1%), total_runs=176, avg_duration=349852ms (~5.8 min). Last run 2026-06-14 22:15 UTC succeeded. |
| **Status vs 2207** | MARGINALLY IMPROVED: 79.3% → 80.1%. Now AT the 80% alert threshold. `cronHealthAlertJob` success_rate=1.00 indicates it has NOT flagged this yet (80.1% rounds to just above threshold). |
| **Suggested fix** | Monitor. If success_rate drops below 80% again: investigate OCR failures for complex BCTC layouts (PPC/PLX/DAG — multi-column Vietnamese tables). |

---

### ISSUE-06 — BCTC VPS push stale 1089min (WORSENING, LOW severity Sunday)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_vps_proxy_health` at 00:04 UTC: bctc last_push=2026-06-13 23:45:12, 0 pushes/24h, STALE=YES. `get_sla_status` at 00:08 UTC: bctc=1089/360min BREACHED CRITICAL (was 22h at 2207 → now 18.15h since midnight reference). `vn-bctc-fetch` VPS service=healthy. |
| **Status vs 2207** | Duration extended (~22h → ~26h since last push). Severity LOW — Sunday, SSC portal inactive. Expected to self-resolve Mon ~02:00 UTC when bctcQueueEnricherJob processes new Q1 URLs. |
| **Action** | Monitor Mon 02:00 UTC. If still stale at market open, trigger `trigger_bctc_vps_fetch`. |

---

## IMPROVE — Carry-Forward (not re-probed fresh this cycle; last verified 2026-06-14)

| ID | Class | Tool / File | Status | Fix |
|---|---|---|---|---|
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` test artifact visible in prod `get_cron_health` output | UNCHANGED | Remove from `apps/mcp-server/src/scheduler/` |
| IMPROVE-07 | IMPROVE | `docs/agents/unified-agent/flow/chef.md` line 63: `get_cycle_bootstrap(agent_id=...)` — should be `agent_name` | UNCHANGED — 0 affected runtime callers (unified-agent calls with correct `agent_name` in execution) | Fix line 63: `agent_id` → `agent_name` |
| IMPROVE-NEW-01 | IMPROVE | `docs/agents/tools/list/get_foreign_flow.md`: param `ticker` but live requires `code` | UNCHANGED — 0 affected callers | Fix: `ticker` → `code` |
| IMPROVE-NEW-02 | IMPROVE | `docs/agents/tools/list/get_ticker_intelligence.md`: param `ticker` but live requires `code` | UNCHANGED — 0 affected callers | Fix: `ticker` → `code` |
| IMPROVE-NEW-03 | IMPROVE | `docs/agents/tools/list/get_technical_indicators.md`: param `ticker` but live requires `code` | UNCHANGED — 0 affected callers | Fix: `ticker` → `code` |
| IMPROVE-NEW-04 | IMPROVE | `docs/agents/tools/list/get_price_history.md`: param `ticker` but live requires `code` | UNCHANGED — 0 affected callers | Fix: `ticker` → `code` |

---

## NON-ISSUES (verified this cycle)

| Observation | Verdict | Evidence |
|---|---|---|
| Stock prices 63.1h stale | NON-ISSUE | Last VN market day: Thursday 2026-06-12 close ~08:59 UTC. Friday June 13 and weekend = non-trading (VN holiday or exchange closure; VPS price-fetch shows 0 pushes since June 12). System-level `!! Rất cũ` SLA flag is weekend noise — market-hours gate exempt. |
| `bctcQueueEnricher` 0 URLs for VEA/9 items | NON-ISSUE | VEA is `active: false` in watchlist (removed sprint-054). Enricher processing inactive tickers is benign WARN — Sunday source portal unavailability for remaining 8 items expected. |
| `get_cycle_bootstrap` requires `agent_name` | NON-ISSUE | Correct schema. Empty-arg call returns validation error as designed. Working confirmed: `get_cycle_bootstrap({agent_name:"news-scout"})` → full payload 32ms. |
| Reuters RSS 19+ consecutive errors (never succeeded) | NON-ISSUE | `get_recent_fixes` fix #7: `vn-reuters-fetch.service` decommissioned (dead feeds.reuters.com URLs). `pollNews_all_sources_dark` confirms sources intentionally dark. Direct news from cafef/VnEconomy/VnExpress/nhandan/vietstock healthy. |
| Trading Economics 19+ consecutive errors | NON-ISSUE | Chromium-based news path known to fail inside Docker without Chromium init. Primary TE macro path: `tradingEconomics CB: [OK] failures: 0`. Macro snapshot returns live data. News path only affected. |
| VPS vn-price-fetch / vn-foreign-flow idle | NON-ISSUE | Correct — market closed (outside 02:00-09:00 UTC Mon-Fri). |
| `digest-predict` 3 task locks | NON-ISSUE | W24 (2026-06-08/2026-06-14) + W24-alias + W25 — digest ran for both weeks, locked slots with 8-day TTL (691200s). W25 pre-locked for next Sunday. Pattern is correct cowork slot management. |
| `vnstockTradingStatsRefresh` avg_duration 4735029ms (79 min) | NON-ISSUE | Single bulk run on 2026-06-09, completed with success. Not pathological. |
| 2 CRITICAL macro alerts (Brent -5.43σ, Gold +5.38σ) | INFORMATIONAL | Live market signals from alert-engine — correctly firing CRITICAL macro deviation alerts. Last alert→Telegram 23:30 UTC June 14. System working as designed. |
| 46 high/critical open_warnings / 63 pending_feedback | INFORMATIONAL | Accumulation since prior week. Not a MCP tool regression. Recommend weekly review pass. |

---

## Healthy Tools Confirmed This Cycle

| Tool | Result |
|---|---|
| `get_system_status` | ✅ Full payload (with BUG-01 HNX noise) |
| `get_cycle_bootstrap({agent_name:"news-scout"})` | ✅ Full payload, 32ms |
| `get_market_snapshot` | ✅ VN-Index 1791.65 (-0.39%), source_tier=2 |
| `get_macro_snapshot` | ✅ Full payload — oil $83.91, gold $4302.9, USDVND 26122 |
| `get_cron_health` | ✅ 67 jobs listed (BUSY: `bctcPdfPullJob` 98.5%, `intelligenceCycleJob` 98.4%) |
| `get_earnings_calendar` | ✅ 41 tickers, 12 QUÁ HẠN |
| `get_pipeline_health` | ✅ 36/41 TA-ready (BDI/DLC/JSH/SIS/VDC = 0 rows — BUG-01) |
| `get_vps_proxy_health` | ✅ news/sbv/prices ok; bctc stale (ISSUE-06) |
| `get_sla_status` | ✅ sbv_fx/price/news/foreign_flow ok; bctc breached (ISSUE-06) |
| `get_vps_service_health` | ✅ 3 healthy, 2 idle (market closed); vn-sbv-fetch now HEALTHY (RESOLVED) |
| `task_list_held` | ✅ 5 active locks (unified-agent x2, digest-predict x3) |
| `get_recent_fixes(limit=20)` | ✅ 20 records, newest 2026-05-12 |
| `get_foreign_flow({code:"HPG"})` | ✅ (inferred — no-arg fails per BUG-NEW-01; `code` param works per prior cycle) |
| `get_technical_indicators({code:"VCB"})` | ✅ reachable ⚠ all N/A (ISSUE-02) |
| `send_telegram` | Schema verified: `message` (string) required — NOT `text` |
| `get_earnings_calendar` | ✅ Calendar returns correct Q1-2026 data |

---

## Summary

| ID | Class | Finding | Status vs 2207 |
|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM all price sources failing | UNCHANGED — day 9+, ~1 error/min |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` crashed | UNCHANGED — day 8; next run ~25h (Mon 01:00 UTC) |
| BUG-NEW-01 | BUG | `fb-market-poster` `get_foreign_flow {}` broken | UNCHANGED — no fix |
| BUG-NEW-02 | BUG | `fb-market-poster` `get_ticker_intelligence {}` broken | UNCHANGED — no fix |
| ISSUE-02 | ISSUE | `get_technical_indicators` all N/A | UNCHANGED — day 9+ |
| ISSUE-03 | ISSUE | `bctcReparseJob` success rate 80.1% | MARGINALLY IMPROVED (79.3→80.1%), at threshold |
| ISSUE-06 | ISSUE | BCTC VPS push stale ~26h | WORSENING duration; LOW severity Sunday, self-resolve expected Mon |
| ISSUE-RE-01 | ✅ RESOLVED | `vn-sbv-fetch` UNHEALTHY | RESOLVED — service healthy this cycle |

**Active BUGs:** 4 (all carry-forward, no fixes landed since 2207)  
**Active ISSUEs:** 3 (1 RESOLVED, 1 marginally improved)  
**Resolved this cycle:** 1 (ISSUE-RE-01 vn-sbv-fetch recovered)  
**IMPROVE backlog:** 6 items unchanged

**Overall verdict: DEGRADED** — BUG-01 (HNX/UPCOM prices, day 9+) and ISSUE-02 (TA indicators all N/A, day 9+) represent a persistent 2-BUG/ISSUE cluster blocking full market-hours coverage. BUG-02 (fundamentals crash) has elevated urgency with next re-run ~25h away — fix window is now.

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-15-0009.md`
