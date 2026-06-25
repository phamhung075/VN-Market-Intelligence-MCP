# Team MCP Tool Recheck — 2026-06-22 08:07 UTC

**Run by:** health-recheck agent  
**Probe window:** 2026-06-22 08:02–08:07 UTC (market OPEN)  
**Gateway:** vn-market reachable (all calls via mcp__gateway__call_tool)  
**Prior report:** team-tool-recheck-2026-06-21-*.md  

---

## ACTIVE FINDINGS (re-confirmed this cycle)

| # | Tool / Component | Class | Evidence (probe this cycle) | Caller count | Suggested fix |
|---|---|---|---|---|---|
| B1 | `vn-bctc-fetch` VPS service | **BUG** | `get_vps_service_health` → `unhealthy \| 0ms response \| 5d 14h uptime`. BCTC freshness: 131.4h. `get_bctc_pending_refine` shows VCB/HPG/GVR/HVN stuck PENDING. Work logs show bug #2776 blocking CTG for 35+ cycles. | 3 agents (`refine_bctc_md`, `bctc-analyst`, `dev-pdf-extractor`). Tools blocked: `get_bctc_full`, `get_bctc_page_text`, `get_bctc_page_image`, `push_bctc_refined_unit` | Restart `vn-bctc-fetch` VPS service; investigate why it stays unhealthy with 0ms response despite being "up" 5 days |
| B2 | Reuters RSS source | **BUG** | `get_system_status` → `Reuters RSS \| Ngưng \| Chưa bao giờ \| 80 ⚠` (80 consecutive failures, 0 successful fetches ever recorded). Also `Trading Economics × 2` same pattern. | news-scout (`fetch_and_analyze`), news pipeline (`pollNewsJob`) | Investigate endpoint block / auth change. Consider disabling to stop circuit-breaker noise if unreachable from current IP. |
| I1 | `get_ism_subcomponents` | **ISSUE** | Returns `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob (requires FRED_API_KEY)."}`. No data since at least 2026-06-13. | Callers: `news-scout` (stage-fetch → macro chain), `unified-agent`. Grep: 5+ flow files reference ISM macro layer. | Set `FRED_API_KEY` env var on MCP server, or document as permanently unavailable and remove from agent flows |
| I2 | `get_sector_rotation` 5d N/A | **ISSUE** | Returns `"chỉ có dữ liệu 1 ngày"` (only 1 day available) despite `get_pipeline_health` showing 43 OHLCV rows per ticker. Sector rotation data shows N/A for all 16 sectors' 5d trend. | `market-watcher` cycle flow, `unified-agent` market analysis. 5d trend used for sector rotation signal. | Investigate: `get_sector_rotation` may read from a separate aggregation table not populated by `ohlcv-daily-aggregator`. Check `vnstockTradingStatsRefresh` (85.7% success rate) as possible root cause. |
| I3 | Foreign-flow fallback exhausted | **ISSUE** | `get_system_status` → 10 unresolved errors, all `foreign-flow-job: all fallbacks exhausted` every 1-2 min. `get_foreign_flow("VCB")` shows 4/5 days with 0 net volume (data gap). `vn-foreign-flow` VPS service is healthy (13s ago poll OK) but primary endpoint and all fallbacks fail. | `get_foreign_flow` (market-watcher, unified-agent, alert-commander), `get_market_foreign_flow`. | Diagnose primary foreign-flow endpoint URL; verify fallback sources are still valid. Foreign-flow job may need endpoint update. |
| I4 | `get_cascade_metrics` 0 evaluations | **ISSUE** | All 44 cascade rules: `Eval=0` despite 1,665+ hits total. `cascade-backtest` cron ran 2026-06-21 successfully (100%) but metrics remain 0 evaluated. `Overall accuracy: —`. | `bctc-analyst`, `market-watcher`, `unified-agent` use cascade metrics for signal validation. `get_cascade_outcomes` returns no actionable data. | Investigate why `verdictResolutionJob` (runs every 7min, 313 runs, 100%) isn't writing evaluated outcomes to cascade metrics table |
| I5 | `get_vn_liquidity_state` partial | **ISSUE** | Multiple blocked sub-indicators this cycle: `sjc_price_mn_vnd=0` (no SJC crawler row), `usd_vnd_buy/sell=0`, OMO blocked (HTML parse fail), `interbank_1w` blocked (`dttktt.sbv.gov.vn` unreachable from VPS, 100% packet loss). `sbv_rates` using DB fallback (HTML parse failed). | `market-watcher` EOD, `unified-agent`, `digest-predict`. Liquidity state is a core TNB Layer 4 input. | (a) Add SJC price crawler. (b) Fix OMO HTML parser. (c) Investigate VPS route to dttktt.sbv.gov.vn. |
| I6 | `wti_crude_usd` auto-tracked indicator stale | **ISSUE** | `get_system_status` → `wti_crude_usd: 95.5 (79 data points)`. Current WTI market price ~76-79 USD. The stored value 95.5 is months stale. `brent_crude_usd` fetched live at 79.71 (correct). | Any agent using WTI indicator for macro regime gets wrong signal. Note: `get_macro_snapshot` uses live brent (correct), but `wti_crude_usd` in auto-tracked indicators is stale. | Fix `commodityTrackerRefreshJob` WTI fetch path or rename column to brent_crude_usd to match actual data source |
| I7 | CafeF RSS degraded | **ISSUE** | `get_system_status` → `CafeF RSS \| Suy giảm \| 9 phút trước \| 3` (3 consecutive failures). Observed during market hours (08:03 UTC). CafeF is the primary VN news source. | `fetch_and_analyze` (news-scout). Probe returned 3 articles from cafef successfully, suggesting transient throttle. | Monitor; if failures persist, check rate-limit headers from cafef.vn and add backoff |

