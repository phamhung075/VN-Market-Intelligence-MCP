/**
 * startScheduler.ts — startScheduler() function (task 1406e)
 *
 * Registers all cron jobs. Imports cron schedules from ./cronConfig.js and
 * helper functions from ./startupHelpers.js. All 40+ job runner imports live
 * here (they are used exclusively inside startScheduler()).
 */

import cron from 'node-cron'
import { runSscCheck } from './news-analysis/sscCheckerJob.js'
import { runMarketScan } from './market-data/marketScanJob.js'
import { runMorningBriefing } from './briefings/morningBriefingJob.js'
import { runEveningSummary } from './briefings/eveningSummaryJob.js'
import { runIntelligenceCycle } from './news-analysis/intelligenceCycleJob.js'
import { registerSummaryJobs, runSummaryJob } from './summaryJobs.js'
import { runWalCheckpoint, registerShutdownHook, backupDatabase, checkWalFileSize } from '../infrastructure/db/checkpoint.js'
import { runIntegrityCheckJob } from './integrityCheckJob.js'
import { walCheckpointAlert } from './walCheckpointAlert.js'
import { runPatternWatch } from './news-analysis/patternWatchJob.js'
import { runDailyAudit, runDailyAuditIfStale } from './news-analysis/dataAuditJob.js'
import { runPredictionMarketPoll } from './macro/predictionMarketJob.js'
import { runAlertDigest } from './alerts/alertDigestJob.js'
import { runWeeklyPortfolioReport } from './portfolio/weeklyPortfolioReportJob.js'
import { runPredictionOutcomeCheck } from './macro/predictionOutcomeJob.js'
import { runDevTeamHeartbeat } from './system/devTeamHeartbeatJob.js'
import { runWeatherCheck } from './weatherCheckJob.js'
import { runDavPharmacyCheck } from './davPharmacyJob.js'
import { runVpsProxyWatchdog } from './vpsProxyWatchdogJob.js'
import { runBctcOverdueCheck } from './financial-reports/bctcOverdueCheckJob.js'
import { runBctcBatchSweepJob } from './financial-reports/bctcBatchSweepJob.js'
import { runBctcReparseJob } from './financial-reports/bctcReparseJob.js'
import { runBctcQueueEnricherJob } from './financial-reports/bctcQueueEnricherJob.js'
import { runBctcPdfPullJob } from './financial-reports/bctcPdfPullJob.js'
import { runAskQueueCheck } from './system/askQueueCheckJob.js'
import { runCronHealthAlert } from './alerts/cronHealthAlertJob.js'
import { runForeignFlowAlertJobCron } from './market-data/foreignFlowAlertJob.js'
import { runInsiderCheck } from './market-data/insiderCheckJob.js'
import { runPipelineWatchdog } from './pipelineWatchdogJob.js'
import { runFranceSummary } from './briefings/franceSummaryJob.js'
import { runAlertScanParallel } from './alerts/alertScanParallelJob.js'
import { runTaAlertNotifierCron } from './market-data/taAlertNotifierJob.js'
import { runSignalOutcomeJobCron } from './alerts/signalOutcomeJob.js'
import { runSignalOutcomeResolutionJobCron } from './alerts/signalOutcomeResolutionJob.js'
import { runAlertOutcomeJobCron } from './alerts/alertOutcomeJob.js'
import { runVerdictResolutionJobCron } from './alerts/verdictResolutionJob.js'
import { runOhlcvStartupProbe } from './market-data/ohlcvStartupProbe.js'
import { runOhlcvDailyAggregator } from './market-data/ohlcvDailyAggregatorJob.js'
import { runOhlcvStalenessCheck } from './market-data/ohlcvStalenessCheckJob.js'
import { runTaOhlcvBackfill } from './market-data/taOhlcvBackfillJob.js'
import { priceUpdateWatchdog } from './market-data/priceUpdateWatchdogJob.js'
import { runVpsHealthPolling } from './system/vpsServiceHealthJob.js'
import { runVnIndexRefreshJob } from './market-data/vnIndexRefreshJob.js'
import { runFreshnessSlaMonitorJob } from './system/freshnessSlaMonitorJob.js'
import { macroIndicatorRefreshJob, validateMacroFreshnessOnStartup, runMarketEarningYieldJob, runCommodityTrackerRefreshJob, runSbvRatesRefreshJob } from './macro/index.js'
import { fetchFredEffrIorb } from '../infrastructure/fetchers/fredEffrIorb.js'
import { fetchFredIsmSubcomponents } from '../infrastructure/fetchers/fredIsmSubcomponents.js'
import { runForeignFlowFetcherJobCron } from './market-data/foreignFlowFetcherJob.js'
import { runMonthlySignalQualityJob } from './audits/monthlySignalQualityJob.js'
import { runImfIndicatorPollerJob } from './market-data/imfIndicatorPollerJob.js'
import { trackSessionToolUsageJob } from './system/trackSessionToolUsageJob.js'
import { runDailyDashboardJob } from './system/dailyDashboardJob.js'
import { newsHeadlinesRefreshJob } from './news-analysis/index.js'
import { runReputationComputeJob } from './news/index.js'
import { runPublicContractsJob } from './market-data/publicContractsJob.js'
import { runBrokerSanctionsJob } from './news-analysis/brokerSanctionsJob.js'
import { runBondMaturityPollerJob } from './macro/bondMaturityPollerJob.js'
import { runAccuracyDigest } from './digest/accuracyDigestJob.js'
import { runSelfImproveOrchestrator } from './audits/selfImproveOrchestratorJob.js'
import { runBctcEvalRecomputeJob } from './financial-reports/bctcEvalRecomputeJob.js'
import { runAgmPlanJob } from './financial-reports/agmPlanJob.js'
import { runBoardDetailsJob } from './financial-reports/boardDetailsJob.js'
import { runDiskUsageAlertJob } from './diskUsageAlertJob.js'
import { runTasksMdJanitorJob } from './system/tasksMdJanitorJob.js'
import { runVnstockFundamentalsJobCron, runVnstockTradingStatsJobCron, runVnstockFundamentalsJob } from './financial-reports/vnstockFundamentalsJob.js'
import { runVnstockStartupProbe } from './financial-reports/vnstockStartupProbe.js'
import { getDb } from '../infrastructure/db/schema.js'
import { SqliteJobRunRepository } from '../infrastructure/db/repositories/SqliteJobRunRepository.js'
import { reapZombieJobRuns } from '../infrastructure/db/cronJobRunStore.js'
import { CRONS } from './cronConfig.js'
import {
  log,
  shouldRunCatchup,
  eveningReportIsValid,
  scheduleForeignFlowCbReset,
  runWeeklyAuditWithDb,
  runBctcReparseWithDb,
  runEvidenceAccumulatorWithDb,
  runBaseRateComputationWithDb,
  runPredictionResolutionWithDb,
  runCalibrationReportWithDb,
} from './startupHelpers.js'

