# Team MCP Tool Health Recheck — 2026-06-15 08:08 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-15 08:03–08:08 UTC (VN market OPEN)
**Method:** Read-only smoke calls + caller-surface grep. No writes to live data.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `get_cycle_bootstrap(agent_name="news-scout")` responded in <1s |
| vn-market server | **UP** — uptime 1m16s at probe time (server restarted ~08:02:47 UTC) |
| MCP error class | Input-validation errors returned correctly (not transport dead) |

---

## Active Findings (re-confirmed this cycle)

### BUG-1 — `get_foreign_flow` wrong caller pattern + doc/schema triple-drift

| Field | Value |
|---|---|
| Class | **BUG** |
| Tool | `get_foreign_flow` |
| Affected callers | `docs/agents/fb-market-poster/flow/main.md:78`, `docs/agents/tools/package/fb-market-poster.md:48,55` |
| Caller count | 2 files, 3 call-sites |
| Evidence | Live probe: `call_tool(server="vn-market", tool="get_foreign_flow", arguments={})` → `MCP error -32602: path=["code"] Required` |

**Triple drift detected:**
1. Live tool schema requires param `code: string` (required)
2. Tool canonical doc (`docs/agents/tools/list/get_foreign_flow.md:8`) documents param as `ticker: string` (wrong name)
3. `fb-market-poster` package doc (`tools/package/fb-market-poster.md:48`) documents it as "(none required)" — wrong

**Runtime impact:** fb-market-poster calls `get_foreign_flow({})` at Step 1b every cycle. The call fails with schema error. The flow has "skip individual call if it errors (log + continue)" so the agent degrades silently — no foreign flow enrichment in the FB post. The correct tool for market-wide flow is `get_market_foreign_flow({})` (confirmed working, no required params).

**Suggested fix:**
- `fb-market-poster/flow/main.md:78`: replace `get_foreign_flow({})` with `get_market_foreign_flow({})`
- `tools/package/fb-market-poster.md:48,55`: update to `get_market_foreign_flow`, "(none required)"
- `tools/list/get_foreign_flow.md:8`: fix param name from `ticker` → `code` to match live schema

---

### BUG-2 — `get_ticker_intelligence` called without required `code` param by fb-market-poster

| Field | Value |
|---|---|
| Class | **BUG** |
| Tool | `get_ticker_intelligence` |
| Affected callers | `docs/agents/fb-market-poster/flow/main.md:81`, `docs/agents/tools/package/fb-market-poster.md:49,56` |
| Caller count | 2 files, 3 call-sites |
| Evidence | Live probe: `call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={})` → `MCP error -32602: path=["code"] Required` |

**Drift:** `tools/package/fb-market-poster.md:49` documents `get_ticker_intelligence` as "(none required)" — wrong. `tools/package/market-watcher.md:39` correctly lists `code: string` as required.

**Runtime impact:** fb-market-poster calls `get_ticker_intelligence({})` at Step 1b every cycle → fails, skipped silently → no top-mover enrichment in the FB post.

**Suggested fix:**
- The fb-market-poster intent is "top movers / gainers / losers" — this is a market-wide view, not per-ticker. There is no dedicated market-wide movers tool equivalent. Options: (a) call `get_market_snapshot({})` which returns watchlist prices with % changes (already in Step 1b), (b) call `get_ticker_intelligence` per-ticker for top watchlist movers (requires code). Remove the no-arg call and rely on `get_market_snapshot` breadth data already fetched.
- Update `tools/package/fb-market-poster.md:49,56` to remove `get_ticker_intelligence` from the market-wide batch or document correct per-ticker usage.

---

### ISSUE-3 — BCTC VPS push stale: SLA CRITICAL (1567/120 min)

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Source | `bctc-push` VPS route |
| Last push | 2026-06-13 23:45:12 (>36h ago at probe time) |
| SLA status | `bctc | 1567 min elapsed | 120 min threshold | CRITICAL` (from `get_sla_status`) |
| VPS service | `vn-bctc-fetch: healthy` (from `get_vps_service_health`) — service is up |
| Evidence | `get_vps_proxy_health` → `bctc | last push 2026-06-13 23:45:12 | Stale? YES` |

**Impact:** BCTC financial report data is not refreshing from VPS. `get_bctc_full`, `get_bctc_series`, `get_financial_summary`, `get_bctc_pending_refine` all depend on the VPS push pipeline. The bctc-analyst and refine_bctc_md agents will work against stale data.

**Suggested fix:** VPS service is healthy but not pushing. Check `vn-bctc-fetch` service logs on VPS for stuck queue or stale URL list. Trigger `trigger_bctc_vps_fetch` to force a cycle.

---

