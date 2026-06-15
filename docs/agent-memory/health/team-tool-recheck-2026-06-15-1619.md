# Team MCP Tool Health Recheck — 2026-06-15 16:19 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 16:05–16:19 UTC (VN market CLOSED)
**Prior report:** `team-tool-recheck-2026-06-15-1409.md` (2h 10min delta)
**Method:** Read-only smoke calls per tool + schema validation + caller-surface grep. No live-state mutations except `log_agent_work` probe (id=1386, immediately completed) and `task_claim` probe (health-recheck:2026-06-15, immediately released).

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — uptime 4h 25min (last restart 11:48:28 UTC); Telegram env SET |
| MCP error class | Schema validation errors returned correctly (transport healthy) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC pipeline dead (SLA CRITICAL) | `get_sla_status`: `bctc 2057/360min CRITICAL`; `get_vps_proxy_health`: bctc STALE last push 2026-06-13 23:45 | **ONGOING, WORSENED** (+132min since 14:09) |
| BUG-3 | `post_agent_signal` schema drift (system-auditor) | Re-probed with system-auditor call schema → `MCP -32602: from_agent/to_agent/signal_type/payload required`; flow/main.md still uses `{type, ts, tier, summary}` | **ONGOING, CONFIRMED** |
| ISSUE-1 | Server restart rate 26/7d | `get_cron_health`: `mcpServerStartup total_runs=26` — no new restarts | **ONGOING, STABLE** |
| ISSUE-2 | WTI crude $95.5 inverted vs Brent $83.16 | `get_system_status`: `wti_crude_usd=95.5` vs `brent_crude_usd=83.16` — $12.44 inverted | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters/TE consecutive failures | `get_system_status`: Reuters `Ngưng \| 40 errors`; Trading Economics `Ngưng \| 40 errors × 2` | **ONGOING, WORSENED** (+18 failures since 14:09) |
| IMPROVE-1 | `get_cycle_bootstrap` legacy enum | Schema error confirms `financial-analyst \| report-analyzer` still in enum | **ONGOING** |
| IMPROVE-2 | 5 dark watchlist tickers (0 OHLCV) | `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC rows=0 — unchanged | **ONGOING** |
| IMPROVE-3 | macroIndicatorRefreshJob timezone docs | No code change detected; static doc drift | **ASSUMED ONGOING** |
| IMPROVE-4 | `get_sla_status` BCTC threshold mismatch (6h vs system-map 168h) | `get_sla_status` still reports 360min threshold for BCTC | **ONGOING** |
| IMPROVE-NEW-2 | `vn-sbv-fetch` unhealthy false-positive | `get_vps_service_health`: `vn-sbv-fetch \| healthy` — now correct | **RESOLVED ✅** |

---

## ACTIVE FINDINGS

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Class | **BUG** |
| Cron | `vnstockTradingStatsRefresh` |
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50 (50.0%)`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last crash | 2026-06-15 08:30:01 UTC |
| Delta | Unchanged from 14:09 — 0 new runs, still crashed |
| Caller-surface grep | `grep -r "trading_stats" apps/mcp-server/src` → `assembleBriefing.ts`, `IKinhDichScoreRepository.ts`; package docs: market-watcher, bctc-analyst, unified-agent (3 agents) |
| Blast radius | `vnstock_trading_stats` table not refreshed; `get_sector_comparison`, `get_market_cap`, `get_company_profile` downstream |

**Fix:** Add per-ticker timeout in `syncVnstockData.ts` trading_stats path; job-level `AbortSignal.timeout(600_000)` guard. Check resource contention with `vnstockFundamentalsRefresh` (665s avg, overlapping window).

---

### BUG-2 (ONGOING, WORSENING) — BCTC pipeline dead: 2057 min stale, SLA CRITICAL

| Field | Value |
|---|---|
| Class | **BUG** |
| SLA evidence | `get_sla_status`: `bctc \| 2057 min elapsed \| 360 min SLA \| CRITICAL` |
| VPS evidence | `get_vps_proxy_health`: `bctc \| last push 2026-06-13 23:45:12 \| 0 pushes/24h \| STALE: YES` |
| Enricher errors | `get_system_status`: `bctcQueueEnricher: 0 URLs populated across all 9 item(s) — all sources may be unavailable or geo-blocked` (recurring every 15min) |
| VPS service | `get_vps_service_health`: `vn-bctc-fetch: healthy` — service up but returning 0 URLs (silent-failure) |
| Calendar context | `get_earnings_calendar`: 27 tickers filed Q1-2026 (incl. VCB on 2026-06-13, CTG on 2026-06-13, D2D on 2026-06-13) — data EXISTS but not in DB |
| Worsening | +132 min since 14:09 report; +2057 min total since last push |
| Caller-surface grep | `grep "get_bctc" docs/agents/tools/package/*.md` → bctc-analyst.md, unified-agent.md, digest-predict.md (3 agents) |

