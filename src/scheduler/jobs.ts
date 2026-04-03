/**
 * Scheduled jobs — daily market routines (GMT+7 / Asia/Ho_Chi_Minh)
 * All crons configurable via .env
 *
 * Registered jobs:
 *   morningBriefing  08:00 weekdays     (task 101) ✓
 *   marketOpen       09:00 weekdays     (task 103) ✓
 *   newsPoll         every 30 min       (task 102) ✓
 *   marketClose      15:30 weekdays     (task 103) ✓
 *   sscCheck         20:00 daily        (task 104) ✓
 *   eveningSummary   22:00 weekdays     (task 105) ✓
 */

import cron from 'node-cron'
import { runSscCheck } from './sscCheckerJob.js'
import { runMarketScan } from './marketScanJob.js'
import { runNewsPoller } from './newsPollerJob.js'
import { runMorningBriefing } from './morningBriefingJob.js'
import { runEveningSummary } from './eveningSummaryJob.js'
import { runDavPharmacyCheck } from './davPharmacyJob.js'

export const CRONS = {
  morningBriefing: Bun.env.CRON_MORNING_BRIEFING ?? '0 8 * * 1-5',
  marketOpen:      Bun.env.CRON_MARKET_OPEN      ?? '0 9 * * 1-5',
  newsPoll:        Bun.env.CRON_NEWS_POLL         ?? '*/30 * * * *',
  marketClose:     Bun.env.CRON_MARKET_CLOSE      ?? '30 15 * * 1-5',
  sscCheck:        Bun.env.CRON_SSC_CHECK         ?? '0 20 * * *',
  eveningSummary:  Bun.env.CRON_EVENING_SUMMARY   ?? '0 22 * * 1-5',
  // DAV drug approval check: 1st of each month at 06:00 GMT+7 (Sprint 044)
  davPharmacyCheck: Bun.env.CRON_DAV_CHECK        ?? '0 6 1 * *',
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

  // Every 30 min — News polling — task 102
  cron.schedule(CRONS.newsPoll, async () => {
    await runNewsPoller()
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

  // 1st of month 06:00 — DAV drug approval check (Sprint 044)
  cron.schedule(CRONS.davPharmacyCheck, async () => {
    await runDavPharmacyCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} cron jobs active`)
}
