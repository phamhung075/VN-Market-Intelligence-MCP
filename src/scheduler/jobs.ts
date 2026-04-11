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
 *   eveningSummary        22:00 weekdays       (task 105) ✓
 *   dataAuditDaily        23:00 daily          (task 157) ✓
 *   dataAuditWeekly       01:00 Sunday         (task 157) ✓
 *   predictionMarketPoll  every 30 min         (task 167) ✓
 *   predictionOutcomeCheck Sunday 08:00 UTC    (task 248) ✓
 *   franceSummary          06:00 UTC weekdays  (task 243) ✓
 *   devTeamHeartbeat       07:00 UTC Sunday    (task 245) ✓
 *   weatherCheck          every 6h (typhoon season) / 12h off-season  (task 261) ✓
 *   bctcOverdueCheck      09:00 daily          (task 1018 slice 3) ✓
 */

import cron from 'node-cron'
import { runSscCheck } from './sscCheckerJob.js'
import { runMarketScan } from './marketScanJob.js'
import { runMorningBriefing } from './morningBriefingJob.js'
import { runEveningSummary } from './eveningSummaryJob.js'
import { runIntelligenceCycle } from './intelligenceCycleJob.js'
import { registerSummaryJobs } from './summaryJobs.js'
import { runWalCheckpoint, registerShutdownHook } from '../infrastructure/db/checkpoint.js'
import { runPatternWatch } from './patternWatchJob.js'
import { runDailyAudit, runWeeklyAudit, runDailyAuditIfStale } from './dataAuditJob.js'
import { runPredictionMarketPoll } from './predictionMarketJob.js'
import { runAlertDigest } from './alertDigestJob.js'
import { runWeeklyPortfolioReport } from './weeklyPortfolioReportJob.js'
import { runPredictionOutcomeCheck } from './predictionOutcomeJob.js'
import { runFranceSummary } from './franceSummaryJob.js'
import { runDevTeamHeartbeat } from './devTeamHeartbeatJob.js'
import { runWeatherCheck } from './weatherCheckJob.js'
import { runDavPharmacyCheck } from './davPharmacyJob.js'
import { runVpsProxyWatchdog } from './vpsProxyWatchdogJob.js'
import { runBctcOverdueCheck } from './bctcOverdueCheckJob.js'
import { runBctcReparseJob } from './bctcReparseJob.js'
import { runAskQueueCheck } from './askQueueCheckJob.js'
import { runCronHealthAlert } from './cronHealthAlertJob.js'

