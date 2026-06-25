# Team MCP Tool Health Recheck — 2026-06-23T14:10Z

**Run type:** Scheduled automated health recheck  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-23-1211.md`  
**Probed by:** health-recheck agent  
**Gateway status:** REACHABLE — all probes executed successfully

---

## TOOL SMOKE TEST SUMMARY

| Tool | Result | Notes |
|---|---|---|
| `get_system_status` | OK | Full status, 10 unresolved errors logged |
| `get_cycle_bootstrap({agent_name:"market-watcher"})` | OK | Required param; bare call returns schema error |
| `get_macro_snapshot` | OK | source_tier=2, deltas null (BUG-3) |
| `get_market_snapshot` | OK | VN-Index 1869.04 +0.60%, breadth 95↑/208↓ |
| `get_cron_health` | OK | All jobs returned; sbvRatesRefreshJob=98.2% |
| `get_pipeline_health` | OK | TA rows per ticker; 7 tickers not ready |
| `get_sla_status` | OK | 2 breached: bctc CRITICAL, news HIGH (transient) |
| `get_vps_proxy_health` | OK | bctc STALE (Day 10+), all others ok |
| `get_recent_fixes` | OK | 20 fixes returned |
| `get_ism_subcomponents` | FAIL | `no_data` — FRED_API_KEY missing; HTTP 400 NAPMBI |

---

## ACTIVE FINDINGS (all re-confirmed this cycle)

| # | Tool/Source | Class | Evidence (this cycle) | Delta vs 12:11Z | Callers | Suggested Fix |
|---|---|---|---|---|---|---|
| BUG-1 | BCTC pipeline / vn-bctc-fetch VPS | **CRITICAL** (Day 10+, WORSENING) | `get_vps_proxy_health`: bctc last_push=2026-06-16 18:02:24, 0 pushes/24h, STALE=YES. `get_sla_status`: bctc 9682/360min CRITICAL. `get_system_status` FRESHNESS: `BCTC 7 ngày trước / 161.4h / Rất cũ`. | Was 9565 min → now 9682 min (+117 min). Failure entering Day 10. | bctc-analyst, refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob | SSH to VPS, inspect vn-bctc-fetch container logs. Restart container, verify cafef.vn/bctc scraper reachable. Structural fix: health alert if vn-bctc-fetch shows 0 pushes >2h. |
| BUG-2 | Reuters RSS | **HIGH** (ONGOING, WORSENING) | `get_system_status` source health: `Reuters RSS / Ngưng / Chưa bao giờ / 200 ⚠`. | Was 181 failures → now 200. Persistent IP block / feed URL change confirmed. | news-scout, news pipeline (2+ callers) | Check RSS feed URL validity. Consider removing from rotation or switching to alternate Reuters feed endpoint. |
| BUG-3 | Trading Economics (2× sources) | **HIGH** (ONGOING, WORSENING) | `get_system_status`: both TE entries `Ngưng / Chưa bao giờ / 200 ⚠` and `201 ⚠`. `get_macro_snapshot`: oilUsdDelta=null, goldUsdDelta=null, usdVndDelta=null. | Was 181/182 → now 200/201. All commodity direction signals remain lost. | market-watcher, unified-agent, news-scout, digest-predict, alert-commander (5 callers) | TE anti-scrape hardened. Explore API key path. Fallback: Yahoo Finance for commodity deltas, alternate macro source for USD/VND. |
| BUG-4 | ISM / FRED_API_KEY | **MEDIUM** (ONGOING) | `get_ism_subcomponents`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows ... requires FRED_API_KEY"}`. `get_system_status` errors: `[fredIsmSubcomponents] all 3 retries exhausted for NAPMBI — giving up — HTTP 400 Bad Request`. | UNCHANGED. HTTP 400 confirms key absent (empty key → 400 from FRED endpoint). | bctc-analyst, news-scout, unified-agent (3 callers) | Set `FRED_API_KEY` env var in mcp-server container. Free key at fred.stlouisfed.org. Register NAPMBI series too. |
| ISSUE-1 | sbvRatesRefreshJob / SBV zero-value guard | **HIGH** (ONGOING) | `get_system_status` errors: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 12:34, 13:04, 13:34 UTC (every 30 min). `get_cron_health`: sbvRatesRefreshJob success_rate=98.2%. `get_vps_proxy_health`: sbv last_push=13:34:26 UTC, 28 pushes/24h, no errors → VPS healthy, zero values coming from source. | UNCHANGED. Zero-value guard firing on every 30-min sbv refresh cycle. VPS container "healthy" but SBV API returning zero-value payload intermittently. | SBV rate consumers: market-watcher, unified-agent (2+ callers) | Investigate SBV API response when zero-value occurs (log raw payload). Add retry with backoff before rejecting. Check for SBV API session expiry / auth token rotation. |
| ISSUE-2 | Warning/Feedback backlog | **HIGH** (ONGOING) | `get_system_status`: `pending_feedback: 67 new items`, `open_warnings: 50 high/critical items`. | UNCHANGED. | System-wide | Triage `get_open_warnings` queue. Assign high-priority items to dev team for review. |
| ISSUE-3 | Cron job overlap — intelligence-cycle + alertDigestJob | **MEDIUM** (ONGOING, SCOPE EXTENDED) | `get_system_status` errors: `[intelligence-cycle] previous cycle still running — skipped` at 12:30, 13:45 UTC. `[alertDigestJob] already running — skipping` at 14:00 UTC. `get_cron_health`: intelligenceCycleJob avg_duration=27967ms; alertDigestJob avg_duration=2178ms. | Prior report noted intelligenceCycle only. This cycle confirms alertDigestJob also overlapping. Both use same overlap-detection pattern. | news-scout, market-watcher, unified-agent (intelligenceCycle); all downstream of daily digest | Profile slow intelligenceCycle stages. Increase cron interval or add async splitting. For alertDigestJob, check if prior run is hung rather than just slow. |
| ISSUE-4 | TA data — 7 tickers sparse/missing | **LOW** (UNCHANGED) | `get_pipeline_health`: BDI=0 rows, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows. | UNCHANGED. | technical-analysis callers | Backfill historical OHLCV for these tickers. Verify VPS price fetch covers them. |
| ISSUE-5 | Commodity direction deltas null | **LOW** (linked BUG-3) | `get_macro_snapshot`: oilUsdDelta=null, goldUsdDelta=null, usdVndDelta=null, all directions=unknown. | UNCHANGED. Downstream of BUG-3 (TE sources dead). | market-watcher, unified-agent, digest-predict | Resolves when BUG-3 fixed. |
| ISSUE-6 | vnstockTradingStatsRefresh slow | **LOW** (ONGOING) | `get_cron_health`: avg_duration=733069ms (12.2 min), total_runs=7, success_rate=100%. | UNCHANGED. Duration stable but still very high. | trading-stats consumers | Profile query. Add DB indexes on ticker+date. Consider exchange-segment batching. |
| ISSUE-10 | VPS — BCTC only unhealthy | **LOW** (ONGOING) | `get_vps_proxy_health`: prices/news/sbv all ok; bctc STALE (0 pushes/24h). | UNCHANGED. Only bctc remains genuinely down. | BCTC pipeline callers | See BUG-1 fix. |
| ISSUE-11 | vnstockFundamentalsRefresh slow | **LOW** (ONGOING) | `get_cron_health`: avg_duration=845851ms (14.1 min), total_runs=2. | UNCHANGED. | fundamentals consumers | Profile query. Paginated batch strategy. |

