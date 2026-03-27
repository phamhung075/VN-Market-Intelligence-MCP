/**
 * Scheduled jobs — daily market routines (GMT+7 / Asia/Ho_Chi_Minh)
 * All crons configurable via .env
 */

import cron from 'node-cron'
import { runSscCheck } from './sscCheckerJob.js'

export const CRONS = {
  morningBriefing: Bun.env.CRON_MORNING_BRIEFING ?? '0 8 * * *',
  marketOpen:      Bun.env.CRON_MARKET_OPEN      ?? '0 9 * * 1-5',
  newsPoll:        Bun.env.CRON_NEWS_POLL         ?? '*/30 * * * *',
  marketClose:     Bun.env.CRON_MARKET_CLOSE      ?? '30 15 * * 1-5',
  sscCheck:        Bun.env.CRON_SSC_CHECK         ?? '0 20 * * *',
  eveningSummary:  Bun.env.CRON_EVENING_SUMMARY   ?? '0 22 * * *',
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [SCHEDULER] ${msg}`)
}

export function startScheduler() {
  // 08:00 — Morning briefing
  cron.schedule(CRONS.morningBriefing, async () => {
    log('Running morning briefing...')
    // TODO: call fetchAllNews() + getMarketSnapshot() + generate report
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 09:00 — Market open scan (weekdays only)
  cron.schedule(CRONS.marketOpen, async () => {
    log('Market open scan...')
    // TODO: call getMarketSnapshot() + anomaly detection
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // Every 30 min — News polling
  cron.schedule(CRONS.newsPoll, async () => {
    log('News polling...')
    // TODO: fetchAllNews() + runImpactChain() + generateAlerts()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 15:30 — Market close scan
  cron.schedule(CRONS.marketClose, async () => {
    log('Market close scan...')
    // TODO: getMarketSnapshot() + daily performance summary
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 20:00 — SSC nightly report check
  cron.schedule(CRONS.sscCheck, async () => {
    await runSscCheck()
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  // 22:00 — Evening summary
  cron.schedule(CRONS.eveningSummary, async () => {
    log('Evening summary...')
    // TODO: generate end-of-day digest
  }, { timezone: 'Asia/Ho_Chi_Minh' })

  log(`Scheduler started — ${Object.keys(CRONS).length} jobs registered`)
}