export const CRONS = {
  morningBriefing:        Bun.env.CRON_MORNING_BRIEFING          ?? '0 8 * * 1-5',
  marketOpen:             Bun.env.CRON_MARKET_OPEN               ?? '0 9 * * 1-5',
  intelligenceCycle:      Bun.env.CRON_INTELLIGENCE_CYCLE         ?? '*/15 * * * *',
  marketClose:            Bun.env.CRON_MARKET_CLOSE               ?? '30 15 * * 1-5',
  sscCheck:               Bun.env.CRON_SSC_CHECK                  ?? '0 20 * * *',
  alertDigest:            Bun.env.CRON_ALERT_DIGEST               ?? '0 21 * * 1-5',
  eveningSummary:         Bun.env.CRON_EVENING_SUMMARY            ?? '0 22 * * 1-5',
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
  /** France wake-up summary: weekdays 06:00 UTC (07:00 CET) — task 243 */
  franceSummary:          Bun.env.CRON_FRANCE_SUMMARY             ?? '0 6 * * 1-5',
  /** SQLite WAL checkpoint: daily 03:00 GMT+7 = 20:00 UTC (task 140) */
  walCheckpoint:          Bun.env.CRON_WAL_CHECKPOINT             ?? '0 20 * * *',
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
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [SCHEDULER] ${msg}`)
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

  // 08:00 — Morning briefing (weekdays Mon-Fri only) — task 101
  cron.schedule(CRONS.morningBriefing, async () => {
    await runMorningBriefing()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:00 — Market open scan (weekdays Mon-Fri only) — task 103
  cron.schedule(CRONS.marketOpen, async () => {
    await runMarketScan('open')
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 15 min — Intelligence cycle (task 106)
  // During market hours (09:00-15:30 GMT+7 Mon-Fri): full 5-step cycle
  //   A. pollNews  B. listSscDocs  C. fetchPrices  D. runImpactChain  E. sendAlerts
  // Outside market hours: news poll only (step A)
  cron.schedule(CRONS.intelligenceCycle, async () => {
    await runIntelligenceCycle()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 15:30 — Market close scan (weekdays Mon-Fri only) — task 103
  cron.schedule(CRONS.marketClose, async () => {
    await runMarketScan('close')
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 20:00 — SSC report check (task 104)
  cron.schedule(CRONS.sscCheck, async () => {
    await runSscCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 22:00 — Evening summary (weekdays Mon-Fri only) — task 105
  cron.schedule(CRONS.eveningSummary, async () => {
    await runEveningSummary()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 21:00 — Alert digest (weekdays Mon-Fri only) — task 188
  cron.schedule(CRONS.alertDigest, async () => {
    await runAlertDigest()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 03:00 GMT+7 (20:00 UTC) — WAL checkpoint (task 140)
  // Note: 20:00 UTC = 03:00 GMT+7 (ICT). Overridable via CRON_WAL_CHECKPOINT env var.
  cron.schedule(CRONS.walCheckpoint, () => {
    runWalCheckpoint()
  })

  // Sunday 22:30 GMT+7 — Weekly pattern watch (task 146)
  cron.schedule(CRONS.patternWatch, async () => {
    await runPatternWatch()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  registerSummaryJobs({
    daily:     CRONS.summaryDaily,
    weekly:    CRONS.summaryWeekly,
    monthly:   CRONS.summaryMonthly,
    quarterly: CRONS.summaryQuarterly,
    yearly:    CRONS.summaryYearly,
  })

  cron.schedule(CRONS.dataAuditDaily, async () => {
    await runDailyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  cron.schedule(CRONS.dataAuditWeekly, async () => {
    await runWeeklyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Startup catch-up: if a server restart straddled the 23:00 daily cron,
  // last_daily_audit can drift >24h causing WAL bloat risk. Fire-and-forget.
  // Triggered by report 994 (missed 2026-04-06 audit).
  void runDailyAuditIfStale().then((ran) => {
    if (ran) log("daily audit catch-up ran on startup")
  })

  cron.schedule(CRONS.predictionMarketPoll, async () => {
    await runPredictionMarketPoll()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:30 GMT+7 daily — BCTC stranded-PDF auto-reparse — task 1019
  cron.schedule(CRONS.bctcReparseJob, async () => {
    await runBctcReparseJob()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

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
    await runWeeklyPortfolioReport()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Weekdays 06:00 UTC (07:00 CET) — France wake-up summary — task 243
  cron.schedule(CRONS.franceSummary, async () => {
    await runFranceSummary()
  }, { timezone: "UTC" })

  // Sunday 07:00 UTC (08:00 CET) — Dev Team weekly heartbeat — task 245
  cron.schedule(CRONS.devTeamHeartbeat, async () => {
    await runDevTeamHeartbeat()
  }, { timezone: "UTC" })

  // Sunday 08:00 UTC — Prediction market outcome validation — task 248
  // Validates last 7 days of prediction signals: confirmed / false_positive / neutral
  cron.schedule(CRONS.predictionOutcome, async () => {
    await runPredictionOutcomeCheck()
  }, { timezone: "UTC" })

  // Every 6h — Weather check + climate signals — task 261
  // Typhoon season (Jun-Nov): every 6h. Off-season: every 12h.
  cron.schedule(CRONS.weatherCheck, async () => {
    await runWeatherCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 1st of month 06:00 — DAV drug approval check (Sprint 044)
  cron.schedule(CRONS.davPharmacyCheck, async () => {
    await runDavPharmacyCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Daily 09:00 GMT+7 — BCTC overdue check (task 1018 slice 3).
  // Inserted alerts (severity=high) flow through readUnnotifiedAlerts ->
  // existing Alert Commander Telegram dispatch. Deterministic per-day id
  // keeps cooldown/dedup intact.
  cron.schedule(CRONS.bctcOverdueCheck, async () => {
    try {
      const r = await runBctcOverdueCheck()
      if (r.alertsInserted > 0) {
        log(`[bctc-overdue] inserted=${r.alertsInserted} overdue=${r.overdueFound} checked=${r.stocksChecked}`)
      }
    } catch (err) {
      log(`[bctc-overdue] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 10 min during VN market hours — VPS price-proxy watchdog.
  // Detects stale market_prices and SSH-heals the Vultr crontab in-process.
  // Uses `*/10 2-8 * * 1-5` so it only runs inside the window the VPS itself
  // is expected to push during; off-hours runs short-circuit via
  // isVnMarketHoursUtc() anyway, but a tighter cron avoids extra wakeups.
  cron.schedule(CRONS.vpsProxyWatchdog, async () => {
    try {
      const status = await runVpsProxyWatchdog()
      if (status !== "ok" && status !== "off-hours" && status !== "cooldown") {
        log(`[vps-watchdog] ${status}`)
      }
    } catch (err) {
      log(`[vps-watchdog] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'UTC' })

  // Daily 00:00 UTC (07:00 GMT+7) — Cron health alert (task 1103).
  // Sends ONE message to WORK channel if any job has < 80% success rate in last 24h.
  // Silent when all jobs are healthy (no heartbeat on all-green).
  cron.schedule(CRONS.cronHealthAlert, async () => {
    try {
      const r = await runCronHealthAlert()
      if (r.alertsSent > 0) {
        log(`[cron-health-alert] degraded=${r.alertsSent}`)
      }
    } catch (err) {
      log(`[cron-health-alert] uncaught: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, { timezone: 'UTC' })

  log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} cron keys in CRONS map (incl. WAL checkpoint + 5 summary) + vps-watchdog active`)
}
