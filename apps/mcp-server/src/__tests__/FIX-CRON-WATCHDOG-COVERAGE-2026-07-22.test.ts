/**
 * FIX-CRON-WATCHDOG-COVERAGE-2026-07-22
 *
 * Cron audit item 3: WATCHDOG_MANIFEST covered only 16/85 registered jobs —
 * none of the 4 Sunday jobs that item 1 found dead (integrityCheckJob,
 * bondMaturityPollerJob, devTeamHeartbeatJob, predictionOutcomeJob) were
 * monitored, which is exactly why 3 missed Sundays went undetected. RELATED
 * GAP: 3 bespoke jobs (signalOutcomeJob, alertOutcomeJob,
 * signalOutcomeResolutionJob) had ZERO cron_job_runs telemetry — no manifest
 * entry could ever have worked for them regardless of coverage width.
 *
 * This file proves:
 *   AC-1: the 4 Sunday jobs are present in WATCHDOG_MANIFEST with weekly
 *         cadence and fire an alert once stale past their 1.2x threshold
 *   AC-2: sscCheckerJob / dataAuditJob:weekly are present under their REAL
 *         recorded job_name (not the CRONS config-key name)
 *   AC-3: the 3 newly-telemetered bespoke jobs are present in the manifest
 *   AC-4: manifest size grew by exactly 9 (16 -> 25) — no accidental drop
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  runSchedulerWatchdog,
  _alertCooldownMap,
  WATCHDOG_MANIFEST,
  CANONICAL_WATCHDOG_JOB_NAMES,
} from '../scheduler/system/schedulerWatchdogJob.js'

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

const WEEKLY_MS = 604_800_000

describe('FIX-CRON-WATCHDOG-COVERAGE-2026-07-22 — AC-1: 4 Sunday jobs now monitored', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  const sundayJobs = [
    'integrityCheckJob',
    'bondMaturityPollerJob',
    'devTeamHeartbeatJob',
    'predictionOutcomeJob',
  ]

  for (const jobName of sundayJobs) {
    it(`${jobName} is present in WATCHDOG_MANIFEST with weekly cadence`, () => {
      expect(WATCHDOG_MANIFEST[jobName]).toBeDefined()
      expect(WATCHDOG_MANIFEST[jobName]!.cadenceMs).toBe(WEEKLY_MS)
    })

    it(`${jobName} alerts once stale past its 1.2x weekly threshold`, async () => {
      const db = makeDbWithCronTable()
      const nowMs = Date.now()
      // 2 weeks + a bit stale (well past 1.2x = 8.4 days)
      insertRun(db, jobName, msAgo(nowMs, 14 * 86_400_000))

      const alerts: string[] = []
      const result = await runSchedulerWatchdog({
        db,
        manifest: { [jobName]: WATCHDOG_MANIFEST[jobName]! },
        sendFn: async (msg) => { alerts.push(msg) },
        nowMs,
      })

      expect(result.alerted).toBe(1)
      expect(alerts[0]).toContain(jobName)
    })

    it(`${jobName} does NOT alert when it ran within the last 3 days (healthy)`, async () => {
      const db = makeDbWithCronTable()
      const nowMs = Date.now()
      insertRun(db, jobName, msAgo(nowMs, 3 * 86_400_000))

      const result = await runSchedulerWatchdog({
        db,
        manifest: { [jobName]: WATCHDOG_MANIFEST[jobName]! },
        sendFn: async () => {},
        nowMs,
      })

      expect(result.alerted).toBe(0)
    })
  }
})

describe('FIX-CRON-WATCHDOG-COVERAGE-2026-07-22 — AC-2: real recorded job_name (not CRONS key)', () => {
  it('sscCheckerJob is the manifest key (not "sscCheck")', () => {
    expect(WATCHDOG_MANIFEST['sscCheckerJob']).toBeDefined()
    expect(WATCHDOG_MANIFEST['sscCheck']).toBeUndefined()
  })

  it('dataAuditJob:weekly is the manifest key (not "dataAuditWeekly")', () => {
    expect(WATCHDOG_MANIFEST['dataAuditJob:weekly']).toBeDefined()
    expect(WATCHDOG_MANIFEST['dataAuditWeekly']).toBeUndefined()
  })
})

describe('FIX-CRON-WATCHDOG-COVERAGE-2026-07-22 — AC-3: newly-telemetered bespoke jobs monitored', () => {
  for (const jobName of ['signalOutcomeJob', 'alertOutcomeJob', 'signalOutcomeResolutionJob']) {
    it(`${jobName} is present in WATCHDOG_MANIFEST`, () => {
      expect(WATCHDOG_MANIFEST[jobName]).toBeDefined()
    })
  }
})

describe('FIX-CRON-WATCHDOG-COVERAGE-2026-07-22 — AC-4: manifest grew by exactly 9 (16 -> 25)', () => {
  it('manifest + canonical list both have 25 entries', () => {
    expect(Object.keys(WATCHDOG_MANIFEST).length).toBe(25)
    expect(CANONICAL_WATCHDOG_JOB_NAMES.length).toBe(25)
  })
})
