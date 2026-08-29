/**
 * schedulerJobTable.ts — declarative cron job registry (task FACTORY-SCHEDULER-job-table-registry)
 *
 * startScheduler.ts held 76+ copy-paste `scheduleCron(CRONS.x, async () => { await
 * jobRunRepo.wrapRun('xJob', async () => {...}) }, opts)` blocks — 57 of which share an
 * IDENTICAL outer envelope (only the cron key, wrapRun job-name, options, and runner body
 * differ). This file factors that envelope into ONE generic loop (`registerJobTable`) driven
 * by a declarative `JOB_TABLE` array built by `buildJobTable(ctx)`.
 *
 * Bespoke jobs (22) that do NOT go through the plain `jobRunRepo.wrapRun(name, runner)`
 * envelope — because they skip wrapRun entirely, use their own DB-backed dedup helper
 * (`run*WithDb` from startupHelpers.ts), have non-standard try/catch shapes, or build extra
 * local state (walEscalateFn, the scheduler-watchdog self-heal manifest) before registering —
 * keep individual `scheduleCron(...)` call sites, verbatim, in `registerBespokeJobs(ctx)`.
 *
 * Composition root: startScheduler.ts calls
 *   registerJobTable(buildJobTable(ctx), ctx.jobRunRepo)
 *   registerBespokeJobs(ctx)
 * where `ctx = { db, jobRunRepo }`.
 *
 * DoD: every job's cron expression / options / runner body is reproduced EXACTLY —
 * this file is a pure code-move, no behavior change. See
 * docs/agent-memory/decisions/sprint-FACTORY-SCHEDULER-job-table-registry.md for the
 * pre/post equivalence verification methodology (mirrors the vnstockBridge /
 * telegramCommands split precedents in this codebase).
 */

import type { Database } from 'bun:sqlite'
import type { IJobRunRepository } from '../domain/repositories/IJobRunRepository.js'
import { CRONS } from './cronConfig.js'
import { log, scheduleCron, runWeeklyAuditWithDb, runBctcReparseWithDb, runEvidenceAccumulatorWithDb, runBaseRateComputationWithDb, runPredictionResolutionWithDb, runCalibrationReportWithDb } from './startupHelpers.js'
import { checkWalFileSize, runForcedTruncateCheckpoint, backupDatabase } from '../infrastructure/db/checkpoint.js'
import { walCheckpointAlert } from './walCheckpointAlert.js'
import { createWalEscalateFn } from './walEscalation.js'
import { runMarketScan } from './market-data/marketScanJob.js'
import { runSscCheck } from './news-analysis/sscCheckerJob.js'
import { runMorningBriefing } from './briefings/morningBriefingJob.js'
import { runEveningSummary } from './briefings/eveningSummaryJob.js'
import { runIntelligenceCycle } from './news-analysis/intelligenceCycleJob.js'
import { runAlertDigest } from './alerts/alertDigestJob.js'
import { runRestartCadenceAlertJob } from './system/restartCadenceAlertJob.js'
import { runPatternWatch } from './news-analysis/patternWatchJob.js'
import { runMonthlySignalQualityJob, MONTHLY_SIGNAL_QUALITY_AUDIT_JOB_NAME } from './audits/monthlySignalQualityJob.js'
import { runDailyAudit } from './news-analysis/dataAuditJob.js'
import { runPredictionMarketPoll } from './macro/predictionMarketJob.js'
import { runBctcQueueEnricherJob } from './financial-reports/bctcQueueEnricherJob.js'
import { runBctcPdfPullJob } from './financial-reports/bctcPdfPullJob.js'
import { runBctcExtractReconcileJob } from './financial-reports/bctcExtractReconcileJob.js'
import { runBctcBatchSweepJob } from './financial-reports/bctcBatchSweepJob.js'
import { runAskQueueCheck } from './system/askQueueCheckJob.js'
import { runWeeklyPortfolioReport } from './portfolio/weeklyPortfolioReportJob.js'
import { runDevTeamHeartbeat } from './system/devTeamHeartbeatJob.js'
import { runPredictionOutcomeCheck } from './macro/predictionOutcomeJob.js'
import { runWeatherCheck } from './weatherCheckJob.js'
import { runDavPharmacyCheck } from './davPharmacyJob.js'
import { runBctcOverdueCheck } from './financial-reports/bctcOverdueCheckJob.js'
import { runVpsProxyWatchdog } from './vpsProxyWatchdogJob.js'
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
import { runOhlcvDailyAggregator } from './market-data/ohlcvDailyAggregatorJob.js'
import { runOhlcvStalenessCheck } from './market-data/ohlcvStalenessCheckJob.js'
import { runOhlcvSanityCheck } from './market-data/ohlcvSanityCheckJob.js'
import { runTaOhlcvBackfill } from './market-data/taOhlcvBackfillJob.js'
import { runOhlcvHistoryBackfill } from './market-data/ohlcvHistoryBackfillJob.js'
import { priceUpdateWatchdog } from './market-data/priceUpdateWatchdogJob.js'
import { runVpsHealthPolling } from './system/vpsServiceHealthJob.js'
import { runVnIndexRefreshJob } from './market-data/vnIndexRefreshJob.js'
import { runIntraday5mCompactor } from './market-data/intraday5mCompactorJob.js'
import { runIntradayForeignFlow5mCompactor } from './market-data/intradayForeignFlow5mCompactorJob.js'
import { runSbvOmoLiquidityCron } from './macro/sbvOmoLiquidityCronJob.js'
import { runRagFtsRebuildCron } from './rag/ragFtsRebuildCronJob.js'
import { runFreshnessSlaMonitorJob } from './system/freshnessSlaMonitorJob.js'
import { macroIndicatorRefreshJob, runMarketEarningYieldJob, runCommodityTrackerRefreshJob, runSbvRatesRefreshJob } from './macro/index.js'
import { runForeignFlowFetcherJobCron } from './market-data/foreignFlowFetcherJob.js'
import { runImfIndicatorPollerJob } from './market-data/imfIndicatorPollerJob.js'
import { trackSessionToolUsageJob } from './system/trackSessionToolUsageJob.js'
import { runDailyDashboardJob } from './system/dailyDashboardJob.js'
import { newsHeadlinesRefreshJob } from './news-analysis/index.js'
import { runReputationComputeJob } from './news/index.js'
import { runPublicContractsJob } from './market-data/publicContractsJob.js'
import { runBrokerSanctionsJob } from './news-analysis/brokerSanctionsJob.js'
import { runDeepFetchVpsJob } from './news-analysis/deepFetchVpsJob.js'
import { runDeepFetchMainJob } from './news-analysis/deepFetchMainJob.js'
import { runBondMaturityPollerJob } from './macro/bondMaturityPollerJob.js'
import { runAccuracyDigest } from './digest/accuracyDigestJob.js'
import { runSelfImproveOrchestrator } from './audits/selfImproveOrchestratorJob.js'
import { runBctcEvalRecomputeJob } from './financial-reports/bctcEvalRecomputeJob.js'
import { runAgmPlanJob } from './financial-reports/agmPlanJob.js'
import { runBoardDetailsJob } from './financial-reports/boardDetailsJob.js'
import { runDiskUsageAlertJob } from './diskUsageAlertJob.js'
import { runTasksMdJanitorJob } from './system/tasksMdJanitorJob.js'
import { runVnstockFundamentalsJobCron, runVnstockTradingStatsJobCron } from './financial-reports/vnstockFundamentalsJob.js'
import { runBreadthHistoryPersisterJob, JOB_NAME_BREADTH_PERSISTER } from './market-data/breadthHistoryPersisterJob.js'
import { runSchedulerWatchdog, WATCHDOG_MANIFEST } from './system/schedulerWatchdogJob.js'
import { runIntegrityCheckJob } from './integrityCheckJob.js'

/** Composition-root context threaded into both table-driven and bespoke registration. */
export interface SchedulerJobTableCtx {
  db: Database
  jobRunRepo: IJobRunRepository
}

/** One declarative cron-job registration — the (cron, options, runner) triple that used
 *  to be copy-pasted directly into a `scheduleCron(...)` call. `runner` is typed identically
 *  to `IJobRunRepository.wrapRun`'s 2nd param so extraction from an existing wrapRun call
 *  site is a pure copy (no type-shape drift). */
