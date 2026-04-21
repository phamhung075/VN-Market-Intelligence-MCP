# System Status Dashboard

> **Maintained by:** Dev team (developer + qa agents) — update after every fix, sprint close, or health check.
> **Last updated:** 2026-04-21 (sprint 234 complete, server restarted)
> **How to refresh:** run `get_cron_health`, `get_pipeline_health`, `get_system_status` MCP tools + SSH VPS status check.

---

## 1. VPS Proxy Services (Vinahost Vietnam — geo-block bypass)

| Service | Interval | Status | Last Restart | Notes |
|---------|----------|--------|-------------|-------|
| `vn-news-fetch.service` | 15 min | ✅ running | 2026-04-18 04:48 +07 | TasksMax raised 32→256 (task 1396). Playwright browser source for vneconomy-finance was crashing. |
| `vn-price-fetch.service` | 5 min | ✅ running | 2026-04-17 23:16 +07 | Stable |
| `vn-bctc-fetch.service` | 6 h | ✅ running | 2026-04-17 23:17 +07 | Stable |
| `vn-sbv-fetch.service` | 30 min | ✅ running | 2026-04-17 23:18 +07 | Stable |
| `vn-foreign-flow.service` | 5 min | ✅ running | 2026-04-17 23:19 +07 | Stable |

**SSH health check:** `source .env && sshpass -p "$VINAHOST_PASSWORD" ssh root@$VINAHOST_IP /root/vps-status.sh`

---

## 2. Server Schedulers (local MCP server — `src/scheduler/`)

> Success rate from `get_cron_health(days=7)`. Last checked 2026-04-17.

| Job | Schedule | Success Rate | Last Run | Status | Notes |
|-----|----------|-------------|---------|--------|-------|
| `alertDigestJob` | 14:00 UTC daily | 100% | 2026-04-17 14:00 | ✅ ok | |
| `askQueueCheckJob` | every 3 min | 100% | 2026-04-17 21:24 | ✅ ok | |
| `bbAlertScanJob` | market hours | 100% | 2026-04-17 08:45 | ✅ ok | |
| `bctcOverdueCheckJob` | 02:00 UTC daily | 100% | 2026-04-17 02:00 | ✅ ok | |
| `bctcReparseJob` | hourly | 100% | 2026-04-17 19:02 | ✅ ok | |
| `calibrationReportJob` | weekly | 100% | — | ✅ ok | |
| `cronHealthAlertJob` | 00:00 UTC daily | 75% | 2026-04-17 00:00 | ⚠️ flaky | 1 failure in 4 runs. Intermittent — monitor. |
| `dataAuditJob:daily` | 16:00 UTC daily | 100% | 2026-04-17 16:00 | ✅ ok | |
| `devTeamHeartbeatJob` | hourly | 100% | — | ✅ ok | |
| `eveningSummaryJob` | 15:30 UTC daily | 100% | 2026-04-17 15:30 | ✅ ok | |
| `evidenceAccumulatorJob` | 16:00 UTC daily | 100% | 2026-04-17 16:00 | ✅ ok | |
| `foreignFlowAlertJob` | market close | 100% | 2026-04-17 09:30 | ✅ ok | |
| `franceSummaryJob` | 06:30–08:00 UTC */30 | 100% | 2026-04-17 07:00 | ✅ ok | |
| `insiderCheckJob` | 01:00 UTC daily | 100% | 2026-04-17 01:00 | ✅ ok | |
| `intelligenceCycleJob` | every 30 min | 98% | 2026-04-17 21:30 | ✅ ok | 9 failures in 443 runs — occasional timeout, acceptable. |
| `marketScanJob:close` | 08:30 UTC (market close) | 100% | 2026-04-17 08:30 | ✅ ok | |
| `marketScanJob:open` | 02:00 UTC (market open) | 100% | 2026-04-17 02:00 | ✅ ok | |
| `morningBriefingJob` | 01:00 UTC daily | 100% | 2026-04-17 01:00 | ✅ ok | |
| `ohlcvDailyAggregatorJob` | 16:00 UTC weekdays | 100% | 2026-04-17 | ✅ ok | |
| `ohlcvStartupProbe` | on startup | 100% | — | ✅ ok | |
| `patternWatchJob` | market hours | 100% | — | ✅ ok | |
| `pipelineWatchdogJob` | every 30 min | 98.2% | 2026-04-17 21:30 | ✅ ok | ~3 failures in 168 — acceptable. |
| `pollNewsJob` | on VPS push (~15 min) | ⚠️ stale before 1396 | 2026-04-17 (post-fix) | ✅ fixed | Was never recording — fixed in task 1396: wrapped in `recordJobRun`. |
| `predictionMarketPollJob` | every 30 min | 99.1% | 2026-04-17 21:30 | ✅ ok | |
| `predictionOutcomeJob` | daily | 100% | — | ✅ ok | |
| `predictionResolutionJob` | 16:30 UTC daily | 100% | 2026-04-17 16:30 | ✅ ok | |
| `sscCheckerJob` | 13:00 UTC daily | 100% | 2026-04-17 13:00 | ✅ ok | avg 153s — slow but expected (SSC PDF scan). |
| `summaryJob:daily` | 15:30 UTC daily | 100% | 2026-04-17 15:30 | ✅ ok | |
| `taAlertNotifierJob` | market hours | 100% | 2026-04-17 08:45 | ✅ ok | |
| `taAlertScanJob` | market hours | 100% | 2026-04-17 08:45 | ✅ ok | |
| `vpsProxyWatchdogJob` | every 30 min | 100% | 2026-04-17 08:50 | ✅ ok | observe-only — never restarts VPS. |
| `vpsServiceHealthJob` | every 5 min | 100% | 2026-04-21 21:35 | ✅ ok | NEW — Sprint 234: direct health polling of all 5 VPS services. |
| `freshnessSlaMonitorJob` | every 30 min | 100% | 2026-04-21 21:30 | ✅ ok | NEW — Sprint 234: data freshness SLA validation + escalation. |
| `weatherCheckJob` | 17:00 UTC daily | 94.7% | 2026-04-17 17:00 | ⚠️ flaky | 1 failure in 19. External API timeout — monitor. |
| `weeklyPortfolioReportJob` | Sunday | 100% | — | ✅ ok | |