### ISSUE-4 — Foreign flow data: all-zero values during market hours

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Tool | `get_market_foreign_flow` |
| Evidence | `get_market_foreign_flow({})` during market OPEN returned `Foreign Buy: 0, Sell: 0, Net: +0` for all 102 tickers including top-5 list |
| Corroborating | `get_system_status` recent errors show `[foreign-flow-job] fallback activated` + `[foreign-flow-job] all fallbacks exhausted` repeating every minute during market hours |
| VPS push log | VPS IS pushing 102 items every ~40s via `/proxy/foreign-flow` — data arrives at server |

**Diagnosis:** The VPS push is delivering 102 items per cycle (non-zero push counts confirmed). Yet the aggregated market view returns all zeros. The direct fetcher (bgapidatafeed.vps.com.vn) is failing, but VPS data is incoming. Possible causes: (a) the pushed items are all zero-value rows from the VPS source itself, (b) the aggregation query reads from a different table than the VPS push writes to, (c) a schema mismatch between push format and read format.

**Impact:** All market-wide FII analysis by market-watcher, unified-agent, fb-market-poster will show no foreign flow signal. Alert-commander cannot fire FII-driven alerts.

**Suggested fix:** Add a DB sanity check: compare VPS push row count vs non-zero net_value count. If push rows are all zero, the issue is upstream on the VPS. If push rows have data but reads return zero, it's an aggregation bug.

---

### ISSUE-5 — High server restart rate: 22 restarts in 7 days

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_cron_health` → `mcpServerStartup: total_runs=22` over 7 days (~3.1/day) |
| Corroborating | `restartCadenceAlertJob: total_runs=86` in 7 days; server uptime was only 1m16s at probe time (08:02:47 UTC restart confirmed via `mcpServerStartup: last_run=2026-06-15 08:02:47`) |

**Impact:** Each restart resets in-flight cron state. Crons that run once daily or weekly may be disrupted if the restart happens during their window. This explains `marketEarningYieldJob` missing cadence (ISSUE-6 below). High restart rate also causes the "uptime: 1m16s" seen in `get_system_status` — data freshness checks by the system-auditor will see stale states.

**Suggested fix:** Check Docker restart policy and OOM conditions. Review container logs for recurring crash triggers. Assess whether WAL checkpoint job (running every 30 min, 261 runs) is stable.

---

### ISSUE-6 — `marketEarningYieldJob` missed weekday cadence

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Cron | `marketEarningYield` — schedule `30 9 * * 1-5` (09:30 UTC Mon–Fri) |
| Last run | 2026-06-10 09:30 (Wednesday — 5 calendar days ago) |
| Total runs | 2 in last 7 days (expected ~5 for Mon–Fri) |
| Missed runs | Thu 2026-06-11 and Fri 2026-06-12 both skipped (confirmed by last_run date + total_runs=2) |
| Evidence | `get_cron_health` → `marketEarningYieldJob: last_run=2026-06-10 09:30 | total_runs=2 | success_rate=1.00` |

**Impact:** Market EY signal (earnings yield vs SBV deposit rate spread) is stale. This feeds the `get_macro_snapshot` yield signal used by all cowork agents for CHEAP/EXPENSIVE equity classification.

**Suggested fix:** Check if server restarts are disrupting this specific job window. With 22 restarts in 7 days, a restart near 09:30 UTC on Jun 11 or Jun 12 would skip that day's fire.

---

## Improvement Opportunities

### IMPROVE-7 — WTI crude price inverted vs Brent (stale value)

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_system_status` auto-tracked indicators: `wti_crude_usd = 95.5 (79 pts)` vs `brent_crude_usd = 83.34 (23 pts)` |
| Issue | WTI ($95.5) > Brent ($83.34) by $12.16 — this spread is inverted vs normal (WTI typically $2–5 below Brent). Strongly suggests `wti_crude_usd` is stale. 79 data points vs 23 suggests different fetch cadences. |

**Impact:** Any macro analysis using `wti_crude_usd` from the auto-tracker will use a materially wrong price. Agents reading `get_macro_snapshot` receive `brent_crude_usd=83.34` (correct), but if they access the indicator tracker separately, they get stale WTI.

**Suggested fix:** Verify the WTI fetcher source and last fetch time. If WTI is not fetched from the same source as Brent, align them.

---

### IMPROVE-8 — 5 watchlist tickers with 0 OHLCV rows (no TA capability)

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Tickers | BDI, DLC, JSH, SIS, VDC |
| Evidence | `get_pipeline_health` → `BDI: rows=0 TA not ready`, `DLC: rows=0 TA not ready`, `JSH: rows=0 TA not ready`, `SIS: rows=0 TA not ready`, `VDC: rows=0 TA not ready` |

