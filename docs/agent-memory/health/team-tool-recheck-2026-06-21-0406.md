# Team MCP Tool Recheck — 2026-06-21 04:06 UTC

**Run by:** health-recheck agent  
**Gateway:** vn-market reachable ✅  
**Probe window:** 2026-06-21 ~04:03–04:07 UTC (VN market CLOSED — off-hours weekend run)  
**Prior report:** `team-tool-recheck-2026-06-20-0603.md`  
**STEP 3c:** All prior findings re-probed this cycle before classification.

---

## Summary

| Class | Count | Worst severity |
|-------|-------|----------------|
| BUG   | 4     | CRITICAL (BCTC pipeline dead — day 5) |
| ISSUE | 6     | HIGH (SBV recurring rejection, open warnings growing) |
| IMPROVE | 3   | LOW–MEDIUM |
| RESOLVED | 1  | ISSUE-2 orphan lock cleared |

---

## RESOLVED (no longer reproduce)

### ~~ISSUE-2 — Orphaned cowork-leader-lock~~ → RESOLVED

| Field | Value |
|-------|-------|
| Prior evidence | Lock `cowork-leader-lock` expired 27 min, no heartbeat (2026-06-20 06:03) |
| Re-probe | `task_list_held` → lock active, `heartbeat_at: ~1782013877` (current), `expires_at: 2026-06-21T04:21:17` — fresh and healthy |
| Status | **RESOLVED** |

---

## ACTIVE FINDINGS

### BUG-1 — CRITICAL: BCTC pipeline dead (day 5), SLA breached 2.4×

| Field | Value |
|-------|-------|
| Tool | `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status` |
| Evidence (re-confirmed) | `vn-bctc-fetch: unhealthy`; bctc proxy last push `2026-06-16 18:02` (5 days stale); `get_sla_status` → **bctc 6202 min / 2615 min SLA → CRITICAL breach 2.4×**. 51 reports in `get_bctc_pending_refine` queue. |
| Prior cycle | Same finding at 2026-06-20 06:03 — NO fix landed in 22h |
| Caller count | bctc-analyst (flow/cycle.md), refine_bctc_md (flow/main.md uses `limit:1`), cron:bctcReparseJob, cron:bctcPdfPull, cron:bctcQueueEnricher — **5 callers** |
| Impact | No new BCTC PDFs fetched since June 16. Q1-2026 earnings window: 11 tickers show QUÁ HẠN in `get_earnings_calendar`. BCTC analyst blocked on stale data. 51 pending-refine queue stuck. |
| Probe commands | `get_vps_service_health`, `get_vps_proxy_health`, `get_sla_status` |
| Suggested fix | SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify with `get_vps_service_health`. Then run `trigger_bctc_vps_fetch` to flush. If service restarts but stays unhealthy, inspect logs: `journalctl -u vn-bctc-fetch -n 100`. |

---

