# Team MCP Tool Health Recheck — 2026-06-15 18:06 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 18:03–18:06 UTC (VN market CLOSED)
**Prior report:** `team-tool-recheck-2026-06-15-1619.md` (1h 47min delta)
**Method:** Read-only smoke calls per tool + caller-surface grep. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — 1h 41m uptime (restarted 16:24:56 UTC); Telegram env SET |
| MCP error class | Schema validation errors returned correctly (transport healthy) |

---

## STEP 3c — Prior-Report Delta (re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC pipeline dead (SLA CRITICAL) | `get_sla_status`: `bctc 2166/360min CRITICAL`; `get_vps_proxy_health`: bctc STALE last push 2026-06-13 23:45 | **ONGOING, WORSENED** (+109 min since 16:19) |
| BUG-3 | `post_agent_signal` schema drift (system-auditor) | Docs/flow unchanged; no code fix deployed this cycle (server restart at 16:24 is a full restart) | **ONGOING, ASSUMED** |
| BUG-NEW-1 | `fetch_and_analyze` all-sources timeout | `get_system_status` (18:03 UTC): 10 recent errors are ALL `bctcQueueEnricher` — zero `fetch_and_analyze` errors visible | **RESOLVED ✅** — was transient at 16:12; not reproducing now |
| BUG-NEW-2 | `search_similar_context` timeout | Same check — no timeout errors in current log; isolated to 16:12 spike | **RESOLVED ✅** — transient, not reproducing |
| BUG-NEW-3 | `bctcReparseJob` 79.8% | `get_cron_health`: `success_rate=0.80 (79.8%)`, `total_runs=168`, last_run 16:25:26 success | **ONGOING** — marginally below 80% alert threshold |
| ISSUE-1 | Server restart rate 26/7d | `get_cron_health`: `mcpServerStartup total_runs=27` — +1 restart at 16:24:56 UTC | **WORSENED** — now 27/7d (3.9/day) |
| ISSUE-2 | WTI crude inverted $95.5 vs Brent $83.16 | `get_system_status`: `wti_crude_usd=95.5 (79 data points)` vs `brent_crude_usd=83.27` | **UNCHANGED** |
| ISSUE-3 | Reuters/TE consecutive failures | `get_system_status`: Reuters `Ngưng \| 18 errors`; TE `Ngưng \| 18 errors × 2` — reset by restart; re-accumulating | **ONGOING** — failure counters reset at 16:24; sources still stopped |
| ISSUE-NEW-1 | `get_system_status` intermittent 60s timeout | Called alongside 5 other parallel tools at 18:03; returned in ~8s with full payload | **RESOLVED ✅** — was tied to 16:12 load spike |
| IMPROVE-1 | `get_cycle_bootstrap` legacy enum values | `get_cycle_bootstrap` with `agent_name: "market-watcher"` → OK (27ms) | **ONGOING** — `financial-analyst`, `report-analyzer` still in enum |
| IMPROVE-2 | 5 dark watchlist tickers (0 OHLCV rows) | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC `rows=0` | **ONGOING** |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift | `get_cron_health`: last_run `2026-06-15 12:13:01` (= 19:13 VN) — schedule correct; system-map says `"19:13 UTC"` | **ONGOING** doc drift |
| IMPROVE-4 | `get_sla_status` BCTC threshold mismatch | `get_sla_status`: BCTC threshold `360 min` (6h) vs system-map 168h out-of-window | **ONGOING** |

---

## NEW Finding This Cycle

### BUG-NEW-4 (NEW) — `get_foreign_flow` triple-parameter mismatch breaks `fb-market-poster`

