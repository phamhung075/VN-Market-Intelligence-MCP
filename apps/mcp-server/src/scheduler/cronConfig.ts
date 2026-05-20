/**
 * cronConfig.ts — CRONS schedule map (task 1406e)
 *
 * Pure configuration. No imports from scheduler jobs or infrastructure.
 * All values read from Bun.env with fallback defaults.
 * Zero side-effects at module load time.
 */

export const CRONS = {
  morningBriefing:        Bun.env.CRON_MORNING_BRIEFING          ?? '0 8 * * 1-5',
  marketOpen:             Bun.env.CRON_MARKET_OPEN               ?? '0 9 * * 1-5',
  intelligenceCycle:      Bun.env.CRON_INTELLIGENCE_CYCLE         ?? '*/15 * * * *',
  marketClose:            Bun.env.CRON_MARKET_CLOSE               ?? '30 15 * * 1-5',
  sscCheck:               Bun.env.CRON_SSC_CHECK                  ?? '0 20 * * *',
  alertDigest:            Bun.env.CRON_ALERT_DIGEST               ?? '0 21 * * 1-5',
  eveningSummary:         Bun.env.CRON_EVENING_SUMMARY            ?? '30 22 * * 1-5',
  dataAuditDaily:         Bun.env.CRON_DATA_AUDIT_DAILY           ?? '0 23 * * *',
  weeklyPortfolioReport:  Bun.env.CRON_WEEKLY_PORTFOLIO_REPORT    ?? '0 23 * * 0',
  dataAuditWeekly:        Bun.env.CRON_DATA_AUDIT_WEEKLY          ?? '0 1 * * 0',
  predictionMarketPoll:   Bun.env.CRON_PREDICTION_MARKET_POLL     ?? '*/30 * * * *',
  /** Typhoon season (Jun-Nov): every 6h. Off-season: every 12h. task 261 */
  weatherCheck:           Bun.env.CRON_WEATHER_CHECK              ?? '0 */6 * * *',
  /** DAV drug approval check: 1st of each month at 06:00 GMT+7 (Sprint 044) */
  davPharmacyCheck:       Bun.env.CRON_DAV_CHECK                  ?? '0 6 1 * *',
  /** BCTC overdue check: daily 09:00 GMT+7 (task 1018 slice 3) */
  bctcOverdueCheck:       Bun.env.CRON_BCTC_OVERDUE_CHECK         ?? '0 9 * * *',
  /** BCTC stranded-PDF auto-reparse: daily 09:30 GMT+7 (task 1019 slice 2) */
  bctcReparseJob:         Bun.env.CRON_BCTC_REPARSE_JOB           ?? '30 9 * * *',
  /** BCTC queue enricher: every 15 min (task 1287) */
  bctcQueueEnricher:      Bun.env.CRON_BCTC_QUEUE_ENRICHER        ?? '*/15 * * * *',
  /** BCTC PDF pull: every 30 min — MCP downloads PDFs from VPS cache (feat/bctc-pull-pdf) */
  bctcPdfPull:            Bun.env.CRON_BCTC_PDF_PULL               ?? '*/30 * * * *',
  /** /ask queue check: every 12 min — signal 07-qa-responder when pending (task 1074) */
  askQueueCheck:          Bun.env.CRON_ASK_QUEUE_CHECK             ?? '*/12 * * * *',
  /** SQLite WAL checkpoint: every 30min FULL (live hours) + TRUNCATE+backup at 03-05 UTC (task 1329a) */
  walCheckpoint:          Bun.env.CRON_WAL_CHECKPOINT             ?? '*/30 * * * *',
  /** Periodic summary — daily: 22:30 every day (task 1023) */
  summaryDaily:           Bun.env.CRON_SUMMARY_DAILY              ?? '30 22 * * *',
  /** Periodic summary — weekly: 23:00 every Sunday (task 1023) */
  summaryWeekly:          Bun.env.CRON_SUMMARY_WEEKLY             ?? '0 23 * * 0',
  /** Periodic summary — monthly: 00:30 on the 1st (task 1023) */
  summaryMonthly:         Bun.env.CRON_SUMMARY_MONTHLY            ?? '30 0 1 * *',
  /** Periodic summary — quarterly: 01:00 on Jan/Apr/Jul/Oct 1st (task 1023) */
  summaryQuarterly:       Bun.env.CRON_SUMMARY_QUARTERLY          ?? '0 1 1 1,4,7,10 *',
  /** Periodic summary — yearly: 02:00 on Jan 2nd (task 1023) */
  summaryYearly:          Bun.env.CRON_SUMMARY_YEARLY             ?? '0 2 2 1 *',
  /** Weekly pattern watch: Sunday 22:30 GMT+7 (task 146) */
  patternWatch:           Bun.env.CRON_PATTERN_WATCH              ?? '30 22 * * 0',
  /** Dev team weekly heartbeat: Sunday 07:00 UTC (task 245) */
  devTeamHeartbeat:       Bun.env.CRON_DEV_TEAM_HEARTBEAT         ?? '0 7 * * 0',
  /** Prediction market outcome validation: Sunday 08:00 UTC (task 248) */
  predictionOutcome:      Bun.env.CRON_PREDICTION_OUTCOME         ?? '0 8 * * 0',
  /** VPS proxy watchdog: every 10 min during VN market hours (Mon-Fri 02:00-08:59 UTC) */
  vpsProxyWatchdog:       Bun.env.CRON_VPS_PROXY_WATCHDOG         ?? '*/10 2-8 * * 1-5',
  /** Cron health alert: daily 00:00 UTC (07:00 GMT+7) — task 1103 */
  cronHealthAlert:        Bun.env.CRON_HEALTH_ALERT                ?? '0 0 * * *',
  /** Evidence accumulator: daily 23:00 VN = 16:00 UTC — task 1118, Sprint 057 Phase A */
  evidenceAccumulator:    Bun.env.CRON_EVIDENCE_ACCUMULATOR        ?? '0 16 * * *',
  /** Base rate recomputation: weekly Sunday 19:00 UTC = 02:00 VN Monday — task 1122, Sprint 059 */
  baseRateComputation:    Bun.env.CRON_BASE_RATE_COMPUTATION       ?? '0 19 * * 0',
  /** Prediction resolution: daily 16:30 UTC (after VN market close 15:30 VN) — task 1125, Sprint 059 */
  predictionResolution:   Bun.env.CRON_PREDICTION_RESOLUTION       ?? '30 16 * * *',
  /** Calibration report: Sunday 13:00 UTC (20:00 VN) — task 1128, Sprint 060 */
  calibrationReport:      Bun.env.CRON_CALIBRATION_REPORT          ?? '0 13 * * 0',
  /** Foreign flow alert: 08:13 UTC (15:13 VN) weekdays — task 1133, Sprint 061; moved 09:30→08:13 by Sprint 1949-T6 (EOD chef reads at 08:37, 24min window) */
  foreignFlowAlert:       Bun.env.CRON_FOREIGN_FLOW_ALERT          ?? '13 8 * * 1-5',
  /** Insider SSC disclosure check: daily 01:00 UTC (08:00 VN) Mon-Sun — task 1143, Sprint 063 */
  insiderCheck:           Bun.env.CRON_INSIDER_CHECK               ?? '0 1 * * *',
  /** Pipeline watchdog: every 30 min 24/7 — task 1190, Sprint 076 */
  pipelineWatchdog:       Bun.env.CRON_PIPELINE_WATCHDOG            ?? '*/30 * * * *',
  /** France morning summary: every 30 min 06:00-08:59 UTC Mon-Fri — task 1349, Sprint 117
   *  Widened from single-point '0 7 * * 1-5' to survive server restarts during active dev.
   *  Dedup guard (alreadySentToday) in franceSummaryJob.ts prevents duplicate sends. */
  franceSummary:          Bun.env.CRON_FRANCE_SUMMARY               ?? '*/30 6-8 * * 1-5',
  /** taAlertScan — every 15min VN market hours (task 1307) */
  taAlertScan:            Bun.env.CRON_TA_ALERT_SCAN                 ?? '*/15 2-8 * * 1-5',
  /** bbAlertScan — every 15min VN market hours (task 1309) */
  bbAlertScan:            Bun.env.CRON_BB_ALERT_SCAN                  ?? '*/15 2-8 * * 1-5',
  /** taAlertNotifier — deliver unnotified TA alerts to market channel every 15min VN market hours (task 1314) */
  taAlertNotifier:        Bun.env.CRON_TA_ALERT_NOTIFIER               ?? '*/15 2-8 * * 1-5',
  /** signalOutcomeJob — resolve agent_signals outcomes daily at 08:30 UTC (task 1382) */
  signalOutcomeJob:       Bun.env.CRON_SIGNAL_OUTCOME_JOB               ?? '30 8 * * 1-5',
  /** ohlcvDailyAggregator — aggregate intraday ticks into daily_ohlcv at 15:00 UTC (22:00 VN) Mon-Fri (task 1375, Sprint 130)
   *  Shifted from 16:00 → 15:00 UTC: runs 30 min before eveningSummary (15:30 UTC = 22:30 VN),
   *  ensuring taSummary is populated in the evening report. */
  ohlcvDailyAggregator:   Bun.env.CRON_OHLCV_DAILY_AGGREGATOR          ?? '0 15 * * 1-5',
  /** ohlcvStalenessCheck — daily OHLCV staleness check at 08:15 UTC Mon-Fri (task 1465, Sprint 175)
   *  Fires after VN market open data push window. Alerts WORK if >50% watchlist tickers
   *  are missing from daily_ohlcv for the current VN date. Covers mid-day VPS outage. */
  ohlcvStalenessCheck:    Bun.env.CRON_OHLCV_STALENESS_CHECK            ?? '15 8 * * 1-5',
  /** cascadeBacktest — daily backtest: fills price_impact_3d/7d/outcome_correct on cascade_rule_hits rows >3d old (task 1505, Sprint 192) */
  cascadeBacktest:        Bun.env.CRON_CASCADE_BACKTEST                  ?? '30 20 * * *',
  /** priceUpdateWatchdog — price staleness detection at 6h threshold (task 229, Sprint 229)
   *  Every 10 min during VN market hours (Mon-Fri 02:00-08:59 UTC). Early-warning layer
   *  (separate from 45-min VPS watchdog) to catch price pipeline failures and alert user. */
  priceUpdateWatchdog:    Bun.env.CRON_PRICE_UPDATE_WATCHDOG             ?? '*/10 2-8 * * 1-5',
  /** vpsServiceHealth — VPS service health polling every 5 min (task 234) */
  vpsServiceHealth:       Bun.env.CRON_VPS_SERVICE_HEALTH                 ?? '*/5 * * * *',
  /** vnIndexRefresh — VNINDEX upsert every 5 min during VN market hours — task 1397 */
  vnIndexRefresh:         Bun.env.CRON_VN_INDEX_REFRESH                   ?? '*/5 2-8 * * 1-5',
  /** freshnessSlaMonitor — data freshness SLA check every 30 min (task 234) */
  freshnessSlaMonitor:    Bun.env.CRON_FRESHNESS_SLA_MONITOR              ?? '*/30 * * * *',
  /** macroIndicatorRefreshJob — 19:13 UTC daily (02:13 VN next day / 21:13 France); moved 06:00 GMT+7→19:13 UTC by Sprint 1949-T7 (24min before Evening Preview chef at 19:37 UTC) */
  macroIndicatorRefresh:  Bun.env.CRON_MACRO_INDICATOR_REFRESH            ?? '13 19 * * *',
  /** Foreign flow fallback fetcher: every minute (60 seconds) — task 1290 */
  foreignFlowFetch:       Bun.env.CRON_FOREIGN_FLOW_FETCH                  ?? '*/1 * * * *',
  /** Monthly signal quality audit: 1st of month 00:00 UTC — task 1295c */
  monthlySignalQualityAudit: Bun.env.CRON_MONTHLY_SIGNAL_QUALITY_AUDIT     ?? '0 0 1 * *',
  /** IMF indicator poller: every 6 hours — task 1296b */
  imfIndicatorPoller:        Bun.env.CRON_IMF_INDICATOR_POLLER              ?? '0 */6 * * *',
  /** Session tool usage tracker: every 8h (matches cache TTL) — task 1299c */
  trackSessionToolUsage:     Bun.env.CRON_TRACK_SESSION_TOOL_USAGE          ?? '0 */8 * * *',
  /** BCTC batch sweep: 09:00 UTC on the 25th of Jan, Apr, Jul, Oct (task 1841b) */
  bctcBatchSweep:            Bun.env.CRON_BCTC_BATCH_SWEEP                  ?? '0 9 25 1,4,7,10 *',
  /** DB integrity check: weekly Sunday 02:00 UTC + WAL >= 40MB threshold — task 1342 */
  integrityCheck:            Bun.env.CRON_DB_INTEGRITY_CHECK                 ?? '0 2 * * 0',
  /** Market earning yield (Báu Phase 2): daily 09:30 UTC (16:30 VN) weekdays — task 1426a */
  marketEarningYield:        Bun.env.CRON_MARKET_EARNING_YIELD               ?? '30 9 * * 1-5',
  /** alertOutcomeJob — daily alert outcome resolver at 08:45 UTC weekdays (task 1847d-C)
   *  15 min after signalOutcomeJob (08:30 UTC) to avoid DB write contention. */
  alertOutcomeJob:           Bun.env.CRON_ALERT_OUTCOME_JOB                  ?? '45 8 * * 1-5',
  /** Daily dashboard aggregation: 23:30 GMT+7 every day (after evening summary + periodic summary) — task 1854a */
  dailyDashboard:            Bun.env.CRON_DAILY_DASHBOARD                    ?? '30 23 * * *',
  /** verdictResolutionJob — hourly alert verdict resolver (task 1863b, Sprint 1867)
   *  Minute=7 (not 0) to avoid pile-up with cronHealthAlert/weatherCheck/imfIndicatorPoller
   *  and other jobs that cluster at minute=0 every hour. Architect amendment 2026-05-10. */
  verdictResolutionJob:      Bun.env.CRON_VERDICT_RESOLUTION                 ?? '7 * * * *',
  /** newsHeadlinesRefresh — Bloomberg + Reuters via news-fetch service: every 30 min (task 1899a-cron) */
  newsHeadlinesRefresh:      Bun.env['CRON_NEWS_HEADLINES_REFRESH']           ?? '*/30 * * * *',
  /** bondMaturityPoller — weekly Sunday 02:30 UTC (09:30 VN) — task 1920b */
  bondMaturityPoller:        Bun.env.CRON_BOND_MATURITY_POLLER                 ?? '30 2 * * 0',
  /** vnstockFundamentalsRefresh — weekly Mon 01:00 UTC batch sweep of 6 fundamental tables (task 1920a) */
  vnstockFundamentalsRefresh: Bun.env.CRON_VNSTOCK_FUNDAMENTALS               ?? '0 1 * * 1',
  /** vnstockTradingStatsRefresh — daily weekdays 08:30 UTC (post HOSE close) trading stats sweep (task 1920a) */
  vnstockTradingStatsRefresh: Bun.env.CRON_VNSTOCK_TRADING_STATS              ?? '30 8 * * 1-5',
  /** commodityTrackerRefresh — daily 06:00 UTC commodity prices + shipping indices refresh (task 1920c) */
  commodityTrackerRefresh:    Bun.env.CRON_COMMODITY_TRACKER                  ?? '0 6 * * *',
  /** brokerSanctionsSweep — last Friday of month 08:00 UTC, quarter-guard in job body (task 1920d) */
  brokerSanctionsSweep:       Bun.env.CRON_BROKER_SANCTIONS                   ?? '0 8 25-31 * 5',
  /** sbvRatesRefresh — every 4 hours, SBV rates + USD/VND FX refresh (task 1920k) */
  sbvRatesRefresh:            Bun.env.CRON_SBV_RATES_REFRESH                   ?? '0 */4 * * *',
  /** reputationComputeJob — daily 08:30 UTC, compute reputation scores for watchlist tickers (task 1922d) */
  reputationCompute:          Bun.env.CRON_REPUTATION_COMPUTE                   ?? '30 8 * * *',
  /** publicContractsJob — weekly Mon 03:00 UTC, scrape muasamcong.mpi.gov.vn procurement results (Task B) */
  publicContractsRefresh:     Bun.env['CRON_PUBLIC_CONTRACTS']                  ?? '0 3 * * 1',
  /** signalOutcomeResolution — hourly T+24h / T+48h outcome resolution (2026-05-17 feedback loop)
   *  Minute=17 avoids pile-up with minute=0 cluster (cronHealthAlert, macroIndicator, etc.) */
  signalOutcomeResolution:    Bun.env.CRON_SIGNAL_OUTCOME_RESOLUTION             ?? '17 * * * *',
  /** accuracyDigest — daily 07:00 UTC signal accuracy digest to WORK channel (task 1941c)
   *  Fires after VN market open (02:00 UTC) and before Paris open (08:00 UTC).
   *  Collision check: 07:00 UTC is free (cronHealthAlert=00:00, macroIndicator=06:00). */
  accuracyDigest:             Bun.env.CRON_ACCURACY_DIGEST                        ?? '0 7 * * *',
  /** diskUsageAlert — hourly LanceDB disk-usage watchdog (task 1959-watchdog-5)
   *  Fires at minute=47 to avoid pile-up with minute=0/7/17 cluster.
   *  Alerts BUG channel when /app/data/lancedb exceeds DISK_ALERT_THRESHOLD_GB (default 20 GB).
   *  6 h cooldown prevents alert flood on sustained over-threshold condition. */
  diskUsageAlert:             Bun.env.CRON_DISK_USAGE_ALERT                       ?? '47 * * * *',
}
