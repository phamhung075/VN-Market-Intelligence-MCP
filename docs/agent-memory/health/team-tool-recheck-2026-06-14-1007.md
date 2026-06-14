# Team MCP Tool Recheck — 2026-06-14 10:07 UTC

**Run by:** health-recheck agent (claude-sonnet-4-6)
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)`
**vn-market reachable:** YES (get_system_status OK, server uptime 11m 6s at run start — restarted ~09:52 UTC)
**DB:** market.db 275.38 MB | WAL 1.21 MB
**Probes completed:** 18 tools hit; 3 flow file batches read; 2 notebooks cross-checked

---

## Tool Coverage — Probed This Cycle

| Tool | Probe Result | Latency | Notes |
|---|---|---|---|
| `get_cycle_bootstrap` | ✅ OK | ~26ms | Requires `agent_name` (required param — schema correct) |
| `get_market_snapshot` | ✅ OK | — | VN-Index 1,791.65 (-0.39%); source_tier=2 |
| `get_macro_snapshot` | ✅ OK | — | Returns JSON-in-text; macro data fresh |
| `get_system_status` | ✅ OK | — | Reveals active errors (see BUG-01, BUG-03) |
| `task_list_held` | ✅ OK | — | 1 orphaned expired lock returned (see ISSUE-05 NEW) |
| `get_agent_signals` | ✅ OK (requires `agent`) | — | With `agent="news-scout"` returns correctly; prior probe with only `limit` failed schema |
| `get_earnings_calendar` | ✅ OK | — | 41 tickers; 12 QUÁ HẠN (overdue Q1-2026) |
| `get_cron_health` | ✅ OK | — | Full 60-job table; confirms BUG-02 still crashed |
| `get_pipeline_health` | ✅ OK | — | 5 tickers 0 rows / TA not ready (BDI/DLC/JSH/SIS/VDC) |
| `get_vps_proxy_health` | ✅ OK | — | All 4 routes healthy; news "ok" (ISSUE-04 RESOLVED) |
| `get_vps_service_health` | ✅ OK | — | 3 healthy, 2 idle (market closed, weekend) |
| `get_sla_status` | ✅ OK | — | News SLA breach 66min/30min (ISSUE-01 re-confirmed) |
| `get_alerts` | ✅ OK | — | 10 returned; alert pipeline functional |
| `get_recent_fixes` | ✅ OK | — | 10 returned; fix log pipeline functional |
| `get_watchlist` | ✅ OK | — | 41 tickers, all thresholds and sectors correct |
| `get_rate_limit_status` | ✅ OK | — | 11 sources; 0 throttled |
| `get_technical_indicators` | ⚠️ DEGRADED | ~150ms | FPT + VCB both N/A all indicators (ISSUE-02 re-confirmed) |
| `get_financial_summary` | ✅ OK | — | Requires `actionCode` (not `ticker`); FPT Q1-2026 returned |

---

## ACTIVE Findings — Re-confirmed This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (unchanged, recurring)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Source** | `get_system_status` errors; `get_pipeline_health` BDI/DLC/JSH/SIS/VDC |
| **Re-probe this cycle** | `get_system_status` at 10:03 UTC shows 10/10 most recent unresolved errors = `[hnx] all HNX price sources failed` / `[hnx] all UPCOM price sources failed`, timestamped 09:59–10:03 UTC (every ~60s). Same pattern as 0808 cycle. |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` — `get_price_history(code)` per ticker. `get_cycle_bootstrap` market_context includes HNX/UPCOM tickers. 5 watchlist tickers (BDI, DLC, JSH, SIS, VDC) confirmed 0 rows / TA not ready. |
| **Blast radius** | market-watcher: 5 tickers show N/A during market hours. VNH, JSH also affected (HNX). |
| **Status vs prior** | UNCHANGED — errors still every 60s, now starting from server restart at 09:52 UTC. |
| **Suggested fix** | Investigate `apps/stock-price/` HNX fetch path. `get_rate_limit_status` shows `api.hnx.vn` was called 16s ago with 0 wait time — CB is open/passing but fetches still failing. Check if HNX API response format changed. Failing even on Sunday off-hours implies something is polling outside market-hours gates. |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (6+ days unresolved)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Cron** | `vnstockFundamentalsRefresh` |
| **Re-probe this cycle** | `get_cron_health`: last_status=`crashed`, success_rate=0.00 (0.0%), total_runs=1, avg_duration=4035883ms (~67 min before crash). Last run: 2026-06-08. NO second attempt in 6 days. |
| **Caller surface** | `docs/agents/tools/package/bctc-analyst.md` and `market-analyst/flow/main.md:90` — `get_financial_summary(actionCode)` and `get_bctc_full(code)` depend on fundamental data refreshed by this job. P/E, EPS, P/B stale since 2026-06-08. |
| **Blast radius** | bctc-analyst: ratios stale for all 41 tickers. market-analyst: valuation pass degraded. |
| **Status vs prior** | UNCHANGED — 6 days since crash, still 0 total successful runs. |
| **Suggested fix** | Review `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`. 67-min runtime before crash suggests timeout/memory/network issue with vnstock API (known to return ANSI escape sequences per fix #8 in get_recent_fixes). Add per-ticker try/catch + timeout; schedule re-trigger; add to cronHealthAlert coverage. |

---

### BUG-03 — BCTC Zero-confidence extractions (2 tickers now)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Source** | `bctcReparseJob` → PDF extractor pipeline |
| **Re-probe this cycle** | `get_system_status` at 10:03 UTC: `[BCTC] Zero-confidence extraction — skipped insert for PPC 2026-Q1` (10:03:25) AND `[BCTC] Zero-confidence extraction — skipped insert for PLX 2025-Q4` (10:01:18). New vs prior report: PLX Q4-2025 added. |
| **Caller surface** | `docs/agents/bctc-analyst/flow/main.md` ESC-5 checks `get_bctc_refined`. BCTC data for PPC Q1-2026 and PLX Q4-2025 is silently skipped. |
| **Blast radius** | bctc-analyst has zero input for PPC Q1-2026 and PLX Q4-2025. bctcReparseJob success_rate = 78.8% (↓ from 79.9% in prior cycle) — cronHealthAlert threshold is 80%. |
| **Status vs prior** | WORSENED — PLX Q4-2025 is a new zero-confidence ticker. Rate dropped from 79.9% → 78.8%. |
| **Suggested fix** | Check PDF extractor container logs for PPC and PLX. May need OCR quality improvement (low-scan PDFs). Per dev-pdf-extractor notebook (2026-06-08): `cpus: '1.0'` CFS exhaustion was root cause of prior PDF extractor unhealthy events — verify current CPU quota. |

---

## ISSUE Findings — Re-confirmed This Cycle

### ISSUE-01 — News SLA CRITICAL breach (66min vs 30min)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_sla_status` |
| **Re-probe this cycle** | `get_sla_status` at 10:04 UTC: news age=66min, SLA=30min, status=`breached`, severity=CRITICAL. VPS news pushes active (50/24h, last push 10:02:06) — SLA measures `market_messages` DB ingestion age, not push timestamp. |
| **Caller surface** | `docs/agents/news-scout/flow/cycle.md` bootstrap reads system_status. `docs/agents/unified-agent/flow/chef.md` — news is TNB Layer 1. `freshnessSlaMonitorJob` fires send_telegram(bug) on breach. |
| **Blast radius** | Potential recurring BUG alerts if SLA checker fires every 30 min. News article content arriving (system shows 10 recent articles) but stored freshness timestamp lagging. |
| **Status vs prior** | WORSENED slightly — 66min (was 58min in 0808 report). |
| **Suggested fix** | Investigate what `get_sla_status` reads for "news" freshness timestamp. If it reads `MAX(sent_at)` from `market_messages` but VPS pushes bypass that table, align the pipeline. Raise SLA threshold to 120min for off-hours OR add VPS push timestamp as secondary freshness signal. |

---

### ISSUE-02 — `get_technical_indicators` returns N/A for all indicators (data path gap)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_technical_indicators` |
| **Re-probe this cycle** | `get_technical_indicators(code="FPT")` and `(code="VCB")` at 10:08 UTC: both return N/A for MA5/MA20/MA50/RSI14/MACD/BB20, source_tier=3, "needs minimum 15 candles". But `get_pipeline_health` confirms FPT=37 rows (RSI14=48.0, TA ready) and VCB=37 rows (RSI14=43.8, TA ready). TA service (port 5003) is NOT reading from same daily_ohlcv store. |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` calls `get_technical_indicators(code)` per ticker with price move. `docs/agents/tools/package/market-watcher.md` confirms this dependency. 1 active caller flow. |
| **Blast radius** | market-watcher: zero TA confirmation signals during any cycle (including market hours). RSI/MACD/BB anomaly detection entirely disabled. |
| **Status vs prior** | UNCHANGED — same N/A response for same tickers. |
| **Suggested fix** | Check `apps/technical-analysis/` internal OHLCV store — does `ta-ohlcv-backfill` (last: 2026-06-12 01:30) populate a different table than `daily_ohlcv`? Add fallback: when TA service returns N/A but source_tier≥3 AND `get_pipeline_health` has ≥15 rows for ticker, compute RSI14 client-side from `get_price_history`. |

---

### ISSUE-03 — `bctcReparseJob` success_rate 78.8% (below 80% threshold)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Cron** | `bctcReparseJob` |
| **Re-probe this cycle** | `get_cron_health`: success_rate=0.79 (78.8%), total_runs=184, avg_duration=392821ms (~6.5 min). Last run: 10:03:26 UTC (success). Rate decreased from 79.9% at 0808 cycle. |
| **Caller surface** | Feeds `get_bctc_full` and ESC-5 in bctc-analyst. 184 total runs = 7-day window; ~21 failures. |
| **Status vs prior** | WORSENED — 79.9% → 78.8%. `cronHealthAlertJob` (last: 2026-06-14 00:00 UTC) should be alerting on this. |
| **Suggested fix** | Check if `cronHealthAlertJob` fired BUG alert on this (look for alert with `success_rate < 0.80`). Root cause likely same as BUG-03 zero-confidence extractions. Fix PDF extraction quality in dev-pdf-extractor to resolve both. |

---

## RESOLVED Findings (Re-probed This Cycle — No Longer Reproducing)

### ISSUE-04 — VPS news proxy stale flag — RESOLVED
| Field | Value |
|---|---|
| **Prior class** | ISSUE |
| **Re-probe this cycle** | `get_vps_proxy_health` at 10:04 UTC: news shows `status=ok`, last push 2026-06-14 10:02:06, 50 pushes/24h, 0 errors. Stale flag is gone. |
| **Resolution** | Transient — likely tied to a quiet period earlier this morning. VPS news fetch healthy. DROP from active issues. |

### BUG-04 — bctcQueueEnricher 0 URLs for 9 tickers — STATUS UNCERTAIN (fix applied, not fully re-probed)
| Field | Value |
|---|---|
| **Prior class** | BUG |
| **Re-probe this cycle** | `get_system_status` 10 most recent unresolved errors: no "0 URLs found" warnings visible (only HNX failures and BCTC zero-confidence). `bctcQueueEnricherJob`: success_rate 99.6%, 486 runs, last_run 09:45 UTC success. `dev-mcp-server` notebook (2026-06-13) confirms orphan-re-sync arm was added to `bctcQueueEnricherJob.ts`. |
| **Resolution** | LIKELY RESOLVED for HOSE tickers. HNX/UPCOM tickers (BDI, DLC, JSH, SIS, VDC) still have 0 rows in `get_pipeline_health` — non-HSX discovery path still pending per dev-pdf-extractor notebook. Downgrade to IMPROVE (track separately from BUG-04). |

---

## NEW Findings This Cycle

### ISSUE-05 (NEW) — Orphaned expired task lock in `task_list_held`
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `task_list_held` |
| **Evidence** | `task_list_held` at 10:04 UTC returns `task:DOCLANG-SERIALIZE` held by `po` (session `pid-1-ts-1781415215127`). `expires_at: 2026-06-14T08:10:18Z` — expired ~114 minutes ago. `heartbeat_at` = same as `claimed_at` (no heartbeat sent since acquisition). Session appears dead. Prior report (0808) showed 0 locks. |
| **Caller surface** | `docs/agents/system-auditor/flow/main.md:597` and `bctc-analyst/flow/main.md:88` — both use `task_claim` + `task_release` pattern. If `task_list_held` displays expired locks as active, agents checking this tool for "who holds what" will be confused. If `task_claim` correctly enforces TTL on claim (not just on list), this is display-only noise. |
| **Blast radius** | Low — likely cosmetic only if TTL is enforced at claim time. Medium risk: if the `DOCLANG-SERIALIZE` sprint task is needed again, a new claim attempt will reveal whether the expired lock is properly ignored. |
| **Suggested fix** | In `task_list_held` handler, filter out rows where `expires_at < now()`. Optionally add a cleanup sweep in `walCheckpointJob` or a dedicated TTL-sweeper. Confirm `task_claim` validates TTL expiry before refusing a claim. |

---

### IMPROVE-04 (NEW) — `macroIndicatorRefreshJob_FAILTEST` test artifact in production
| Field | Value |
|---|---|
| **Class** | IMPROVE |
| **Evidence** | `get_cron_health` returns `macroIndicatorRefreshJob_FAILTEST`: last_run=2026-06-08 02:37:17, 1 total run, success, avg_duration=16951ms. This is a QA test job left in production cron registry. |
| **Blast radius** | Zero operational impact (ran once, succeeded, never fires again). But: clutters `get_cron_health` output, may confuse system-auditor when scanning all crons, and will artificially inflate total cron count in `docs/data/project-stats.json#cronJobCount`. |
| **Suggested fix** | Remove `macroIndicatorRefreshJob_FAILTEST` from the scheduler in `apps/mcp-server/src/scheduler/`. Update `project-stats.json` cron count via `bun scripts/gen-project-stats.ts` after removal. |

---

## Carries from Prior (Unresolved, No New Probe Needed)

### IMPROVE-01 — Tool list docs use stale `ticker` param (0 callers)
- Prior caller-surface grep confirmed 0 active callers use wrong param. NON-ISSUE for production. Doc fix only.
- **Verified:** `grep -r "get_technical_indicators\|get_price_history" docs/agents/*/flow/ docs/agents/tools/package/` — 0 callers use `ticker`. All use `code`. NON-ISSUE for production runtime.

### IMPROVE-02 — Direct RSS source health misleads operators (re-confirmed)
- Reuters RSS `Suy giảm`, Trading Economics `Suy giảm` / "never succeeded" in `get_system_status`. VPS proxy routes active and healthy. Source health UI should annotate geo-blocked paths. IMPROVE quality only.

### IMPROVE-03 — `vnstockFundamentalsRefresh` not covered by `cronHealthAlertJob`
- Still relevant as BUG-02 persists 6+ days without automated re-trigger.

---

## Summary Table

| ID | Class | Tool / Cron | Status | Callers affected |
|---|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM price sources | UNCHANGED | market-watcher (5 tickers N/A) |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` | UNCHANGED (6d) | bctc-analyst, market-analyst (all 41 tickers) |
| BUG-03 | BUG | `bctcReparseJob` / PDF extraction | WORSENED (+PLX Q4-2025) | bctc-analyst (PPC, PLX) |
| ISSUE-01 | ISSUE | `get_sla_status` / news freshness | WORSENED (66min, was 58min) | news-scout, unified-agent |
| ISSUE-02 | ISSUE | `get_technical_indicators` | UNCHANGED | market-watcher (all tickers) |
| ISSUE-03 | ISSUE | `bctcReparseJob` success rate | WORSENED (78.8%, was 79.9%) | bctc pipeline |
| ISSUE-04 | — | VPS news proxy stale flag | **RESOLVED** | — |
| BUG-04 | — | bctcQueueEnricher 0 URLs | **LIKELY RESOLVED** (fix applied) | — |
| ISSUE-05 | ISSUE | Orphaned task lock (NEW) | NEW | ops / any agent using task_claim |
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` (NEW) | NEW | cronHealthAlert noise |

**Active BUGs:** 3 | **Active ISSUEs:** 4 | **Resolved this cycle:** 2

**Overall system verdict: DEGRADED** — 3 re-confirmed BUGs, 4 re-confirmed ISSUEs. BUG-02 (vnstockFundamentalsRefresh crash) remains unresolved 6 days. `get_technical_indicators` blind spot affects market-watcher TA detection every cycle. HNX/UPCOM price failures ongoing even on Sunday (outside market hours).
