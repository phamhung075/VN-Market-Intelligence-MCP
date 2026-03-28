/**
 * Scheduled jobs — daily market routines (GMT+7 / Asia/Ho_Chi_Minh)
 * All crons configurable via .env
 *
 * Registered jobs:
 *   morningBriefing  08:00 daily        (task 101 — TODO)
 *   marketOpen       09:00 weekdays     (task 103) ✓
 *   newsPoll         every 30 min       (task 102) ✓
 *   marketClose      15:30 weekdays     (task 103) ✓
 *   sscCheck         20:00 daily        (task 104) ✓
 */

import cron from 'node-cron'
import { runMarketScan } from './marketScanJob.js'
import { runNewsPoller } from './newsPollerJob.js'

export const CRONS = {
  morningBriefing: Bun.env.CRON_MORNING_BRIEFING ?? '0 8 * * *',
  marketOpen:      Bun.env.CRON_MARKET_OPEN      ?? '0 9 * * 1-5',
  newsPoll:        Bun.env.CRON_NEWS_POLL         ?? '*/30 * * * *',
  marketClose:     Bun.env.CRON_MARKET_CLOSE      ?? '30 15 * * 1-5',
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [SCHEDULER] ${msg}`)
}

export function startScheduler() {
  // 08:00 — Morning briefing
  cron.schedule(CRONS.morningBriefing, async () => {
    log('Running morning briefing...')
    // TODO task 101: call assembleBriefing() + pollNews() + persistBriefing()
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

  log(`Scheduler started — ${Object.keys(CRONS).length} jobs registered`)
}
