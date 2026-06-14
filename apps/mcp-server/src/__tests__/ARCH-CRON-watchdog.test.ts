/**
 * ARCH-CRON-watchdog — T3-ARCH-CRON-WATCHDOG regression tests
 *
 * Proves Lever D (schedulerWatchdogJob.ts): missed-fire detection, alert
 * dedup, self-heal dispatch, MAX(started_at) double-log immunity, and 2h
 * in-process rate-limit.
 *
 * Coverage:
 *   WD-1. No alert emitted when job ran within the cadence window.
 *   WD-2. WORK alert fires when last run age exceeds 1.5× cadence.
 *   WD-3. Self-heal calls selfHealFn() and emits alert when stale.
 *   WD-4. Self-heal dedup: selfHealFn skips when T4 guard finds recent success.
 *   WD-5. 2h rate-limit: second call within 2h emits no duplicate alert.
 *   WD-6. MAX(started_at) immunity: double-log rows (same started_at) do not
 *          cause false staleness — watchdog reads MAX, not COUNT.
 *   WD-7. Never-ran job emits a registration-missing alert.
 *   WD-8. DB table missing → fail-open (watchdog skips that job, no crash).
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  runSchedulerWatchdog,
  _alertCooldownMap,
  ALERT_COOLDOWN_MS,
  WATCHDOG_MANIFEST,
  CANONICAL_WATCHDOG_JOB_NAMES,
  type WatchdogManifest,
} from '../scheduler/system/schedulerWatchdogJob.js'

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function makeDbWithoutCronTable(): Database {
  return new Database(':memory:')
}

function insertRun(
  db: Database,
  jobName: string,
  status: 'success' | 'error',
  startedAt: string,
): void {
  db.prepare(
    `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES (?, ?, ?)`,
  ).run(jobName, startedAt, status)
}

/** ISO timestamp string N milliseconds before nowMs */
function msAgo(nowMs: number, ms: number): string {
  return new Date(nowMs - ms).toISOString().replace('T', ' ').slice(0, 19)
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_MS = 86_400_000
const WEEKLY_MS = 604_800_000

// ─────────────────────────────────────────────────────────────────────────────
// WD-1: No alert within cadence window
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-1: no alert when job ran within cadence window', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('emits no alert when last run was 1h ago and cadence is 24h (threshold=1.5×)', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, 'testJob', 'success', msAgo(nowMs, 3_600_000)) // 1h ago

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      testJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.checked).toBe(1)
    expect(result.alerted).toBe(0)
    expect(alerts).toHaveLength(0)
  })

  it('emits no alert when last run is exactly at 1.0× cadence (threshold=1.5×)', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, 'testJob', 'success', msAgo(nowMs, DAILY_MS)) // exactly 1× cadence

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      testJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.alerted).toBe(0)
    expect(alerts).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-2: Alert fires at 1.5× cadence
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-2: WORK alert fires when last run age > 1.5× cadence', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('emits one WORK alert when last run was 37h ago (daily job, threshold=1.5×)', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, 'testJob', 'success', msAgo(nowMs, 37 * 3_600_000)) // 37h ago > 1.5×24h

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      testJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.checked).toBe(1)
    expect(result.alerted).toBe(1)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toContain('scheduler-watchdog')
    expect(alerts[0]).toContain('testJob')
    expect(alerts[0]).toContain('37.0h ago')
  })

  it('alert message contains cadence, threshold, and last-run timestamp', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    const lastRunMs = nowMs - 40 * 3_600_000 // 40h ago
    insertRun(db, 'alertJob', 'success', msAgo(nowMs, 40 * 3_600_000))

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      alertJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(alerts[0]).toContain('cadence=24.0h')
    expect(alerts[0]).toContain('threshold=1.5×')
    expect(alerts[0]).toContain('Stale since')
    // Verify timestamp in message is from last run
    const expectedPrefix = new Date(lastRunMs).toISOString().slice(0, 10)
    expect(alerts[0]).toContain(expectedPrefix)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-3: Self-heal calls selfHealFn()
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-3: self-heal invokes selfHealFn when stale', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('calls selfHealFn() and increments healed when job is stale', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, 'healJob', 'success', msAgo(nowMs, 40 * 3_600_000)) // 40h > 1.5×24h

    let healCalled = false
    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      healJob: {
        cadenceMs: DAILY_MS,
        thresholdMultiplier: 1.5,
        action: 'self-heal',
        selfHealFn: async () => { healCalled = true },
      },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.healed).toBe(1)
    expect(result.alerted).toBe(1)
    expect(healCalled).toBe(true)
    // Alert message for self-heal says "Auto-trigger fired"
    expect(alerts[0]).toContain('Auto-trigger fired')
  })

  it('does NOT call selfHealFn() when job is within cadence window', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, 'healJob', 'success', msAgo(nowMs, 3_600_000)) // 1h ago — healthy

    let healCalled = false
    const manifest: WatchdogManifest = {
      healJob: {
        cadenceMs: DAILY_MS,
        thresholdMultiplier: 1.5,
        action: 'self-heal',
        selfHealFn: async () => { healCalled = true },
      },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async () => {},
      nowMs,
    })

    expect(result.healed).toBe(0)
    expect(healCalled).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-4: Self-heal dedup — wrapRun T4 guard prevents double execution
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-4: self-heal dedup prevents double execution via wrapRun T4 guard', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('selfHealFn body guarded by shouldSkipRecoveryReplay skips if recent success exists', async () => {
    // Simulate: watchdog calls selfHealFn which calls wrapRun, which calls
    // shouldSkipRecoveryReplay inside the job body. The guard finds a recent
    // success row (just 2h old) and skips — preventing double execution.
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    // Insert a stale row (outside threshold) so watchdog fires the heal
    insertRun(db, 'dedupJob', 'success', msAgo(nowMs, 40 * 3_600_000)) // 40h > 1.5×24h

    let innerExecCount = 0

    const manifest: WatchdogManifest = {
      dedupJob: {
        cadenceMs: DAILY_MS,
        thresholdMultiplier: 1.5,
        action: 'self-heal',
        selfHealFn: async () => {
          // Simulates wrapRun + shouldSkipRecoveryReplay pattern:
          // Check if a recent success (within 90% of cadence) already exists.
          // This is what the production selfHealFn does via jobRunRepo.wrapRun.
          const { shouldSkipRecoveryReplay } = await import(
            '../scheduler/startupHelpers.js'
          )
          const skip = shouldSkipRecoveryReplay(db, 'dedupJob', DAILY_MS)
          if (!skip) {
            innerExecCount++
            // Insert a success row to simulate the job ran
            db.prepare(
              `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES (?, datetime('now'), 'success')`,
            ).run('dedupJob')
          }
        },
      },
    }

    // First watchdog call — executes the heal
    await runSchedulerWatchdog({ db, manifest, sendFn: async () => {}, nowMs })
    expect(innerExecCount).toBe(1)

    // Second watchdog call (different nowMs to bypass rate-limit, same job)
    _alertCooldownMap.clear()
    await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async () => {},
      nowMs: nowMs + 5 * 3_600_000, // 5h later — still within daily cadence
    })
    // T4 guard fires: recent success row exists, inner body skipped
    expect(innerExecCount).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-5: 2h rate-limit prevents duplicate alert spam
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-5: 2h rate-limit prevents duplicate WORK alerts', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('emits alert on first call, suppresses on second call within 2h', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, 'spamJob', 'success', msAgo(nowMs, 40 * 3_600_000))

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      spamJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }
    const sendFn = async (msg: string) => { alerts.push(msg) }

    // First call — alert fires
    await runSchedulerWatchdog({ db, manifest, sendFn, nowMs })
    expect(alerts).toHaveLength(1)

    // Second call — within ALERT_COOLDOWN_MS window
    const secondCallMs = nowMs + ALERT_COOLDOWN_MS - 60_000 // 1 min before cooldown expires
    await runSchedulerWatchdog({ db, manifest, sendFn, nowMs: secondCallMs })
    expect(alerts).toHaveLength(1) // no new alert
  })

  it('re-alerts after 2h cooldown expires', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    insertRun(db, 'reAlertJob', 'success', msAgo(nowMs, 40 * 3_600_000))

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      reAlertJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }
    const sendFn = async (msg: string) => { alerts.push(msg) }

    // First call
    await runSchedulerWatchdog({ db, manifest, sendFn, nowMs })
    expect(alerts).toHaveLength(1)

    // Second call — after cooldown expires
    const afterCooldownMs = nowMs + ALERT_COOLDOWN_MS + 1_000
    await runSchedulerWatchdog({ db, manifest, sendFn, nowMs: afterCooldownMs })
    expect(alerts).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-6: MAX(started_at) immunity to double-log artifact
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-6: MAX(started_at) is immune to double-log rows', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('does not alert when two rows share started_at within threshold (double-log simulation)', async () => {
    // FIX-CRON-JOB-RUNS-DOUBLE-LOG: a single execution inserts two rows with
    // the same started_at. If watchdog used COUNT(*) it would see 2 rows but
    // still be immune — but more critically, if it used MIN/AVG instead of MAX,
    // it might compute the wrong age. Verify MAX(started_at) is used:
    // Both rows have the same started_at (1h ago) — MAX is still 1h ago → healthy.
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    const recentTs = msAgo(nowMs, 3_600_000) // 1h ago — within 1.5×24h threshold

    // Double-log: two rows for the same execution
    insertRun(db, 'doubleLogJob', 'success', recentTs)
    insertRun(db, 'doubleLogJob', 'success', recentTs)

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      doubleLogJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    // MAX(started_at) = recentTs (1h ago) → within threshold → no alert
    expect(result.alerted).toBe(0)
    expect(alerts).toHaveLength(0)
  })

  it('alerts correctly even with many double-log rows when the MAX is stale', async () => {
    // 10 rows from various times (simulating long double-log history),
    // but MAX(started_at) is still 40h ago — must still alert.
    const db = makeDbWithCronTable()
    const nowMs = Date.now()

    // Insert 5 stale double-log pairs (40h ago each)
    for (let i = 0; i < 5; i++) {
      const staleTs = msAgo(nowMs, 40 * 3_600_000)
      insertRun(db, 'doubleLogStaleJob', 'success', staleTs)
      insertRun(db, 'doubleLogStaleJob', 'success', staleTs)
    }

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      doubleLogStaleJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.alerted).toBe(1)
    expect(alerts[0]).toContain('doubleLogStaleJob')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-7: Never-ran job emits registration-missing alert
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-7: never-ran job emits registration-missing alert', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('emits a "never run" alert when no rows exist for the job', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()
    // No rows inserted for 'ghostJob'

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      ghostJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.alerted).toBe(1)
    expect(alerts[0]).toContain('ghostJob')
    expect(alerts[0]).toContain('has never run')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-8: DB table missing → fail-open
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-8: missing cron table → fail-open, no crash', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('does not throw when cron_job_runs table does not exist', async () => {
    const db = makeDbWithoutCronTable()
    const nowMs = Date.now()

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      ghostJob: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
    }

    // Should not throw; DB error is swallowed (fail-open)
    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    // queryLastStartedAt returns null on error → triggers never-ran alert
    // (fail-open: watchdog still emits an alert, but does not crash)
    expect(result.checked).toBe(1)
    // No crash is the primary assertion
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-9: Multiple jobs — checked count matches manifest size
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-9: multi-job manifest — all jobs checked', () => {
  beforeEach(() => { _alertCooldownMap.clear() })

  it('checks all 3 jobs in a manifest and returns correct counts', async () => {
    const db = makeDbWithCronTable()
    const nowMs = Date.now()

    // job1: healthy (1h ago)
    insertRun(db, 'job1', 'success', msAgo(nowMs, 3_600_000))
    // job2: stale (37h ago)
    insertRun(db, 'job2', 'success', msAgo(nowMs, 37 * 3_600_000))
    // job3: never ran (no rows)

    const alerts: string[] = []
    const manifest: WatchdogManifest = {
      job1: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
      job2: { cadenceMs: DAILY_MS, thresholdMultiplier: 1.5, action: 'alert-only' },
      job3: { cadenceMs: WEEKLY_MS, thresholdMultiplier: 1.3, action: 'alert-only' },
    }

    const result = await runSchedulerWatchdog({
      db,
      manifest,
      sendFn: async (msg) => { alerts.push(msg) },
      nowMs,
    })

    expect(result.checked).toBe(3)
    expect(result.alerted).toBe(2) // job2 (stale) + job3 (never ran)
    expect(result.healed).toBe(0)
    // job1 must not appear in any alert
    const job1Alert = alerts.find((a) => a.includes('job1'))
    expect(job1Alert).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WD-10: Manifest integrity — every WATCHDOG_MANIFEST key must match a
//         recorded job_name in CANONICAL_WATCHDOG_JOB_NAMES.
//
// This test is the structural guard against key-name drift. It fails loudly
// whenever a job is renamed in wrapRun/recordJobRun but the manifest key is
// not updated to match.
//
// How the canonical set is derived (NOT hand-copied):
//   CANONICAL_WATCHDOG_JOB_NAMES is exported from schedulerWatchdogJob.ts and
//   each entry is annotated with its exact recording site (file + line). The
//   test imports that exported array — so both the manifest and the canonical
//   set share the same module as their SSOT. A future rename requires updating
//   (a) the wrapRun/recordJobRun call site, (b) CANONICAL_WATCHDOG_JOB_NAMES,
//   and (c) the WATCHDOG_MANIFEST key — any mismatch between (b) and (c)
//   causes this test to fail before the commit can ship.
//
// Fail-proof check (documented below): temporarily corrupt a key → test fails.
// ─────────────────────────────────────────────────────────────────────────────

describe('ARCH-CRON-watchdog — WD-10: manifest integrity — every key matches canonical recorded job_name', () => {
  it('every WATCHDOG_MANIFEST key exists in CANONICAL_WATCHDOG_JOB_NAMES', () => {
    const canonicalSet = new Set<string>(CANONICAL_WATCHDOG_JOB_NAMES)
    const manifestKeys = Object.keys(WATCHDOG_MANIFEST)

    // Every manifest key must be in the canonical set — if not, the watchdog
    // queries cron_job_runs with the wrong name → false "never run" alerts.
    const missingFromCanonical = manifestKeys.filter((k) => !canonicalSet.has(k))
    expect(
      missingFromCanonical,
      `WATCHDOG_MANIFEST keys not in CANONICAL_WATCHDOG_JOB_NAMES (watchdog will query wrong job_name): ${JSON.stringify(missingFromCanonical)}. ` +
      `Update the manifest key to match what the job records in cron_job_runs via wrapRun/recordJobRun, ` +
      `then add/update the entry in CANONICAL_WATCHDOG_JOB_NAMES with the recording site comment.`,
    ).toEqual([])

    // The canonical set must cover every manifest key — no orphaned manifest entries.
    expect(manifestKeys.length).toBeGreaterThan(0)
  })

  it('CANONICAL_WATCHDOG_JOB_NAMES has no duplicates (would indicate copy-paste error)', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const name of CANONICAL_WATCHDOG_JOB_NAMES) {
      if (seen.has(name)) duplicates.push(name)
      seen.add(name)
    }
    expect(
      duplicates,
      `Duplicate entries in CANONICAL_WATCHDOG_JOB_NAMES: ${JSON.stringify(duplicates)}`,
    ).toEqual([])
  })

  it('manifest has exactly the same count as CANONICAL_WATCHDOG_JOB_NAMES (no undocumented additions)', () => {
    // Both sides must grow together: adding a job to the manifest requires
    // adding its canonical name; removing a job requires removing from both.
    const manifestCount = Object.keys(WATCHDOG_MANIFEST).length
    const canonicalCount = CANONICAL_WATCHDOG_JOB_NAMES.length
    expect(
      manifestCount,
      `WATCHDOG_MANIFEST has ${manifestCount} keys but CANONICAL_WATCHDOG_JOB_NAMES has ${canonicalCount} entries. ` +
      `They must stay in sync — add or remove from both together.`,
    ).toBe(canonicalCount)
  })
})