export interface JobTableEntry {
  name: string
  cron: string
  options?: Parameters<typeof scheduleCron>[2]
  runner: Parameters<IJobRunRepository['wrapRun']>[1]
}

// ─────────────────────────────────────────────────────────────────────────────
// buildJobTable — the 57 jobs that share the plain jobRunRepo.wrapRun(name, runner)
// envelope. Order preserved from the pre-split startScheduler.ts registration order
// (WD-11 / ordering-sensitive tests rely on stable relative order).
// ─────────────────────────────────────────────────────────────────────────────

export function buildJobTable(ctx: SchedulerJobTableCtx): JobTableEntry[] {
  const { db } = ctx

  // ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE: default-OFF enable flag. ragFtsRebuildCronJob
  // shipped (35cc8cd56) ahead of the rag-service capacity fix (RAG-FTS-BUILD-MEMORY-BOUND,
  // parked BLOCKED) — FTS rebuild at ~56k rows OOMs the 768m rag-service cgroup on every
  // nightly 20:15 UTC fire. Read fresh (not module-top-level) so tests can flip the env var
  // between calls without re-importing the module. Do NOT gate via CRON_RAG_FTS_REBUILD=''
  // (nullish-coalescing in cronConfig.ts ignores '' and an empty cron expr crashes croner at
  // boot) — this explicit boolean is the only supported disable/enable mechanism. Stays false
  // until RAG-FTS-BUILD-MEMORY-BOUND is verified fixed.
  const ragFtsRebuildCronEnabled = (Bun.env.CRON_RAG_FTS_REBUILD_ENABLED ?? 'false').toLowerCase() === 'true'

  return [
    // 08:00 — Morning briefing (weekdays Mon-Fri only) — task 101
    {
      name: 'morningBriefingJob',
      cron: CRONS.morningBriefing,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await runMorningBriefing()
      },
    },

    // Every 15 min — Intelligence cycle (task 106)
    // During market hours (09:00-15:30 GMT+7 Mon-Fri): full 5-step cycle
    //   A. pollNews  B. listSscDocs  C. fetchPrices  D. runImpactChain  E. sendAlerts
    // Outside market hours: news poll only (step A)
    {
      name: 'intelligenceCycleJob',
      cron: CRONS.intelligenceCycle,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        const result = await runIntelligenceCycle()
        return { rowsWritten: (result?.newsFetched ?? 0) + (result?.impactEventsRan ?? 0) }
      },
    },

    // 22:00 — Evening summary (weekdays Mon-Fri only) — task 105
    {
      name: 'eveningSummaryJob',
      cron: CRONS.eveningSummary,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await runEveningSummary()
      },
    },

    // 21:00 — Alert digest (weekdays Mon-Fri only) — task 188
    // DB-backed dedup guard: runAlertDigest receives the same db instance so it can check
    // cron_job_runs for a success row from an earlier run today. recoverMissedExecutions:
    // true — if the event loop is stalled at fire time (e.g. startup ohlcv backfill,
    // bctcReparseJob zombies), node-cron replays the missed tick on recovery instead of
    // skipping until tomorrow (task 1958a). Safe because runAlertDigest has an
    // alreadySentToday() DB-backed dedup guard.
    {
      name: 'alertDigestJob',
      cron: CRONS.alertDigest,
      options: { timezone: 'Asia/Ho_Chi_Minh', recoverMissedExecutions: true },
      runner: async () => {
        await runAlertDigest(undefined, db)
      },
    },

    // Every 30 min at :15 and :45 UTC — Restart-cadence alert guardrail — FIX-MCP-CRASH-LOOP A-1
    // Staggered 15 min from WAL checkpoint (:00 and :30). Queries cron_job_runs for
    // mcpServerStartup sentinel rows in last 4h. Sends WORK alert when count >= 2.
    {
      name: 'restartCadenceAlertJob',
      cron: CRONS.restartCadenceAlert,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runRestartCadenceAlertJob(db)
        if (result.alertSent) {
          log(`[restart-cadence-alert] alert sent — restartCount=${result.restartCount}`)
        }
        return { rowsWritten: result.alertSent ? 1 : 0 }
      },
    },

    // Sunday 22:30 GMT+7 — Weekly pattern watch (task 146)
    {
      name: 'patternWatchJob',
      cron: CRONS.patternWatch,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await runPatternWatch()
      },
    },

    // 1st of month 00:00 UTC — Monthly signal quality audit — task 1295c
    // Queries signal_rejections from prior month and generates audit report. Alerts to
    // WORK channel if rejection rate exceeds 2%. FIX-MONTHLYSIGNALQUALITYAUDITJOB-
    // MISSED-JULY-RECOVER-GUARD (2026-08-29): recoverMissedExecutions flipped
    // false → true as defence-in-depth ONLY — node-cron's recovery replays in-process
    // event-loop stalls only and can NEVER bridge a restart/downtime spanning the fire
    // instant (Scheduler.start() re-seeds lastExecution from boot time); the REAL
    // recovery is the startup catch-up probe in startScheduler.ts (shouldRunCatchup
    // cadence='month', success-only per-current-month dedup). The flip is safe because
    // runMonthlySignalQualityJob() now carries a T4 per-target-month dedup guard
    // (shouldSkipMonthlyReplay) — a replay or catch-up can no longer double-send the
    // Telegram WORK report. RAW-verified live before this fix: the job missed both the
    // 2026-07-01 and 2026-08-01 fires with zero recovery (last real fire 2026-06-01).
    {
      // NOTE: this registration keeps the plain string job-name literal on purpose —
      // the Gate-2d cronJobCount generator (scripts/gen-project-stats.ts) counts
      // table-driven jobs by matching quoted job-name fields inside buildJobTable();
      // a constant reference (like JOB_NAME_BREADTH_PERSISTER) silently drops the
      // count and drifts docs/data/project-stats.json. The single-source constant
      // MONTHLY_SIGNAL_QUALITY_AUDIT_JOB_NAME still drives the T4 guard inside
      // runMonthlySignalQualityJob() and the startup catch-up probe in
      // startScheduler.ts — only this registration keeps the literal.
      name: 'monthlySignalQualityAuditJob',
      cron: CRONS.monthlySignalQualityAudit,
      options: { timezone: 'UTC', recoverMissedExecutions: true },
      runner: async () => {
        await runMonthlySignalQualityJob()
      },
    },

    // FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR (architect RULING: RETIRE,
    // not restore-via-VPS — gamma-api.polymarket.com is blocked at the ISP
    // level by France's ANJ gambling regulator, a sovereign-regulator block
    // categorically different from the VN-source geoblocks the VPS proxy
    // pattern exists for). predictionMarkets.enabled now defaults to false
    // (config.ts + mcp.config.json). Deliberately LEFT in JOB_TABLE rather
    // than removed: runPredictionMarketPoll()'s own Step 1 reads the
    // disabled flag and returns immediately (cheap no-op, records
    // status=success honestly — the row IS disabled by design), and this
    // keeps the re-enable path a single PREDICTION_MARKETS_ENABLED=true env
    // flip with no redeploy of the job table needed if the upstream block is
    // ever lifted. Also avoids perturbing the Gate-2d cronJobCount baseline
    // for no functional reason.
    {
      name: 'predictionMarketPollJob',
      cron: CRONS.predictionMarketPoll,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await runPredictionMarketPoll()
      },
    },

    // Every 15 min — BCTC queue enricher background job (task 1287)
    // Dequeues max 20 unenriched BCTC items per run, populates source_url via SSC lookup
    {
      name: 'bctcQueueEnricherJob',
      cron: CRONS.bctcQueueEnricher,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        const result = await runBctcQueueEnricherJob()
        return { rowsWritten: result.urlsPopulated }
      },
    },

    // Every 30 min — BCTC PDF pull job (feat/bctc-pull-pdf)
    // Downloads PDFs from VPS cache for bctc_vps_queue items with VPS source_url.
    // Requires VPS_PUSH_API_KEY env var.
    {
      name: 'bctcPdfPullJob',
      cron: CRONS.bctcPdfPull,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        const result = await runBctcPdfPullJob()
        return { rowsWritten: result.downloaded }
      },
    },

    // 5,35 * * * * — BCTC extract reconcile job (FIX-BCTC-D3C-RECONCILE-JOB)
    // Resolves 'pek_triggered' rows (bctcPdfPullJob's async /pek-extract trigger)
    // to 'done'/'enrich_failed' by checking bctc_layout_units/bctc_table_rows/
    // bctc_md_tables row counts once PEK has had runway. Without this job,
    // 'pek_triggered' rows have no further transition path (accumulate forever).
    {
      name: 'bctcExtractReconcileJob',
      cron: CRONS.bctcExtractReconcile,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        const result = await runBctcExtractReconcileJob()
        return { rowsWritten: result.done }
      },
    },

    // 09:00 UTC on 25th of Jan/Apr/Jul/Oct — BCTC batch sweep (task 1841b)
    // Triggers during earnings season: fetches BCTC data for all 30 watchlist tickers.
    // isEarningsSeason() gate is evaluated inside runBctcBatchSweepJob() — cron fires
    // monthly but no-ops outside season months.
    {
      name: 'bctcBatchSweepJob',
      cron: CRONS.bctcBatchSweep,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runBctcBatchSweepJob()
      },
    },

    // Sunday 23:00 — Weekly portfolio report — task 218
    {
      name: 'weeklyPortfolioReportJob',
      cron: CRONS.weeklyPortfolioReport,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await runWeeklyPortfolioReport()
      },
    },

    // Sunday 07:00 UTC (08:00 CET) — Dev Team weekly heartbeat — task 245
    {
      name: 'devTeamHeartbeatJob',
      cron: CRONS.devTeamHeartbeat,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runDevTeamHeartbeat()
      },
    },

    // Sunday 08:00 UTC — Prediction market outcome validation — task 248
    // Validates last 7 days of prediction signals: confirmed / false_positive / neutral
    {
      name: 'predictionOutcomeJob',
      cron: CRONS.predictionOutcome,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runPredictionOutcomeCheck()
      },
    },

    // Every 6h — Weather check + climate signals — task 261
    // Typhoon season (Jun-Nov): every 6h. Off-season: every 12h.
    {
      name: 'weatherCheckJob',
      cron: CRONS.weatherCheck,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await runWeatherCheck()
      },
    },

    // 1st of month 06:00 — DAV drug approval check (Sprint 044)
    {
      name: 'davPharmacyCheckJob',
      cron: CRONS.davPharmacyCheck,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await runDavPharmacyCheck()
      },
    },

    // Daily 09:00 GMT+7 — BCTC overdue check (task 1018 slice 3).
    // Inserted alerts (severity=high) still flow through readUnnotifiedAlerts -> the
    // intelligence-cycle Step E pipeline, but that pipeline routes to BUG, not WORK.
    // FR-OBS-01-FIX: the job itself also sends an explicit WORK-channel Telegram
    // message on each NEW batch insert. Deterministic per-week id keeps cooldown/dedup intact.
    {
      name: 'bctcOverdueCheckJob',
      cron: CRONS.bctcOverdueCheck,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        const r = await runBctcOverdueCheck()
        if (r.alertsInserted > 0) {
          log(`[bctc-overdue] inserted=${r.alertsInserted} overdue=${r.overdueFound} checked=${r.stocksChecked}`)
        }
        return { rowsWritten: r.alertsInserted }
      },
    },

    // Every 10 min during VN market hours — VPS price-proxy watchdog.
    // Detects stale market_prices and SSH-heals the Vultr crontab in-process. Uses
    // `*/10 2-8 * * 1-5` so it only runs inside the window the VPS itself is expected to
    // push during; off-hours runs short-circuit via isVnMarketHoursUtc() anyway, but a
    // tighter cron avoids extra wakeups.
    {
      name: 'vpsProxyWatchdogJob',
      cron: CRONS.vpsProxyWatchdog,
      options: { timezone: 'UTC' },
      runner: async () => {
        const status = await runVpsProxyWatchdog()
        if (status !== 'ok' && status !== 'off-hours' && status !== 'cooldown') {
          log(`[vps-watchdog] ${status}`)
        }
      },
    },

    // Daily 00:00 UTC (07:00 GMT+7) — Cron health alert (task 1103).
    // Sends ONE message to WORK channel if any job has < 80% success rate in last 24h.
    // Silent when all jobs are healthy (no heartbeat on all-green).
    {
      name: 'cronHealthAlertJob',
      cron: CRONS.cronHealthAlert,
      options: { timezone: 'UTC' },
      runner: async () => {
        const r = await runCronHealthAlert()
        if (r.alertsSent > 0) {
          log(`[cron-health-alert] degraded=${r.alertsSent}`)
        }
        return { rowsWritten: r.alertsSent }
      },
    },

    // Every 30 min 24/7 — Pipeline watchdog — task 1190
    // Polls getPipelineHealth() and alerts WORK channel when staleMins > 90. 3-hour
    // cooldown prevents alert floods during sustained outages.
    {
      name: 'pipelineWatchdogJob',
      cron: CRONS.pipelineWatchdog,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runPipelineWatchdog()
        if (result === 'alert-sent' || result === 'notify-failed') {
          log(`[pipeline-watchdog] ${result}`)
        }
      },
    },

    // Weekdays 07:00 UTC (08:00 CET) — France morning summary — tasks 1316/1317
    // Sends Vietnamese digest to MARKET channel before Paris market open.
    {
      name: 'franceSummaryJob',
      cron: CRONS.franceSummary,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runFranceSummary()
        if (result.sent) {
          log(`[france-summary] sent — movers=${result.moverCount} alerts=${result.alertCount} ta=${result.taSignals.length}`)
        }
        return { rowsWritten: result.moverCount + result.alertCount }
      },
    },

    // Every 15 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — Parallel alert scan
    // — tasks 1307+1309. Runs TA and BB alert scans in parallel. Both scan watchlist for
    // technical breakouts. No direct Telegram — Alert Commander dispatches via
    // readUnnotifiedAlerts(). Task 1309c: Scheduler Dispatch Refactoring
    // Cron key: CRONS.alertScanParallel (single key — FIX-CRON-ALERTSCAN-CONFIG-KEYS-
    // ORPHANED-BY-PARALLEL-WRAPPER collapsed the old taAlertScan/bbAlertScan CRONS keys,
    // which no longer had any registration call site for the latter and produced two
    // permanently-frozen /api/cron-status Layer-A rows).
    {
      name: 'alertScanParallelJob',
      cron: CRONS.alertScanParallel,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runAlertScanParallel()
        if (result.totalFired > 0) {
          log(`[alert-scan-parallel] ta_scanned=${result.taResult?.scanned ?? 0} ta_fired=${result.taResult?.fired ?? 0}, bb_scanned=${result.bbResult?.scanned ?? 0} bb_fired=${result.bbResult?.fired ?? 0}, total_fired=${result.totalFired} [${result.durationMs}ms]`)
        }
        return { rowsWritten: result.totalFired }
      },
    },

    // 15:00 UTC (22:00 VN) Mon-Fri — OHLCV daily aggregator — task 1375, Sprint 130
    // Shifted from 16:00 → 15:00 UTC so aggregation runs 30 min before eveningSummary
    // (15:30 UTC). Aggregates intraday market_prices_history ticks into daily_ohlcv rows.
    {
      name: 'ohlcv-daily-aggregator',
      cron: CRONS.ohlcvDailyAggregator,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runOhlcvDailyAggregator()
      },
    },

    // 15:05 UTC Mon-Fri — OHLCV unit sanity check — CONTAM-5 / Sprint OHLCV-UNIT-CONTAM
    // Fires 5 min after ohlcvDailyAggregator (15:00 UTC). Scans last 7 days of daily_ohlcv
    // for all watchlist tickers. Sends BUG Telegram on any mixed-scale (contaminated) row.
    // Tolerates all-zero rows (BACKLOG_CONTAM_8 known defect) without spamming.
    {
      name: 'ohlcv-sanity-check',
      cron: CRONS.ohlcvSanityCheck,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runOhlcvSanityCheck()
        if (result.hitCount > 0) {
          log(`[ohlcv-sanity] contamination detected: ${result.hitCount} row(s), sentBug=${result.sentBug}`)
        }
        return { rowsWritten: result.hitCount }
      },
    },

    // 00:45 UTC Mon-Fri — OHLCV pre-briefing sanity check — FR-G4 /
    // FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0. Catches synthetic seed bars and scale
    // contamination BEFORE morning briefing (01:00 UTC) and before taOhlcvBackfill
    // (01:30 UTC). Reuses runOhlcvSanityCheck; distinct job id.
    {
      name: 'ohlcv-sanity-check-early',
      cron: CRONS.ohlcvSanityCheckEarly,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runOhlcvSanityCheck()
        if (result.hitCount > 0) {
          log(`[ohlcv-sanity-early] contamination detected: ${result.hitCount} row(s), sentBug=${result.sentBug}`)
        }
        return { rowsWritten: result.hitCount }
      },
    },

    // 08:15 UTC Mon-Fri — OHLCV staleness check — task 1465, Sprint 175
    // Fires after VN market open. Alerts WORK when >50% watchlist tickers have no
    // daily_ohlcv row for today's VN date (UTC+7). Covers mid-day VPS price-push failure.
    {
      name: 'ohlcv-staleness-check',
      cron: CRONS.ohlcvStalenessCheck,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runOhlcvStalenessCheck()
      },
    },

    // 01:40 UTC daily — OHLCV history backfill — OHLCV-BACKFILL-P0 (Sprint
    // MARKET-INDICATOR-DEPTH-P0). Backfills 2yr of daily bars for VN-Index + all watchlist
    // tickers from VnDirect api-finfo. Prerequisite unlock for P0-1 rv_60d + 252d-drawdown
    // and P1 momentum family. Idempotent via writeOhlcvBatch ON CONFLICT IGNORE — safe to
    // re-run daily. Fire-and-forget: non-blocking; errors per-ticker logged at WARN, not fatal.
    {
      name: 'ohlcv-history-backfill',
      cron: CRONS.ohlcvHistoryBackfill,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runOhlcvHistoryBackfill()
        return {
          rowsWritten: result.totalWritten,
          tickers: result.tickersProcessed,
          errors: result.errors.length,
        }
      },
    },

    // 01:30 UTC Mon-Fri — TA OHLCV restoration backfill — task 1970
    // Heals daily_ohlcv rows corrupt from 1972-era VNDIRECT null-coercion bug (low=0).
    // Fetches tickers with < 35 clean rows OR any low=0 corrupt rows. Uses INSERT OR
    // REPLACE. Fire-and-forget: non-blocking; errors logged only.
    {
      name: 'ta-ohlcv-backfill',
      cron: CRONS.taOhlcvBackfill,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runTaOhlcvBackfill()
        return {
          rowsWritten: result.backfilled,
          covered: result.covered,
          sparse: result.sparse,
          errors: result.errors.length,
        }
      },
    },

    // Every 10 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — Price update
    // watchdog — task 229. Early-warning layer for price staleness (6h threshold). Detects
    // when VPS price-push stops and alerts dev team + user before evening summary sends
    // stale data.
    {
      name: 'price-update-watchdog',
      cron: CRONS.priceUpdateWatchdog,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await priceUpdateWatchdog()
        if (result !== 'ok' && result !== 'off-hours' && result !== 'cooldown') {
          log(`[price-watchdog] ${result}`)
        }
      },
    },

    // 20:30 UTC daily — cascade backtest — task 1505, Sprint 192
    // Fills price_impact_3d/7d/outcome_correct on cascade_rule_hits rows older than 3 days.
    // Runs after ohlcvDailyAggregator (20:00 UTC) so D+3/D+7 closes are fully aggregated.
    {
      name: 'cascade-backtest',
      cron: CRONS.cascadeBacktest,
      options: { timezone: 'UTC' },
      runner: async () => {
        const { runCascadeBacktest } = await import('./macro/cascadeBacktestJob.js')
        await runCascadeBacktest()
      },
    },

    // Every 5 min — VPS service health polling — task 234, Sprint 234
    // Polls all 5 VPS services (price, BCTC, news, SBV, foreign-flow) and records health
    // status. Circuit breaker protects against cascading failures.
    {
      name: 'vpsServiceHealthJob',
      cron: CRONS.vpsServiceHealth,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runVpsHealthPolling()
      },
    },

    // Every 5 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — VN-Index refresh —
    // task 1397. Fetches VNINDEX directly from VnDirect vnmarket_prices API (not via VPS).
    // Ensures market_prices.VNINDEX stays fresh regardless of VPS push payload.
    {
      name: 'vnIndexRefreshJob',
      cron: CRONS.vnIndexRefresh,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runVnIndexRefreshJob()
        return { rowsWritten: result.stored }
      },
    },

    // Every 5 min, 24/7 — NO market-hours gate — intraday 5-min OHLCV compactor —
    // ALPHA-S2-TICK-DOWNSAMPLE-5MIN (Sprint FLOW-PRICE-ALPHA-LOOP). Groups
    // market_prices_history ticks into 5-min UTC-aligned bars and UPSERTs
    // intraday_ohlcv_5m — ALL codes present in the source table (brief §6), not just
    // watchlist. Archive-now compaction ahead of pushPricesHandler.ts's rolling ~24h
    // purge (brief §1.1). Idempotent + gap-tolerant by construction (brief §2) — see
    // docs/architecture-briefs/2026-07-14-alpha-s2-tick-downsample-5min.md.
    {
      name: 'intraday5mCompactorJob',
      cron: CRONS.intraday5mCompactor,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runIntraday5mCompactor()
        return { rowsWritten: result.bucketsWritten }
      },
    },

    // Every 5 min, 24/7 — NO market-hours gate — intraday 5-min FOREIGN-FLOW compactor —
    // ALPHA-S2-FOREIGN-FLOW-WRITE-RACE (Sprint FLOW-PRICE-ALPHA-LOOP). Groups
    // foreign_flow_history ticks into 5-min UTC-aligned buckets using LAST-value-in-bucket
    // semantics (NOT OHLC — foreign flow columns are cumulative counters / point-in-time
    // gauges, brief §2.3) and UPSERTs intraday_foreign_flow_5m — ALL codes present, standalone
    // table/job from the price plane (distinct bounded context). Archive-now compaction ahead
    // of pushForeignFlowHandler.ts's rolling ~24h purge (Step 6b). See
    // docs/architecture-briefs/2026-07-15-alpha-s2-foreign-flow-write-race-verdict.md.
    {
      name: 'intradayForeignFlow5mCompactorJob',
      cron: CRONS.intradayForeignFlow5mCompactor,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runIntradayForeignFlow5mCompactor()
        return { rowsWritten: result.bucketsWritten }
      },
    },

    // 09:09 UTC daily (16:09 VN) — SBV OMO liquidity cron — ALPHA-S2-OMO-LIQUIDITY-CRON
    // (Sprint FLOW-PRICE-ALPHA-LOOP). Triggers macro-indicators' POST /liquidity-state so
    // sbv_omo_daily accrues (the Go service already persists on every call when
    // omoInputs.ParseOK===true — this job is a pure trigger, zero local DB writes). HARD
    // fail (macroFetch ok:false) alerts BUG every time; SOFT fail (omo.is_estimate===true)
    // logs a warning only (avoids manufacturing false incidents out of normal SBV
    // no-auction-day cadence). See
    // docs/architecture-briefs/2026-07-15-alpha-s2-omo-liquidity-cron.md.
    {
      name: 'sbvOmoLiquidityCronJob',
      cron: CRONS.sbvOmoLiquidityCron,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runSbvOmoLiquidityCron()
        return { rowsWritten: result.persisted ? 1 : 0 }
      },
    },

    // 20:15 UTC daily (03:15 VN next day) — RAG FTS index rebuild trigger —
    // ALPHA-S2-RAG-FTS-REBUILD-CRON (Sprint FLOW-PRICE-ALPHA-LOOP). Triggers rag-service's
    // POST /admin/rebuild-fts so the BM25 hybrid-search leg picks up every row indexed via
    // ragIndex() since the last rebuild (DFR-P3's own design always intended this scheduled
    // half to exist alongside the lazy-on-first-hybrid-query fallback). Pure trigger — zero
    // local DB writes; the LanceDB FTS index mutation happens entirely server-side. Single-
    // branch HARD-fail contract (no ambiguous partial-success state, unlike sbvOmoLiquidityCron):
    // any non-2xx/network/90s-timeout error alerts BUG every time. See
    // docs/architecture-briefs/2026-07-15-alpha-s2-rag-fts-rebuild-cron.md.
    //
    // ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE (2026-07-15): gated behind CRON_RAG_FTS_REBUILD_ENABLED
    // (default-OFF — see ragFtsRebuildCronEnabled above). Registration is entirely omitted
    // (not just no-op'd) when the flag is unset/false, so a stray mcp-server redeploy cannot
    // arm the nightly OOM before RAG-FTS-BUILD-MEMORY-BOUND (rag-service capacity fix) lands.
    ...(ragFtsRebuildCronEnabled
      ? [
          {
            name: 'ragFtsRebuildCronJob',
            cron: CRONS.ragFtsRebuildCron,
            options: { timezone: 'UTC' },
            runner: async () => {
              const result = await runRagFtsRebuildCron()
              return { rowsWritten: result.rebuilt ? 1 : 0 }
            },
          },
        ]
      : []),

    // Every 30 min — Data freshness SLA monitor — task 234, Sprint 234
    // Checks signal source data freshness against SLA thresholds. Escalates to Alert
    // Commander when SLA breaches detected with 60-min cooldown.
    {
      name: 'freshnessSlaMonitorJob',
      cron: CRONS.freshnessSlaMonitor,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runFreshnessSlaMonitorJob()
      },
    },

    // 19:13 UTC daily — Macro indicator refresh — task 239, Sprint 239 (rescheduled
    // Sprint 1949-T7). Moved from 06:00 GMT+7 → 19:13 UTC so Evening Preview chef (19:37
    // UTC) has fresh US-session data. Fetches Yahoo/SBV/GSO macro indicators, FRED
    // EFFR/IORB, ISM sub-components.
    {
      name: 'macroIndicatorRefreshJob',
      cron: CRONS.macroIndicatorRefresh,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        await macroIndicatorRefreshJob()
      },
    },

    // Every 6 hours — IMF economic indicator poller — task 1296b
    // Fetches IMF growth/inflation/oil forecasts, stores in imf_indicators table,
    // classifies macro sentiment for signal enrichment via imfSentiment field.
    {
      name: 'imfIndicatorPollerJob',
      cron: CRONS.imfIndicatorPoller,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runImfIndicatorPollerJob()
        return { rowsWritten: result.indicator_count }
      },
    },

    // Every 8h — Per-call tool usage tracker — task TSU-DEV-U1
    // Reads perCallCounterStore snapshot (replaces sessionToolCache — dead in gateway
    // model), writes to docs/agent-memory/modules/tool-usage-stats.json (observability).
    {
      name: 'trackSessionToolUsageJob',
      cron: CRONS.trackSessionToolUsage,
      options: { timezone: 'UTC' },
      runner: async () => {
        const stats = await trackSessionToolUsageJob()
        return { rowsWritten: stats.uniqueTools }
      },
    },

    // Sunday 02:00 UTC — DB integrity check — task 1342
    // Runs PRAGMA integrity_check on market.db weekly. Also fires opportunistically when
    // WAL >= 40 MB (integrityCheckJob handles threshold). Alert sent to WORK channel when
    // corruption detected; silent on clean pass.
    {
      name: 'integrityCheckJob',
      cron: CRONS.integrityCheck,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runIntegrityCheckJob(Bun.env.DB_PATH ?? 'market.db', true)
        if (result && !result.ok) {
          log(`[integrity-check] CORRUPTION DETECTED — ${result.details.length} issue(s)`)
        }
        return { rowsWritten: result ? (result.ok ? 0 : 1) : 0 }
      },
    },

    // Weekdays 09:30 UTC (16:30 VN) — Market earning yield computation — task 1426a
    // Báu Phase 2 (Dinh Gia): aggregates PE from vnstock_financials, computes market-wide
    // median PE and earnings yield, writes two rows to tracked_indicators. Fires after
    // market close so intraday prices are fully settled. Coverage guard: skips DB write if
    // < 70% of watchlist tickers have valid PE.
    {
      name: 'marketEarningYieldJob',
      cron: CRONS.marketEarningYield,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runMarketEarningYieldJob()
      },
    },

    // 23:30 GMT+7 daily — Daily dashboard aggregation — task 1854a
    // Reads session logs + orch-state.json .task_board + project-stats.json and writes
    // docs/data/daily-dashboard.json for observability and sprint tracking. Fires after
    // evening summary (22:30) and periodic summary (22:30) are done.
    {
      name: 'dailyDashboardJob',
      cron: CRONS.dailyDashboard,
      options: { timezone: 'Asia/Ho_Chi_Minh' },
      runner: async () => {
        const result = await runDailyDashboardJob()
        log(`[daily-dashboard] written — date=${result.date} sessions=${result.sessionCount} tasksDone=${result.tasksDone}`)
        return { rowsWritten: result.sessionCount }
      },
    },

    // Every hour at minute=7 UTC — Verdict resolution job — task 1863b, Sprint 1867
    // Resolves pending AlertVerdict rows >=24h old by comparing fire-price vs live close.
    // Minute=7 avoids collision with the cluster of minute=0 jobs (cronHealthAlert,
    // weatherCheck, imfIndicatorPoller, etc.).
    {
      name: 'verdictResolutionJob',
      cron: CRONS.verdictResolutionJob,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runVerdictResolutionJobCron()
        if (result.rowsResolved > 0 || result.errors > 0) {
          log(`[verdict-resolution] evaluated=${result.rowsEvaluated} resolved=${result.rowsResolved} pruned=${result.rowsPruned} errors=${result.errors}`)
        }
        return { rowsWritten: result.rowsResolved }
      },
    },

    // Every 30 min — News headlines refresh — task 1899a-cron
    // Sequential: Bloomberg first, Reuters second (RAM constraint: no concurrent
    // Playwright browsers). Pushes normalized articles to /api/push-news. Errors per
    // source logged and skipped.
    {
      name: 'newsHeadlinesRefreshJob',
      cron: CRONS.newsHeadlinesRefresh,
      options: { timezone: 'UTC' },
      runner: async () => {
        await newsHeadlinesRefreshJob()
      },
    },

    // Sunday 02:30 UTC (09:30 VN) — Bond maturity poller — task 1920b
    // Fetches upcoming TPDN (corporate bond) maturities for watchlist issuers and upserts
    // them into bond_maturity via upsertBond() (ON CONFLICT idempotent). Zero-row result
    // triggers WORK alert. Fail-loud on fetch error. AC-0: vnstock bond endpoint / domain
    // seed data — direct from France (no VPS required).
    {
      name: 'bondMaturityPollerJob',
      cron: CRONS.bondMaturityPoller,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runBondMaturityPollerJob()
        return { rowsWritten: result.rowsWritten }
      },
    },

    // 06:00 UTC daily — Commodity prices + shipping indices refresh — task 1920c
    // FR-1: fetchYahooFinancePrices + storeCommoditySnapshot (commodity_prices + history).
    // FR-2: fetchShippingIndices + storeShippingIndices (tracked_indicators shipping
    // rows). Independent error isolation: commodity failure does NOT abort shipping call.
    // Fail-loud: each block sends WORK alert on error. Note: same cron expression as
    // macroIndicatorRefresh ('0 6 * * *') — kept as SEPARATE job registration for
    // independent cron_job_runs observability (per TASK_1920c.md spec).
    {
      name: 'commodityTrackerRefreshJob',
      cron: CRONS.commodityTrackerRefresh,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runCommodityTrackerRefreshJob()
        return { rowsWritten: result.rowsWritten }
      },
    },

    // Every 4 hours — SBV rates + USD/VND FX refresh — task 1920k
    // Fetches current VCB USD/VND official rate and SBV interest-rate fallbacks. Persists
    // via storeSbvSnapshot() into sbv_rates table (INSERT OR REPLACE). Fail-loud to WORK
    // channel on fetch or store error.
    {
      name: 'sbvRatesRefreshJob',
      cron: CRONS.sbvRatesRefresh,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runSbvRatesRefreshJob()
        return { rowsWritten: result.rowsWritten }
      },
    },

    // Last Friday of month 08:00 UTC — Broker sanctions quarterly sweep — task 1920d
    // Cron fires monthly (25th-31st Fri) but the job body applies a quarter-guard: only
    // runs in March / June / September / December. Non-quarter Fridays record
    // status='skipped' in cron_job_runs. Zero-result or fetch error → WORK alert. Requires
    // UNIQUE(broker_name, sanction_start) — migrated in schema-alerts.ts.
    {
      name: 'brokerSanctionsSweep',
      cron: CRONS.brokerSanctionsSweep,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runBrokerSanctionsJob()
        return { rowsWritten: result.rowsWritten }
      },
    },

    // Daily 08:30 UTC — Reputation compute job — task 1922d
    // Iterates all watchlist tickers, aggregates 7-day mention_velocity + agent_signals,
    // computes reputation score (0-100) and persists to reputation_scores table.
    // Fail-loud to WORK channel on job-level error; per-ticker failures are non-fatal.
    // recoverMissedExecutions: true — prevents silent drop under event loop saturation
    // (FU-REPUTATION-CRON-MISS 2026-06-11 + EVIDENCE-ACCUM-SILENT-CRON 2026-06-12: same
    // class of miss — node-cron drops tick when event loop is busy and autorecover=false).
    // jobRunRepo.wrapRun dedup: if already ran today, second fire is a no-op write (upsert).
    {
      name: 'reputationComputeJob',
      cron: CRONS.reputationCompute,
      options: { timezone: 'UTC', recoverMissedExecutions: true },
      runner: async () => {
        const result = await runReputationComputeJob()
        return { rowsWritten: result.tickersProcessed }
      },
    },

    // Monday 03:00 UTC — Public contracts weekly scrape — Task B
    // Fetches government procurement award results from muasamcong.mpi.gov.vn.
    // Geo-blocked outside Vietnam: set MUASAMCONG_VPS_PROXY_URL to route via Vinahost VPS.
    // Fail-loud to WORK channel when store errors occur; fetch-empty is silent.
    {
      name: 'publicContractsJob',
      cron: CRONS.publicContractsRefresh,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runPublicContractsJob()
        if (result.fetched > 0) {
          log(`[public-contracts] fetched=${result.fetched} inserted=${result.rowsWritten}`)
        }
        return { rowsWritten: result.rowsWritten }
      },
    },

    // Daily 07:00 UTC — Signal accuracy WORK digest — task 1941c
    // Computes 30-day accuracy stats from signal_outcomes, formats top-3/bottom-3 signal
    // type breakdown, sends to WORK channel. DB-backed dedup guard prevents duplicate
    // sends on day boundary (survives server restarts).
    {
      name: 'accuracyDigestJob',
      cron: CRONS.accuracyDigest,
      options: { timezone: 'UTC' },
      runner: () => runAccuracyDigest({ db }),
    },

    // Every hour at minute=47 UTC — Disk-usage watchdog — task 1959-watchdog-5
    // Shells out to `du -sh /app/data/lancedb` and sends BUG Telegram when usage exceeds
    // DISK_ALERT_THRESHOLD_GB (default 20 GB). 6 h cooldown prevents spam. Minute=47
    // avoids pile-up with minute=0/7/17/37 cluster.
    {
      name: 'diskUsageAlertJob',
      cron: CRONS.diskUsageAlert,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runDiskUsageAlertJob()
        if (result === 'alert-sent') {
          log('[disk-usage-alert] BUG Telegram sent — lancedb over threshold')
        }
        return { rowsWritten: result === 'alert-sent' ? 1 : 0 }
      },
    },

    // Daily 03:00 UTC — orch-state.json / task-lock coherence janitor — task 1965b (OSC-2)
    // D4 audit dimension: calls task_list_held(kind="sprint-task"), cross-checks
    // orch-state.json .head.active_task_id (AC-4), parses .task_board tasks (AC-2/AC-3),
    // detects concurrent git commits on docs/data/orch/orch-state.json within 30s (AC-5).
    // Appends signal_queue row for each divergence. Clean day → log only (AC-3). Off-peak:
    // 03:00 UTC (after bctcReparseJob at 02:30 UTC). No new DB schema.
    {
      name: 'tasksMdJanitorJob',
      cron: CRONS.tasksMdJanitor,
      options: { timezone: 'UTC' },
      runner: async () => {
        await runTasksMdJanitorJob()
      },
    },

    // Sprint SELF-IMPROVE-GATE Phase 2 — Self-improvement detection (09:02 UTC daily)
    // Shadow mode: all DISPATCH_PATHS default-false; no auto-dispatch fires at ship.
    // HN-1: bctcOverdueCheck is DAILY (0 9 * * *) not weekday-only; 2-min offset is correct.
    {
      name: 'selfImproveOrchestratorJob',
      cron: CRONS.selfImproveOrchestrator,
      options: { timezone: 'UTC' },
      runner: () => runSelfImproveOrchestrator({ db }),
    },

    // Sprint BCTC-EVAL-SUBSTRATE — Nightly BCTC eval recompute (22:02 UTC)
    // Off-market: 22:02 UTC = 05:02 GMT+7 next day; well outside HOSE hours (02:00-08:59
    // UTC Mon-Fri). Sweeps stale bctc_eval_results rows (detector_version mismatch) and
    // recomputes stages 4-6. Override via env: CRON_BCTC_EVAL_RECOMPUTE
    {
      name: 'bctcEvalRecomputeJob',
      cron: CRONS.bctcEvalRecompute,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runBctcEvalRecomputeJob()
        return { rowsWritten: result.recomputed * 3 } // 3 stages per report
      },
    },

    // Daily 20:30 UTC (03:30 VN next day) — AGM plan + actuals ingest —
    // RAPID-DATA-LAYER FIX-G. Pulls planned targets + actuals for all watchlist tickers
    // from Vinahost VPS proxy. Off-market: 20:30 UTC = after VN market close +
    // ohlcvDailyAggregator (20:00 UTC).
    {
      name: 'agmPlanRefreshJob',
      cron: CRONS.agmPlanRefresh,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runAgmPlanJob()
        if (result.plan_rows_written > 0 || result.actual_rows_written > 0) {
          log(`[agm-plan] plan_rows=${result.plan_rows_written} actual_rows=${result.actual_rows_written} tickers_ok=${result.tickers_ok.length} errors=${result.tickers_error.length}`)
        }
        return { rowsWritten: result.plan_rows_written + result.actual_rows_written }
      },
    },

    // Daily 21:00 UTC (04:00 VN next day) — Board appointment_year ingest —
    // RAPID-DATA-LAYER FIX-I-B. Pulls officer appointment dates for all watchlist tickers
    // from Vinahost VPS proxy. Off-market: 21:00 UTC = after AGM plan refresh (20:30 UTC).
    // UPDATE-only (no INSERT).
    {
      name: 'boardDetailsRefreshJob',
      cron: CRONS.boardDetailsRefresh,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runBoardDetailsJob()
        if (result.rows_updated > 0) {
          log(`[board-details] rows_updated=${result.rows_updated} tickers_ok=${result.tickers_ok.length} errors=${result.tickers_error.length}`)
        }
        return { rowsWritten: result.rows_updated }
      },
    },

    // Every 5 min — Deep-fetch VPS executor — DFR-P2-MCP
    // Drains up to deepFetch.maxPerCycle (10) pending queue rows via VPS
    // /proxy/article-body. Independent of the 15-min intelligence cycle — runs 24/7.
    {
      name: 'deepFetchVpsJob',
      cron: CRONS.deepFetchVps,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runDeepFetchVpsJob()
        return { rowsWritten: result.done }
      },
    },

    // Every 5 min — Deep-fetch main-server executor (Playwright fallback) — DFR-P2-MCP
    // Drains up to deepFetch.maxPlaywrightPerCycle (5) vps-failed rows via news-fetch
    // POST /fetch-article.
    {
      name: 'deepFetchMainJob',
      cron: CRONS.deepFetchMain,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runDeepFetchMainJob()
        return { rowsWritten: result.done }
      },
    },

    // 08:37 UTC Mon-Fri — Breadth History Persister — BREADTH-TIME-SERIES (Sprint
    // MARKET-INDICATOR-DEPTH-P0). Fetches HOSE market breadth
    // (advancing/declining/unchanged/ceiling/floor) from VnDirect vnmarket_prices and
    // writes one row per session to market_breadth_history. FORWARD-ACCRUING ONLY: no
    // backfill, ON CONFLICT IGNORE, NFR-BR-1 source logging. Slot: free between
    // reputationCompute (08:33 UTC) and alertOutcomeJob (08:45 UTC).
    {
      name: JOB_NAME_BREADTH_PERSISTER,
      cron: CRONS.breadthHistoryPersister,
      options: { timezone: 'UTC' },
      runner: async () => {
        const result = await runBreadthHistoryPersisterJob(db)
        if (result.inserted) {
          log(`[breadth-persister] inserted session_date=${result.session_date}`)
        } else if (result.skipped_reason) {
          log(`[breadth-persister] skipped: ${result.skipped_reason} date=${result.session_date ?? 'n/a'}`)
        }
        return { rowsWritten: result.inserted ? 1 : 0 }
      },
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// registerJobTable — the single generic loop that replaces 57 copy-pasted
// scheduleCron(CRONS.x, async () => { await jobRunRepo.wrapRun('xJob', ...) }, opts) blocks.
// ─────────────────────────────────────────────────────────────────────────────

export function registerJobTable(jobTable: JobTableEntry[], jobRunRepo: IJobRunRepository): void {
  for (const j of jobTable) {
    scheduleCron(j.cron, () => jobRunRepo.wrapRun(j.name, j.runner), j.options ?? {})
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// registerBespokeJobs — the 22 jobs that do NOT fit the plain jobRunRepo.wrapRun(name,
// runner) envelope: they skip wrapRun entirely (own DB-backed dedup via a run*WithDb
// startupHelpers.ts wrapper, or recordJobRun happens inside the job module itself), have
// non-standard try/catch shapes, or need extra local state built before registration
// (walEscalateFn, the scheduler-watchdog self-heal manifest). Each entry below is an
// unmodified copy of its original scheduleCron(...) call site.
// ─────────────────────────────────────────────────────────────────────────────

export function registerBespokeJobs(ctx: SchedulerJobTableCtx): void {
  const { db, jobRunRepo } = ctx

  // 09:00 — Market open scan (weekdays Mon-Fri only) — task 103
  // recordJobRun called inside runMarketScan() — job visible in cron_job_runs
  scheduleCron(CRONS.marketOpen, async () => {
    await runMarketScan('open')
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 15:30 — Market close scan (weekdays Mon-Fri only) — task 103
  // recordJobRun called inside runMarketScan() — job visible in cron_job_runs
  scheduleCron(CRONS.marketClose, async () => {
    await runMarketScan('close')
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 20:00 — SSC report check (task 104)
  // recordJobRun called inside runSscCheck() — job visible in cron_job_runs
  scheduleCron(CRONS.sscCheck, async () => {
    await runSscCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 30min — WAL checkpoint (task 1329a / BC-1 ROOT FIX)
  // BC-1: unconditional TRUNCATE every 30 min via runForcedTruncateCheckpoint() (issues
  // BEGIN IMMEDIATE to expire reader snapshots then PRAGMA wal_checkpoint(TRUNCATE)).
  // Replaces the FULL(live)/TRUNCATE(off-hours) split that left WAL wedged at 4000 frames.
  // Off-hours backup call preserved for data safety. Overridable via CRON_WAL_CHECKPOINT
  // env var. D-1 guardrail: escalation closure (walEscalation.ts createWalEscalateFn)
  // writes WAL_ESCALATION signal to orch-state when WAL > 10 MB. Closure stays agnostic
  // of orch-state at the checkpoint.ts (infra) layer — this scheduler-layer module is the
  // bridge.
  const walEscalateFn = createWalEscalateFn()
  scheduleCron(CRONS.walCheckpoint, async () => {
    await jobRunRepo.wrapRun('walCheckpointJob', async () => {
      const hour = new Date().getUTCHours()
      const isOffHours = hour >= 3 && hour < 5
      await checkWalFileSize(Bun.env.DB_PATH ?? 'market.db', undefined, undefined, walEscalateFn)
      // BC-1 ROOT FIX: TRUNCATE unconditionally every 30 min
      const walResult = await runForcedTruncateCheckpoint()
      await walCheckpointAlert({ walSize: walResult.walSize, checkpointed: walResult.checkpointed ? walResult.walSize : 0 })
      if (isOffHours) {
        await backupDatabase(Bun.env.DB_PATH ?? 'market.db')
      }
    })
  })

  // dataAuditJob:daily — recordJobRun called inside runDailyAudit() — task 157
  scheduleCron(CRONS.dataAuditDaily, async () => {
    await runDailyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  scheduleCron(CRONS.dataAuditWeekly, async () => {
    await runWeeklyAuditWithDb(db)
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:30 GMT+7 daily — BCTC stranded-PDF auto-reparse — task 1019
  scheduleCron(CRONS.bctcReparseJob, async () => {
    await runBctcReparseWithDb(db)
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 12 min — /ask queue check (task 1074).
  // Signals 07-qa-responder when pending questions are found in ask_queue. The server
  // never answers the question — the cowork agent does the work.
  scheduleCron(CRONS.askQueueCheck, () => {
    try {
      const result = runAskQueueCheck()
      if (result.signaled) {
        log(`[ask-queue-check] signaled 07-qa-responder: count=${result.count}`)
      }
    } catch (err) {
      log(`[ask-queue-check] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Daily 23:00 VN (16:00 UTC) — Evidence accumulator — task 1118
  // recoverMissedExecutions: true — if the event loop is stalled at fire time (e.g.
  // vnstockFundamentalsJob startup sweep occupying the event loop), node-cron replays the
  // missed tick on recovery instead of skipping until tomorrow
  // (EVIDENCE-ACCUM-SILENT-CRON root cause: event loop saturation drops tick when
  // recoverMissedExecutions is false). Safe: runEvidenceAccumulatorWithDb has a same-day
  // DB-backed dedup guard that prevents double execution.
  scheduleCron(CRONS.evidenceAccumulator, async () => {
    await runEvidenceAccumulatorWithDb(db)
  }, { timezone: 'UTC', recoverMissedExecutions: true })

  // Sunday 19:00 UTC (02:00 VN Monday) — Base rate computation — task 1122, Sprint 059
  scheduleCron(CRONS.baseRateComputation, async () => {
    await runBaseRateComputationWithDb(db)
  }, { timezone: 'UTC' })

  // Daily 16:30 UTC (23:30 VN) — Prediction resolution — task 1125
  // Fires after VN market close (15:30 VN = 08:30 UTC) giving the VPS price-push service
  // time to deliver daily_ohlcv rows before resolution runs.
  scheduleCron(CRONS.predictionResolution, async () => {
    await runPredictionResolutionWithDb(db)
  }, { timezone: 'UTC' })

  // Sunday 13:00 UTC (20:00 VN) — Calibration report — task 1128, Sprint 060
  // Weekly materialised Brier score aggregation over 90-day prediction_claims window.
  // Sends digest to WORK (always) and MARKET (when total_resolved >= 1).
  scheduleCron(CRONS.calibrationReport, async () => {
    await runCalibrationReportWithDb(db)
  }, { timezone: 'UTC' })

  // Weekdays 08:13 UTC (15:13 VN) — Foreign flow alert scan — task 1133, Sprint 061
  // (rescheduled Sprint 1949-T6). Moved from 09:30 → 08:13 UTC so EOD chef (08:37 UTC)
  // has the signal in hand (24min window). Scans watchlist for HIGH-severity smart-money
  // foreign flow signals. Inserts alert rows + evidence fragments. Digest sent to WORK only.
  scheduleCron(CRONS.foreignFlowAlert, async () => {
    try {
      await runForeignFlowAlertJobCron()
      log(`[foreign-flow-alert] completed`)
    } catch (err) {
      log(`[foreign-flow-alert] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'UTC' })

  // Daily 01:00 UTC (08:00 VN) — Insider SSC transaction check — task 1143, Sprint 063
  // Mon-Sun: SSC disclosures can be published on weekends. runInsiderCheck() uses
  // insertAlert + insertEvidenceFragment (no direct Telegram).
  scheduleCron(CRONS.insiderCheck, async () => {
    await runInsiderCheck()
  }, { timezone: 'UTC' })

  // Every 15 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — TA alert notifier —
  // task 1314. Delivers unnotified TA alert rows
  // (ta_overbought/ta_oversold/ta_bb_breakout_up/down) to Telegram market channel.
  // Batched (max 10/cycle). Marks notified_telegram=1 after send.
  scheduleCron(CRONS.taAlertNotifier, async () => {
    const result = await runTaAlertNotifierCron()
    if (result.sent > 0) {
      log(`[ta-alert-notifier] sent=${result.sent}`)
    }
  }, { timezone: 'UTC' })

  // 08:30 UTC Mon-Fri — Signal outcome resolver — task 1382
  // Resolves agent_signals with outcome='fired' or NULL after VN market close. Compares
  // entry price vs resolution price; marks confirmed or false_positive.
  // FIX-CRON-WATCHDOG-COVERAGE-BESPOKE-TELEMETRY: routed through jobRunRepo.wrapRun (was
  // a bare scheduleCron + .catch(console.error) with ZERO cron_job_runs telemetry — invisible
  // to get_cron_health and to WATCHDOG_MANIFEST regardless of manifest coverage, since there
  // was no row to query). wrapRun records status/duration and never re-throws (see
  // recordJobRun), so the .catch(console.error) safety net is now redundant and removed.
  scheduleCron(CRONS.signalOutcomeJob, () => jobRunRepo.wrapRun('signalOutcomeJob', async () => {
    await runSignalOutcomeJobCron()
  }), { timezone: 'UTC' })

  // 08:45 UTC Mon-Fri — Alert outcome resolver — task 1847d-C
  // Scores fired alerts WHERE outcome IS NULL using market_prices_history. 15 min after
  // signalOutcomeJob to avoid DB write contention. BLK-3: sends Telegram WORK digest for
  // position-danger HITs.
  // FIX-CRON-WATCHDOG-COVERAGE-BESPOKE-TELEMETRY: see signalOutcomeJob comment above.
  scheduleCron(CRONS.alertOutcomeJob, () => jobRunRepo.wrapRun('alertOutcomeJob', async () => {
    await runAlertOutcomeJobCron()
  }), { timezone: 'UTC' })

  // Every 1 min — Foreign flow fallback fetcher — task 1290
  // Resilience loop: if VPS is down, cache/SSE keeps daily_ohlcv updated.
  // recoverMissedExecutions: false (OPT-OUT, T2-ARCH-CRON-RECOVER-JITTER): fires every
  // 60 s by design; recovery replay would double-fetch within seconds of restart. The
  // underlying runForeignFlowFetcherJobCron() has its own freshness guard and is a pure
  // no-op when data is already fresh.
  scheduleCron(CRONS.foreignFlowFetch, async () => {
    try {
      await runForeignFlowFetcherJobCron()
    } catch (err) {
      log(`[foreign-flow-fetch] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'UTC', recoverMissedExecutions: false })

  // Every hour at minute=17 UTC — Signal outcome resolution — 2026-05-17 feedback loop
  // Resolves T+24h and T+48h pending rows in signal_outcomes by comparing entry vs
  // resolution price. Minute=17 avoids pile-up with minute=0/7 cluster (cronHealthAlert,
  // imfPoller, verdictResolution).
  // FIX-CRON-WATCHDOG-COVERAGE-BESPOKE-TELEMETRY: see signalOutcomeJob comment above.
  scheduleCron(CRONS.signalOutcomeResolution, () => jobRunRepo.wrapRun('signalOutcomeResolutionJob', async () => {
    await runSignalOutcomeResolutionJobCron()
  }), { timezone: 'UTC' })

  // Monday 01:00 UTC — vnstock fundamentals weekly batch sweep — task 1920a
  // Iterates 30-ticker watchlist; populates vnstock_financials, balance_sheet, cash_flow,
  // events, officers, shareholders via syncVnstockData per ticker. isRunning guard
  // prevents double-stack (7-10 min sweep). Per-ticker isolation. Fail-loud to WORK
  // channel when any tickers fail at sweep completion.
  scheduleCron(CRONS.vnstockFundamentalsRefresh, async () => {
    await runVnstockFundamentalsJobCron()
  }, { timezone: 'UTC' })

  // Weekdays 08:30 UTC (15:30 VN, post HOSE close) — vnstock trading stats daily sweep —
  // task 1920a. Iterates 30-ticker watchlist; upserts vnstock_trading_stats via
  // syncVnstockData. UNIQUE(code, date) ensures idempotency — repeated same-day runs are
  // safe. isRunning guard + per-ticker error isolation.
  scheduleCron(CRONS.vnstockTradingStatsRefresh, async () => {
    await runVnstockTradingStatsJobCron()
  }, { timezone: 'UTC' })

  // Every 10 min — Scheduler missed-fire watchdog — T3-ARCH-CRON-WATCHDOG (Lever D)
  // Queries MAX(started_at) per job_name against WATCHDOG_MANIFEST (16 jobs). Sends
  // WORK-channel alert when last successful run exceeds cadence × thresholdMultiplier.
  // Self-heal jobs (ohlcvDailyAggregator, reputationComputeJob, evidenceAccumulatorJob,
  // taOhlcvBackfill, intraday5mCompactorJob) are injected with selfHealFn here — DDD-clean: job modules are
  // imported at the composition root, not inside schedulerWatchdogJob.ts. In-process 2h
  // rate-limit prevents alert spam. No WAL writes from watchdog itself.
  // recoverMissedExecutions: true (via scheduleCron default) + recordJobRun routing
  // ensures shouldSkipRecoveryReplay covers the watchdog itself (idempotency T4). Cadence
  // /threshold values are hardcoded here to match WATCHDOG_MANIFEST constants
  // (Record<string,…> index is possibly-undefined in strict TS — inline literals avoid
  // non-null assertions and keep the types clean).
  const liveManifest: typeof WATCHDOG_MANIFEST = {
    ...WATCHDOG_MANIFEST,
    // FIX-T3: inject selfHealFn for self-heal jobs using the SAME job_name key that the
    // regular cron path writes to cron_job_runs — so the watchdog queries the correct
    // rows and the self-heal wrapRun writes under the same name.
    'ohlcv-daily-aggregator': {
      cadenceMs: 86_400_000,
      thresholdMultiplier: 1.5,
      action: 'self-heal',
      selfHealFn: async () => {
        // Writes cron_job_runs row as 'ohlcv-daily-aggregator' — matches the JOB_TABLE entry
        await jobRunRepo.wrapRun('ohlcv-daily-aggregator', async () => {
          await runOhlcvDailyAggregator()
        })
      },
    },
    reputationComputeJob: {
      cadenceMs: 86_400_000,
      thresholdMultiplier: 1.5,
      action: 'self-heal',
      selfHealFn: async () => {
        await jobRunRepo.wrapRun('reputationComputeJob', async () => {
          await runReputationComputeJob()
        })
      },
    },
    evidenceAccumulatorJob: {
      cadenceMs: 86_400_000,
      thresholdMultiplier: 1.5,
      action: 'self-heal',
      selfHealFn: async () => {
        await runEvidenceAccumulatorWithDb(db)
      },
    },
    'ta-ohlcv-backfill': {
      cadenceMs: 86_400_000,
      thresholdMultiplier: 1.5,
      action: 'self-heal',
      selfHealFn: async () => {
        // Writes cron_job_runs row as 'ta-ohlcv-backfill' — matches the JOB_TABLE entry
        await jobRunRepo.wrapRun('ta-ohlcv-backfill', async () => {
          await runTaOhlcvBackfill()
        })
      },
    },
    // ALPHA-S2-SUB5-WATCHDOG-STRETCH: 5-min cadence self-heal for the intraday
    // 5-min OHLCV compactor (JOB_TABLE name: 'intraday5mCompactorJob', L605
    // above) — see schedulerWatchdogJob.ts WATCHDOG_MANIFEST entry for the
    // §2 retention-purge rationale.
    intraday5mCompactorJob: {
      cadenceMs: 300_000,
      thresholdMultiplier: 3,
      action: 'self-heal',
      selfHealFn: async () => {
        // Writes cron_job_runs row as 'intraday5mCompactorJob' — matches the JOB_TABLE entry
        await jobRunRepo.wrapRun('intraday5mCompactorJob', async () => {
          await runIntraday5mCompactor()
        })
      },
    },
  }

  scheduleCron(CRONS.schedulerWatchdog, async () => {
    await jobRunRepo.wrapRun('schedulerWatchdogJob', async () => {
      const result = await runSchedulerWatchdog({ db, manifest: liveManifest })
      if (result.alerted > 0 || result.healed > 0) {
        log(`[scheduler-watchdog] checked=${result.checked} alerted=${result.alerted} healed=${result.healed}`)
      }
      return { rowsWritten: result.alerted + result.healed }
    })
  }, { timezone: 'UTC' })
}