**Fix:**
1. SSH VPS → `curl http://localhost:PORT/proxy/bctc-discover/VCB` to distinguish geo-block vs empty-scrape
2. Call `trigger_bctc_vps_fetch` to force a discovery cycle
3. Check if SSC portal returned format change that breaks URL extraction in VPS scraper

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor flow uses wrong contract

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence | Re-probed with system-auditor's documented schema `{type, ts, tier, summary, checks, overall}` → `MCP -32602: from_agent required, to_agent required, signal_type required (enum), payload required` |
| Live schema | `from_agent: string (req), to_agent: string (req), signal_type: 'urgent_news'\|'price_anomaly'\|'cross_validate'\|'suppress'\|'chain_catalyst'\|'fundamental_validation'\|'price_confirmation'\|'verified_chain'\|'signal_feedback'\|'legal_risk'\|'verified_decision' (req), payload: object (req)` |
| Flow mismatch | `system-auditor/flow/main.md` L193 (Tier-2 E-1 emit), L482 (Tier-3 E-1 emit), L509 (Tier-3 Roll-Up) — all 3 sites use wrong schema |
| Impact | All 3 `post_agent_signal` emits from system-auditor fail silently. Infrastructure anomaly signals never reach the coordination bus. Anomalies invisible to other agents. |
| Caller-surface | `grep post_agent_signal docs/agents/system-auditor/flow/main.md` → 3 confirmed broken call sites. News/price agents use correct schema. |

**Fix:** Rewrite all 3 emit blocks in system-auditor flow to use `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}` or add infra signal types to the enum in the tool schema.

---

### BUG-NEW-1 (NEW) — `fetch_and_analyze` all 4 major VN news sources timed out

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence | `get_system_status` recent errors (16:12 UTC): cafef exceeded 10000ms, vnexpress exceeded 10000ms, vneconomy exceeded 12000ms, reuters exceeded 15000ms; "some RAG index calls failed (degraded gracefully)" |
| Pattern | ALL major VN sources failed in the same fetch cycle — not a single-source issue |
| Frequency | Log shows errors at 16:12 UTC (most recent cycle); pattern consistent with ISSUE-3 (Reuters degraded) + general VN source slowness |
| Caller-surface grep | `grep -r "fetch_and_analyze" docs/agents/` → news-scout (stage-fetch.md), market-analyst (main.md); `stage-fetch.md` is the primary consumer per news-scout cycle.md |
| Blast radius | news-scout: news pipeline returns empty in these cycles; VN news intelligence gap during timeout windows |

**Fix:** Add per-source circuit-breaker fallback path in `fetch_and_analyze` — if all primary sources timeout, retry with a 3s simplified payload before returning empty. Check if VN source timeouts coincide with VPS geo-route latency spikes.

---

### BUG-NEW-2 (NEW) — `search_similar_context` ERROR: operation timed out

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence | `get_system_status` recent errors: `[ERROR] 2026-06-15 16:12:45 search_similar_context: [search_similar_context] Error — The operation timed out.` |
| Timing | Coincides with BUG-NEW-1 fetch_and_analyze timeouts (same 16:12 cycle) — RAG service under load |
| Caller-surface grep | `grep -r "search_similar_context" docs/agents/` → news-scout/flow/stage-fetch.md, bctc-analyst/flow/stage-analyze.md, bctc-analyst/flow/deep-dive-opus.md (2 agents, 3 flow sites) |
| Impact | news-scout loses historical context lookup; bctc-analyst loses similar-pattern lookups for ESC gate cross-validation |

**Fix:** Check RAG service health (`rag-service` container) — may be OOM or LanceDB index query slow under concurrent load. Add timeout guard in `search_similar_context` tool that returns empty-but-ok rather than ERROR on timeout.

---

### BUG-NEW-3 (RE-OPENED) — `bctcReparseJob` back below 80% success threshold

| Field | Value |
|---|---|
| Class | **BUG** |
| Evidence | `get_cron_health`: `success_rate=0.80 (79.7%)`, `total_runs=172`, `avg_duration=328,114ms` |
| Prior status | "RESOLVED" in 14:09 report (80.1%, 176 runs) — 7-day sliding window shifted, prior failures now weighted higher |
| Threshold | `cronHealthAlertJob` fires when `success_rate < 80%` per system-map.json |
| Impact | `bctcReparseJob` re-triggers extraction from recent PDFs; failures = new BCTC PDFs not parsed into financial_reports |
| Caller-surface | PDF extractor pipeline consumers: bctc-analyst (6-pass analysis), unified-agent (get_bctc_full) |

