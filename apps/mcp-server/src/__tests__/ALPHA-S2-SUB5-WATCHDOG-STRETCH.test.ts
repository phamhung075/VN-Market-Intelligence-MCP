/**
 * ALPHA-S2-SUB5-WATCHDOG-STRETCH
 *
 * [OPTIONAL STRETCH] WATCHDOG_MANIFEST self-heal entry for intraday5mCompactor
 * (schedulerJobTable.ts JOB_TABLE name: 'intraday5mCompactorJob', L605).
 *
 * ALPHA-S2 core epic (SUB1-SUB4) CLOSED done_verified 2026-07-14. SUB5 was
 * optional/stretch, de-gated from the epic close, standalone backlog row.
 * Brief §4 / §2: defense-in-depth — if the 5-min compactor is down >=24h,
 * underlying market_prices_history ticks are purged by pushPricesHandler.ts's
 * rolling ~24h retention before any daily cron could rescue the gap. Mirrors
 * the ohlcv-daily-aggregator / reputationComputeJob / ta-ohlcv-backfill
 * self-heal pattern already proven by ARCH-CRON-watchdog.test.ts.
 *
 * This file proves:
 *   AC-1: intraday5mCompactorJob is present in WATCHDOG_MANIFEST with the
 *         declared cadence (300_000ms / 5min), thresholdMultiplier (3), and
 *         action ('self-heal').
 *   AC-2: it is present in CANONICAL_WATCHDOG_JOB_NAMES (WD-10 manifest
 *         integrity guard, schedulerWatchdogJob.ts).
 *   AC-3: it fires an alert once stale past its 3x / 5-min threshold
 *         (>=15 min silent).
 *   AC-4: it does NOT alert when it ran within the last few minutes (healthy).
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  runSchedulerWatchdog,
  _alertCooldownMap,
  WATCHDOG_MANIFEST,
  CANONICAL_WATCHDOG_JOB_NAMES,
} from '../scheduler/system/schedulerWatchdogJob.js'

const JOB_NAME = 'intraday5mCompactorJob'
const CADENCE_MS = 300_000 // 5 min

function makeDbWithCronTable(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      started_at   TEXT    NOT NULL,
      finished_at  TEXT,
      status       TEXT    NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `)
  return db
}

function insertRun(db: Database, jobName: string, startedAt: string): void {
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES (?, ?, 'success')`,
  ).run(jobName, startedAt)
}

function msAgo(nowMs: number, ms: number): string {
  return new Date(nowMs - ms).toISOString().replace('T', ' ').slice(0, 19)
}

describe('ALPHA-S2-SUB5-WATCHDOG-STRETCH — AC-1: manifest entry shape', () => {
  it('intraday5mCompactorJob is present with cadence=300_000ms, thresholdMultiplier=3, action=self-heal', () => {
    const entry = WATCHDOG_MANIFEST[JOB_NAME]
    expect(entry).toBeDefined()
    expect(entry!.cadenceMs).toBe(CADENCE_MS)
    expect(entry!.thresholdMultiplier).toBe(3)
    expect(entry!.action).toBe('self-heal')
  })
})

describe('ALPHA-S2-SUB5-WATCHDOG-STRETCH — AC-2: canonical job-name registry', () => {
  it('intraday5mCompactorJob is present in CANONICAL_WATCHDOG_JOB_NAMES', () => {
    expect(CANONICAL_WATCHDOG_JOB_NAMES).toContain(JOB_NAME)
  })
})

describe('ALPHA-S2-SUB5-WATCHDOG-STRETCH — AC-3/AC-4: staleness detection at 3x/5min threshold', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('alerts once stale past 3x the 5-min cadence (>=15 min silent)', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, JOB_NAME, msAgo(nowMs, 20 * 60_000)) // 20 min ago > 3x5min=15min

    const alerts: string[] = []
    const result = await runSchedulerWatchdog({
      db,
      manifest: { [JOB_NAME]: WATCHDOG_MANIFEST[JOB_NAME]! },
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.alerted).toBe(1)
    expect(alerts[0]).toContain(JOB_NAME)
  })

  it('does NOT alert when it ran within the last 5 minutes (healthy)', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, JOB_NAME, msAgo(nowMs, 5 * 60_000)) // 5 min ago — within 15min threshold

    const result = await runSchedulerWatchdog({
      db,
      manifest: { [JOB_NAME]: WATCHDOG_MANIFEST[JOB_NAME]! },
      sendFn: async () => {},
      nowMs,
    })

    expect(result.alerted).toBe(0)
  })
})