**Impact:** market-watcher cannot compute RSI/MACD/BB for these tickers. TA alerts disabled for them. 5/41 watchlist tickers (12%) are dark.

**Suggested fix:** Verify exchange membership (BDI=HNX, DLC=UPCOM, JSH=HNX, SIS=HOSE, VDC=UPCOM). These may require non-HOSE price sources. Check if the VPS price scraper covers HNX/UPCOM tickers.

---

### IMPROVE-9 — Trading Economics + Reuters RSS disabled

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `get_system_status` source health: `Reuters RSS: disabled`, `Trading Economics: disabled` (one of two TE instances disabled) |

**Impact:** Reduced macro and international news coverage. Trading Economics provides CPI/GDP/industrial production data. Without it, `get_macro_snapshot` macro columns may fall back to stale/estimated values.

---

### IMPROVE-10 — `macroIndicatorRefreshJob` schedule docs say "19:13 UTC" but fires at 12:13 UTC

| Field | Value |
|---|---|
| Class | **IMPROVE** |
| Evidence | `system-map.json` says `"desc": "Macro indicator daily refresh (yahoo→sbv→gso)"` and `cron-registry.json` maps it to `19:13 UTC daily`. But `get_cron_health` shows `last_run: 2026-06-14 12:13:00`. |
| Diagnosis | 12:13 UTC = 19:13 VN (UTC+7). The actual schedule runs at 12:13 UTC, not 19:13 UTC. The docs conflate VN time with UTC. |

**Suggested fix:** Update `system-map.json` description from "19:13 UTC" to "12:13 UTC (19:13 VN)" to avoid ops confusion.

---

## Resolved Since Last Report

No prior report found in `docs/agent-memory/health/`. First run baseline established.

---

## Tool Probe Summary

| Tool | Reachable | Notes |
|---|---|---|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ | Returns signals + market context |
| `get_market_snapshot` | ✅ | VN-Index 1799.31 +0.43% |
| `get_macro_snapshot` | ✅ | Carry NEUTRAL, yield CHEAP (tier-4 estimate) |
| `get_system_status` | ✅ | Shows 10 unresolved errors (foreign-flow fallback) |
| `get_earnings_calendar` | ✅ | 41 tickers, 10 overdue Q1-2026 |
| `get_pipeline_health` | ✅ | 5 tickers with 0 rows |
| `get_vps_proxy_health` | ✅ | BCTC stale; price/news/sbv/ff ok |
| `get_vps_service_health` | ✅ | All 5 services healthy |
| `get_cron_health` | ✅ | marketEarningYieldJob missed cadence |
| `get_sla_status` | ✅ | BCTC CRITICAL (1567/120 min) |
| `get_market_foreign_flow` | ✅ (data quality issue) | Returns all zeros during market hours |
| `get_foreign_flow({})` | ❌ schema error | Required `code` param missing |
| `get_ticker_intelligence({})` | ❌ schema error | Required `code` param missing |
| `task_claim(task_kind="cowork-slot")` | ✅ (schema verified) | Valid kinds: cowork-slot, sprint-task, dashboard-row, commit-mutex |
| `get_recent_fixes` | ✅ | 20 recent fixes retrieved |

---

## Active Finding Tally

| Class | Count | Tools/Systems Affected |
|---|---|---|
| BUG | 2 | `get_foreign_flow`, `get_ticker_intelligence` (both in fb-market-poster) |
| ISSUE | 4 | BCTC VPS stale, foreign-flow all-zeros, server restart rate, marketEarningYieldJob cadence |
| IMPROVE | 4 | WTI stale, 5 dark tickers, TE+Reuters disabled, macroIndicatorRefreshJob docs |
| RESOLVED | 0 | (first run — no prior baseline) |

**Caller-surface verification (BUG-1 and BUG-2):**
- Grep run: `grep -r "get_foreign_flow\|get_ticker_intelligence" docs/agents/**/*.md`
- BUG-1 affected callers: `fb-market-poster/flow/main.md:78`, `tools/package/fb-market-poster.md:48,55` — 2 files, 3 sites
- BUG-2 affected callers: `fb-market-poster/flow/main.md:81`, `tools/package/fb-market-poster.md:49,56` — 2 files, 3 sites
- market-watcher calls `get_ticker_intelligence(code)` correctly (per-ticker with code param)
- unified-agent references `get_foreign_flow()` conceptually in market-analysis.md:30 as "data from" — not a direct call site; market-watcher uses `get_market_foreign_flow` via macro-health-read skill
- **Blast radius: fb-market-poster agent only (both BUGs). No other agent confirmed broken by these patterns.**