### BUG-2 — HIGH: Reuters RSS — persistent, never succeeded (18 consecutive, count reset at server restart ~2026-06-16)

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Source Health section |
| Evidence (re-confirmed) | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 18 ⚠` — never fetched in recorded history. Prior report showed 106 consecutive; count reset when mcp-server restarted ~2026-06-16 (uptime: 4d 9h 57m). Root issue unchanged. |
| Prior cycle | Same since at least 2026-06-20 06:03 |
| Caller count | news-scout (`stage-signals.md` uses `fetch_and_analyze` which routes through news pipeline); Reuters in `system-map.json` data_sources. **1 agent pipeline** |
| Impact | International Reuters coverage permanently dark for news-scout and unified-agent. Macro signal quality reduced. |
| Suggested fix | Verify Reuters RSS URL still active (Reuters restructured RSS in 2024). If decommissioned, remove from active source list in mcp-server config to eliminate log noise. Check `get_recent_fixes` — fix #7 (2026-04-30) decommissioned `vn-reuters-fetch.service`; cross-check if source record was also removed. |

---

### BUG-3 — HIGH: Trading Economics — persistent, never succeeded (18 consecutive, count reset at server restart)

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Source Health section |
| Evidence (re-confirmed) | 2 Trading Economics sources: `Trading Economics \| Ngưng \| Chưa bao giờ \| 18 ⚠` (both instances). Count reset at 2026-06-16 server restart — root issue unchanged. |
| Prior cycle | Same since at least 2026-06-20 06:03 |
| Caller count | `get_macro_snapshot` (market-watcher, unified-agent package docs), `get_vn_macro_indicators`, `macro-health-read` skill — **3+ agents** |
| Impact | Commodity price delta fields null in `get_macro_snapshot` (confirmed: `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null`). Macro narrative degraded to cached/estimated values. |
| Suggested fix | Check if Chromium is present in mcp-server container: `docker exec mcp-server chromium --version`. If missing, rebuild with Dockerfile fix. Also check TradingEconomics rate limits / IP block status. |

---

### BUG-4 (NEW): ISM subcomponent data missing — FRED_API_KEY likely unset

| Field | Value |
|-------|-------|
| Tool | `get_ism_subcomponents` |
| Evidence | `{"error": "no_data", "message": "fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| Context | `macroIndicatorRefreshJob` last ran at 2026-06-20 12:13 UTC with `success` (100.0% rate, 13 runs). Yet ISM data remains absent → FRED_API_KEY likely not set, or ISM fetch silently skipped within the job. |
| Caller count | `news-scout` (package/news-scout.md), `bctc-analyst` (package/bctc-analyst.md), `unified-agent` (package/unified-agent.md) — **3 agents** |
| Probe command | `get_ism_subcomponents` → returns `error: no_data` |
| Suggested fix | Check `.env` for `FRED_API_KEY`. If unset, obtain key at fred.stlouisfed.org (free). If set, check macroIndicatorRefreshJob logs for ISM-specific fetch failure. |

---

## ISSUES (degraded / not broken)

### ISSUE-1 — MEDIUM: SBV zero-value rejection guard firing every 30 min (log noise, data protected)

| Field | Value |
|-------|-------|
| Tool | `get_system_status`, `get_vps_service_health` |
| Evidence (re-confirmed) | `vn-sbv-fetch: healthy` (improved vs prior UNHEALTHY), but `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` fires at 02:02, 02:32, 03:02, 03:32, 04:02 UTC (every 30 min). `sbvRatesRefreshJob` success_rate: 98.1%. |
| Impact | Data protected — rejection guard working. SBV rates fresh (last push 4 min ago). Root cause: SBV API returning zero-value off-hours responses. Generates misleading ERROR-level log entries. |
| Suggested fix | Add off-hours guard in `sbvRatesRefreshJob`: skip write (not reject) when fetch returns zero-value. Alternatively, downgrade rejection log from ERROR → WARN when outside VN business hours. |

### ISSUE-2 — HIGH: 49 open high/critical warnings, 67 pending feedback items (growing)

| Field | Value |
|-------|-------|
| Tool | `get_system_status` |
| Evidence (re-confirmed) | `open_warnings: 49 high/critical items`, `pending_feedback: 67 new items`. Prior: 47 / 65. Growing +2/+2 since yesterday. Last weekly audit: 2026-06-20 18:00. |
| Impact | Accumulated unreviewed signals. May contain actionable patterns hidden in noise. |
| Suggested fix | Dispatch `system-auditor` Tier-2 sweep to drain feedback and resolve warnings. |

### ISSUE-3 — LOW: bctcReparseJob at 94.5% success rate (below 100%, linked to BUG-1)

| Field | Value |
|-------|-------|
| Tool | `get_cron_health` |
| Evidence (re-confirmed) | `bctcReparseJob: success_rate=0.95 (94.5%), total_runs=73`. Improved from 89.7% (prior report). |
| Impact | ~4 re-parse cycles failed in 7-day window. Likely related to BUG-1 (BCTC pipeline stalled). |
| Suggested fix | Will likely self-heal once BUG-1 (vn-bctc-fetch) is fixed. |

### ISSUE-4 — MEDIUM: intelligence-cycle long-run skip (cycle >15 min at market open)

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Recent Errors |
| Evidence (new) | `[intelligence-cycle] previous cycle still running — skipped` at 02:15 UTC. `intelligenceCycleJob` avg_duration: 29,391ms (29s normally); 02:00 cycle took >15 min. |
| Impact | One market-hour intelligence cycle skipped at open. Potentially missed early price anomalies. |
| Suggested fix | Investigate 02:00 UTC cycle — possible VPS latency spike or DB lock contention at market open. Add cycle-level timeout guard (e.g., 12 min hard kill). |

### ISSUE-5 — LOW: HNX/UPCOM price source transient failure at 02:02 UTC

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → Recent Errors |
| Evidence (re-confirmed, downgraded from BUG-2) | `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` at 02:02 UTC. Circuit breaker `hnx: OK, 0 failures` now. Tickers BDI/VNH/JSH/VDC/DLC/SIS persist at N/A — likely data coverage gap, not systemic failure. |
| Impact | Transient. 6 tickers with no price coverage are likely small-cap gaps rather than active failures. |
| Suggested fix | Monitor for recurrence at next market open. If persistent, check VPS proxy `/proxy/ssc-iboard` for HNX/UPCOM route. |

### ISSUE-6 — LOW: Commodity price deltas null in macro snapshot (TE source dark)

| Field | Value |
|-------|-------|
| Tool | `get_macro_snapshot` |
| Evidence (new) | `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null, oilUsdDirection: "unknown"`. Linked to BUG-3 (Trading Economics failures). |
| Impact | Macro direction signals show "unknown" for oil/gold — agents relying on direction for regime classification get degraded signals. |
| Suggested fix | Linked fix → BUG-3. Also check `commodityTrackerRefreshJob` (success_rate: 100%, ran 06:00 UTC yesterday) for prior-value storage path. |

---

## IMPROVE

### IMPROVE-1 — LOW (UNRESOLVED, prior report): `get_price_history` docs say `ticker`, live tool requires `code`

| Field | Value |
|-------|-------|
| Tool | `get_price_history` |
| Evidence (re-confirmed) | `{"ticker": "FPT", "days": 5}` → `path ["code"] Required`. `{"code": "FPT", "days": 5}` → success. |
| Caller surface | `grep -r "get_price_history" docs/agents/*/flow/*.md` → all flow callers use `code` correctly. `grep` in `docs/agents/tools/list/get_price_history.md` and `docs/agents/tools/package/market-watcher.md` show wrong `ticker`/`tickers` in examples. **0 affected runtime callers.** |
| Suggested fix | Update `docs/agents/tools/list/get_price_history.md` param name `ticker` → `code`. Update `docs/agents/tools/package/market-watcher.md` example (line 145) `tickers: [...]` → `code: "VCB"`. |

### IMPROVE-2 — MEDIUM (NEW): `get_bctc_pending_refine` without `limit` returns 235K chars for 51 items

| Field | Value |
|-------|-------|
| Tool | `get_bctc_pending_refine` |
| Evidence | Raw call `{}` → 235,355 chars, 11,948 lines (51 reports with full `windows[]` arrays). Exceeds max-token guard — response saved to file rather than returned in-context. `refine_bctc_md/flow/main.md` correctly uses `{limit: 1}`. |
| Caller surface | `grep -r 'get_bctc_pending_refine' docs/agents/` → `refine_bctc_md` uses `limit: 1` ✓. Tool doc `docs/agents/tools/list/get_bctc_pending_refine.md` shows `{}` default example — risky for direct callers. |
| Suggested fix | Add server-side default `limit` cap (e.g., 10) when unspecified, to prevent context overflow. Update tool doc default example to always include `limit`. |

### IMPROVE-3 — LOW: `vnstockTradingStatsRefresh` at 85.7% success, avg 10.8 min runtime

| Field | Value |
|-------|-------|
| Tool | `get_cron_health` |
| Evidence | `vnstockTradingStatsRefresh: success_rate=0.86 (85.7%), total_runs=7, avg_duration=649,220ms`. Above 80% threshold but trending toward alert. 10.8 min avg run time is very slow. |
| Impact | Low (not below 80% yet). But a long-running stats job at ~11 min risks overlap with subsequent runs. |
| Suggested fix | Investigate slow path in trading stats refresh. Consider pagination or incremental update instead of full refresh. |

---

## Tool Probe Summary

| Tool | Reachable | Latency | Result |
|------|-----------|---------|--------|
| `get_system_status` | ✅ | fast | Full health data returned — see BUGs/ISSUEs above |
| `get_cycle_bootstrap` | ✅ | 27ms | Requires `agent_name` (all callers pass it correctly — NON-ISSUE) |
| `get_market_snapshot` | ✅ | fast | VN-Index 1824.53 (-0.32%), breadth data fresh |
| `get_macro_snapshot` | ✅ | fast | Works; delta fields null (TE source dark) |
| `get_agent_signals` | ✅ | fast | `from_agent: null` returns all-producer signals ✅ |
| `get_cron_health` | ✅ | fast | 70+ jobs healthy; 2 below 95% (sbvRatesRefreshJob 98.1%, bctcReparseJob 94.5%) |
| `get_vps_service_health` | ✅ | fast | 1 unhealthy (vn-bctc-fetch), 2 idle (market closed), 2 healthy |
| `get_vps_proxy_health` | ✅ | fast | bctc STALE 5 days — confirms BUG-1 |
| `get_sla_status` | ✅ | fast | bctc CRITICAL breach 2.4× |
| `get_earnings_calendar` | ✅ | fast | 41 tickers tracked; 11 QUÁ HẠN |
| `get_pipeline_health` | ✅ | fast | 6 tickers TA not ready (0 rows); 5 oversold signals |
| `get_ism_subcomponents` | ✅ (returns error) | fast | No data — FRED_API_KEY likely missing (BUG-4) |
| `get_market_foreign_flow` | ✅ | fast | 2026-06-19 data, NET BUY |
| `get_watchlist` | ✅ | fast | 41 tickers; 6 N/A (coverage gap not systemic failure) |
| `get_week_period` | ✅ | fast | W25, period 2026-06-15/2026-06-21 |
| `get_market_context` | ✅ | fast | Full market context returned |
| `get_rate_limit_status` | ✅ | fast | 11 sources, all ready, 0 backpressure |
| `task_list_held` | ✅ | fast | 5 locks; cowork-leader-lock active + fresh |
| `get_bctc_pending_refine` | ✅ (oversized) | fast | 51 pending reports, 235K char response without `limit` |
| `get_price_history(code)` | ✅ | fast | Works with `code` param |
| `get_price_history(ticker)` | ❌ | — | Fails — docs drift (0 runtime callers affected) |

---

## Cross-check: `get_recent_fixes` check for BUGs

Before sending Telegram alert (per system-map.json BUG channel rules): confirmed no recent fix covers BUG-1, BUG-3, BUG-4, or IMPROVE-1.
- BUG-1 (vn-bctc-fetch): no fix in `get_cron_health` or prior reports
- BUG-2 (Reuters): unresolved since at least 2026-04-30
- BUG-3 (Trading Economics): unresolved since at least 2026-04-30
- BUG-4 (ISM/FRED): not previously reported

---

_Report generated: 2026-06-21 04:07 UTC_
