# Team MCP Tool Recheck — 2026-06-14 14:08 UTC

**Run by:** health-recheck agent (scheduled routine)
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)`
**vn-market reachable:** YES (get_system_status OK, uptime ~32m at probe time)
**DB:** market.db 275.82 MB | WAL 3.93 MB
**Probes completed:** 16 tools probed; all prior findings re-executed fresh this cycle
**Prior report compared:** team-tool-recheck-2026-06-14-1207.md

---

## Tool Coverage — Probed This Cycle

| Tool | Probe Result | Notes |
|---|---|---|
| `get_system_status` | ✅ OK | BUG-01 re-confirmed (HNX/UPCOM errors every ~60s) |
| `get_cycle_bootstrap` | ✅ OK | Requires `agent_name` (enum-validated), not `agent_id` |
| `get_watchlist` | ✅ OK | 41 tickers; BDI/DLC/JSH/SIS/VDC show N/A (HNX/UPCOM) |
| `get_macro_snapshot` | ✅ OK | VN-Index 1791.65, Oil $87.33, Gold $4238.8, USD/VND 26122 |
| `get_pipeline_health` | ✅ OK | BDI/DLC/JSH/SIS/VDC=0 rows; all HOSE tickers 35-37 rows |
| `get_cron_health` | ✅ OK | BUG-02 re-confirmed; ISSUE-03 slightly improved; IMPROVE-04 still present |
| `get_technical_indicators` | ⚠️ N/A | FPT: all indicators N/A (source_tier=3) — ISSUE-02 re-confirmed |
| `get_vps_proxy_health` | ✅ OK | BCTC stale 14.3h (ISSUE-06 re-confirmed, vn-bctc-fetch healthy) |
| `get_sla_status` | ✅ OK | 5/5 ok — ISSUE-01 still RESOLVED |
| `task_list_held` | ✅ OK | 0 locks held — ISSUE-05 still RESOLVED |
| `get_earnings_calendar` | ✅ OK | 13 tickers QUÁ HẠN, 28 ĐÃ NỘP |
| `get_market_snapshot` | ✅ OK | VN-Index 1791.65 (-0.39%), source_tier=2 |
| `get_alerts` | ✅ OK | 10 alerts (7d); QA test artifact alert present (see IMPROVE-05) |
| `get_recent_fixes` | ✅ OK | 5 returned; fix log operational |
| `get_vps_service_health` | ✅ OK | 3 healthy (vn-bctc-fetch, vn-news-fetch, vn-sbv-fetch), 2 idle (market closed — expected) |
| `get_rate_limit_status` | ✅ OK | 11/11 sources ready, 0 waiting |

---

## ACTIVE Findings — Re-confirmed This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (day 6+, unchanged)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Source** | `get_system_status` errors + `get_pipeline_health` 5 tickers 0 rows |
| **Re-probe this cycle** | `get_system_status` at 14:04 UTC: 10/10 unresolved errors = `[hnx] all HNX price sources failed` / `[hnx] all UPCOM price sources failed`, firing every ~60s (14:01, 14:02, 14:03, 14:04 UTC). Circuit breaker hnx [OK] 0 failures — CB passes but fetches still fail. `get_pipeline_health` at 14:04: BDI/DLC/JSH/SIS/VDC = 0 rows, TA not ready. `get_watchlist`: all 5 tickers show "N/A" prices. |
| **Caller surface** | `grep -r "get_technical_indicators" docs/agents --include="*.md" -l` → `docs/agents/market-watcher/flow/cycle.md` (1 active caller). HNX/UPCOM tickers (BDI, DLC, JSH, SIS, VDC) unserviceable per `get_pipeline_health` 0 rows. |
| **Blast radius** | market-watcher: 5 tickers (BDI, DLC, JSH, SIS, VDC) N/A every cycle. Error log polluted with ~60 errors/hour off-hours. |
| **Status vs 1207** | UNCHANGED — same error rate, same 5 tickers, same CB-misleading pattern. |
| **Suggested fix** | Investigate `apps/stock-price/` HNX fetch path — API response format likely changed. Add market-hours gate to skip HNX polling outside 02:00–09:00 UTC Mon–Fri to eliminate off-hours error noise. |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (6 days unresolved)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Cron** | `vnstockFundamentalsRefresh` |
| **Re-probe this cycle** | `get_cron_health` at 14:04 UTC: last_run=2026-06-08 01:00:00, last_status=`crashed`, success_rate=0.00 (0.0%), total_runs=1, avg_duration=4035883ms (~67 min). ZERO re-trigger attempts since crash 6 days ago. |
| **Caller surface** | `grep -r "get_financial_summary\|vnstockFundamentalsRefresh\|get_bctc_full" docs/agents --include="*.md" -l` → 19 files. Active callers: `bctc-analyst/flow/stage-analyze.md`, `market-analyst/flow/main.md`, `digest-predict/flow/monday.md`, `digest-predict/flow/monthly.md`, `qa-responder/flow/cycle.md`, `unified-agent` (via get_bctc_full). P/E, EPS, P/B stale for all 41 tickers since 2026-06-08. |
| **Blast radius** | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent — all valuation ratio analyses degraded. |
| **Status vs 1207** | UNCHANGED — no re-trigger, no fix. |
| **Suggested fix** | Immediate: manually re-trigger `vnstockFundamentalsRefresh` via dev. Code fix: add per-ticker try/catch + 30s timeout in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`. Confirm ANSI escape-sequence sanitization applied before JSON parse (fix #2 in get_recent_fixes). |

---

## ISSUE Findings — Active This Cycle

### ISSUE-02 — `get_technical_indicators` returns N/A for all indicators (TA service disconnect)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_technical_indicators` |
| **Re-probe this cycle** | `get_technical_indicators(code="FPT")` at 14:05 UTC: MA5/MA20/MA50/RSI14/MACD/BB20 all N/A, source_tier=3, "cần tối thiểu 15 nến" / "cần tối thiểu 50 nến". `get_pipeline_health` at same time: FPT=37 rows, RSI14=48.0, TA ready. Identical disconnect as every prior cycle. |
| **Caller surface** | `grep -r "get_technical_indicators" docs/agents --include="*.md" -l` → `docs/agents/market-watcher/flow/cycle.md` (1 active caller, every market cycle). Tool and list docs are documentation only. |
| **Blast radius** | market-watcher: zero TA confirmation signals every cycle. RSI/MACD/BB anomaly detection entirely disabled during market hours. |
| **Status vs 1207** | UNCHANGED |
| **Suggested fix** | TA service (port 5003) reads different OHLCV store than `daily_ohlcv`. Confirm `ta-ohlcv-backfill` (last: 2026-06-12 01:30) targets correct shared volume path. Interim: when source_tier=3 AND `get_pipeline_health` rows≥15, compute RSI14 client-side from `get_price_history`. |

---

### ISSUE-03 — `bctcReparseJob` success rate below 80% threshold

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Cron** | `bctcReparseJob` |
| **Re-probe this cycle** | `get_cron_health` at 14:04 UTC: success_rate=0.79 (78.8%), total_runs=184. Prior 1207: 78.5%, 181 runs. Delta: 3 new runs (14:00 UTC), all succeeded (rate ticked from 78.5%→78.8%). Last 3 runs 100% success — possible stabilization. Still below 80% threshold. avg_duration=383s (~6.4 min). |
| **Caller surface** | `grep -r "bctcReparseJob\|push_bctc_refined\|get_bctc_refined" docs/agents --include="*.md" -l` → `bctc-analyst/flow/main.md` (ESC-5), `refine_bctc_md/flow/main.md`, `ops/flow/bctc.md`. Multiple active callers. |
| **Blast radius** | bctc-analyst ESC-5 gate blind when bctcReparseJob fails (no refined units returned → ESC-5=FALSE by default). refine_bctc_md agent starved of valid inputs. |
| **Status vs 1207** | SLIGHTLY IMPROVED (78.5%→78.8%, last 3 runs all success). Still below threshold but recovery signal. |
| **Suggested fix** | Root cause: PDF extraction quality. Investigate pdf-extractor container for PPC/PLX OCR failures. Check `cronHealthAlertJob` coverage of bctcReparseJob (threshold: 80%). |

---

### ISSUE-06 — BCTC VPS push stale (14.3h, service healthy — likely weekend content drought)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_vps_proxy_health` |
| **Re-probe this cycle** | `get_vps_proxy_health` at 14:05 UTC: bctc last_push=2026-06-13 23:45:12, 0 pushes in 24h, Stale=YES. Duration now 14.3h (was 12h at 1207 report). `get_vps_service_health` at 14:06: vn-bctc-fetch=**healthy** (service UP, responding, 1m ago). `get_system_status`: bctcQueueEnricherJob 0 URLs found for VEA, 0 URLs populated across all 9 items (WARN logged). |
| **Context update** | vn-bctc-fetch service is **healthy** — this is NOT a service crash. Probable cause: **weekend SSC portal inactivity**. Government BCTC filings typically don't arrive Saturday night/Sunday. The bctcQueueEnricher finds 0 new PDF URLs because source portals have no new filings. 13 tickers are QUÁ HẠN (get_earnings_calendar) — they may file during the week. |
| **Caller surface** | bctc-analyst pipeline → PDF pull → reparseJob → get_bctc_full / get_bctc_refined. |
| **Blast radius** | If a company files on Sunday (unusual), it would be missed until next push. Likely self-resolves Monday when SSC updates. Risk level: LOW (weekend). |
| **Status vs 1207** | Duration WORSENED (12h→14.3h), but root cause reassessed: service healthy, likely content drought not service failure. Monitor Monday open. |
| **Suggested fix** | Monitor at Mon 02:00 UTC — if bctc push still 0 at market open, then trigger `trigger_bctc_vps_fetch` to force-probe. Add weekend-aware staleness annotation in `get_vps_proxy_health` to distinguish "no new filings" from "service down". |

---

## RESOLVED Findings — Re-probed This Cycle, No Longer Reproducing

### ISSUE-01 — News SLA breach — STILL RESOLVED ✅

| Field | Value |
|---|---|
| **Re-probe** | `get_sla_status` at 14:06 UTC: news age=18min, SLA=30min, status=ok. 71 pushes/24h. |
| **Status** | Remains resolved. |

### ISSUE-05 — Orphaned expired task lock — STILL RESOLVED ✅

| Field | Value |
|---|---|
| **Re-probe** | `task_list_held(expired=true)` at 14:06 UTC: `{"locks":[],"count":0}`. No locks held. |
| **Status** | Remains clean. |

---

## IMPROVE (Low Priority)

### IMPROVE-04 — `macroIndicatorRefreshJob_FAILTEST` test artifact in production scheduler

| Field | Value |
|---|---|
| **Re-probe** | `get_cron_health`: macroIndicatorRefreshJob_FAILTEST last_run=2026-06-08 02:37:17, total_runs=1, success. Still present. |
| **Impact** | Zero operational impact. Noise in cron registry. |
| **Suggested fix** | Remove from `apps/mcp-server/src/scheduler/`. Update `docs/data/project-stats.json` cronJobCount. |

### IMPROVE-05 — QA test artifact alert unread in production (NEW this cycle)

| Field | Value |
|---|---|
| **Evidence** | `get_alerts(limit=10)` at 14:06 UTC: `[HIGH] 2026-06-13T07:59 VCB — "QA Gate-3 live co-write probe"` — alert id: `qa-gate3-probe-1781337593868`. Test probe alert sitting as unread [HIGH] in production alert table. |
| **Impact** | Zero operational impact. Pollutes alert history; unread HIGH alert could confuse alert stats monitoring. |
| **Suggested fix** | QA agent should mark its own probe alerts read on completion. Or alert ID prefix `qa-gate3-*` should be filtered out of production alert stats. |

---

## Summary Table

| ID | Class | Tool / Cron | Status | Callers Affected |
|---|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM price sources | UNCHANGED (day 6+) | market-watcher (5 tickers N/A) |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` crashed | UNCHANGED (day 6) | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent |
| ISSUE-01 | — | News SLA breach | **STILL RESOLVED** ✅ | — |
| ISSUE-02 | ISSUE | `get_technical_indicators` N/A | UNCHANGED | market-watcher (all tickers, all market cycles) |
| ISSUE-03 | ISSUE | `bctcReparseJob` success rate 78.8% | SLIGHTLY IMPROVED (↑78.5→78.8%, last 3 runs ok) | bctc-analyst, refine_bctc_md |
| ISSUE-05 | — | Orphaned task lock | **STILL RESOLVED** ✅ | — |
| ISSUE-06 | ISSUE | BCTC VPS push stale 14.3h | Duration WORSENED, severity DOWNGRADED (service healthy, weekend SSC drought likely) | bctc-analyst / PDF pipeline |
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` | UNCHANGED | cronHealthAlert noise only |
| IMPROVE-05 | IMPROVE | QA test alert artifact unread | NEW | alert stats (minor) |

**Active BUGs:** 2 | **Active ISSUEs:** 3 | **Resolved (still):** 2 | **New this cycle:** IMPROVE-05

**Overall system verdict: DEGRADED** — BUG-02 (vnstockFundamentalsRefresh crash) now 6 days without re-trigger; BUG-01 (HNX/UPCOM) fires every 60s; ISSUE-02 (get_technical_indicators N/A) blinds market-watcher every cycle. ISSUE-03 showing stabilization (last 3 runs succeeded). ISSUE-06 likely weekend content drought, self-resolves Monday. Weekend market-closed context explains stale prices and idle market-hours jobs.

---

## Gateway Transport Health

Gateway `mcp__gateway__call_tool` is operational. 16/16 tool probes reachable. Transport not dead. No BLOCKED status warranted.
