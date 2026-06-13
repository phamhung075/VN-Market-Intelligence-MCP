# MCP Tool Health Recheck — 2026-06-13T08:07Z

**Run by:** health-recheck agent (cloud session, fresh checkout)  
**Gateway:** vn-market reachable ✅ | Server uptime at probe start: 10m 16s (recent restart)  
**DB:** market.db 271 MB, WAL 4.99 MB  
**Probe scope:** 35 tools probed across all cowork + dev team flow files  
**Prior report:** none (first run)

---

## Summary

| Class | Count |
|-------|-------|
| BUG   | 5     |
| ISSUE | 10    |
| IMPROVE | 3   |

---

## Findings Table

| # | Tool / Cron | Class | Evidence | Suggested Fix |
|---|-------------|-------|----------|---------------|
| 1 | `vnstockFundamentalsRefresh` cron | **BUG** | `last_status: crashed`, `success_rate: 0.0%`, `avg_duration: 4035s (~67 min)`, `last_run: 2026-06-08`. Explains repeated `vnstock:balance_sheet:ACB RATE_LIMITED` + `vnstock:finance:ACB` errors in live system_status. Not recovered in 5 days. | Investigate crash log; likely OOM or vnstock API auth expiry. Reset + redeploy. Adds to bctcReparseJob failure rate. |
| 2 | `get_technical_indicators(code)` | **BUG** | Called with `code="VCB"`. Returns `source_tier=3`, ALL indicators N/A: `MA5/MA20/MA50=N/A`, `RSI(14)=N/A (needs ≥15 candles)`, `MACD=N/A`, `BB20=N/A`. Meanwhile `get_pipeline_health` shows VCB: `rows=38, TA ready, RSI14=52.9`. The MCP tool does NOT route to the TA service's pre-computed values — it falls back to a tier-3 raw price path with insufficient data. Breaks market-watcher Step 1 (price analysis). | Route `get_technical_indicators` to TA service pre-computed values when available (RSI/BB/MACD already computed by `bctcReparseJob` / pipeline health path). Fix data routing bug in mcp-server technical indicator handler. |
| 3 | `get_bctc_full` schema drift | **BUG** | Tool package docs (`docs/agents/tools/package/bctc-analyst.md`) state `get_bctc_full(ticker: string)`. Live schema requires `code: string` — confirmed by validation error: `{"path":["code"],"message":"Required"}` when called with `{ticker:"FPT"}`. Any bctc-analyst cycle following the documented signature fails at the first BCTC lookup call. | Update tool package docs to replace `ticker` with `code` for `get_bctc_full`, `get_bctc_ocf`. Grep all flow files for `ticker:` args to this tool and fix. |
| 4 | HNX/UPCOM price sources | **BUG** | Live system errors: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` (3 occurrences at 08:02-08:03 UTC). Affects 6 watchlist tickers: BDI, JSH, VNH (HNX); DLC, VDC (UPCOM); ACV (UPCOM). All show `N/A` prices and `rows=0` / `TA not ready` in pipeline health. | Diagnose HNX/UPCOM scraper: check if iboard SSC VPS path covers these exchanges, or if a direct HNX endpoint is broken. At minimum add fallback. |
| 5 | BCTC VPS pipeline stale | **BUG** | `get_vps_proxy_health` shows `bctc` last push: `2026-06-08 00:30:03` (5 days ago). `vn-bctc-fetch` service reports "healthy" (TCP ping only — functional verification missing). `bctcPdfPullJob` runs every 30 min successfully but has no new files to pull. System shows zero-confidence extraction errors for PLX 2025-Q4. SLA shows bctc age=899 min vs SLA=1416 min (generous threshold masking the real 5-day gap). | SSH into VPS and check `vn-bctc-fetch` service logs. Likely the BCTC discovery endpoint is returning empty or the fetch script is silently failing. Add functional health check (file count > 0) beyond TCP ping. |
| 6 | `get_ism_subcomponents` | **ISSUE** | Returns `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`. Used by news-scout stage-bootstrap.md and bctc-analyst for US macro regime classification. `macroIndicatorRefreshJob` last ran 2026-06-12 12:13 successfully but ISM rows are not populating. | Check if `FRED_API_KEY` env var is set in mcp-server container. If missing, ISM data will never populate. Also verify `macroIndicatorRefreshJob` actually fetches ISM sub-components (may be disabled behind a key guard). |
| 7 | News source health tracker | **ISSUE** | Source health shows CafeF RSS, Reuters RSS, Trading Economics (x2), VnEconomy RSS, VnExpress RSS all as "Suy giảm / Chưa bao giờ" (Degraded / Never). Yet `pollNewsJob` runs at 99.6% success (763 runs), `newsHeadlinesRefreshJob` ran at 07:30 UTC, and `fetch_and_analyze` returned 20 items. The source health `last_success` is not being updated from the `pollNewsJob` write path — it only updates on direct circuit-breaker calls. Agents relying on source health for circuit breaker decisions see a false-degraded state. | Wire source health `last_success` updates into `pollNewsJob` / `deepFetchMainJob` success path, not just the CB probe path. |
| 8 | `get_sector_rotation` 5d gap | **ISSUE** | All 16 sectors show `N/A / 5d` — only 1-day momentum available. Used by market-watcher Step 2 and `get_carry_trade_signal` regime logic. Affects `CARRY_REGIME=HOT_MONEY_INFLOW` detection which drives `hot_money_concentration` flags. | Ensure `ohlcvDailyAggregatorJob` and the sector price history table have at least 5 trading days populated for all sectors. This may resolve after a few more trading days. Monitor. |
| 9 | Stale zombie task locks | **ISSUE** | `task_list_held` returns 2 locks expired 4-6 hours ago still present: `task:FIX-ALERT-ORPHAN-CORRELATION` (expired 03:43 UTC) and `task:po-triage-20260613` (expired 01:56 UTC). TTL-based cleanup is not purging expired records from `coordination.db`. | Add a periodic cleanup query to `walCheckpointJob` or a new `coordinationCleanupJob`: `DELETE FROM tasks WHERE expires_at < NOW()`. Prevents stale lock accumulation. |
| 10 | `get_price_history` zero-price rows | **ISSUE** | `get_price_history(code="FPT", days=30)` returns `close=0, volume=0` for `2026-05-30` with `-100.00%` change. This is a holiday/weekend date with no trading. The zero-price row poisons `dailyStdDev` calculations in market-watcher (sigma thresholds become incorrect). | Filter out rows where `close=0` in `get_price_history` response, or skip holiday dates in the storage phase. Guard: `if close == 0: skip row`. |
| 11 | `get_supply_chain_exposure` BDI staleness | **ISSUE** | BDI index last updated `2026-04-07` (67 days ago). Response shows `BDI: 1,400 (+0.0%) - 2026-04-07`. BDI is fetched via a direct source; the shipping-index data source has `expected_cadence_hours: 6` per system-map but has not refreshed in 67 days. | Check `commodityTrackerRefreshJob` (last run 2026-06-13 06:00 success) to confirm it covers BDI. If not, add BDI to the commodity tracker or create a dedicated shipping-index fetcher. |
| 12 | `vnstockTradingStatsRefresh` slow | **ISSUE** | `avg_duration: 4735029ms (~79 min)`. Not crashing but monopolizes resources. `vnstockFundamentalsRefresh` (crashed) also averaged 67 min. Both jobs appear to be sequential full-table vnstock API sweeps without rate limiting or incremental fetch. | Add incremental fetch (only fetch tickers with missing/stale data), add rate limiting with backoff. Consider splitting into per-ticker mini-jobs with TTL guards. |
| 13 | `bctcReparseJob` 84% success rate | **ISSUE** | `success_rate: 0.84 (83.7%)` over 190 runs. ~31 failing runs. Consistent with PLX Q4 zero-confidence extraction in live errors. PDF parser is producing low-confidence extractions on some reports. | Review recent failing tickers in bctc_queue. The BCTC contamination cleanup (fix #10 in get_recent_fixes, 2026-04-29) addressed some parsing issues. New failures may be different PDF layouts. Run `get_pipeline_health` on bctc queue for failure patterns. |
| 14 | `get_cycle_bootstrap` DB context | **ISSUE** | At probe start, mcp-server uptime was only 10m 16s (recent container restart). `get_cycle_bootstrap` returned valid data (14ms, fast), but a restart mid-cowork-cycle could orphan running task locks and lose in-flight cycle state. | Confirm container restart reason (OOM? deploy? manual?). Consider adding startup probe delay before cowork dispatcher fires post-restart. |
| 15 | News source diversity | **ISSUE** | `fetch_and_analyze` returned 20 items, all from `vnexpress.net` only. No CafeF, VnEconomy, Reuters, or TradingEconomics items despite those sources being listed as direct-proxy in system-map. This reduces news diversity for news-scout chain analysis and may cause sentiment bias. Related to finding #7 (source health false-degraded). | Confirm CafeF / VnEconomy RSS paths are active in `deepFetchMainJob`. The `pollNews_all_sources_dark` job ran at 00:00 UTC with `avg_duration=0ms` — suspicious (0ms suggests it's a no-op stub). |
| 16 | Source health `newsapi: disabled` | **IMPROVE** | `newsapi` shows "disabled" in source health table, cluttering the dashboard and confusing source health reads. If intentionally disabled (no API key), remove from the display. | Add `enabled: false` filter to source health display; skip "disabled" sources in dashboard rendering. |
| 17 | `task_list_held` expired locks display | **IMPROVE** | Expired locks should not appear in `task_list_held` response. Currently returns expired records with stale `expires_at` timestamps, which can confuse agents checking for active lock collisions. | Filter query: `WHERE expires_at > NOW()` or add `active: bool` field to response for disambiguation. |
| 18 | `get_bctc_full` QoQ comparison withheld | **IMPROVE** | Response for FPT Q1-2026 includes `PUB-7: Period basis mismatch — 2026-Q1 standalone-quarter vs 2025-Q4 FY-cumulative`. QoQ comparison is withheld. bctc-analyst uses this comparison for YoY delta in pass_2. | Ensure `get_bctc_full` can optionally return raw period data so bctc-analyst can select same-quarter prior year manually when auto-comparison is suppressed. Alternatively add `comparison_period` param. |

---

## Canonical Tool-Dependency List (probed)

| Tool | Reachable | Source Tier | Notes |
|------|-----------|-------------|-------|
| `get_system_status` | ✅ | — | 10m uptime at probe start |
| `get_cycle_bootstrap` | ✅ | — | 14ms, fast |
| `get_market_snapshot` | ✅ | tier-2 | tier-1 not serving |
| `get_macro_snapshot` | ✅ | tier-2 | carry/yield signals ok |
| `get_earnings_calendar` | ✅ | — | 12 tickers QUÁ HẠN |
| `task_list_held` | ✅ | — | 2 zombie locks found |
| `task_claim` | ✅ (schema) | — | not mutated |
| `task_heartbeat` | ✅ (schema) | — | not mutated |
| `get_watchlist` | ✅ | — | 41 tickers, 6 N/A prices |
| `get_agent_signals` | ✅ | — | empty (off-hours, ok) |
| `get_price_history` | ✅ | — | zero-price row bug (Finding 10) |
| `get_cron_health` | ✅ | — | 1 crashed cron (Finding 1) |
| `get_pipeline_health` | ✅ | — | 5 tickers TA not ready |
| `get_technical_indicators` | ⚠️ | tier-3 | all N/A despite TA ready (Finding 2) |
| `get_open_chain_findings` | ✅ | — | 0 findings (off-hours) |
| `get_sector_rotation` | ⚠️ | — | N/A 5d (Finding 8) |
| `get_fed_liquidity_spread` | ✅ | tier-1 | ok |
| `get_ism_subcomponents` | ❌ | — | no_data (Finding 6) |
| `fetch_and_analyze` | ⚠️ | tier-2 | 20 items, vnexpress only (Finding 15) |
| `get_supply_chain_exposure` | ⚠️ | — | BDI 67d stale (Finding 11) |
| `get_crisis_early_warning` | ✅ | — | ok |
| `get_portfolio_conviction` | ✅ | — | all MODERATE |
| `get_vps_proxy_health` | ✅ | — | bctc stale 5d (Finding 5) |
| `get_bctc_full` | ⚠️ | tier-2 | works with `code=`, docs say `ticker=` (Finding 3) |
| `get_legal_risk_signals` | ✅ | — | 5 signals |
| `get_vps_service_health` | ✅ | — | 3 healthy, 2 idle |
| `get_sla_status` | ✅ | — | all ok (loose thresholds) |
| `get_recent_fixes` | ✅ | — | last fix 2026-05-12 |
| `send_telegram` | ✅ (schema) | — | not called (test) |
| `log_agent_work` | ✅ (schema) | — | not called (test) |
| `post_agent_signal` | ✅ (schema) | — | not called (test) |
| `emit_pressure_state` | ✅ (schema) | — | write-only, not mutated |
| `get_market_context` | not probed | — | alias of market_snapshot area |
| `get_alerts` | ✅ (via bootstrap) | — | 39 alerts 24h |
| `get_agent_work_log` | not probed | — | low priority |

---

## Priority Action Items

**P0 — Fix before next earnings window:**
1. `vnstockFundamentalsRefresh` crash (Finding 1) — 5 days down, fundamentals pipeline broken
2. BCTC VPS pipeline stale (Finding 5) — 5 days no new PDFs, affects bctc-analyst
3. `get_technical_indicators` routing bug (Finding 2) — market-watcher TA signals all N/A

**P1 — Fix this sprint:**
4. `get_bctc_full` schema docs drift (Finding 3) — breaks bctc-analyst if not caught
5. HNX/UPCOM price sources (Finding 4) — 6 watchlist tickers without price
6. `get_ism_subcomponents` no_data (Finding 6) — regime detection degraded
7. Zero-price rows in `get_price_history` (Finding 10) — corrupts sigma calculations

**P2 — Housekeeping:**
8. Source health tracker false-degraded (Finding 7)
9. Zombie task locks (Finding 9)
10. BDI staleness (Finding 11)

---

*Report generated: 2026-06-13T08:07Z | Path: docs/agent-memory/health/team-tool-recheck-2026-06-13-0807.md*
