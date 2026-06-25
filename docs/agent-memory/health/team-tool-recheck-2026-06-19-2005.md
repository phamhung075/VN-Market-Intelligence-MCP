# Team MCP Tool Health Recheck — 2026-06-19T20:05Z

**Probe window:** 2026-06-19T19:58Z – 2026-06-19T20:05Z
**Gateway:** `vn-market` via `mcp__gateway__call_tool` — **REACHABLE** ✅
**Probed tools:** ~25 read-only calls across all cowork/dev agent dependencies
**Prior report:** `team-tool-recheck-2026-06-19-1808.md`
**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-19-2005.md`

---

## RESOLVED (was ACTIVE in prior cycle — fresh probe confirms fixed)

| # | Was | Evidence of Resolution |
|---|-----|------------------------|
| BUG-1 | `get_agent_signals` all-producers mode broken | **RESOLVED** — Fresh probe: `call_tool("get_agent_signals", {from_agent: null, status: "all", hours_back: 0.25})` returned 44 signals correctly. Prior report may have probed without `from_agent` key entirely (inbox mode → requires `agent`). Runtime contract verified: passing explicit `null` triggers all-producers mode as documented. Grep: `docs/agents/tools/list/get_agent_signals.md:15` doc matches live behaviour. **0 affected callers** — market-watcher L54 and news-scout stage-bootstrap L57 both pass `from_agent: null` per doc contract. |
| ISSUE-4 | weatherCheckJob overlap | **NOT REPRODUCED** — `get_cron_health` shows weatherCheckJob last_run 2026-06-19 17:00:01, 100% success in last 7d. No overlap entries in current `get_system_status` recent errors. Dropping from active list. |
| ISSUE-5 | RAG insert timeout (`pollNews ragInsert`) | **NOT REPRODUCED** — No evidence in current system status errors or recent logs. Not carried forward. |

---

## ACTIVE FINDINGS (re-confirmed this cycle — fresh probe each)

### BUGs

| # | Tool / Component | Class | Evidence (this cycle) | Caller Count | Suggested Fix |
|---|-----------------|-------|----------------------|-------------|---------------|
| BUG-2 | `get_ism_subcomponents` | BUG | Re-probe 20:03Z: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — unchanged from 1808 report. | 3 callers: news-scout, bctc-analyst, unified-agent (grep: `docs/agents/tools/package/`). | Set `FRED_API_KEY` env var in mcp-server container and trigger `macroIndicatorRefreshJob` once to seed. Without it, agents that depend on ISM regime signals get no_data silently. |
| BUG-3 | BCTC VPS pipeline (`vn-bctc-fetch`) | BUG | Re-probe 20:03Z: `get_vps_service_health` → `vn-bctc-fetch: unhealthy`. `get_vps_proxy_health` → bctc STALE, last push `2026-06-16 18:02:24`, 0 items in 24h. `get_sla_status` → **bctc SLA breached CRITICAL** at 4281 min / 694 min threshold (was 4163 min at 1808 — worsening at ~1 min/min). 3 days without any BCTC data ingestion. | 2 affected agent flows: bctc-analyst cycle blocked on Q1-2026 ingestion; refine_bctc_md pending queue stale. 10 watchlist tickers show `QUÁ HẠN` in earnings calendar. | SSH to VPS → restart `vn-bctc-fetch` service → check crash logs. Service uptime shows last restart was ~2026-06-16 (3d 1h 57m per health probe). |
| BUG-4 | SBV fetch (zero-value responses) | BUG | Re-probe: `get_system_status` recent errors show 4 fresh occurrences: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 18:30, 19:00, 19:30, 20:00 UTC. `get_vps_service_health` → `vn-sbv-fetch: unhealthy, uptime 44m` (recently restarted, still unhealthy). VPS proxy push log shows sbv pushes succeeding (1 item per push) but content is all-zeros. | `sbvRatesRefreshJob` (macro/sbvRatesJob.ts) + `intelligenceCycleJob.ts:649`. SBV data consumers (`get_macro_snapshot` carry-trade/yield signals) using stale fallback. | Check vn-sbv-fetch VPS service logs — likely SBV portal changed response format or requires header. The rejection guard in `storeSbvSnapshot` is correctly protecting good data, but the upstream fetch is broken. |

### ISSUEs

| # | Tool / Component | Class | Evidence (this cycle) | Caller Count | Suggested Fix |
|---|-----------------|-------|----------------------|-------------|---------------|
| ISSUE-1 | Reuters RSS source | ISSUE | Re-probe: `get_system_status` source health → `Reuters RSS | Ngưng | Chưa bao giờ | 11 ⚠`. Never succeeded. Counter reset to 11 after server restart at 19:04 (was 150 last cycle). Still hard-failed. | `news-scout` via `fetch_and_analyze` / `pollNewsJob`. Reduces international news diversity. | Re-probe Reuters RSS endpoint — URL may have changed or now requires auth. Disable the source if dead >7d to stop log noise. |
| ISSUE-2 | Trading Economics source | ISSUE | Re-probe: `get_system_status` → two Trading Economics entries both `Ngưng`, both `Chưa bao giờ`, both 11 consecutive failures post-restart. | macro data consumers. | Anti-bot detection likely. May need API key or alternative scraper strategy. |
| ISSUE-3 | `intelligence-cycle` overlap | ISSUE | Re-probe: `get_system_status` recent errors show 2 occurrences: `[intelligence-cycle] previous cycle still running — skipped` at 18:45 and 19:15 UTC. `intelligenceCycleJob` avg_duration is 33s but bctcReparseJob (avg 180s), agmPlanRefreshJob (avg 60s) running concurrently may cause I/O contention. | All agents depending on intelligence-cycle data (market-watcher, news-scout, unified-agent). | Add a per-job TTL mutex. Or increase skip window tolerance. Current 15-min schedule with occasional 30-60s runs is borderline — investigate which sub-step causes the elongated runs. |
| ISSUE-6 | `vnstockTradingStatsRefresh` slow | ISSUE | Re-probe: `get_cron_health` → `vnstockTradingStatsRefresh` success_rate 85.7% (6/7 runs), avg_duration 649220ms (10.8 min), last_run 2026-06-19 08:30:01. Unchanged from prior report. | market-watcher (trading stats). | Profile — likely N+1 ticker HTTP calls. Batch or parallelize ticker fetch loop. |

### NEW findings (not in prior report)

| # | Tool / Component | Class | Evidence (this cycle) | Caller Count | Suggested Fix |
|---|-----------------|-------|----------------------|-------------|---------------|
| NEW-1 | kinhdich service 503 off-hours | ISSUE | `get_system_status` recent errors: 3× `[kinhdich] service unreachable — [Kinh Dich Service] 503: {"error":"insufficient price data for market reading — requires at least 7"}` at 18:54 UTC (market closed). intelligenceCycleJob calls kinhdich 3× concurrently off-hours. Service is up and responding but rejects off-hours requests with 503. | `intelligenceCycleJob` off-hours branch. Generates spurious WARN log spam each cycle. | Kinhdich service should return a soft `{"status":"market_closed","hexagram":null}` 200 response off-hours instead of 503. Or intelligence cycle should gate kinhdich call behind market-hours check before calling. |
| NEW-2 | `windowPartitioner` truncation | WARN | `get_system_status` errors: `[windowPartitioner] continuation window truncated at maxWindowPages` at 01:05 UTC. May silently drop trailing content from large news/document windows during intelligence cycle. | intelligence cycle document processing. | Investigate maxWindowPages setting — either increase the cap or split processing across cycles. 1 occurrence is low severity but worth monitoring. |

---

## RESOLVED TOOLS — Spot-checked healthy this cycle

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ | Valid `agent_name` required; returns agent_signals + market_context + system_status correctly. |
| `get_system_status` | ✅ | Full health, circuit breakers all OK, DB 284MB, WAL 3.9MB. |
| `get_market_snapshot` | ✅ | VN-Index 1824.53, breadth, KinhDich returned correctly. |
| `get_macro_snapshot` | ✅ | Oil, gold, USDVND, carry/yield signals computed correctly. |
| `get_earnings_calendar` | ✅ | Returns 41-ticker calendar (QUÁ HẠN tickers reflect BUG-3). |
| `get_cron_health` | ✅ | All 70 crons returned; most at 100% success. |
| `get_pipeline_health` | ✅ | 38/41 tickers TA-ready; BDI/DAG/DLC/JSH/SIS/VDC/VNH not ready (expected — low volume). |
| `get_vps_proxy_health` | ✅ (tool) | prices/news/sbv routes OK; bctc STALE is BUG-3. |
| `get_vps_service_health` | ✅ (tool) | Tool works; content issues are BUG-3, BUG-4. |
| `get_rate_limit_status` | ✅ | 11 sources, 0 rate-limited, 0 in backoff. |
| `get_sla_status` | ✅ (tool) | Tool works; BCTC breach is BUG-3. |
| `get_vn_macro_indicators` | ✅ | IIP data returned (PROBE-3 PASS), source NSO monthly Excel. |
| `get_agent_signals` (inbox) | ✅ | `agent="market-watcher"` works. |
| `get_agent_signals` (all-producers) | ✅ | `from_agent=null` returns 44 signals — BUG-1 confirmed RESOLVED. |
| `get_recent_signals` | ✅ | Returns structured 44-signal JSON. |
| `emit_pressure_state` | ✅ | Returns `success:true`; `stale_warning:true` expected (off-market hours, cowork not running). |
| `task_claim` / `task_release` | ✅ | Claim/release round-trip confirmed working. |

---

## Priority Matrix

| Priority | Finding | Age | Blast Radius |
|----------|---------|-----|-------------|
| P0 — Fix now | BUG-3: BCTC VPS `vn-bctc-fetch` unhealthy | 3 days | bctc-analyst fully blocked Q1-2026; 10 tickers QUÁ HẠN; worsening |
| P0 — Fix now | BUG-4: SBV zero-value rejections every 30 min | Ongoing | Macro/SBV carry-trade signals using stale fallback data |
| P1 — Fix this sprint | BUG-2: `get_ism_subcomponents` no FRED_API_KEY | Unknown | 3 agents (news-scout, bctc-analyst, unified-agent) macro-blind on ISM |
| P2 — Investigate | ISSUE-1: Reuters RSS hard-failed (11 errors, reset) | ≥7 days | Reduced international news coverage |
| P2 — Investigate | ISSUE-2: Trading Economics hard-failed | ≥7 days | Macro data gap |
| P2 — Fix | NEW-1: kinhdich 503 off-hours (3× per cycle) | New | Log noise + missed hexagram blocks in intelligence cycle |
| P3 — Monitor | ISSUE-3: intelligence-cycle skip (2× last 2h) | Recurring | Missed orchestration runs |
| P3 — Monitor | ISSUE-6: vnstockTradingStatsRefresh slow (85.7% success) | Ongoing | Near SLA threshold |
| P3 — Monitor | NEW-2: windowPartitioner truncation | New (1×) | May silently drop document trailing content |

---

## Delta vs Prior Report (2026-06-19T18:08Z)

| Finding | Delta |
|---------|-------|
| BUG-1 (`get_agent_signals`) | ✅ **RESOLVED** — `from_agent=null` probe confirmed working |
| BUG-2 (ISM no_data) | ⚠ **UNCHANGED** — still no FRED_API_KEY |
| BUG-3 (BCTC VPS) | ❌ **WORSENING** — SLA breach 4163→4281 min (118 min worse) |
| BUG-4 (SBV zero-value) | ❌ **UNCHANGED** — 4 new rejections since 1808 report |
| ISSUE-1 (Reuters RSS) | ⚠ **UNCHANGED** — counter reset after restart, still never-succeeded |
| ISSUE-2 (Trading Economics) | ⚠ **UNCHANGED** — same |
| ISSUE-3 (intel-cycle overlap) | ⚠ **UNCHANGED** — 2 new skips at 18:45, 19:15 UTC |
| ISSUE-4 (weatherCheckJob) | ✅ **NOT REPRODUCED** — dropped |
| ISSUE-5 (RAG timeout) | ✅ **NOT REPRODUCED** — dropped |
| ISSUE-6 (vnstock slow) | ⚠ **UNCHANGED** — same numbers |
| NEW-1 (kinhdich 503) | 🆕 **NEW** |
| NEW-2 (windowPartitioner) | 🆕 **NEW** |

---

*Generated by: health-recheck scheduled routine*
*Probed via: `mcp__gateway__call_tool(server="vn-market", ...)`*
*UTC: 2026-06-19T20:05:56Z*
