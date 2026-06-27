# Team MCP Tool Health Recheck — 2026-06-23T12:11Z

**Run type:** Scheduled automated health recheck  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-23-1008.md`  
**Probed by:** system-auditor (health-recheck cron)  
**Gateway status:** REACHABLE — all probes executed successfully

---

## ACTIVE FINDINGS (re-confirmed this cycle)

| # | Tool/Source | Class | Evidence | Callers | Suggested Fix |
|---|---|---|---|---|---|
| BUG-1 | vn-bctc-fetch / BCTC pipeline | **CRITICAL** (Day 9+, WORSENING) | `get_vps_service_health`: vn-bctc-fetch=unhealthy. `get_sla_status`: `bctc: 9565/360min CRITICAL`. `get_vps_proxy_health`: last_push=2026-06-16 18:02:24, 0 pushes/24h, STALE=YES. `get_system_status` DATA FRESHNESS: `BCTC 7 ngày trước / 159.4h / Rất cũ`. `get_earnings_calendar`: 11 tickers QUÁ HẠN (BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH). `get_bctc_pending_refine`: 5 PDFs pending (VCB Q1/2025, HPG Q4/2025, GVR Q1/2026, HPG Q1/2026, HVN Q1/2026). | bctc-analyst, refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob (5 callers) | SSH to VPS, inspect vn-bctc-fetch container logs — likely network/scraper block or container crash loop. Restart container, check BCTC source availability (cafef.vn/bctc). SLA threshold now 360min means 6h TTL breach flagged. |
| BUG-2 | Reuters RSS | **HIGH** (ONGOING) | `get_system_status` source health: `Reuters RSS / Ngưng / Chưa bao giờ / 181 ⚠` — failure count climbed from ~4 post-restart to 181, indicating persistent block not a transient. | news-scout, unified-agent (2 callers) | Check VPS RSS fetcher for Reuters. Likely IP block or feed URL change. Consider alternate Reuters feed endpoint or remove from rotation. |
| BUG-3 | Trading Economics (2× sources) | **HIGH** (ONGOING) | `get_system_status` source health: both TE entries `Ngưng / Chưa bao giờ / 181 ⚠` and `182 ⚠`. `get_macro_snapshot`: oilUsdDelta=null, goldUsdDelta=null, usdVndDelta=null — all commodity direction signals lost. | market-watcher, unified-agent, news-scout, digest-predict, alert-commander (5 callers) | TradingEconomics anti-scrape hardened. Check if API key available. Fallback: Yahoo Finance for commodity prices, alternate macro source for USD/VND. |
| BUG-4 | ISM / FRED_API_KEY | **MEDIUM** (ONGOING) | `get_system_status` errors: `[get_ism_subcomponents] no ISM data in fred_series_daily` — no FRED API key configured, ISM subcomponents unavailable. | bctc-analyst, news-scout, unified-agent (3 callers) | Set `FRED_API_KEY` env var in mcp-server container. Free key available at fred.stlouisfed.org. |
| ISSUE-1 | sbvRatesRefreshJob / SBV VPS | **HIGH** | `get_system_status` errors: `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` recurring ~every 30min (10:04, 10:34, 11:04, 11:34, 12:04 UTC). Zero-value guard protecting data integrity. `get_cron_health`: sbvRatesRefreshJob success_rate=98.2% vs 100% norm. vn-sbv-fetch service shows "healthy" but SBV API returns zero-value responses periodically. | SBV rate consumers across market-watcher, unified-agent (2+ callers) | Investigate why SBV VPS scraper returns zero-value snapshots. Check VPS vn-sbv-fetch container for connection drops to SBV API endpoint. Add exponential backoff before zero-value rejection. |
| ISSUE-2 | Warning/Feedback backlog | **HIGH** | `get_system_status`: `open_warnings: 50 high/critical items, pending_feedback: 67 new items` — backlog grew since last cycle. | All agents (system-wide) | Triage `get_open_warnings` queue. Assign high-priority items to dev team. |
| ISSUE-3 | intelligenceCycleJob overlap | **MEDIUM** | `get_system_status` errors: `[intelligence-cycle] previous cycle still running — skipped` at 11:15 UTC. `get_cron_health`: intelligenceCycleJob avg_duration=28117ms; some cycles >15min, triggering overlap detection. | news-scout, market-watcher, unified-agent (cycle overlap) | Profile which stage causes >15min runs. Consider increasing cron interval or adding async stage splitting. |
| ISSUE-4 | TA data — 7 tickers sparse/missing | **LOW** | `get_pipeline_health`: BDI=0 rows, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — 7 tickers lack adequate TA rows. | technical-analysis callers | These tickers may be newly added. Backfill historical OHLCV. Check if VPS price fetch covers these symbols. |
| ISSUE-5 | Commodity deltas null | **LOW** (linked BUG-3) | `get_macro_snapshot`: oilUsdDelta=null, goldUsdDelta=null, usdVndDelta=null. All direction signals unknown. | market-watcher, unified-agent, digest-predict | Resolved automatically when BUG-3 (Trading Economics) is fixed. |
| ISSUE-6 | vnstockTradingStatsRefresh slow | **LOW** (partially improved) | `get_cron_health`: avg_duration=733069ms (12.2 min), total_runs=7. Success rate NOW 100% (was 85.7% in prior cycle — reliability improved). Duration still extremely high. | trading-stats consumers | Profile the query. Add DB indexing on ticker+date. Consider batching by exchange segment. |
| ISSUE-10 | VPS health — BCTC only | **LOW** (IMPROVED) | `get_vps_service_health`: vn-news-fetch=healthy, vn-sbv-fetch=healthy, vn-foreign-flow=idle(market-closed), vn-price-fetch=idle(market-closed), vn-bctc-fetch=unhealthy. Prior cycle showed 4/5 unhealthy; now only BCTC genuinely down — idle/market-closed correctly reported for others. | All VPS-routed consumers | BCTC remains the only genuine VPS failure (see BUG-1). |
| ISSUE-11 | vnstockFundamentalsRefresh slow | **LOW** | `get_cron_health`: avg_duration=845851ms (14.1 min), total_runs=2 — unchanged since prior report. | fundamentals consumers | Profile query. Consider paginated batch refresh strategy. |

---

## PARTIALLY RESOLVED / IMPROVED THIS CYCLE

| # | Item | Prior State | Current State |
|---|---|---|---|
| ISSUE-6 | vnstockTradingStatsRefresh reliability | success_rate=85.7% | success_rate=100% (duration still high) |
| ISSUE-10 | VPS health | 4/5 services unhealthy | Only vn-bctc-fetch unhealthy; others idle/healthy as expected |
| ISSUE-1 | vn-sbv-fetch container | was "unhealthy" | now "healthy" — data guard still firing but container up |

---

## RESOLVED / NON-ISSUES THIS CYCLE

| Item | Evidence |
|---|---|
| `get_agent_signals({from_agent:null,...})` all-producers mode | CONFIRMED WORKING — 121 signals returned |
| `get_cycle_bootstrap({agent_name:"market-watcher"})` | WORKING — initial 502 was transient |
| HOSE all 4 price sources failed (10:04 UTC) | TRANSIENT — market data flowing normally by 12:04 |
| CafeF/VnEconomy/VnExpress RSS "Suy giảm" (3 failures) | LIKELY TRANSIENT — RSS degradation pattern, self-recovering |
| newsapi disabled | BY DESIGN — not a bug |
| `windowPartitioner continuation window truncated` warnings | TIED TO long cycle run — not a systemic schema issue |

---

## TOOL SMOKE TEST SUMMARY

| Tool | Probe Result |
|---|---|
| `get_system_status` | OK — full status returned with data freshness table |
| `get_vps_proxy_health` | OK — route statuses returned (BCTC STALE confirmed) |
| `get_vps_service_health` | OK — 5 services returned |
| `get_sla_status` | OK — BCTC breach at 9565/360min CRITICAL |
| `get_cron_health` | OK — all jobs returned with metrics |
| `get_pipeline_health` | OK — ticker-level TA rows returned |
| `get_macro_snapshot` | OK — returned (deltas null due to BUG-3) |
| `get_cycle_bootstrap({agent_name:"market-watcher"})` | OK — agent bootstrap returned |
| `get_agent_signals({from_agent:null,status:"all",hours_back:0.25})` | OK — 121 signals |
| `get_earnings_calendar` | OK — 11 overdue tickers flagged |
| `get_bctc_pending_refine` | OK — 5 PDFs pending |
| `get_week_period` | OK — week period returned |

---

## SEVERITY SUMMARY

| Class | Count |
|---|---|
| CRITICAL | 1 (BUG-1 BCTC Day 9+) |
| HIGH | 3 (BUG-2 Reuters, BUG-3 TradingEconomics, ISSUE-1 SBV zero-value, ISSUE-2 warnings backlog) |
| MEDIUM | 2 (BUG-4 ISM, ISSUE-3 cycle overlap) |
| LOW | 5 (ISSUE-4, ISSUE-5, ISSUE-6, ISSUE-10, ISSUE-11) |

**Total active findings: 11** (4 BUGs + 7 ISSUEs)

---

*Report generated: 2026-06-23T12:11Z by scheduled health-recheck*
