# Team MCP Tool Recheck — 2026-06-14 12:07 UTC

**Run by:** health-recheck agent (claude-sonnet-4-6)
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)`
**vn-market reachable:** YES (get_system_status OK, uptime 1h 14m 31s at probe time)
**DB:** market.db 275.54 MB | WAL 2.78 MB
**Probes completed:** 8 tools probed; all prior findings re-executed fresh this cycle

---

## Tool Coverage — Probed This Cycle

| Tool | Probe Result | Notes |
|---|---|---|
| `get_system_status` | ✅ OK | 10/10 recent errors = HNX/UPCOM failures (BUG-01 re-confirmed) |
| `get_cron_health` | ✅ OK | Full job table; BUG-02 re-confirmed; IMPROVE-04 still present |
| `get_sla_status` | ✅ OK | News 25min < 30min SLA → ISSUE-01 RESOLVED |
| `task_list_held` | ✅ OK | 1 active lock (T1-ARCH-CRON-T4, expires 12:43 UTC — valid) |
| `get_vps_proxy_health` | ✅ OK | BCTC VPS push STALE 12h+ → NEW ISSUE-06 |
| `get_market_snapshot` | ✅ OK | VN-Index 1,791.65 (-0.39%); source_tier=2 |
| `get_technical_indicators` | ⚠️ N/A | FPT: all indicators N/A — ISSUE-02 UNCHANGED |
| `get_pipeline_health` | ✅ OK | FPT 37 rows RSI14=48.0 (confirms ISSUE-02 disconnect) |
| `get_recent_fixes` | ✅ OK | 20 returned; fix log operational |

---

## ACTIVE Findings — Re-confirmed This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (unchanged, 6+ days recurring)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Source** | `get_system_status` errors + `get_pipeline_health` 5 tickers 0 rows |
| **Re-probe this cycle** | `get_system_status` at 12:03 UTC: 10/10 unresolved errors = `[hnx] all HNX price sources failed` / `[hnx] all UPCOM price sources failed`, firing every ~60s (11:59, 12:00, 12:01, 12:02, 12:03 UTC). Circuit breaker shows hnx [OK] 0 failures — CB is passing but fetches still fail. `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC rows=0, TA not ready. |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` — `get_price_history(code)` per ticker. market-watcher bootstrap includes HNX/UPCOM tickers via `get_cycle_bootstrap`. 5 watchlist tickers confirmed unserviceable. |
| **Blast radius** | market-watcher: 5 tickers (BDI, DLC, JSH, SIS, VDC) N/A all market hours. HNX/UPCOM fetch polling continues outside market hours (waste + error noise). |
| **Status vs prior (1007 cycle)** | UNCHANGED — same error rate, same tickers. Circuit breaker status unchanged. |
| **Suggested fix** | Investigate `apps/stock-price/` HNX fetch path — API response format may have changed. Also add market-hours gate to skip HNX polling outside 02:00–09:00 UTC Mon–Fri (eliminates off-hours error noise). |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (7 days unresolved)
| Field | Value |
|---|---|
| **Class** | BUG |
| **Cron** | `vnstockFundamentalsRefresh` |
| **Re-probe this cycle** | `get_cron_health` at 12:04 UTC: last_run=2026-06-08 01:00:00, last_status=`crashed`, success_rate=0.00 (0.0%), total_runs=1, avg_duration=4035883ms (~67 min). ZERO runs attempted since crash 7 days ago. |
| **Caller surface** | `bctc-analyst/flow/cycle.md` pass-2 and market-analyst `/flow/main.md:90` — `get_financial_summary(actionCode)`, `get_bctc_full(code)` depend on ratios refreshed by this job. P/E, EPS, P/B stale for all 41 tickers since 2026-06-08. |
| **Blast radius** | bctc-analyst: all valuation ratios stale (7 days). market-analyst: earnings-yield and ratio pass degraded. `cronHealthAlertJob` last ran 2026-06-14 00:00 UTC (success) but BUG-02 has 0% rate — unclear if alertJob covers this job. |
| **Status vs prior** | UNCHANGED (now 7 days vs 6 days). No re-trigger attempted. |
| **Suggested fix** | Immediate: manually re-trigger `vnstockFundamentalsRefresh` via dev. Code fix: `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — add per-ticker try/catch + 30s timeout. vnstock API returns ANSI escape sequences (fix #8 in get_recent_fixes) — ensure that sanitization is applied before JSON parse. |

---

### BUG-03 — BCTC Zero-confidence extractions + `bctcReparseJob` rate declining
| Field | Value |
|---|---|
| **Class** | BUG |
| **Source** | `bctcReparseJob` → PDF extractor pipeline |
| **Re-probe this cycle** | `get_cron_health`: bctcReparseJob success_rate=0.78 (78.5%), total_runs=181. Prior cycle (1007): 78.8%, 184 runs. WORSENED. Note: `get_system_status` top-10 errors are all consumed by HNX failures — BCTC zero-confidence errors not visible in top-10 this cycle. Rate decline (78.8% → 78.5%) confirms zero-confidence failures are ongoing. |
| **Caller surface** | `bctc-analyst/flow/main.md` ESC-5 reads `get_bctc_refined`. `get_bctc_full` / `get_financial_summary` depend on reparse output. 2 tickers (PPC Q1-2026, PLX Q4-2025) previously confirmed as zero-confidence skipped. |
| **Blast radius** | bctc-analyst blind on PPC and PLX (at minimum). cronHealthAlertJob threshold is 80% — this job is below threshold, should be alerting. |
| **Status vs prior** | WORSENED — rate 78.8% → 78.5%. Top-10 errors now dominated by HNX (BCTC errors still occurring, below top-10 view). |
| **Suggested fix** | Investigate PDF extractor container for PPC/PLX OCR failures. Check CPU quota — prior diagnosis: `cpus: '1.0'` CFS exhaustion. Fix zero-confidence path in dev-pdf-extractor. Confirm `cronHealthAlertJob` is monitoring `bctcReparseJob` (add if missing). |

---

## ISSUE Findings — Active This Cycle

### ISSUE-02 — `get_technical_indicators` returns N/A for all indicators (TA service disconnect)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_technical_indicators` |
| **Re-probe this cycle** | `get_technical_indicators(code="FPT")` at 12:04 UTC: MA5/MA20/MA50/RSI14/MACD/BB20 all N/A, source_tier=3, "cần tối thiểu 15 nến". `get_pipeline_health` at same time: FPT=37 rows, RSI14=48.0, TA ready. Same disconnect observed every cycle. |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` calls `get_technical_indicators(code)` per ticker with price move. `docs/agents/tools/package/market-watcher.md` confirms. 1 active caller, every market cycle. |
| **Blast radius** | market-watcher: zero TA confirmation signals every cycle. RSI/MACD/BB anomaly detection entirely disabled during market hours. |
| **Status vs prior** | UNCHANGED — same N/A for same probe ticker. |
| **Suggested fix** | TA service (port 5003) reads from a different OHLCV store than `daily_ohlcv`. Confirm `ta-ohlcv-backfill` (last: 2026-06-12 01:30) targets correct shared volume path. Interim: when source_tier=3 AND `get_pipeline_health` rows≥15, compute RSI14 client-side from `get_price_history`. |

---

### ISSUE-03 — `bctcReparseJob` success rate below 80% threshold
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Cron** | `bctcReparseJob` |
| **Re-probe this cycle** | `get_cron_health`: success_rate=0.78 (78.5%), total_runs=181, avg_duration=402812ms (~6.7 min). Last run: 2026-06-14 11:00:24 UTC (success). Threshold is 80%. |
| **Caller surface** | Same as BUG-03. BCTC pipeline quality gate. |
| **Status vs prior** | WORSENED — 79.9% (0808) → 78.8% (1007) → 78.5% (this cycle). Steady decline. |
| **Suggested fix** | Root cause is same as BUG-03. Fix PDF extraction quality. Verify `cronHealthAlertJob` coverage of this job. |

---

### ISSUE-06 (NEW) — BCTC VPS push STALE (12h+, no pushes today)
| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_vps_proxy_health` |
| **Evidence** | `get_vps_proxy_health` at 12:03 UTC: bctc shows `last push: 2026-06-13 23:45:12`, 0 pushes in 24h, `stale=YES`. Tool reports "STALE: bctc — VPS may be down or unreachable". prices (market closed — expected), news (59/24h, ok), sbv (24/24h, ok). BCTC alone is stale. `bctcPdfPullJob` last_run=11:30 UTC success (97.1%) — the mcp-server pulls but VPS is sending nothing. |
| **Caller surface** | `bctcPdfPullJob` → `bctcReparseJob` → `get_bctc_full` / `bctc-analyst`. If VPS BCTC cache has no new PDFs, the pipeline stalls at source. Could explain why bctcReparseJob rate declines (fewer valid inputs). |
| **Blast radius** | BCTC ingestion pipeline: any new financial reports filed since 2026-06-13 23:45 UTC are not reaching the mcp-server. During earnings season (Q1 2026 — 12 tickers QUÁ HẠN per prior data) this is significant. |
| **Suggested fix** | Check VPS-side BCTC cron (`bctc-discover` route) — confirm VPS service is running and fetching. Run `trigger_bctc_vps_fetch` to manually test reachability. If VPS service is hung, `restart_vps_service` or SSH recovery. |

---

## RESOLVED Findings (Re-probed This Cycle — No Longer Reproducing)

### ISSUE-01 — News SLA breach — RESOLVED ✅
| Field | Value |
|---|---|
| **Prior class** | ISSUE |
| **Re-probe this cycle** | `get_sla_status` at 12:03 UTC: news age=25min, SLA=30min, status=`ok`. No breach. 5/5 signals ok. |
| **Resolution** | Fully resolved. News pipeline healthy (59 pushes/24h, last push 11:54 UTC). DROP from active issues. |

### ISSUE-05 — Orphaned expired task lock — RESOLVED ✅
| Field | Value |
|---|---|
| **Prior class** | ISSUE |
| **Re-probe this cycle** | `task_list_held` at 12:03 UTC: shows `task:T1-ARCH-CRON-T4-DEDUP-GUARDS`, owner=dev-team, expires_at=2026-06-14T12:43:31Z (active — expires 38 min in future). The prior expired `DOCLANG-SERIALIZE` lock (which expired ~08:10 UTC) is GONE. Current lock is legitimate (heartbeat healthy, owned by dev-mcp-server spawned by dev-team for cron dedup guard implementation). |
| **Resolution** | Prior expired orphan cleared. Current lock is valid. DROP from active issues. |

---

## Carry-Forward (IMPROVE — Low Priority, No Re-probe Needed)

### IMPROVE-01 — Tool list docs use stale `ticker` param (0 callers)
- Caller-surface grep confirms 0 active callers use wrong param. Doc fix only. NON-ISSUE for runtime.

### IMPROVE-02 — Reuters/TradingEconomics source health shows "Ngưng / never succeeded" in get_system_status
- VPS proxy routes handle these geo-blocked paths correctly. Source health UI should annotate. IMPROVE quality only.

### IMPROVE-03 — `vnstockFundamentalsRefresh` not covered by `cronHealthAlertJob`
- Still relevant as BUG-02 persists 7 days without automated re-trigger.

### IMPROVE-04 — `macroIndicatorRefreshJob_FAILTEST` test artifact in production
| Field | Value |
|---|---|
| **Re-probe this cycle** | `get_cron_health` confirms still present: last_run=2026-06-08 02:37:17, 1 total run, success. |
| **Status** | UNCHANGED — test artifact remains in production scheduler. Zero operational impact. |
| **Suggested fix** | Remove from `apps/mcp-server/src/scheduler/`. Update `project-stats.json` cronJobCount. |

---

## Summary Table

| ID | Class | Tool / Cron | Status | Callers Affected |
|---|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM price sources | UNCHANGED (day 7) | market-watcher (5 tickers N/A) |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` | UNCHANGED (day 7) | bctc-analyst, market-analyst (all 41 tickers) |
| BUG-03 | BUG | `bctcReparseJob` / PDF extraction | WORSENED (78.5%, ↓78.8%) | bctc-analyst (PPC, PLX+) |
| ISSUE-01 | — | News SLA breach | **RESOLVED** ✅ | — |
| ISSUE-02 | ISSUE | `get_technical_indicators` N/A | UNCHANGED | market-watcher (all tickers, all cycles) |
| ISSUE-03 | ISSUE | `bctcReparseJob` success rate | WORSENED (78.5%) | BCTC pipeline |
| ISSUE-05 | — | Orphaned task lock | **RESOLVED** ✅ | — |
| ISSUE-06 | ISSUE | BCTC VPS push STALE 12h+ | **NEW** | bctc-analyst / PDF pipeline |
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` | UNCHANGED | cronHealthAlert noise only |

**Active BUGs:** 3 | **Active ISSUEs:** 3 | **Resolved this cycle:** 2 | **New this cycle:** 1

**Overall system verdict: DEGRADED** — BUG-02 (vnstockFundamentalsRefresh crash) now 7 days unresolved; BUG-01 (HNX/UPCOM failures) fires every 60s around the clock; ISSUE-02 (get_technical_indicators N/A) blinds market-watcher TA detection every cycle. New ISSUE-06 (BCTC VPS stale) risks blocking incoming Q1-2026 earnings reports.
