/**
 * Scheduled jobs — daily market routines (GMT+7 / Asia/Ho_Chi_Minh)
 * All crons configurable via .env
 *
 * Registered jobs:
 *   morningBriefing       08:00 weekdays       (task 101) ✓
 *   marketOpen            09:00 weekdays       (task 103) ✓
 *   intelligenceCycle     every 15 min         (task 106) ✓
 *   marketClose           15:30 weekdays       (task 103) ✓
 *   sscCheck              20:00 daily          (task 104) ✓
 *   alertDigest           21:00 weekdays       (task 188) ✓
 *   eveningSummary        22:30 weekdays       (task 105, rescheduled task 1186) ✓
 *   dataAuditDaily        23:00 daily          (task 157) ✓
 *   dataAuditWeekly       01:00 Sunday         (task 157) ✓
 *   predictionMarketPoll  every 30 min         (task 167) ✓
 *   predictionOutcomeCheck Sunday 08:00 UTC    (task 248) ✓
 *   devTeamHeartbeat       07:00 UTC Sunday    (task 245) ✓
 *   weatherCheck          every 6h (typhoon season) / 12h off-season  (task 261) ✓
 *   bctcOverdueCheck      09:00 daily          (task 1018 slice 3) ✓
 *   pipelineWatchdog      every 30 min 24/7  (task 1190) ✓
 *   taAlertScan           every 15min VN market hours  (task 1307) ✓
 *   bbAlertScan           every 15min VN market hours  (task 1309) ✓
 *   taAlertNotifier       every 15min VN market hours  (task 1314) ✓
 *   startupCatchup (morning)  30s after boot if 01:00 UTC passed  (task 1430) ✓
 *   startupCatchup (evening)  30s after boot if 15:30 UTC passed  (task 1430) ✓
 */

import cron from 'node-cron'
import { runSscCheck } from './sscCheckerJob.js'
import { runMarketScan } from './marketScanJob.js'
import { runMorningBriefing } from './briefings/morningBriefingJob.js'
import { runEveningSummary } from './briefings/eveningSummaryJob.js'
import { runIntelligenceCycle } from './intelligenceCycleJob.js'
import { registerSummaryJobs } from './summaryJobs.js'
import { runWalCheckpoint, registerShutdownHook } from '../infrastructure/db/checkpoint.js'
import { walCheckpointAlert } from './walCheckpointAlert.js'
import { runPatternWatch } from './patternWatchJob.js'
import { runDailyAudit, runWeeklyAudit, runDailyAuditIfStale } from './dataAuditJob.js'
import { runPredictionMarketPoll } from './predictionMarketJob.js'
import { runAlertDigest } from './alerts/alertDigestJob.js'
import { runWeeklyPortfolioReport } from './portfolio/weeklyPortfolioReportJob.js'
import { runPredictionOutcomeCheck } from './predictionOutcomeJob.js'
import { runDevTeamHeartbeat } from './system/devTeamHeartbeatJob.js'
import { runWeatherCheck } from './weatherCheckJob.js'
import { runDavPharmacyCheck } from './davPharmacyJob.js'
import { runVpsProxyWatchdog } from './vpsProxyWatchdogJob.js'
import { runBctcOverdueCheck } from './financial-reports/bctcOverdueCheckJob.js'
import { runBctcReparseJob } from './financial-reports/bctcReparseJob.js'
import { runAskQueueCheck } from './system/askQueueCheckJob.js'
import { runCronHealthAlert } from './alerts/cronHealthAlertJob.js'
import { runEvidenceAccumulatorJob } from './evidenceAccumulatorJob.js'
import { runBaseRateComputationJob } from './baseRateComputationJob.js'
import { runPredictionResolutionJob } from './predictionResolutionJob.js'
import { runCalibrationReportJob } from './calibrationReportJob.js'
import { runForeignFlowAlertJobCron } from './foreignFlowAlertJob.js'
import { runInsiderCheck } from './insiderCheckJob.js'
import { runPipelineWatchdog } from './pipelineWatchdogJob.js'
import { runFranceSummary } from './briefings/franceSummaryJob.js'
import { runTaAlertScan } from './taAlertScanJob.js'
import { runBbAlertScan } from './alerts/bbAlertScanJob.js'
import { runTaAlertNotifierCron } from './taAlertNotifierJob.js'
import { runOhlcvStartupProbe } from './ohlcvStartupProbe.js'
import { runOhlcvDailyAggregator } from './ohlcvDailyAggregatorJob.js'
import { runOhlcvStalenessCheck } from './ohlcvStalenessCheckJob.js'
import { getDb } from '../infrastructure/db/schema.js'
import { recordJobRun } from '../infrastructure/db/cronJobRunStore.js'
import type { Database } from 'bun:sqlite'

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
  /** /ask queue check: every 12 min — signal 07-qa-responder when pending (task 1074) */
  askQueueCheck:          Bun.env.CRON_ASK_QUEUE_CHECK             ?? '*/12 * * * *',
  /** SQLite WAL checkpoint: every 6h (task 1464 — was daily 20:00 UTC, busy readers blocked TRUNCATE causing 497MB WAL) */
  walCheckpoint:          Bun.env.CRON_WAL_CHECKPOINT             ?? '0 */6 * * *',
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
  /** Foreign flow alert: daily 09:30 UTC (16:30 VN) weekdays — task 1133, Sprint 061 */
  foreignFlowAlert:       Bun.env.CRON_FOREIGN_FLOW_ALERT          ?? '30 9 * * 1-5',
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
}