---

## RESOLVED (were in prior reports — verified clean this cycle)

| Finding | Prior class | Resolution evidence |
|---|---|---|
| `get_insider_signals` outstandingShares required | BUG (June 17-18) | Re-probe `get_insider_signals(code="FPT")` — returns valid response. SSOT doc shows `outstandingShares` is Optional (default 0). Grep: 13 files, 0 callers pass it as required. Caller-surface verified: 0 affected callers. RESOLVED. |
| `get_agent_signals` `from_agent: null` broken | Suspected issue (this cycle) | Re-probe with `{"from_agent": null, "status": "all", "hours_back": 0.25}` → returns "Tín hiệu cho all-producers (49 tin)". Market-watcher corroboration pattern is valid. NON-ISSUE. |

---

## Tools Probed (smoke-pass, no issues)

| Tool | Result | Notes |
|---|---|---|
| `get_market_snapshot` | PASS | VN-Index 1857.91 +1.83%, live data tier 1 |
| `get_macro_snapshot` | PASS | Live oil/gold/USDVND, tier 2 |
| `get_system_status` | PASS | Full status returned; source of I3/I6/I7 findings |
| `get_cycle_bootstrap` | PASS | Requires `agent_name` param (correct per SSOT) |
| `get_earnings_calendar` | PASS | 41 tickers, Q1-2026 calendar complete |
| `get_cron_health` | PASS | 65 jobs, all 100% except `vnstockTradingStatsRefresh` (85.7%) |
| `get_pipeline_health` | PASS | 35 of 41 tickers TA-ready; 6 tickers (BDI/DAG/DLC/JSH/SIS/VDC) have 0 OHLCV rows |
| `emit_pressure_state` | PASS | Responds with `stale_warning: true` (expected off-cycle) |
| `get_foreign_flow` (with `code`) | PASS | Data sparse (4/5 days = 0) — symptom of I3 above |
| `get_vn_macro_indicators` | PASS | IIP data returned correctly |
| `fetch_and_analyze` | PASS | 3 articles returned from VN sources |
| `get_cascade_metrics` | PASS (data problem) | Tool responds; underlying data issue → I4 |
| `get_vps_service_health` | PASS | Reveals B1 (vn-bctc-fetch unhealthy) |
| `task_list_held` | PASS | 7 locks held; cowork-leader-lock active |
| `get_recent_signals` | PASS | 49 signals from alert-engine (no cowork signals active, expected) |
| `get_bctc_pending_refine` | PASS | Tool works; 5 PDFs PENDING/PARTIAL, blocked by B1 |
| `get_agent_work_log` | PASS | Log history accessible; last news-scout run June 17 |
| `send_telegram` | SCHEMA VERIFIED | Uses `message` param (not `text`) — confirmed correct per SSOT |

---

## Summary

- **1 BUG re-confirmed:** `vn-bctc-fetch` VPS unhealthy (5+ days, blocks BCTC pipeline entirely)
- **1 BUG re-confirmed:** Reuters RSS + Trading Economics permanently dead (80+ failures, 0 successes)
- **6 ISSUEs re-confirmed:** ISM no FRED key, sector_rotation 5d N/A, foreign-flow fallback noise, cascade 0 evaluations, liquidity state partial, WTI indicator stale
- **1 ISSUE new:** CafeF RSS degraded (3 failures, may be transient)
- **2 RESOLVED:** insider_signals outstandingShares (was BUG → RESOLVED), get_agent_signals null probe (NON-ISSUE)
- Gateway transport fully operational; all tool calls routed correctly via `mcp__gateway__call_tool(server="vn-market", ...)`