| Field | Value |
|---|---|
| Class | **BUG** |
| Live tool call | `call_tool(server="vn-market", tool="get_foreign_flow", arguments={})` → `MCP -32602: path: ['code'], received: undefined, message: Required` |
| Live schema | Requires `code: string` (confirmed from test files: `{ code: "VNM", days: 5 }`) |
| Tool doc | `docs/agents/tools/list/get_foreign_flow.md` says param is `ticker` — **wrong field name** |
| Package doc | `docs/agents/tools/package/fb-market-poster.md` line 48: `(none required)` — **wrong: no such no-arg mode** |
| Flow file | `docs/agents/fb-market-poster/flow/main.md` line 78: `call_tool(…, tool="get_foreign_flow", arguments={})` — **will fail every cycle** |
| Correct alternative | `get_market_foreign_flow(arguments={})` — no args required, returns market-wide net buy/sell + top movers (confirmed working: returns 102 tickers, top 5 buyers/sellers). This is what fb-market-poster actually needs. |
| Caller-surface grep | `grep "get_foreign_flow" docs/agents/fb-market-poster/flow/main.md` → line 78 confirmed broken. `grep "get_foreign_flow" docs/agents/unified-agent/flow/market-analysis.md` → comment reference only, not a call. Source tests use `code` param correctly. |
| Affected callers | **1 agent broken**: fb-market-poster (line 78 in flow/main.md). unified-agent and other agents use `get_market_foreign_flow` or reference data from bootstrap — not affected. |

**Fix:**
1. In `docs/agents/fb-market-poster/flow/main.md:78`: replace `get_foreign_flow` with `get_market_foreign_flow` (no args needed; returns the market-wide data the poster actually wants).
2. In `docs/agents/tools/package/fb-market-poster.md`: replace `get_foreign_flow` row with `get_market_foreign_flow` entry.
3. In `docs/agents/tools/list/get_foreign_flow.md`: fix param name from `ticker` to `code`.

---

## ACTIVE FINDINGS

### BUG-1 (ONGOING, 2nd+ cycle) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). No subsequent run — job is weekdays 08:30 UTC only |
| Downstream | `vnstock_trading_stats` table not refreshed; affects `get_sector_comparison`, `get_market_cap`, `get_company_profile` |
| Caller-surface | `grep "trading_stats" apps/mcp-server/src` → `assembleBriefing.ts`, `IKinhDichScoreRepository.ts` |

**Fix:** Add per-ticker `AbortSignal.timeout(60_000)` in `vnstockFundamentalsJob.ts` trading-stats path + job-level 600s guard. File: `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`.

---

### BUG-2 (ONGOING, WORSENING) — BCTC pipeline dead: 2166 min stale, SLA CRITICAL

| Field | Value |
|---|---|
| SLA evidence | `get_sla_status`: `bctc \| 2166 min elapsed \| 360 min SLA \| CRITICAL` |
| VPS evidence | `get_vps_proxy_health`: `bctc \| last push 2026-06-13 23:45:12 \| 0 pushes/24h \| STALE: YES` |
| Enricher errors | `get_system_status`: `bctcQueueEnricher: 0 URLs populated across all 9 item(s) — all sources may be unavailable or geo-blocked` (recurring every 15 min) |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — up but returning 0 URLs (silent-failure) |
| Earnings context | `get_earnings_calendar`: Q1-2026 overdue: ACV, BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH, VNM (14 tickers) |
| Worsening | +109 min since 16:19 report; +2166 min total since last successful push |
| Caller-surface | `grep "get_bctc" docs/agents/tools/package/*.md` → bctc-analyst.md, unified-agent.md, digest-predict.md |

**Fix:** `trigger_bctc_vps_fetch` to force a discovery cycle; SSH VPS to probe `curl /proxy/bctc-discover/VCB` directly to distinguish geo-block vs scraper format change.

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor flow uses wrong contract

| Field | Value |
|---|---|
| Live schema | `from_agent (req), to_agent (req), signal_type: enum (req), payload: object (req)` |
| Flow mismatch | `system-auditor/flow/main.md` L193, L482, L509 — uses `{type, ts, tier, summary, checks, overall}` |
| Impact | All 3 `post_agent_signal` emits from system-auditor fail silently. Infra anomalies invisible to other agents. |
| Caller-surface | 1 agent broken (system-auditor). News/price agents use correct schema. |