---

## 3. MCP Tools (103 registered — `src/interface/mcp/tools/`)

> Tools are registered in `src/interface/mcp/tools/registry.ts`. Count tracked in `docs/data/project-stats.json`.
> Last verified: sprint 234, toolCount=103.

| Category | Files | Status | Notes |
|----------|-------|--------|-------|
| Alerts | `alerts.ts`, `alertCheckTools.ts`, `alertMuteTools.ts`, `alertAccuracy.ts`, `priceAlertTools.ts`, `customAlertTools.ts` | ✅ ok | |
| Alert digest | `alertDigestTools.ts` | ✅ ok | Diacritics fixed task 1395 |
| Analysis | `analysis.ts`, `cascadeMetricsTools.ts`, `correlationTools.ts`, `evidenceTools.ts` | ✅ ok | |
| BCTC | `bctcFullTools.ts` | ✅ ok | PDF parse via VPS proxy |
| Broker | `brokerCredibilityTools.ts` | ✅ ok | |
| Calibration | `calibrationTools.ts` | ✅ ok | Diacritics fixed task 1393 |
| Cron health | `cronHealthTools.ts` | ✅ ok | |
| Kinh Dich | `kinhDichTools.ts` | ✅ ok | |
| Market | `marketTools.ts`, `marketContextTools.ts`, `marketMessageTools.ts`, `summaryTools.ts` | ✅ ok | |
| Macro | `macroTools.ts`, `policyTools.ts`, `creditFlowTools.ts` | ✅ ok | |
| Pipeline health | `pipelineHealthTools.ts` | ✅ ok | Added sprint 126 |
| Portfolio | `portfolioTools.ts`, `portfolioRiskTool.ts`, `positionTools.ts`, `targetAllocationTools.ts`, `rebalancingTools.ts`, `performanceTools.ts` | ✅ ok | |
| Prediction | `predictionTools.ts` | ✅ ok | |
| Sector | `sectorComparisonTools.ts`, `sectorRotationTools.ts` | ✅ ok | |
| Signals | `agentSignalTools.ts`, `foreignFlowTools.ts`, `insiderTools.ts`, `sentimentTrendTools.ts`, `technicalIndicatorTools.ts`, `tickerIntelligenceTools.ts` | ✅ ok | |
| Specialty | `climateTools.ts`, `energyTools.ts`, `pharmaTools.ts`, `legalRiskTools.ts`, `supplyChainTools.ts`, `crisisTools.ts`, `bondMaturityTools.ts`, `publicInvestmentTools.ts` | ✅ ok | |
| System | `systemTools.ts`, `rateLimitTools.ts`, `sourceHealthTools.ts`, `dataFreshnessTools.ts`, `vpsProxyTools.ts`, `changelogTools.ts`, `vpsHealthTools.ts`, `slaStatusTools.ts` | ✅ ok | NEW: vpsHealthTools, slaStatusTools (Sprint 234) |
| Telegram | `telegramTools.ts`, `telegramReportTools.ts` | ✅ ok | |
| Watchlist | `watchlist.ts`, `priceHistoryTools.ts` | ✅ ok | |
| Ask queue | `askQueueTools.ts` | ✅ ok | |
| Agent work log | `agentWorkLogTools.ts` | ✅ ok | |
| Search | `searchTools.ts` | ✅ ok | |
| Compare | `compareTools.ts` | ✅ ok | |
| Earnings | `earningsCalendarTools.ts` | ✅ ok | |
| Reports | `reports.ts`, `exportTools.ts` | ✅ ok | |
| Feedback | `feedbackTools.ts` | ✅ ok | |

---

## 4. Known Issues / Watch List

| # | Component | Issue | Severity | Since | Fix |
|---|-----------|-------|----------|-------|-----|
| 1 | `vn-news-fetch.service` | Playwright thread crash on `vneconomy-finance` (browser source) | low | 2026-04-17 | TasksMax raised to 256 (task 1396) — monitor if recurs |
| 2 | `cronHealthAlertJob` | 75% success rate (1 failure in 4 runs) | low | 2026-04-17 | Monitor — likely transient |
| 3 | `weatherCheckJob` | 94.7% success rate | low | 2026-04-17 | External API timeout — monitor |

---

## 5. How to Update This File

After any fix, sprint close, or health anomaly, update the relevant row:
- Change status emoji: `✅ ok` / `⚠️ flaky` / `❌ down`
- Update "Last Run" and "Notes" columns
- Add new issues to section 4, remove resolved ones
- Update "Last updated" header line

**MCP commands to pull fresh data:**
```
get_cron_health(days=7)          — scheduler success rates
get_pipeline_health()            — news pipeline + OHLCV ticker health
get_system_status()              — server health
get_vps_proxy_health()           — VPS proxy status
```