---

## TRANSIENT / NON-ISSUES THIS CYCLE

| Item | Evidence | Classification |
|---|---|---|
| News SLA breach 45/30min | `get_sla_status`: news 45/30min HIGH. BUT `get_vps_proxy_health`: news last_push=14:00:02 UTC, 132 pushes/24h, ok. Gap is measurement artifact, not pipeline failure. | TRANSIENT — self-clearing |
| CafeF/VnEconomy/VnExpress RSS "Suy giảm" (1 failure each) | Pattern from system_status — intermittent; all three had fresh pushes within minutes. | TRANSIENT |
| newsapi disabled | By design. | NON-ISSUE |
| `get_cycle_bootstrap` without `agent_name` → schema error | Expected behavior — agent_name is required param (`'news-scout' | 'financial-analyst' | 'market-watcher' | ...`). Flow files call it correctly. | NON-ISSUE (callers use correct pattern) |

---

## SEVERITY SUMMARY

| Class | Count | Change vs 12:11Z |
|---|---|---|
| **CRITICAL** | 1 (BUG-1 BCTC Day 10+) | Worsening (+117 min) |
| **HIGH** | 4 (BUG-2 Reuters, BUG-3 TradingEconomics, ISSUE-1 SBV zero-value, ISSUE-2 backlog) | UNCHANGED |
| **MEDIUM** | 2 (BUG-4 ISM, ISSUE-3 cycle overlap — scope extended to alertDigestJob) | UNCHANGED |
| **LOW** | 5 (ISSUE-4, ISSUE-5, ISSUE-6, ISSUE-10, ISSUE-11) | UNCHANGED |

**Total active findings: 12** (4 BUGs + 8 ISSUEs)  
**Resolved this cycle: 0**

---

## KEY ESCALATION NOTE

BUG-1 (BCTC) has now been unresolved for **10 days** (last push: 2026-06-16T18:02Z). The `get_earnings_calendar` data from the prior cycle showed 11 tickers OVERDUE (BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH) with no Q1/2026 BCTC. The bctc-analyst and refine_bctc_md agents are fully blocked on new financial data. This warrants immediate dev attention via SSH to VPS to inspect vn-bctc-fetch container logs.

---

*Report generated: 2026-06-23T14:10Z by scheduled health-recheck*
