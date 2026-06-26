# Team MCP Tool Health Recheck — 2026-06-19T18:08Z

**Probe window:** 2026-06-19T17:30Z – 2026-06-19T18:08Z
**Gateway:** `vn-market` via `mcp__gateway__call_tool` — **REACHABLE** ✅
**Probed tools:** ~30 read-only calls across all cowork agent dependencies
**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-19-1808.md`

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### BUGs

| # | Tool | Class | Evidence | Caller Count | Suggested Fix |
|---|------|-------|----------|-------------|---------------|
| BUG-1 | `get_agent_signals` | BUG | `from_agent=null` (all-producers mode) returns Error: "agent is required when using inbox mode (from_agent not provided)". Doc `get_agent_signals.md:15` says this mode is valid — runtime rejects it. | 2 callers: `market-watcher/flow/main.md:54` (GW corroboration probe), `news-scout/flow/stage-bootstrap.md:57` (SIBLING_WINDOW_CACHE) | Dev fix: implement all-producers mode in runtime OR update callers to use `from_agent="news-scout"` + `from_agent="market-watcher"` multi-call workaround. Doc must match runtime. |
| BUG-2 | `get_ism_subcomponents` | BUG | Returns `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — FRED_API_KEY env var missing, job never ran. | 3 callers: news-scout, bctc-analyst, unified-agent (per tool packages) | Configure FRED_API_KEY in env; run `macroIndicatorRefreshJob` manually once to seed data. |
| BUG-3 | BCTC VPS service (`vn-bctc-fetch`) | BUG | `get_vps_service_health`: `vn-bctc-fetch: unhealthy`. VPS uptime 2d 23h 57m (restarted ~2026-06-16). `get_vps_proxy_health`: bctc STALE — last push 2026-06-16 18:02:24, 0 items in 24h. `get_sla_status`: BCTC SLA breached CRITICAL (4163 min vs 575 min threshold). | 1 direct (bctc-analyst), 10 watchlist tickers show QUÁ HẠN in earnings calendar — Q1-2026 BCTC reports unprocessed. | SSH to VPS, restart `vn-bctc-fetch` service, verify health endpoint, check logs for crash reason. |
| BUG-4 | SBV fetch (zero-value responses) | BUG | 10 recent errors: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`. `sbvRatesRefreshJob` shows 100% success in cron health (success = no crash, not no-data). SBV proxy is pushing but content is all zeros. | sbv data consumers (macro snapshot, SBV rates display) degraded silently. | Debug SBV source scraper on VPS — likely VN gov site changed response format or requires auth header. |

### ISSUEs

| # | Tool/Component | Class | Evidence | Caller Count | Suggested Fix |
|---|---------------|-------|----------|-------------|---------------|
| ISSUE-1 | Reuters RSS source | ISSUE | `get_system_status` source health: Reuters RSS 150 consecutive errors, never successful. | news-scout `fetch_and_analyze` depends on Reuters | Re-probe Reuters RSS endpoint — likely URL change or auth requirement. Disable if dead >1 week. |
| ISSUE-2 | Trading Economics source | ISSUE | `get_system_status`: 2 Trading Economics entries both at 150 consecutive failures. | macro data consumers | Investigate TE scraper — anti-bot detection likely. May need paid API key or alternative source. |
| ISSUE-3 | `intelligence-cycle` overlap | ISSUE | Recent errors: `[intelligence-cycle] previous cycle still running — skipped`. Cron firing interval shorter than runtime. | All agents depending on intelligence-cycle orchestration | Increase cron interval or add mutex/TTL guard to skip trigger if previous cycle >90% of interval. |
| ISSUE-4 | `weatherCheckJob` overlap | ISSUE | `[weatherCheckJob] previous run still in progress — skipping`. | climate-risk signal consumers | Same fix as ISSUE-3: increase interval or guard with per-job mutex. |
| ISSUE-5 | RAG insert timeout | ISSUE | `[pollNews] ragInsert failed (non-fatal) — The operation timed out`. Non-fatal but degrades semantic search quality over time. | `search_similar_context` callers (news-scout, bctc-analyst) | Investigate LanceDB insert timeout — may need batch-size reduction or async queue. |
| ISSUE-6 | `vnstockTradingStatsRefresh` slow | ISSUE | `get_cron_health`: 85.7% success, avg 649s runtime (10.8 min). Above 575 min SLA warning. | market-watcher (trading stats consumers) | Profile and optimize — likely N+1 ticker fetch loop; batch or parallelize. |

---

## RESOLVED / HEALTHY (spot-checked this cycle, no issues found)

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ Healthy | Valid agent_name enum required (not freeform). Returns full bootstrap correctly. |
| `get_system_status` | ✅ Healthy | Returns full system health, source errors, recent logs. |
| `get_market_snapshot` | ✅ Healthy | VN-Index, sector leaders, trading halts — correct. |
| `get_market_context` | ✅ Healthy | Trading window, market hours — correct. |
| `get_macro_snapshot` | ✅ Healthy | Returns macro regime data. |
| `get_watchlist` | ✅ Healthy | Returns 10-ticker watchlist. |
| `get_earnings_calendar` | ✅ Healthy | Returns calendar with QUÁ HẠN flags (reflects BUG-3 pipeline state). |
| `get_cron_health` | ✅ Healthy | Full cron job status returned (ISSUE-6 surfaced here). |
| `get_pipeline_health` | ✅ Healthy | Pipeline status returned. |
| `get_vps_proxy_health` | ✅ Healthy (tool) | Tool works; bctc STALE content is BUG-3. |
| `get_vps_service_health` | ✅ Healthy (tool) | Tool works; vn-bctc-fetch service unhealthy is BUG-3. |
| `get_rate_limit_status` | ✅ Healthy | No rate limits hit. |
| `get_sla_status` | ✅ Healthy (tool) | Tool works; BCTC SLA breach is BUG-3. |
| `get_technical_indicators` | ✅ Healthy | Returns RSI, MACD, Bollinger Bands correctly (tested VCB). |
| `get_sector_rotation` | ✅ Healthy | Returns 16-sector performance data. |
| `get_bctc_full` | ✅ Healthy (tool) | Tool returns Q4-2025 cached data; new Q1-2026 blocked by BUG-3. |
| `get_market_breadth` | ✅ Healthy | Returns breadth metrics. |
| `get_recent_fixes` | ✅ Healthy | Returns recent system fix log. |
| `task_list_held` | ✅ Healthy | No stale task locks held. |
| `get_week_period` | ✅ Healthy | Week/period boundary calculation correct. |

---

## Priority Matrix

| Priority | Finding | Age | Blast Radius |
|----------|---------|-----|-------------|
| P0 — Fix now | BUG-3: BCTC VPS vn-bctc-fetch unhealthy | 3+ days | 10 tickers, bctc-analyst fully blocked on Q1-2026 |
| P0 — Fix now | BUG-4: SBV zero-value responses | Ongoing | Macro/SBV data silently degraded for all consumers |
| P1 — Fix this sprint | BUG-1: get_agent_signals all-producers mode broken | Unknown | 2 agent flows — sibling-corroboration branch unreachable |
| P1 — Fix this sprint | BUG-2: get_ism_subcomponents no_data (FRED_API_KEY missing) | Unknown | 3 agents — macro analysis regime blind |
| P2 — Investigate | ISSUE-1: Reuters RSS 150 failures | Unknown | news diversity reduced |
| P2 — Investigate | ISSUE-2: Trading Economics 150 failures | Unknown | macro data gap |
| P3 — Monitor | ISSUE-3, ISSUE-4: Cycle/weather overlap | Recurring | Missed orchestration cycles |
| P3 — Monitor | ISSUE-5: RAG insert timeout | Non-fatal | search_similar_context quality degrades over time |
| P3 — Monitor | ISSUE-6: vnstockTradingStatsRefresh slow | Ongoing | Near SLA threshold |

---

## Previous Cycle Comparison

Previous report: `team-tool-recheck-2026-06-19-1607.md`
- BUG-3 (BCTC VPS): **still active** — no remediation in last 2h
- BUG-4 (SBV zero-value): **still active** — still generating errors
- BUG-1 (get_agent_signals): **still active** — no code fix deployed
- BUG-2 (ISM no_data): **still active** — FRED_API_KEY still missing
- ISSUEs 1-6: **all still active**

---

*Generated by: health-recheck scheduled routine*
*Probed via: `mcp__gateway__call_tool(server="vn-market", ...)`*
*Next run: ~2026-06-19T2007Z*
