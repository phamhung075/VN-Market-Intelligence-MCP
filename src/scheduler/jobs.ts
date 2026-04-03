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
 *   userRequestCheck      every 15 min         (task 246) ✓
 *   predictionOutcomeCheck Sunday 08:00 UTC    (task 248) ✓
 *   franceSummary          06:00 UTC weekdays  (task 243) ✓
 *   devTeamHeartbeat       07:00 UTC Sunday    (task 245) ✓
 *   weatherCheck          every 6h (typhoon season) / 12h off-season  (task 261) ✓
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
import { runDailyAudit, runWeeklyAudit } from './dataAuditJob.js'
import { runPredictionMarketPoll } from './predictionMarketJob.js'
import { runAlertDigest } from './alertDigestJob.js'
import { runWeeklyPortfolioReport } from './weeklyPortfolioReportJob.js'
import { runUserRequestCheck } from './userRequestCheckJob.js'
import { runPredictionOutcomeCheck } from './predictionOutcomeJob.js'
import { runFranceSummary } from './franceSummaryJob.js'
import { runDevTeamHeartbeat } from './devTeamHeartbeatJob.js'
import { runWeatherCheck } from './weatherCheckJob.js'

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
  userRequestCheck:       Bun.env.CRON_USER_REQUEST_CHECK          ?? '*/15 * * * *',
  /** Typhoon season (Jun-Nov): every 6h. Off-season: every 12h. task 261 */
  weatherCheck:           Bun.env.CRON_WEATHER_CHECK              ?? '0 */6 * * *',
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [SCHEDULER] ${msg}`)
}

export function startScheduler() {
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

  // 03:00 GMT+7 — WAL checkpoint (task 140)
  cron.schedule('0 20 * * *', () => {
    runWalCheckpoint()
  })

  // Sunday 22:30 GMT+7 — Weekly pattern watch (task 146)
  cron.schedule('30 22 * * 0', async () => {
    await runPatternWatch()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  registerSummaryJobs()

  cron.schedule(CRONS.dataAuditDaily, async () => {
    await runDailyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  cron.schedule(CRONS.dataAuditWeekly, async () => {
    await runWeeklyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  cron.schedule(CRONS.predictionMarketPoll, async () => {
    await runPredictionMarketPoll()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  registerShutdownHook()

  // Sunday 23:00 — Weekly portfolio report — task 218
  cron.schedule(CRONS.weeklyPortfolioReport, async () => {
    await runWeeklyPortfolioReport()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 15 min — Fast-track user request check — task 246
  // Guarantees /ask responses within 15 min regardless of market hours.
  // Uses CAS claim to avoid double-processing with intelligence cycle step F.
  cron.schedule(CRONS.userRequestCheck, async () => {
    await runUserRequestCheck()
  }, { timezone: 'UTC' })

  // Weekdays 06:00 UTC (07:00 CET) — France wake-up summary — task 243
  cron.schedule("0 6 * * 1-5", async () => {
    await runFranceSummary()
  }, { timezone: "UTC" })

  // Sunday 07:00 UTC (08:00 CET) — Dev Team weekly heartbeat — task 245
  cron.schedule("0 7 * * 0", async () => {
    await runDevTeamHeartbeat()
  }, { timezone: "UTC" })

  // Sunday 08:00 UTC — Prediction market outcome validation — task 248
  // Validates last 7 days of prediction signals: confirmed / false_positive / neutral
  cron.schedule("0 8 * * 0", async () => {
    await runPredictionOutcomeCheck()
  }, { timezone: "UTC" })

  // Every 6h — Weather check + climate signals — task 261
  // Typhoon season (Jun-Nov): every 6h. Off-season: every 12h.
  cron.schedule(CRONS.weatherCheck, async () => {
    await runWeatherCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} core cron jobs + 5 summary jobs + WAL checkpoint active`)
}