**Fix:** Rewrite 3 emit blocks in `docs/agents/system-auditor/flow/main.md` to use correct schema: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}`.

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at 79.8%: below 80% alert threshold

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `success_rate=0.80 (79.8%)`, `total_runs=168`, `avg_duration=324,134ms` |
| Last run | 2026-06-15 16:25:26 UTC — success |
| Threshold | `cronHealthAlertJob` fires when `success_rate < 80%` |
| Note | Likely consequence of BUG-2 (no new PDFs from VPS → empty reparse cycles that fail). May self-resolve once BCTC VPS pipeline is restored. |

---

### BUG-NEW-4 (NEW) — `get_foreign_flow` triple-parameter mismatch: fb-market-poster fails every cycle

*(See detail above in NEW Finding section.)*

---

## Issues (degraded but not broken)

### ISSUE-1 (WORSENED) — Server restart rate: 27 in 7 days (+1 this cycle)

| Evidence | `mcpServerStartup total_runs=27` — new restart at 16:24:56 UTC today |
|---|---|
| Impact | Once-daily cron jobs may miss fire window on restart days; circuit-breaker failure counters reset (Reuters/TE reset at 16:24, at 18 errors by 18:03) |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $83.27 — $12.11 inverted

| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)` — stale historical fetch |
|---|---|
| Impact | Macro analysis tools reading `wti_crude_usd` from DB get materially false input. `get_macro_snapshot` uses live Brent correctly (tier-1); only historical auto-tracker table affected. |

---

### ISSUE-3 (ONGOING) — Reuters RSS + Trading Economics: stopped with recurring failures

| Evidence | `get_system_status`: `Reuters RSS: Ngưng \| 18 errors`; `Trading Economics: Ngưng \| 18 errors × 2` — accumulating since restart at 16:24 |
|---|---|
| Delta | Failure counters reset by 16:24 restart; back to 18 by 18:03. Sources have NEVER succeeded (0 `last_success`). |
| Mitigation | Bloomberg, SBV, Yahoo, IMF covering core macro indicators. VN news via cafef/vnexpress/vneconomy (degraded but flowing). |

---

## Improvements (non-blocking)

| ID | Class | Finding |
|---|---|---|
| IMPROVE-1 | IMPROVE | `get_cycle_bootstrap` enum retains `financial-analyst`, `report-analyzer` — 0 active callers use these names; dead weight in schema |
| IMPROVE-2 | IMPROVE | 5 watchlist tickers with 0 OHLCV rows: BDI, DLC, JSH, SIS, VDC — TA alerts silent for 12% of watchlist; pipeline health shows `TA not ready` |
| IMPROVE-3 | IMPROVE | `macroIndicatorRefreshJob` schedule in system-map says `"19:13 UTC"` — should be `"12:13 UTC (19:13 VN)"` to avoid confusion |
| IMPROVE-4 | IMPROVE | `get_sla_status` BCTC threshold hardcoded at 360 min (6h). Per system-map SLA resolver: out-of-earnings-window (month=6) threshold is 168h. Fires false CRITICAL every day between earnings seasons. |

---

## Resolved This Cycle

| Prior ID | Finding | Proof |
|---|---|---|
| BUG-NEW-1 (16:19) | `fetch_and_analyze` all-sources timeout | `get_system_status` 18:03: 0 fetch_and_analyze errors in log; 10 errors are all bctcQueueEnricher ✅ |
| BUG-NEW-2 (16:19) | `search_similar_context` timeout | Same — no search_similar_context errors in current log ✅ |
| ISSUE-NEW-1 (16:19) | `get_system_status` intermittent 60s timeout | Called alongside 5 other parallel tools at 18:03 — returned in ~8s ✅ |

---

## Full Tool Probe Summary