export function startScheduler() {
  // Idempotency guard — survives bun --hot module reloads.
  // Without this, every hot reload re-runs startScheduler() and stacks a
  // fresh copy of every cron callback on top of the previous ones. After N
  // reloads the '15:30 market close' cron (and every other job) fires N
  // times back-to-back, producing bursts like "22 identical scanMarket
  // WARN lines in one second". globalThis state persists across HMR so the
  // second call short-circuits.
  const g = globalThis as unknown as { __vnMarketSchedulerStarted?: boolean };
  if (g.__vnMarketSchedulerStarted) {
    log("startScheduler called again — already running, skipping re-registration");
    return;
  }
  g.__vnMarketSchedulerStarted = true;

  // ── Composition root — one DB handle + job-run repository for all cron jobs ──
  // Task 1839a Phase 2: single DB init; jobRunRepo replaces per-job calls.
  const db = getDb()
  const jobRunRepo = new SqliteJobRunRepository(db)

  // Task 1955b: reap zombie cron_job_runs rows left behind by prior process crashes.
  // Must run BEFORE any cron registration so newly-registered jobs see a clean slate.
  const { reaped } = reapZombieJobRuns(db)
  if (reaped > 0) {
    log(`[startup] reaped ${reaped} zombie cron_job_runs row(s) → status=crashed`)
  }

  // Startup probe — ohlcv data completeness check (task 1353, Sprint 119).
  // Fire-and-forget: alerts WORK channel if any watchlist ticker has < 8
  // daily_ohlcv rows, prompting operator to run fetch-ohlcv-backfill.sh on VPS.
  void runOhlcvStartupProbe().then((r) => {
    if (r.sent) log(`[ohlcv-probe] sparse tickers: ${r.sparseTickers.map(t => t.code).join(', ')}`)
  }).catch(console.error)

  // Startup CB reset — task 1404
  // Resets breakers.foreignFlow after FOREIGN_FLOW_CB_RESET_DELAY_MS (default 60s).
  // Ensures that if the VPS pushed a batch before migrations completed and tripped
  // the CB to OPEN, it recovers automatically after startup is stable — without
  // waiting the full 5-minute resetTimeoutMs.
  scheduleForeignFlowCbReset()

  // 08:00 — Morning briefing (weekdays Mon-Fri only) — task 101
  cron.schedule(CRONS.morningBriefing, async () => {
    await jobRunRepo.wrapRun('morningBriefingJob', async () => {
      await runMorningBriefing()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:00 — Market open scan (weekdays Mon-Fri only) — task 103
  // recordJobRun called inside runMarketScan() — job visible in cron_job_runs
  cron.schedule(CRONS.marketOpen, async () => {
    await runMarketScan('open')
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 15 min — Intelligence cycle (task 106)
  // During market hours (09:00-15:30 GMT+7 Mon-Fri): full 5-step cycle
  //   A. pollNews  B. listSscDocs  C. fetchPrices  D. runImpactChain  E. sendAlerts
  // Outside market hours: news poll only (step A)
  cron.schedule(CRONS.intelligenceCycle, async () => {
    await jobRunRepo.wrapRun('intelligenceCycleJob', async () => {
      const result = await runIntelligenceCycle()
      return { rowsWritten: (result?.newsFetched ?? 0) + (result?.impactEventsRan ?? 0) }
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 15:30 — Market close scan (weekdays Mon-Fri only) — task 103
  // recordJobRun called inside runMarketScan() — job visible in cron_job_runs
  cron.schedule(CRONS.marketClose, async () => {
    await runMarketScan('close')
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 20:00 — SSC report check (task 104)
  // recordJobRun called inside runSscCheck() — job visible in cron_job_runs
  cron.schedule(CRONS.sscCheck, async () => {
    await runSscCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 22:00 — Evening summary (weekdays Mon-Fri only) — task 105
  cron.schedule(CRONS.eveningSummary, async () => {
    await jobRunRepo.wrapRun('eveningSummaryJob', async () => {
      await runEveningSummary()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 21:00 — Alert digest (weekdays Mon-Fri only) — task 188
  // DB-backed dedup guard: runAlertDigest receives the same db instance so it
  // can check cron_job_runs for a success row from an earlier run today.
  // recordJobRun writes the success row after the callback completes, so a
  // second invocation (e.g. after a server restart) finds the row and skips.
  // task 1377.
  // recoverMissedExecutions: true — if the event loop is stalled at fire time
  // (e.g. startup ohlcv backfill, bctcReparseJob zombies), node-cron replays
  // the missed tick on recovery instead of skipping until tomorrow (task 1958a).
  // Safe because runAlertDigest has an alreadySentToday() DB-backed dedup guard.
  cron.schedule(CRONS.alertDigest, async () => {
    await jobRunRepo.wrapRun('alertDigestJob', async () => {
      await runAlertDigest(undefined, db)
    })
  }, { timezone: 'Asia/Ho_Chi_Minh', recoverMissedExecutions: true })

  // Every 30min — WAL checkpoint (task 1329a)
  // FULL mode during live hours; TRUNCATE + backup during off-hours 03:00-05:00 UTC.
  // Overridable via CRON_WAL_CHECKPOINT env var.
  cron.schedule(CRONS.walCheckpoint, async () => {
    await jobRunRepo.wrapRun('walCheckpointJob', async () => {
      const hour = new Date().getUTCHours();
      // Off-hours 03:00-05:00 UTC: TRUNCATE + backup. Live hours: FULL (non-blocking).
      const isOffHours = hour >= 3 && hour < 5;
      const mode = isOffHours ? 'TRUNCATE' : 'FULL';
      await checkWalFileSize(Bun.env.DB_PATH ?? 'market.db');
      const walResult = runWalCheckpoint(mode);
      await walCheckpointAlert(walResult);
      if (isOffHours) {
        await backupDatabase(Bun.env.DB_PATH ?? 'market.db');
      }
    })
  })

  // Sunday 22:30 GMT+7 — Weekly pattern watch (task 146)
  cron.schedule(CRONS.patternWatch, async () => {
    await jobRunRepo.wrapRun('patternWatchJob', async () => {
      await runPatternWatch()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  registerSummaryJobs({
    daily:     CRONS.summaryDaily,
    weekly:    CRONS.summaryWeekly,
    monthly:   CRONS.summaryMonthly,
    quarterly: CRONS.summaryQuarterly,
    yearly:    CRONS.summaryYearly,
  })

  // 1st of month 00:00 UTC — Monthly signal quality audit — task 1295c
  // Queries signal_rejections from prior month and generates audit report.
  // Alerts to WORK channel if rejection rate exceeds 2%.
  cron.schedule(CRONS.monthlySignalQualityAudit, async () => {
    await jobRunRepo.wrapRun('monthlySignalQualityAuditJob', async () => {
      await runMonthlySignalQualityJob()
    })
  }, { timezone: 'UTC' })

  // dataAuditJob:daily — recordJobRun called inside runDailyAudit() — task 157
  cron.schedule(CRONS.dataAuditDaily, async () => {
    await runDailyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  cron.schedule(CRONS.dataAuditWeekly, async () => {
    await runWeeklyAuditWithDb(db)
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Startup catch-up: if a server restart straddled the 23:00 daily cron,
  // last_daily_audit can drift >24h causing WAL bloat risk. Fire-and-forget.
  // Triggered by report 994 (missed 2026-04-06 audit).
  void runDailyAuditIfStale().then((ran) => {
    if (ran) log("daily audit catch-up ran on startup")
  })

  cron.schedule(CRONS.predictionMarketPoll, async () => {
    await jobRunRepo.wrapRun('predictionMarketPollJob', async () => {
      await runPredictionMarketPoll()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:30 GMT+7 daily — BCTC stranded-PDF auto-reparse — task 1019
  cron.schedule(CRONS.bctcReparseJob, async () => {
    await runBctcReparseWithDb(db)
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Startup catch-up: if server restarts after 09:30 GMT+7, stranded PDFs
  // won't be reparsed until tomorrow. Fire-and-forget 30s after boot.
  // Triggered by report 1108 (VNM/VEA PDFs on disk but financial_reports empty).
  // Fix task 1915-fix-part1: call runBctcReparseWithDb(db) instead of
  // runBctcReparseJob() directly — the direct call bypassed db injection and
  // produced a misleading fire-and-forget recordJobRun no-op.
  setTimeout(async () => {
    try {
      await runBctcReparseWithDb(db)
      log('[bctc-reparse] startup catch-up: complete')
    } catch (err) {
      log(`[bctc-reparse] startup catch-up failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, 30_000)

  // Every 15 min — BCTC queue enricher background job (task 1287)
  // Dequeues max 20 unenriched BCTC items per run, populates source_url via SSC lookup
  cron.schedule(CRONS.bctcQueueEnricher, async () => {
    await jobRunRepo.wrapRun('bctcQueueEnricherJob', async () => {
      const result = await runBctcQueueEnricherJob()
      return { rowsWritten: result.urlsPopulated }
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 30 min — BCTC PDF pull job (feat/bctc-pull-pdf)
  // Downloads PDFs from VPS cache for bctc_vps_queue items with VPS source_url.
  // Requires VPS_PUSH_API_KEY env var.
  cron.schedule(CRONS.bctcPdfPull, async () => {
    await jobRunRepo.wrapRun('bctcPdfPullJob', async () => {
      const result = await runBctcPdfPullJob()
      return { rowsWritten: result.downloaded }
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:00 UTC on 25th of Jan/Apr/Jul/Oct — BCTC batch sweep (task 1841b)
  // Triggers during earnings season: fetches BCTC data for all 30 watchlist tickers.
  // isEarningsSeason() gate is evaluated inside runBctcBatchSweepJob() — cron
  // fires monthly but no-ops outside season months.
  cron.schedule(CRONS.bctcBatchSweep, async () => {
    await jobRunRepo.wrapRun('bctcBatchSweepJob', async () => {
      await runBctcBatchSweepJob()
    })
  }, { timezone: 'UTC' })

  // Startup catch-up: if server restarts after 08:00 GMT+7 (01:00 UTC) or
  // 22:30 GMT+7 (15:30 UTC) without morning briefing / evening summary having
  // run, fire them once. 30s delay matches bctcReparseJob pattern. task 1430.
  setTimeout(async () => {
    log('[startup-catchup] probe firing — checking morningBriefingJob + eveningSummaryJob + franceSummaryJob')

    try {
      if (shouldRunCatchup(db, 'morningBriefingJob', 1, 0, new Date(), true)) {
        log('[startup-catchup] morningBriefingJob: running catch-up')
        await jobRunRepo.wrapRun('morningBriefingJob', async () => { await runMorningBriefing() })
      }
    } catch (err) {
      log(`[startup-catchup] morningBriefingJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      // task 1408: pass reportCheckFn so catchup is skipped when a valid
      // (fresh vnIndex + newsCount > 0) evening report already exists for
      // today's VN date — prevents overwriting a good report with stale data
      // when the container restarts after midnight UTC but before market open.
      const eveningReportCheck = () => eveningReportIsValid()
      if (shouldRunCatchup(db, 'eveningSummaryJob', 15, 30, new Date(), true, eveningReportCheck)) {
        log('[startup-catchup] eveningSummaryJob: running catch-up')
        await jobRunRepo.wrapRun('eveningSummaryJob', async () => { await runEveningSummary() })
      }
    } catch (err) {
      log(`[startup-catchup] eveningSummaryJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      if (shouldRunCatchup(db, 'franceSummaryJob', 9, 0, new Date(), true)) {
        log('[startup-catchup] franceSummaryJob: running catch-up')
        await jobRunRepo.wrapRun('franceSummaryJob', async () => { await runFranceSummary() })
      }
    } catch (err) {
      log(`[startup-catchup] franceSummaryJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    // task 1958a: alertDigestJob and summaryJob:daily lacked startup-catchup probes.
    // When the container restarts after their scheduled windows (14:00 UTC and 15:30 UTC),
    // these jobs were permanently skipped for the day. The probes below fire them once
    // on startup when the window has passed and no success row exists for today.
    // recoverMissedExecutions: true (set on their cron registrations) handles the
    // complementary case: event-loop stall during a RUNNING container.
    try {
      // alertDigestJob: 21:00 VN = 14:00 UTC, weekdays only
      if (shouldRunCatchup(db, 'alertDigestJob', 14, 0, new Date(), true)) {
        log('[startup-catchup] alertDigestJob: running catch-up')
        await jobRunRepo.wrapRun('alertDigestJob', async () => { await runAlertDigest(undefined, db) })
      }
    } catch (err) {
      log(`[startup-catchup] alertDigestJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      // summaryJob:daily: 22:30 VN = 15:30 UTC, every day (weekdayOnly=false)
      if (shouldRunCatchup(db, 'summaryJob:daily', 15, 30, new Date(), false)) {
        log('[startup-catchup] summaryJob:daily: running catch-up')
        await runSummaryJob('daily')
      }
    } catch (err) {
      log(`[startup-catchup] summaryJob:daily error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, 30_000)

  // Every 12 min — /ask queue check (task 1074).
  // Signals 07-qa-responder when pending questions are found in ask_queue.
  // The server never answers the question — the cowork agent does the work.
  cron.schedule(CRONS.askQueueCheck, () => {
    try {
      const result = runAskQueueCheck()
      if (result.signaled) {
        log(`[ask-queue-check] signaled 07-qa-responder: count=${result.count}`)
      }
    } catch (err) {
      log(`[ask-queue-check] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  registerShutdownHook()

  // Sunday 23:00 — Weekly portfolio report — task 218
  cron.schedule(CRONS.weeklyPortfolioReport, async () => {
    await jobRunRepo.wrapRun('weeklyPortfolioReportJob', async () => {
      await runWeeklyPortfolioReport()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Sunday 07:00 UTC (08:00 CET) — Dev Team weekly heartbeat — task 245
  cron.schedule(CRONS.devTeamHeartbeat, async () => {
    await jobRunRepo.wrapRun("devTeamHeartbeatJob", async () => {
      await runDevTeamHeartbeat()
    })
  }, { timezone: "UTC" })

  // Sunday 08:00 UTC — Prediction market outcome validation — task 248
  // Validates last 7 days of prediction signals: confirmed / false_positive / neutral
  cron.schedule(CRONS.predictionOutcome, async () => {
    await jobRunRepo.wrapRun('predictionOutcomeJob', async () => {
      await runPredictionOutcomeCheck()
    })
  }, { timezone: "UTC" })

  // Every 6h — Weather check + climate signals — task 261
  // Typhoon season (Jun-Nov): every 6h. Off-season: every 12h.
  cron.schedule(CRONS.weatherCheck, async () => {
    await jobRunRepo.wrapRun("weatherCheckJob", async () => {
      await runWeatherCheck()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 1st of month 06:00 — DAV drug approval check (Sprint 044)
  cron.schedule(CRONS.davPharmacyCheck, async () => {
    await jobRunRepo.wrapRun("davPharmacyCheckJob", async () => {
      await runDavPharmacyCheck()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Daily 09:00 GMT+7 — BCTC overdue check (task 1018 slice 3).
  // Inserted alerts (severity=high) flow through readUnnotifiedAlerts ->
  // existing Alert Commander Telegram dispatch. Deterministic per-day id
  // keeps cooldown/dedup intact.
  cron.schedule(CRONS.bctcOverdueCheck, async () => {
    await jobRunRepo.wrapRun('bctcOverdueCheckJob', async () => {
      const r = await runBctcOverdueCheck()
      if (r.alertsInserted > 0) {
        log(`[bctc-overdue] inserted=${r.alertsInserted} overdue=${r.overdueFound} checked=${r.stocksChecked}`)
      }
      return { rowsWritten: r.alertsInserted }
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 10 min during VN market hours — VPS price-proxy watchdog.
  // Detects stale market_prices and SSH-heals the Vultr crontab in-process.
  // Uses `*/10 2-8 * * 1-5` so it only runs inside the window the VPS itself
  // is expected to push during; off-hours runs short-circuit via
  // isVnMarketHoursUtc() anyway, but a tighter cron avoids extra wakeups.
  cron.schedule(CRONS.vpsProxyWatchdog, async () => {
    await jobRunRepo.wrapRun('vpsProxyWatchdogJob', async () => {
      const status = await runVpsProxyWatchdog()
      if (status !== "ok" && status !== "off-hours" && status !== "cooldown") {
        log(`[vps-watchdog] ${status}`)
      }
    })
  }, { timezone: 'UTC' })

  // Daily 00:00 UTC (07:00 GMT+7) — Cron health alert (task 1103).
  // Sends ONE message to WORK channel if any job has < 80% success rate in last 24h.
  // Silent when all jobs are healthy (no heartbeat on all-green).
  cron.schedule(CRONS.cronHealthAlert, async () => {
    await jobRunRepo.wrapRun('cronHealthAlertJob', async () => {
      const r = await runCronHealthAlert()
      if (r.alertsSent > 0) {
        log(`[cron-health-alert] degraded=${r.alertsSent}`)
      }
      return { rowsWritten: r.alertsSent }
    })
  }, { timezone: 'UTC' })

  // Daily 23:00 VN (16:00 UTC) — Evidence accumulator — task 1118
  cron.schedule(CRONS.evidenceAccumulator, async () => {
    await runEvidenceAccumulatorWithDb(db)
  }, { timezone: 'UTC' })

  // Sunday 19:00 UTC (02:00 VN Monday) — Base rate computation — task 1122, Sprint 059
  cron.schedule(CRONS.baseRateComputation, async () => {
    await runBaseRateComputationWithDb(db)
  }, { timezone: 'UTC' })

  // Daily 16:30 UTC (23:30 VN) — Prediction resolution — task 1125
  // Fires after VN market close (15:30 VN = 08:30 UTC) giving the VPS
  // price-push service time to deliver daily_ohlcv rows before resolution runs.
  cron.schedule(CRONS.predictionResolution, async () => {
    await runPredictionResolutionWithDb(db)
  }, { timezone: 'UTC' })

  // Sunday 13:00 UTC (20:00 VN) — Calibration report — task 1128, Sprint 060
  // Weekly materialised Brier score aggregation over 90-day prediction_claims window.
  // Sends digest to WORK (always) and MARKET (when total_resolved >= 1).
  cron.schedule(CRONS.calibrationReport, async () => {
    await runCalibrationReportWithDb(db)
  }, { timezone: 'UTC' })

  // Weekdays 08:13 UTC (15:13 VN) — Foreign flow alert scan — task 1133, Sprint 061 (rescheduled Sprint 1949-T6)
  // Moved from 09:30 → 08:13 UTC so EOD chef (08:37 UTC) has the signal in hand (24min window).
  // Scans watchlist for HIGH-severity smart-money foreign flow signals.
  // Inserts alert rows + evidence fragments. Digest sent to WORK only.
  cron.schedule(CRONS.foreignFlowAlert, async () => {
    try {
      await runForeignFlowAlertJobCron()
      log(`[foreign-flow-alert] completed`)
    } catch (err) {
      log(`[foreign-flow-alert] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'UTC' })

  // Daily 01:00 UTC (08:00 VN) — Insider SSC transaction check — task 1143, Sprint 063
  // Mon-Sun: SSC disclosures can be published on weekends.
  // runInsiderCheck() uses insertAlert + insertEvidenceFragment (no direct Telegram).
  cron.schedule(CRONS.insiderCheck, async () => {
    await runInsiderCheck()
  }, { timezone: 'UTC' })

  // Every 30 min 24/7 — Pipeline watchdog — task 1190
  // Polls getPipelineHealth() and alerts WORK channel when staleMins > 90.
  // 3-hour cooldown prevents alert floods during sustained outages.
  cron.schedule(CRONS.pipelineWatchdog, async () => {
    await jobRunRepo.wrapRun('pipelineWatchdogJob', async () => {
      const result = await runPipelineWatchdog()
      if (result === 'alert-sent' || result === 'notify-failed') {
        log(`[pipeline-watchdog] ${result}`)
      }
    })
  }, { timezone: 'UTC' })

  // Weekdays 07:00 UTC (08:00 CET) — France morning summary — tasks 1316/1317
  // Sends Vietnamese digest to MARKET channel before Paris market open.
  cron.schedule(CRONS.franceSummary, async () => {
    await jobRunRepo.wrapRun("franceSummaryJob", async () => {
      const result = await runFranceSummary()
      if (result.sent) {
        log(`[france-summary] sent — movers=${result.moverCount} alerts=${result.alertCount} ta=${result.taSignals.length}`)
      }
      return { rowsWritten: result.moverCount + result.alertCount }
    })
  }, { timezone: 'UTC' })

  // Every 15 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — Parallel alert scan — tasks 1307+1309
  // Runs TA and BB alert scans in parallel. Both scan watchlist for technical breakouts.
  // - TA: RSI(14) overbought/oversold (task 1307) → ta_overbought/ta_oversold alerts
  // - BB: BB20 upper/lower breakouts (task 1309) → ta_bb_breakout_up/ta_bb_breakout_down alerts
  // Parallel execution reduces cycle time: ~3-5s vs 6-10s sequential.
  // No direct Telegram — Alert Commander dispatches via readUnnotifiedAlerts().
  // Task 1309c: Scheduler Dispatch Refactoring
  cron.schedule(CRONS.taAlertScan, async () => {
    await jobRunRepo.wrapRun('alertScanParallelJob', async () => {
      const result = await runAlertScanParallel()
      if (result.totalFired > 0) {
        log(`[alert-scan-parallel] ta_scanned=${result.taResult?.scanned ?? 0} ta_fired=${result.taResult?.fired ?? 0}, bb_scanned=${result.bbResult?.scanned ?? 0} bb_fired=${result.bbResult?.fired ?? 0}, total_fired=${result.totalFired} [${result.durationMs}ms]`)
      }
      return { rowsWritten: result.totalFired }
    })
  }, { timezone: 'UTC' })

  // Every 15 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — TA alert notifier — task 1314
  // Delivers unnotified TA alert rows (ta_overbought/ta_oversold/ta_bb_breakout_up/down) to
  // Telegram market channel. Batched (max 10/cycle). Marks notified_telegram=1 after send.
  cron.schedule(CRONS.taAlertNotifier, async () => {
    const result = await runTaAlertNotifierCron()
    if (result.sent > 0) {
      log(`[ta-alert-notifier] sent=${result.sent}`)
    }
  }, { timezone: 'UTC' })

  // 08:30 UTC Mon-Fri — Signal outcome resolver — task 1382
  // Resolves agent_signals with outcome='fired' or NULL after VN market close.
  // Compares entry price vs resolution price; marks confirmed or false_positive.
  cron.schedule(CRONS.signalOutcomeJob, () => { runSignalOutcomeJobCron().catch(console.error); }, { timezone: 'UTC' })

  // 08:45 UTC Mon-Fri — Alert outcome resolver — task 1847d-C
  // Scores fired alerts WHERE outcome IS NULL using market_prices_history.
  // 15 min after signalOutcomeJob to avoid DB write contention.
  // BLK-3: sends Telegram WORK digest for position-danger HITs.
  cron.schedule(CRONS.alertOutcomeJob, () => { runAlertOutcomeJobCron().catch(console.error); }, { timezone: 'UTC' })

  // 15:00 UTC (22:00 VN) Mon-Fri — OHLCV daily aggregator — task 1375, Sprint 130
  // Shifted from 16:00 → 15:00 UTC so aggregation runs 30 min before eveningSummary (15:30 UTC).
  // Aggregates intraday market_prices_history ticks into daily_ohlcv rows for each watchlist ticker.
  cron.schedule(CRONS.ohlcvDailyAggregator, async () => {
    await jobRunRepo.wrapRun('ohlcv-daily-aggregator', async () => {
      await runOhlcvDailyAggregator()
    })
  }, { timezone: 'UTC' })

  // 08:15 UTC Mon-Fri — OHLCV staleness check — task 1465, Sprint 175
  // Fires after VN market open. Alerts WORK when >50% watchlist tickers have no
  // daily_ohlcv row for today's VN date (UTC+7). Covers mid-day VPS price-push failure.
  cron.schedule(CRONS.ohlcvStalenessCheck, async () => {
    await jobRunRepo.wrapRun('ohlcv-staleness-check', async () => {
      await runOhlcvStalenessCheck()
    })
  }, { timezone: 'UTC' })

  // 01:30 UTC Mon-Fri — TA OHLCV restoration backfill — task 1970
  // Heals daily_ohlcv rows corrupt from 1972-era VNDIRECT null-coercion bug (low=0).
  // Fetches tickers with < 35 clean rows OR any low=0 corrupt rows. Uses INSERT OR REPLACE.
  // Fire-and-forget: non-blocking; errors logged only.
  cron.schedule(CRONS.taOhlcvBackfill, async () => {
    await jobRunRepo.wrapRun('ta-ohlcv-backfill', async () => {
      const result = await runTaOhlcvBackfill()
      return {
        rowsWritten: result.backfilled,
        covered: result.covered,
        sparse: result.sparse,
        errors: result.errors.length,
      }
    })
  }, { timezone: 'UTC' })

  // Every 10 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — Price update watchdog — task 229
  // Early-warning layer for price staleness (6h threshold). Detects when VPS price-push stops
  // and alerts dev team + user before evening summary sends stale data.
  cron.schedule(CRONS.priceUpdateWatchdog, async () => {
    await jobRunRepo.wrapRun('price-update-watchdog', async () => {
      const result = await priceUpdateWatchdog()
      if (result !== "ok" && result !== "off-hours" && result !== "cooldown") {
        log(`[price-watchdog] ${result}`)
      }
    })
  }, { timezone: 'UTC' })

  // 20:30 UTC daily — cascade backtest — task 1505, Sprint 192
  // Fills price_impact_3d/7d/outcome_correct on cascade_rule_hits rows older than 3 days.
  // Runs after ohlcvDailyAggregator (20:00 UTC) so D+3/D+7 closes are fully aggregated.
  cron.schedule(CRONS.cascadeBacktest, async () => {
    await jobRunRepo.wrapRun('cascade-backtest', async () => {
      const { runCascadeBacktest } = await import('./macro/cascadeBacktestJob.js');
      await runCascadeBacktest();
    });
  }, { timezone: 'UTC' })

  // Every 5 min — VPS service health polling — task 234, Sprint 234
  // Polls all 5 VPS services (price, BCTC, news, SBV, foreign-flow) and records health status.
  // Circuit breaker protects against cascading failures.
  cron.schedule(CRONS.vpsServiceHealth, async () => {
    await jobRunRepo.wrapRun('vpsServiceHealthJob', async () => {
      await runVpsHealthPolling()
    })
  }, { timezone: 'UTC' })

  // Every 5 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — VN-Index refresh — task 1397
  // Fetches VNINDEX directly from VnDirect vnmarket_prices API (not via VPS).
  // Ensures market_prices.VNINDEX stays fresh regardless of VPS push payload.
  cron.schedule(CRONS.vnIndexRefresh, async () => {
    await jobRunRepo.wrapRun('vnIndexRefreshJob', async () => {
      const result = await runVnIndexRefreshJob()
      return { rowsWritten: result.stored }
    })
  }, { timezone: 'UTC' })

  // Every 30 min — Data freshness SLA monitor — task 234, Sprint 234
  // Checks signal source data freshness against SLA thresholds.
  // Escalates to Alert Commander when SLA breaches detected with 60-min cooldown.
  cron.schedule(CRONS.freshnessSlaMonitor, async () => {
    await jobRunRepo.wrapRun('freshnessSlaMonitorJob', async () => {
      await runFreshnessSlaMonitorJob()
    })
  }, { timezone: 'UTC' })

  // 19:13 UTC daily — Macro indicator refresh — task 239, Sprint 239 (rescheduled Sprint 1949-T7)
  // Moved from 06:00 GMT+7 → 19:13 UTC so Evening Preview chef (19:37 UTC) has fresh US-session data.
  // Fetches Yahoo/SBV/GSO macro indicators, FRED EFFR/IORB, ISM sub-components.
  cron.schedule(CRONS.macroIndicatorRefresh, async () => {
    await jobRunRepo.wrapRun('macroIndicatorRefreshJob', async () => {
      await macroIndicatorRefreshJob()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Startup validation — check macro data freshness on server start
  // Detects stale macro data (>24h old) and alerts WORK channel before morning briefing
  void validateMacroFreshnessOnStartup().catch((err) => {
    log(`[macro-startup-validation] error: ${err instanceof Error ? err.message : String(err)}`)
  })

  // Task 1922j — Startup backfill: populate fred_series_daily when empty.
  // macroIndicatorRefreshJob runs once daily at 06:00 GMT+7; after a Docker restart
  // the table is empty until the next scheduled run. Backfill immediately on startup
  // to ensure EFFR/IORB and ISM data are always available after container restarts.
  void (async () => {
    try {
      const db = getDb()
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM fred_series_daily`
      ).get() as { cnt: number } | null
      if ((row?.cnt ?? 0) === 0) {
        log('[startup-backfill] fred_series_daily empty — running EFFR/IORB backfill')
        const result = await fetchFredEffrIorb(undefined, db)
        if (result !== null) {
          log(`[startup-backfill] EFFR/IORB: ${result.effrRows} EFFR + ${result.iorbRows} IORB rows inserted`)
        } else {
          log('[startup-backfill] EFFR/IORB fetch returned null — FRED temporarily unavailable')
        }
        const ismResult = await fetchFredIsmSubcomponents(undefined, db)
        if (ismResult !== null) {
          const total = Object.values(ismResult.inserted).reduce((a, b) => a + b, 0)
          log(`[startup-backfill] ISM sub-components: ${total} rows inserted, failed: [${ismResult.failed.join(',')}]`)
        } else {
          log('[startup-backfill] ISM fetch returned null — FRED_API_KEY absent or unavailable')
        }
      }
    } catch (err) {
      log(`[startup-backfill] fred_series_daily backfill error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })()

  // Every 1 min — Foreign flow fallback fetcher — task 1290
  // Resilience loop: if VPS is down, cache/SSE keeps daily_ohlcv updated
  cron.schedule(CRONS.foreignFlowFetch, async () => {
    try {
      await runForeignFlowFetcherJobCron()
    } catch (err) {
      log(`[foreign-flow-fetch] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'UTC' })

  // Every 6 hours — IMF economic indicator poller — task 1296b
  // Fetches IMF growth/inflation/oil forecasts, stores in imf_indicators table,
  // classifies macro sentiment for signal enrichment via imfSentiment field.
  cron.schedule(CRONS.imfIndicatorPoller, async () => {
    await jobRunRepo.wrapRun('imfIndicatorPollerJob', async () => {
      const result = await runImfIndicatorPollerJob()
      return { rowsWritten: result.indicator_count }
    })
  }, { timezone: 'UTC' })

  // Every 8h — Session tool usage tracker — task 1299c
  // Reads sessionToolCache snapshot, aggregates per-tool session counts,
  // writes to docs/agent-memory/modules/tool-usage-stats.json (observability).
  cron.schedule(CRONS.trackSessionToolUsage, async () => {
    await jobRunRepo.wrapRun('trackSessionToolUsageJob', async () => {
      const stats = await trackSessionToolUsageJob()
      return { rowsWritten: stats.sessionCount }
    })
  }, { timezone: 'UTC' })

  // Sunday 02:00 UTC — DB integrity check — task 1342
  // Runs PRAGMA integrity_check on market.db weekly.
  // Also fires opportunistically when WAL >= 40 MB (integrityCheckJob handles threshold).
  // Alert sent to WORK channel when corruption detected; silent on clean pass.
  cron.schedule(CRONS.integrityCheck, async () => {
    await jobRunRepo.wrapRun('integrityCheckJob', async () => {
      const result = await runIntegrityCheckJob(Bun.env.DB_PATH ?? 'market.db', true)
      if (result && !result.ok) {
        log(`[integrity-check] CORRUPTION DETECTED — ${result.details.length} issue(s)`)
      }
      return { rowsWritten: result ? (result.ok ? 0 : 1) : 0 }
    })
  }, { timezone: 'UTC' })

  // Weekdays 09:30 UTC (16:30 VN) — Market earning yield computation — task 1426a
  // Báu Phase 2 (Dinh Gia): aggregates PE from vnstock_financials, computes market-wide
  // median PE and earnings yield, writes two rows to tracked_indicators.
  // Fires after market close so intraday prices are fully settled.
  // Coverage guard: skips DB write if < 70% of watchlist tickers have valid PE.
  cron.schedule(CRONS.marketEarningYield, async () => {
    await jobRunRepo.wrapRun('marketEarningYieldJob', async () => {
      await runMarketEarningYieldJob()
    })
  }, { timezone: 'UTC' })

  // 23:30 GMT+7 daily — Daily dashboard aggregation — task 1854a
  // Reads session logs + orch-state.json .task_board + project-stats.json and writes
  // docs/data/daily-dashboard.json for observability and sprint tracking.
  // Fires after evening summary (22:30) and periodic summary (22:30) are done.
  cron.schedule(CRONS.dailyDashboard, async () => {
    await jobRunRepo.wrapRun('dailyDashboardJob', async () => {
      const result = await runDailyDashboardJob()
      log(`[daily-dashboard] written — date=${result.date} sessions=${result.sessionCount} tasksDone=${result.tasksDone}`)
      return { rowsWritten: result.sessionCount }
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every hour at minute=7 UTC — Verdict resolution job — task 1863b, Sprint 1867
  // Resolves pending AlertVerdict rows >=24h old by comparing fire-price vs live close.
  // Minute=7 avoids collision with the cluster of minute=0 jobs (cronHealthAlert,
  // weatherCheck, imfIndicatorPoller, etc.).
  cron.schedule(CRONS.verdictResolutionJob, async () => {
    await jobRunRepo.wrapRun('verdictResolutionJob', async () => {
      const result = await runVerdictResolutionJobCron()
      if (result.rowsResolved > 0 || result.errors > 0) {
        log(`[verdict-resolution] evaluated=${result.rowsEvaluated} resolved=${result.rowsResolved} pruned=${result.rowsPruned} errors=${result.errors}`)
      }
      return { rowsWritten: result.rowsResolved }
    })
  }, { timezone: 'UTC' })

  // Every 30 min — News headlines refresh — task 1899a-cron
  // Sequential: Bloomberg first, Reuters second (RAM constraint: no concurrent Playwright browsers).
  // Pushes normalized articles to /api/push-news. Errors per source logged and skipped.
  cron.schedule(CRONS.newsHeadlinesRefresh, async () => {
    await jobRunRepo.wrapRun('newsHeadlinesRefreshJob', async () => {
      await newsHeadlinesRefreshJob()
    })
  }, { timezone: 'UTC' })

  // Sunday 02:30 UTC (09:30 VN) — Bond maturity poller — task 1920b
  // Fetches upcoming TPDN (corporate bond) maturities for watchlist issuers and
  // upserts them into bond_maturity via upsertBond() (ON CONFLICT idempotent).
  // Zero-row result triggers WORK alert. Fail-loud on fetch error.
  // AC-0: vnstock bond endpoint / domain seed data — direct from France (no VPS required).
  cron.schedule(CRONS.bondMaturityPoller, async () => {
    await jobRunRepo.wrapRun('bondMaturityPollerJob', async () => {
      const result = await runBondMaturityPollerJob()
      return { rowsWritten: result.rowsWritten }
    })
  }, { timezone: 'UTC' })

  // Monday 01:00 UTC — vnstock fundamentals weekly batch sweep — task 1920a
  // Iterates 30-ticker watchlist; populates vnstock_financials, balance_sheet,
  // cash_flow, events, officers, shareholders via syncVnstockData per ticker.
  // isRunning guard prevents double-stack (7-10 min sweep). Per-ticker isolation.
  // Fail-loud to WORK channel when any tickers fail at sweep completion.
  cron.schedule(CRONS.vnstockFundamentalsRefresh, async () => {
    await runVnstockFundamentalsJobCron()
  }, { timezone: 'UTC' })

  // Weekdays 08:30 UTC (15:30 VN, post HOSE close) — vnstock trading stats daily sweep — task 1920a
  // Iterates 30-ticker watchlist; upserts vnstock_trading_stats via syncVnstockData.
  // UNIQUE(code, date) ensures idempotency — repeated same-day runs are safe.
  // isRunning guard + per-ticker error isolation.
  cron.schedule(CRONS.vnstockTradingStatsRefresh, async () => {
    await runVnstockTradingStatsJobCron()
  }, { timezone: 'UTC' })

  // 06:00 UTC daily — Commodity prices + shipping indices refresh — task 1920c
  // FR-1: fetchYahooFinancePrices + storeCommoditySnapshot (commodity_prices + history).
  // FR-2: fetchShippingIndices + storeShippingIndices (tracked_indicators shipping rows).
  // Independent error isolation: commodity failure does NOT abort shipping call.
  // Fail-loud: each block sends WORK alert on error.
  // Note: same cron expression as macroIndicatorRefresh ('0 6 * * *') — kept as SEPARATE
  // job registration for independent cron_job_runs observability (per TASK_1920c.md spec).
  cron.schedule(CRONS.commodityTrackerRefresh, async () => {
    await jobRunRepo.wrapRun('commodityTrackerRefreshJob', async () => {
      const result = await runCommodityTrackerRefreshJob()
      return { rowsWritten: result.rowsWritten }
    })
  }, { timezone: 'UTC' })

  // Every 4 hours — SBV rates + USD/VND FX refresh — task 1920k
  // Fetches current VCB USD/VND official rate and SBV interest-rate fallbacks.
  // Persists via storeSbvSnapshot() into sbv_rates table (INSERT OR REPLACE).
  // Fail-loud to WORK channel on fetch or store error.
  cron.schedule(CRONS.sbvRatesRefresh, async () => {
    await jobRunRepo.wrapRun('sbvRatesRefreshJob', async () => {
      const result = await runSbvRatesRefreshJob()
      return { rowsWritten: result.rowsWritten }
    })
  }, { timezone: 'UTC' })

  // Last Friday of month 08:00 UTC — Broker sanctions quarterly sweep — task 1920d
  // Cron fires monthly (25th-31st Fri) but the job body applies a quarter-guard:
  // only runs in March / June / September / December. Non-quarter Fridays record
  // status='skipped' in cron_job_runs. Zero-result or fetch error → WORK alert.
  // Requires UNIQUE(broker_name, sanction_start) — migrated in schema-alerts.ts.
  cron.schedule(CRONS.brokerSanctionsSweep, async () => {
    await jobRunRepo.wrapRun('brokerSanctionsSweep', async () => {
      const result = await runBrokerSanctionsJob()
      return { rowsWritten: result.rowsWritten }
    })
  }, { timezone: 'UTC' })

  // Daily 08:30 UTC — Reputation compute job — task 1922d
  // Iterates all watchlist tickers, aggregates 7-day mention_velocity + agent_signals,
  // computes reputation score (0-100) and persists to reputation_scores table.
  // Fail-loud to WORK channel on job-level error; per-ticker failures are non-fatal.
  cron.schedule(CRONS.reputationCompute, async () => {
    await jobRunRepo.wrapRun('reputationComputeJob', async () => {
      const result = await runReputationComputeJob()
      return { rowsWritten: result.tickersProcessed }
    })
  }, { timezone: 'UTC' })

  // Monday 03:00 UTC — Public contracts weekly scrape — Task B
  // Fetches government procurement award results from muasamcong.mpi.gov.vn.
  // Geo-blocked outside Vietnam: set MUASAMCONG_VPS_PROXY_URL to route via Vinahost VPS.
  // Fail-loud to WORK channel when store errors occur; fetch-empty is silent.
  cron.schedule(CRONS.publicContractsRefresh, async () => {
    await jobRunRepo.wrapRun('publicContractsJob', async () => {
      const result = await runPublicContractsJob()
      if (result.fetched > 0) {
        log(`[public-contracts] fetched=${result.fetched} inserted=${result.rowsWritten}`)
      }
      return { rowsWritten: result.rowsWritten }
    })
  }, { timezone: 'UTC' })

  // Every hour at minute=17 UTC — Signal outcome resolution — 2026-05-17 feedback loop
  // Resolves T+24h and T+48h pending rows in signal_outcomes by comparing entry vs resolution price.
  // Minute=17 avoids pile-up with minute=0/7 cluster (cronHealthAlert, imfPoller, verdictResolution).
  cron.schedule(CRONS.signalOutcomeResolution, () => {
    runSignalOutcomeResolutionJobCron().catch(console.error);
  }, { timezone: 'UTC' })

  // Daily 07:00 UTC — Signal accuracy WORK digest — task 1941c
  // Computes 30-day accuracy stats from signal_outcomes, formats top-3/bottom-3
  // signal type breakdown, sends to WORK channel. DB-backed dedup guard prevents
  // duplicate sends on day boundary (survives server restarts).
  cron.schedule(CRONS.accuracyDigest, async () => {
    await jobRunRepo.wrapRun('accuracyDigestJob', () => runAccuracyDigest({ db }))
  }, { timezone: 'UTC' })

  // Every hour at minute=47 UTC — Disk-usage watchdog — task 1959-watchdog-5
  // Shells out to `du -sh /app/data/lancedb` and sends BUG Telegram when usage
  // exceeds DISK_ALERT_THRESHOLD_GB (default 20 GB). 6 h cooldown prevents spam.
  // Minute=47 avoids pile-up with minute=0/7/17/37 cluster.
  cron.schedule(CRONS.diskUsageAlert, async () => {
    await jobRunRepo.wrapRun('diskUsageAlertJob', async () => {
      const result = await runDiskUsageAlertJob()
      if (result === 'alert-sent') {
        log('[disk-usage-alert] BUG Telegram sent — lancedb over threshold')
      }
      return { rowsWritten: result === 'alert-sent' ? 1 : 0 }
    })
  }, { timezone: 'UTC' })

  // Daily 03:00 UTC — orch-state.json / task-lock coherence janitor — task 1965b (OSC-2)
  // D4 audit dimension: calls task_list_held(kind="sprint-task"), cross-checks
  // orch-state.json .head.active_task_id (AC-4), parses .task_board tasks (AC-2/AC-3),
  // detects concurrent git commits on docs/data/orch/orch-state.json within 30s (AC-5).
  // Appends signal_queue row for each divergence. Clean day → log only (AC-3).
  // Off-peak: 03:00 UTC (after bctcReparseJob at 02:30 UTC). No new DB schema.
  cron.schedule(CRONS.tasksMdJanitor, async () => {
    await jobRunRepo.wrapRun('tasksMdJanitorJob', async () => {
      await runTasksMdJanitorJob()
    })
  }, { timezone: 'UTC' })

  // Task 1942a — Startup backfill probe: populate vnstock fundamentals tables
  // when the DB is empty or stale after a cold Docker restart.
  // The Monday cron (vnstockFundamentalsRefresh Mon 01:00 UTC) only fires once
  // weekly; after a restart the tables may be empty for up to 7 days.
  // Guard: COUNT(DISTINCT code WHERE data_type='financials') < 10  → cold DB
  //        last fetched_at > 7 days ago                           → stale data
  //        Otherwise                                              → skip
  // _isFundamentalsRunning in vnstockFundamentalsJob handles overlap with the
  // Monday cron — no second lock is needed here (AC-7).
  void (async () => {
    await runVnstockStartupProbe({
      getDb,
      runJob: () => runVnstockFundamentalsJob(),
      scheduleDelay: (ms: number) => new Promise<void>((res) => setTimeout(res, ms)),
      log,
    })
  })()

  // Sprint SELF-IMPROVE-GATE Phase 2 — Self-improvement detection (09:02 UTC daily)
  // Shadow mode: all DISPATCH_PATHS default-false; no auto-dispatch fires at ship.
  // HN-1: bctcOverdueCheck is DAILY (0 9 * * *) not weekday-only; 2-min offset is correct.
  cron.schedule(CRONS.selfImproveOrchestrator, async () => {
    await jobRunRepo.wrapRun('selfImproveOrchestratorJob', () => runSelfImproveOrchestrator({ db }))
  }, { timezone: 'UTC' })

  // Sprint BCTC-EVAL-SUBSTRATE — Nightly BCTC eval recompute (22:02 UTC)
  // Off-market: 22:02 UTC = 05:02 GMT+7 next day; well outside HOSE hours (02:00-08:59 UTC Mon-Fri).
  // Sweeps stale bctc_eval_results rows (detector_version mismatch) and recomputes stages 4-6.
  // Override via env: CRON_BCTC_EVAL_RECOMPUTE
  cron.schedule(CRONS.bctcEvalRecompute, async () => {
    await jobRunRepo.wrapRun('bctcEvalRecomputeJob', async () => {
      const result = await runBctcEvalRecomputeJob()
      return { rowsWritten: result.recomputed * 3 } // 3 stages per report
    })
  }, { timezone: 'UTC' })

  // Daily 20:30 UTC (03:30 VN next day) — AGM plan + actuals ingest — RAPID-DATA-LAYER FIX-G
  // Pulls planned targets + actuals for all watchlist tickers from Vinahost VPS proxy.
  // Off-market: 20:30 UTC = after VN market close + ohlcvDailyAggregator (20:00 UTC).
  cron.schedule(CRONS.agmPlanRefresh, async () => {
    await jobRunRepo.wrapRun('agmPlanRefreshJob', async () => {
      const result = await runAgmPlanJob()
      if (result.plan_rows_written > 0 || result.actual_rows_written > 0) {
        log(`[agm-plan] plan_rows=${result.plan_rows_written} actual_rows=${result.actual_rows_written} tickers_ok=${result.tickers_ok.length} errors=${result.tickers_error.length}`)
      }
      return { rowsWritten: result.plan_rows_written + result.actual_rows_written }
    })
  }, { timezone: 'UTC' })

  // Daily 21:00 UTC (04:00 VN next day) — Board appointment_year ingest — RAPID-DATA-LAYER FIX-I-B
  // Pulls officer appointment dates for all watchlist tickers from Vinahost VPS proxy.
  // Off-market: 21:00 UTC = after AGM plan refresh (20:30 UTC). UPDATE-only (no INSERT).
  cron.schedule(CRONS.boardDetailsRefresh, async () => {
    await jobRunRepo.wrapRun('boardDetailsRefreshJob', async () => {
      const result = await runBoardDetailsJob()
      if (result.rows_updated > 0) {
        log(`[board-details] rows_updated=${result.rows_updated} tickers_ok=${result.tickers_ok.length} errors=${result.tickers_error.length}`)
      }
      return { rowsWritten: result.rows_updated }
    })
  }, { timezone: 'UTC' })

  log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} cron keys in CRONS map (incl. WAL checkpoint + 5 summary) + vps-watchdog + VPS health + SLA monitor + macro-refresh + imf-poller + session-tool-usage + tasks-md-janitor + bctc-eval-recompute + agm-plan + board-details active`)
}