// ─────────────────────────────────────────────────────────────────────────────
// shouldRunCatchup — startup catch-up decision helper (task 1430)
//
// Returns true when:
//   (a) nowUtc is at or past the window threshold (windowUtcHour:windowUtcMin), AND
//   (b) cron_job_runs has no row for jobName with started_at >= date('now').
//
// On any DB error returns false (fail-safe — do not fire the job).
// nowUtc defaults to new Date() in production; inject a fixed Date in tests.
// ─────────────────────────────────────────────────────────────────────────────
export function shouldRunCatchup(
  db: Database,
  jobName: string,
  windowUtcHour: number,
  windowUtcMin: number,
  nowUtc: Date = new Date(),
  weekdayOnly: boolean = false,
): boolean {
  if (weekdayOnly) {
    const day = nowUtc.getUTCDay()
    if (day === 0 || day === 6) {
      log(`[startup-catchup] ${jobName}: weekend — skipping (weekdayOnly)`)
      return false
    }
  }

  const utcHour = nowUtc.getUTCHours()
  const utcMin  = nowUtc.getUTCMinutes()
  const windowReached =
    utcHour > windowUtcHour ||
    (utcHour === windowUtcHour && utcMin >= windowUtcMin)

  if (!windowReached) {
    log(`[startup-catchup] ${jobName}: window not reached (utcHour=${utcHour})`)
    return false
  }

  try {
    const row = db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM cron_job_runs
         WHERE job_name = ? AND started_at >= date('now')`,
      )
      .get(jobName)
    if ((row?.cnt ?? 0) > 0) {
      log(`[startup-catchup] ${jobName}: already ran today — skipping`)
      return false
    }
    return true
  } catch {
    log(`[startup-catchup] ${jobName}: DB error — skipping (fail-safe)`)
    return false
  }
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [SCHEDULER] ${msg}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Testable cron-callback wrappers — task 1420
//
// Each wrapper calls recordJobRun(db, jobName, fn) so the job name always
// appears in cron_job_runs regardless of which DB is passed. Production cron
// callbacks call these with getDb(); tests inject an in-memory DB and a no-op
// fn to verify observability without running real business logic.
// ─────────────────────────────────────────────────────────────────────────────

/** dataAuditJob:weekly — task 157 */
export async function runWeeklyAuditWithDb(
  db: Database,
  fn: () => Promise<void> = async () => { await runWeeklyAudit() },
): Promise<void> {
  await recordJobRun(db, 'dataAuditJob:weekly', fn)
}

/** bctcReparseJob — task 1019 */
export async function runBctcReparseWithDb(
  db: Database,
  fn: () => Promise<void> = async () => { await runBctcReparseJob() },
): Promise<void> {
  await recordJobRun(db, 'bctcReparseJob', fn)
}

/** evidenceAccumulatorJob — task 1118 */
export async function runEvidenceAccumulatorWithDb(
  db: Database,
  fn: () => Promise<void> = async () => { await runEvidenceAccumulatorJob() },
): Promise<void> {
  await recordJobRun(db, 'evidenceAccumulatorJob', fn)
}

/** baseRateComputationJob — task 1122 */
export async function runBaseRateComputationWithDb(
  db: Database,
  fn: () => Promise<void> = async () => { await runBaseRateComputationJob() },
): Promise<void> {
  await recordJobRun(db, 'baseRateComputationJob', fn)
}

/** predictionResolutionJob — task 1125 */
export async function runPredictionResolutionWithDb(
  db: Database,
  fn: () => Promise<void> = async () => { await runPredictionResolutionJob() },
): Promise<void> {
  await recordJobRun(db, 'predictionResolutionJob', fn)
}

/** calibrationReportJob — task 1128 */
export async function runCalibrationReportWithDb(
  db: Database,
  fn: () => Promise<void> = async () => { await runCalibrationReportJob() },
): Promise<void> {
  await recordJobRun(db, 'calibrationReportJob', fn)
}

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

  // Startup probe — ohlcv data completeness check (task 1353, Sprint 119).
  // Fire-and-forget: alerts WORK channel if any watchlist ticker has < 8
  // daily_ohlcv rows, prompting operator to run fetch-ohlcv-backfill.sh on VPS.
  void runOhlcvStartupProbe().then((r) => {
    if (r.sent) log(`[ohlcv-probe] sparse tickers: ${r.sparseTickers.map(t => t.code).join(', ')}`)
  }).catch(console.error)

  // 08:00 — Morning briefing (weekdays Mon-Fri only) — task 101
  cron.schedule(CRONS.morningBriefing, async () => {
    await recordJobRun(getDb(), 'morningBriefingJob', async () => {
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
    await recordJobRun(getDb(), 'intelligenceCycleJob', async () => {
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
    await recordJobRun(getDb(), 'eveningSummaryJob', async () => {
      await runEveningSummary()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 21:00 — Alert digest (weekdays Mon-Fri only) — task 188
  cron.schedule(CRONS.alertDigest, async () => {
    await recordJobRun(getDb(), 'alertDigestJob', async () => {
      await runAlertDigest()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 03:00 GMT+7 (20:00 UTC) — WAL checkpoint (task 140, 1458)
  // Note: 20:00 UTC = 03:00 GMT+7 (ICT). Overridable via CRON_WAL_CHECKPOINT env var.
  cron.schedule(CRONS.walCheckpoint, async () => {
    await recordJobRun(getDb(), 'walCheckpointJob', async () => {
      const walResult = runWalCheckpoint()
      await walCheckpointAlert(walResult)
    })
  })

  // Sunday 22:30 GMT+7 — Weekly pattern watch (task 146)
  cron.schedule(CRONS.patternWatch, async () => {
    await recordJobRun(getDb(), 'patternWatchJob', async () => {
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

  // dataAuditJob:daily — recordJobRun called inside runDailyAudit() — task 157
  cron.schedule(CRONS.dataAuditDaily, async () => {
    await runDailyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  cron.schedule(CRONS.dataAuditWeekly, async () => {
    await runWeeklyAuditWithDb(getDb())
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Startup catch-up: if a server restart straddled the 23:00 daily cron,
  // last_daily_audit can drift >24h causing WAL bloat risk. Fire-and-forget.
  // Triggered by report 994 (missed 2026-04-06 audit).
  void runDailyAuditIfStale().then((ran) => {
    if (ran) log("daily audit catch-up ran on startup")
  })

  cron.schedule(CRONS.predictionMarketPoll, async () => {
    await recordJobRun(getDb(), 'predictionMarketPollJob', async () => {
      await runPredictionMarketPoll()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:30 GMT+7 daily — BCTC stranded-PDF auto-reparse — task 1019
  cron.schedule(CRONS.bctcReparseJob, async () => {
    await runBctcReparseWithDb(getDb())
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Startup catch-up: if server restarts after 09:30 GMT+7, stranded PDFs
  // won't be reparsed until tomorrow. Fire-and-forget 30s after boot.
  // Triggered by report 1108 (VNM/VEA PDFs on disk but financial_reports empty).
  setTimeout(async () => {
    try {
      const r = await runBctcReparseJob()
      if (r.resolved > 0) {
        log(`[bctc-reparse] startup catch-up: resolved=${r.resolved} examined=${r.examined}`)
      }
    } catch (err) {
      log(`[bctc-reparse] startup catch-up failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, 30_000)

  // Startup catch-up: if server restarts after 08:00 GMT+7 (01:00 UTC) or
  // 22:30 GMT+7 (15:30 UTC) without morning briefing / evening summary having
  // run, fire them once. 30s delay matches bctcReparseJob pattern. task 1430.
  setTimeout(async () => {
    log('[startup-catchup] probe firing — checking morningBriefingJob + eveningSummaryJob + franceSummaryJob')
    const db = getDb()

    try {
      if (shouldRunCatchup(db, 'morningBriefingJob', 1, 0, new Date(), true)) {
        log('[startup-catchup] morningBriefingJob: running catch-up')
        await recordJobRun(db, 'morningBriefingJob', async () => { await runMorningBriefing() })
      }
    } catch (err) {
      log(`[startup-catchup] morningBriefingJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      if (shouldRunCatchup(db, 'eveningSummaryJob', 15, 30, new Date(), true)) {
        log('[startup-catchup] eveningSummaryJob: running catch-up')
        await recordJobRun(db, 'eveningSummaryJob', async () => { await runEveningSummary() })
      }
    } catch (err) {
      log(`[startup-catchup] eveningSummaryJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      if (shouldRunCatchup(db, 'franceSummaryJob', 9, 0, new Date(), true)) {
        log('[startup-catchup] franceSummaryJob: running catch-up')
        await recordJobRun(db, 'franceSummaryJob', async () => { await runFranceSummary() })
      }
    } catch (err) {
      log(`[startup-catchup] franceSummaryJob error: ${err instanceof Error ? err.message : String(err)}`)
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
    await recordJobRun(getDb(), 'weeklyPortfolioReportJob', async () => {
      await runWeeklyPortfolioReport()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Sunday 07:00 UTC (08:00 CET) — Dev Team weekly heartbeat — task 245
  cron.schedule(CRONS.devTeamHeartbeat, async () => {
    await recordJobRun(getDb(), "devTeamHeartbeatJob", async () => {
      await runDevTeamHeartbeat()
    })
  }, { timezone: "UTC" })

  // Sunday 08:00 UTC — Prediction market outcome validation — task 248
  // Validates last 7 days of prediction signals: confirmed / false_positive / neutral
  cron.schedule(CRONS.predictionOutcome, async () => {
    await recordJobRun(getDb(), 'predictionOutcomeJob', async () => {
      await runPredictionOutcomeCheck()
    })
  }, { timezone: "UTC" })

  // Every 6h — Weather check + climate signals — task 261
  // Typhoon season (Jun-Nov): every 6h. Off-season: every 12h.
  cron.schedule(CRONS.weatherCheck, async () => {
    await recordJobRun(getDb(), "weatherCheckJob", async () => {
      await runWeatherCheck()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 1st of month 06:00 — DAV drug approval check (Sprint 044)
  cron.schedule(CRONS.davPharmacyCheck, async () => {
    await recordJobRun(getDb(), "davPharmacyCheckJob", async () => {
      await runDavPharmacyCheck()
    })
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Daily 09:00 GMT+7 — BCTC overdue check (task 1018 slice 3).
  // Inserted alerts (severity=high) flow through readUnnotifiedAlerts ->
  // existing Alert Commander Telegram dispatch. Deterministic per-day id
  // keeps cooldown/dedup intact.
  cron.schedule(CRONS.bctcOverdueCheck, async () => {
    await recordJobRun(getDb(), 'bctcOverdueCheckJob', async () => {
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
    await recordJobRun(getDb(), 'vpsProxyWatchdogJob', async () => {
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
    await recordJobRun(getDb(), 'cronHealthAlertJob', async () => {
      const r = await runCronHealthAlert()
      if (r.alertsSent > 0) {
        log(`[cron-health-alert] degraded=${r.alertsSent}`)
      }
      return { rowsWritten: r.alertsSent }
    })
  }, { timezone: 'UTC' })

  // Daily 23:00 VN (16:00 UTC) — Evidence accumulator — task 1118
  cron.schedule(CRONS.evidenceAccumulator, async () => {
    await runEvidenceAccumulatorWithDb(getDb())
  }, { timezone: 'UTC' })

  // Sunday 19:00 UTC (02:00 VN Monday) — Base rate computation — task 1122, Sprint 059
  cron.schedule(CRONS.baseRateComputation, async () => {
    await runBaseRateComputationWithDb(getDb())
  }, { timezone: 'UTC' })

  // Daily 16:30 UTC (23:30 VN) — Prediction resolution — task 1125
  // Fires after VN market close (15:30 VN = 08:30 UTC) giving the VPS
  // price-push service time to deliver daily_ohlcv rows before resolution runs.
  cron.schedule(CRONS.predictionResolution, async () => {
    await runPredictionResolutionWithDb(getDb())
  }, { timezone: 'UTC' })

  // Sunday 13:00 UTC (20:00 VN) — Calibration report — task 1128, Sprint 060
  // Weekly materialised Brier score aggregation over 90-day prediction_claims window.
  // Sends digest to WORK (always) and MARKET (when total_resolved >= 1).
  cron.schedule(CRONS.calibrationReport, async () => {
    await runCalibrationReportWithDb(getDb())
  }, { timezone: 'UTC' })

  // Weekdays 09:30 UTC (16:30 VN) — Foreign flow alert scan — task 1133, Sprint 061
  // Scans watchlist for HIGH-severity smart-money foreign flow signals.
  // Inserts alert rows + evidence fragments. Digest sent to WORK only.
  // Alert Commander handles MARKET escalation via readUnnotifiedAlerts pipeline.
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
    await recordJobRun(getDb(), 'pipelineWatchdogJob', async () => {
      const result = await runPipelineWatchdog()
      if (result === 'alert-sent' || result === 'notify-failed') {
        log(`[pipeline-watchdog] ${result}`)
      }
    })
  }, { timezone: 'UTC' })

  // Weekdays 07:00 UTC (08:00 CET) — France morning summary — tasks 1316/1317
  // Sends Vietnamese digest to MARKET channel before Paris market open.
  cron.schedule(CRONS.franceSummary, async () => {
    await recordJobRun(getDb(), "franceSummaryJob", async () => {
      const result = await runFranceSummary()
      if (result.sent) {
        log(`[france-summary] sent — movers=${result.moverCount} alerts=${result.alertCount} ta=${result.taSignals.length}`)
      }
      return { rowsWritten: result.moverCount + result.alertCount }
    })
  }, { timezone: 'UTC' })

  // Every 15 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — TA alert scan — task 1307
  // Scans watchlist RSI(14). Writes ta_overbought/ta_oversold rows to alerts table.
  // No direct Telegram — Alert Commander dispatches via readUnnotifiedAlerts().
  cron.schedule(CRONS.taAlertScan, async () => {
    await recordJobRun(getDb(), 'taAlertScanJob', async () => {
      const result = await runTaAlertScan()
      if (result.fired > 0) {
        log(`[ta-alert-scan] scanned=${result.scanned} fired=${result.fired}`)
      }
      return { rowsWritten: result.fired }
    })
  }, { timezone: 'UTC' })

  // Every 15 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — BB alert scan — task 1309
  // Scans watchlist BB20 upper/lower breakouts. Writes ta_bb_breakout_up/ta_bb_breakout_down rows.
  // No direct Telegram — Alert Commander dispatches via readUnnotifiedAlerts().
  cron.schedule(CRONS.bbAlertScan, async () => {
    await recordJobRun(getDb(), 'bbAlertScanJob', async () => {
      const result = await runBbAlertScan()
      if (result.fired > 0) {
        log(`[bb-alert-scan] scanned=${result.scanned} fired=${result.fired}`)
      }
      return { rowsWritten: result.fired }
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

  // 15:00 UTC (22:00 VN) Mon-Fri — OHLCV daily aggregator — task 1375, Sprint 130
  // Shifted from 16:00 → 15:00 UTC so aggregation runs 30 min before eveningSummary (15:30 UTC).
  // Aggregates intraday market_prices_history ticks into daily_ohlcv rows for each watchlist ticker.
  cron.schedule(CRONS.ohlcvDailyAggregator, async () => {
    await recordJobRun(getDb(), 'ohlcv-daily-aggregator', async () => {
      await runOhlcvDailyAggregator()
    })
  }, { timezone: 'UTC' })

  // 08:15 UTC Mon-Fri — OHLCV staleness check — task 1465, Sprint 175
  // Fires after VN market open. Alerts WORK when >50% watchlist tickers have no
  // daily_ohlcv row for today's VN date (UTC+7). Covers mid-day VPS price-push failure.
  cron.schedule(CRONS.ohlcvStalenessCheck, async () => {
    await recordJobRun(getDb(), 'ohlcv-staleness-check', async () => {
      await runOhlcvStalenessCheck()
    })
  }, { timezone: 'UTC' })

  // 20:30 UTC daily — cascade backtest — task 1505, Sprint 192
  // Fills price_impact_3d/7d/outcome_correct on cascade_rule_hits rows older than 3 days.
  // Runs after ohlcvDailyAggregator (20:00 UTC) so D+3/D+7 closes are fully aggregated.
  cron.schedule(CRONS.cascadeBacktest, async () => {
    await recordJobRun(getDb(), 'cascade-backtest', async () => {
      const { runCascadeBacktest } = await import('./cascadeBacktestJob.js');
      await runCascadeBacktest();
    });
  }, { timezone: 'UTC' })

  log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} cron keys in CRONS map (incl. WAL checkpoint + 5 summary) + vps-watchdog active`)
}