**Fix:** Investigate failure pattern in `bctcReparseJob` — likely caused by BUG-2 (no new PDFs from VPS) causing empty parse cycles that time-out or error; may self-resolve once BCTC VPS pipeline is fixed.

---

## Issues (degraded but not broken)

### ISSUE-1 (ONGOING, STABLE) — Server restart rate: 26 in 7 days

| Evidence | `mcpServerStartup total_runs=26` — ~3.7/day; last restart 11:48:28 UTC; no new restarts since 14:09 |
|---|---|
| Impact | Once-daily cron jobs risk missing their fire window on restart days; circuit breaker failure counters reset (obscuring persistent external failures — Reuters/TE reset at 11:48, grew back to 40 by 16:13) |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs Brent $83.16 — $12.44 inverted

| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)` vs live Brent $83.16; spread physically impossible |
|---|---|
| Impact | Stored macro indicator `wti_crude_usd` is wrong; macro analysis tools that read it from DB get materially false input. `get_macro_snapshot` uses live Brent correctly (tier-1); issue is auto-tracker historical table only |

---

### ISSUE-3 (ONGOING, WORSENED) — Reuters RSS + Trading Economics: 40 consecutive failures

| Evidence | `get_system_status`: `Reuters RSS: Ngưng \| 40 errors`; `Trading Economics: Ngưng \| 40 errors × 2` — grew from 22 at 14:09 |
|---|---|
| Delta | +18 failures since 14:09 — every cycle since server restart at 11:48 has failed |
| Impact | Reuters headlines not ingesting; TradingEconomics macro data not refreshing; mitigated by Bloomberg/SBV/Yahoo/IMF covering core indicators |

---

### ISSUE-NEW-1 (NEW) — `get_system_status` intermittent 60s gateway timeout

| Evidence | First probe: `MCP server "gateway" tool "call_tool" timed out after 60s`; second probe (called alone, 2 min later): succeeded in ~8s |
|---|---|
| Pattern | Timeout appears when called alongside other concurrent tool calls (parallel batch); succeeds when called individually |
| Impact | market-watcher Step 0 smoke probe calls `get_system_status` — intermittent 60s timeout causes false smoke-probe failure, leading to `send_telegram(bug, "[market-watcher] Step 0 smoke probe FAILED")` spam on heavy cycles |
| Caller-surface | market-watcher/flow/main.md Step 3: `call_tool(server="vn-market", tool="get_system_status")`. No other cowork agents call it solo. |

**Fix:** In market-watcher smoke probe, prefer `get_cycle_bootstrap.system_status` field (sub_call_timing: 1ms, cached) over standalone `get_system_status`. The bootstrap call is fast and available already.

---

## Improvements (non-blocking)

| ID | Class | Finding | Status |
|---|---|---|---|
| IMPROVE-1 | IMPROVE | `get_cycle_bootstrap` enum has legacy `financial-analyst \| report-analyzer` — 0 active callers use these names | ONGOING |
| IMPROVE-2 | IMPROVE | 5 watchlist tickers with 0 OHLCV rows: BDI, DLC, JSH, SIS, VDC — TA alerts silent for 12% of watchlist | ONGOING |
| IMPROVE-3 | IMPROVE | `macroIndicatorRefreshJob` system-map says `"19:13 UTC"` but fires at `12:13 UTC` (= 19:13 VN UTC+7) | ONGOING |
| IMPROVE-4 | IMPROVE | `get_sla_status` BCTC threshold hardcoded at 6h (360min) vs system-map SLA resolver: 168h out-of-earnings-window (month=6). Reports false CRITICAL daily. | ONGOING |

---

## Resolved This Cycle

| Prior ID | Finding | Proof |
|---|---|---|
| IMPROVE-NEW-2 (14:09) | `vn-sbv-fetch` showing "unhealthy" while SBV data flowed normally | `get_vps_service_health` now: `vn-sbv-fetch \| healthy` — state machine self-corrected ✅ |

---

## Full Tool Probe Summary

| Tool | Status | Latency | Notes |
|---|---|---|---|
| `get_system_status` | ⚠️ INTERMITTENT | 60s timeout (1st probe), ~8s (2nd) | Times out under concurrent load — ISSUE-NEW-1 |
| `get_cycle_bootstrap` | ✅ OK | 173ms | Requires valid enum `agent_name` |
| `get_market_snapshot` | ✅ OK | ~50ms | VN-Index 1799.31 +0.43% |
| `get_macro_snapshot` | ✅ OK | ~200ms | Carry NEUTRAL, yield CHEAP, all tier-2 live |
| `get_watchlist` | ✅ OK | ~100ms | 41 tickers |
| `get_alerts` | ✅ OK | ~100ms | 557 pending; 10 today HIGH/MEDIUM/WARNING |
| `get_cron_health` | ✅ OK (2 issues) | ~300ms | `vnstockTradingStatsRefresh` crashed; `bctcReparseJob` 79.7% |
| `get_pipeline_health` | ✅ OK (5 dark) | ~200ms | 36/41 TA ready; BDI/DLC/JSH/SIS/VDC=0 rows |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | ~200ms | prices/news/sbv OK; bctc last push 2026-06-13 |
| `get_vps_service_health` | ✅ OK | ~100ms | 3 healthy, 2 idle (market closed) |
| `get_sla_status` | ✅ OK (1 CRITICAL) | ~200ms | BCTC breached 2057/360min; rest OK |
| `get_rate_limit_status` | ✅ OK | ~150ms | 12 sources ready, 0 throttled |
| `get_earnings_calendar` | ✅ OK | ~150ms | 27 ĐÃ NỘP, 14 QUÁ HẠN |
| `get_week_period` | ✅ OK | ~50ms | W25, 2026-06-15/2026-06-21 |
| `get_agent_signals` | ✅ OK | ~80ms | Returns empty for news-scout (no new signals) |
| `task_list_held` | ✅ OK | ~80ms | 1 expired lock: `bctc-slot-1:2026-06-15` (expired 16:06 UTC) |
| `task_claim` | ✅ OK | ~80ms | Claimed health-recheck:2026-06-15 successfully |
| `task_release` | ✅ OK | ~50ms | Released cleanly |
| `log_agent_work` | ✅ OK | ~80ms | Call-1 returns `{id}`, Call-2 returns `{ok:true}` |
| `post_agent_signal` | ❌ SCHEMA DRIFT | — | `from_agent/to_agent/signal_type/payload` required; system-auditor flow uses wrong contract (BUG-3) |
| `get_bctc_refined` | ⚠️ SCHEMA NOTE | — | Requires `report_id: string`; NOT `ticker/period_year/period_quarter` |
| `fetch_and_analyze` | ❌ TIMEOUTS | — | All 4 VN sources timed out at 16:12 UTC cycle (BUG-NEW-1) |
| `search_similar_context` | ❌ TIMEOUT | — | ERROR: operation timed out at 16:12 UTC (BUG-NEW-2) |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | 6 | `vnstockTradingStatsRefresh` crash; BCTC pipeline dead; `post_agent_signal` schema drift; `fetch_and_analyze` all-sources timeout; `search_similar_context` timeout; `bctcReparseJob` re-opened |
| **ISSUE** | 4 | Server restart rate 26/7d; WTI crude inverted; Reuters/TE 40 failures; `get_system_status` intermittent timeout |
| **IMPROVE** | 4 | `get_cycle_bootstrap` legacy enum; 5 dark tickers; macroIndicatorRefreshJob docs; `get_sla_status` threshold mismatch |
| **RESOLVED** | 1 | `vn-sbv-fetch` unhealthy false-positive |

---

## Caller-Surface Verification (STEP 3b)

```
# BUG-3 post_agent_signal — re-confirmed broken call sites:
grep "post_agent_signal" docs/agents/system-auditor/flow/main.md
→ L16, L39, L193, L482, L509, L540 — 3 active emit sites (L193/L482/L509) confirmed wrong schema
grep "post_agent_signal" docs/agents/news-scout/flow/ docs/agents/market-watcher/flow/ docs/agents/unified-agent/flow/
→ uses correct schema (from_agent, to_agent, signal_type enum values)
Affected: 1 agent broken (system-auditor), 0 other agents impacted

# BUG-NEW-1 fetch_and_analyze:
grep -r "fetch_and_analyze" docs/agents/ → news-scout/flow/stage-fetch.md, market-analyst/flow/main.md
Affected callers: 2 agents (news-scout primary)

# BUG-NEW-2 search_similar_context:
grep -r "search_similar_context" docs/agents/ → news-scout/flow/stage-fetch.md, bctc-analyst/flow/stage-analyze.md, bctc-analyst/flow/deep-dive-opus.md
Affected callers: 2 agents (news-scout, bctc-analyst)

# BUG-2 BCTC pipeline:
grep "get_bctc" docs/agents/tools/package/*.md → bctc-analyst.md, unified-agent.md, digest-predict.md
Affected callers: 3 agents
```