| Tool | Status | Latency | Notes |
|---|---|---|---|
| `get_cycle_bootstrap` | ✅ OK | 27ms | Requires valid enum `agent_name` |
| `get_market_snapshot` | ✅ OK | ~50ms | VN-Index 1799.31 +0.43%, source_tier=2 |
| `get_macro_snapshot` | ✅ OK | ~200ms | Carry NEUTRAL, yield CHEAP, all tier-2 live |
| `get_system_status` | ✅ OK | ~8s | 10 unresolved errors (all bctcQueueEnricher WARNs) |
| `get_technical_indicators` | ✅ OK | ~100ms | FPT result; source_tier=3 (60d data) |
| `get_earnings_calendar` | ✅ OK | ~150ms | 27 ĐÃ NỘP, 14 QUÁ HẠN |
| `get_foreign_flow` | ❌ SCHEMA BUG | — | Requires `code: string`; doc says `ticker`; fb-market-poster calls with `{}` — BUG-NEW-4 |
| `get_market_foreign_flow` | ✅ OK | ~100ms | No args; returns market-wide net +1.01M (102 tickers) |
| `get_cron_health` | ✅ OK (2 issues) | ~300ms | `vnstockTradingStatsRefresh` crashed; `bctcReparseJob` 79.8% |
| `get_pipeline_health` | ✅ OK (5 dark) | ~200ms | 36/41 TA ready; BDI/DLC/JSH/SIS/VDC rows=0 |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | ~150ms | prices/news/sbv ok; bctc STALE (2026-06-13) |
| `get_vps_service_health` | ✅ OK | ~100ms | 3 healthy, 2 idle (market closed) |
| `get_sla_status` | ✅ OK (1 CRITICAL) | ~100ms | BCTC 2166/360 min CRITICAL; rest ok |
| `get_bctc_pending_refine` | ✅ OK | ~500ms | 5 PDFs in refine queue (VCB Q1-2025, HPG, GVR, HPG Q1-2026, HVN Q1-2026) |
| `get_vn_macro_indicators` | ✅ OK | ~200ms | IIP all-industry yoy_pct=103.3; source=NSO monthly |
| `task_list_held` | ✅ OK | ~150ms | 9 locks held; cowork slots all have valid TTLs |
| `post_agent_signal` | ❌ SCHEMA DRIFT | — | system-auditor flow uses wrong call contract (BUG-3, ongoing) |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | 5 | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC pipeline dead; BUG-3 `post_agent_signal` schema drift; BUG-NEW-3 `bctcReparseJob` 79.8%; **BUG-NEW-4** `get_foreign_flow` param mismatch |
| **ISSUE** | 3 | ISSUE-1 server restarts 27/7d; ISSUE-2 WTI crude inverted; ISSUE-3 Reuters/TE stopped |
| **IMPROVE** | 4 | IMPROVE-1 `get_cycle_bootstrap` enum; IMPROVE-2 5 dark tickers; IMPROVE-3 job schedule doc; IMPROVE-4 SLA threshold |
| **RESOLVED** | 3 | BUG-NEW-1 fetch_and_analyze (transient); BUG-NEW-2 search_similar_context (transient); ISSUE-NEW-1 get_system_status timeout (transient) |

---

## Caller-Surface Verification (STEP 3b)

```
# BUG-NEW-4 get_foreign_flow triple-mismatch:
grep "get_foreign_flow" docs/agents/fb-market-poster/flow/main.md
→ line 78: call_tool(…, "get_foreign_flow", arguments={})  ← CONFIRMED BROKEN

grep "get_foreign_flow" apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts
→ line 137: registered as "get_foreign_flow"; parameters: code (required string)

grep "get_foreign_flow" apps/mcp-server/src/__tests__/1134-get-foreign-flow-tool.test.ts
→ all test calls use { code: "VNM", days: 5 } — `code` is canonical parameter

# BUG-3 post_agent_signal — confirmed broken call sites (from prior cycle grep, unchanged):
grep "post_agent_signal" docs/agents/system-auditor/flow/main.md
→ L193, L482, L509 — 3 active emit sites confirmed wrong schema

# BUG-2 BCTC pipeline:
grep "get_bctc" docs/agents/tools/package/*.md
→ bctc-analyst.md, unified-agent.md, digest-predict.md — 3 agents affected
```
