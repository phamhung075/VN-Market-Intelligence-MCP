/**
 * Scheduled jobs — daily market routines (GMT+7 / Asia/Ho_Chi_Minh)
 * All crons configurable via .env
 *
 * Registered jobs:
 *   morningBriefing    08:00 weekdays         (task 101) ✓
 *   marketOpen         09:00 weekdays         (task 103) ✓
 *   intelligenceCycle  every 15 min           (task 106) ✓  ← replaces newsPoll
 *   marketClose        15:30 weekdays         (task 103) ✓
 *   sscCheck           20:00 daily            (task 104) ✓
 *   eveningSummary     22:00 weekdays         (task 105) ✓
 *   dataAuditDaily     23:00 daily            (task 157) ✓
 *   dataAuditWeekly    01:00 Sunday           (task 157) ✓
 *
 * NOTE: The standalone newsPoll cron (task 102) has been removed.
 * News polling is now absorbed into intelligenceCycle — step A runs on every
 * 15-min tick regardless of market hours, and the cycle skips SSC/prices/impact
 * outside market hours (effectively acting as a 15-min news-only poll at night).
 *
 * NOTE: The intelligenceCycle and marketOpen/marketClose crons may overlap at
 * 09:00 and 15:30. Both call fetchHosePrices concurrently — this is safe because
 * they are independent read operations with no shared mutable state.
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

export const CRONS = {
  morningBriefing:   Bun.env.CRON_MORNING_BRIEFING    ?? '0 8 * * 1-5',
  marketOpen:        Bun.env.CRON_MARKET_OPEN          ?? '0 9 * * 1-5',
  intelligenceCycle: Bun.env.CRON_INTELLIGENCE_CYCLE   ?? '*/15 * * * *',
  marketClose:       Bun.env.CRON_MARKET_CLOSE         ?? '30 15 * * 1-5',
  sscCheck:          Bun.env.CRON_SSC_CHECK            ?? '0 20 * * *',
  eveningSummary:    Bun.env.CRON_EVENING_SUMMARY      ?? '0 22 * * 1-5',
  dataAuditDaily:    Bun.env.CRON_DATA_AUDIT_DAILY     ?? '0 23 * * *',
  dataAuditWeekly:   Bun.env.CRON_DATA_AUDIT_WEEKLY    ?? '0 1 * * 0',
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

  // 03:00 GMT+7 — WAL checkpoint (task 140)
  cron.schedule('0 20 * * *', () => {  // 20:00 UTC = 03:00 GMT+7
    runWalCheckpoint()
  })

  // Sunday 22:30 GMT+7 — Weekly pattern watch (task 146)
  cron.schedule('30 22 * * 0', async () => {
    await runPatternWatch()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Periodic summary jobs (task 130): daily, weekly, monthly, quarterly, yearly
  registerSummaryJobs()

  // 23:00 daily — DB audit (task 157)
  cron.schedule(CRONS.dataAuditDaily, async () => {
    await runDailyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 01:00 every Sunday — weekly deep audit (task 157)
  cron.schedule(CRONS.dataAuditWeekly, async () => {
    await runWeeklyAudit()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Register shutdown hooks for graceful WAL checkpoint on exit
  registerShutdownHook()

  log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} core cron jobs + 5 summary jobs + WAL checkpoint active`)
}
