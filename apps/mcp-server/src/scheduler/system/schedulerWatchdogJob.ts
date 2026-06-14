/**
 * schedulerWatchdogJob.ts — Lever D: missed-fire watchdog (T3-ARCH-CRON-WATCHDOG)
 *
 * Detects any cron job whose last successful run is older than
 * (declared cadence × thresholdMultiplier) and emits a WORK-channel staleness
 * alert. Does NOT auto-restart anything — alert-only for most jobs; self-heal
 * (via the job's own wrapRun path) for explicitly listed quick jobs.
 *
 * Double-log immunity: keys on MAX(started_at) per job_name regardless of row
 * count. The FIX-CRON-JOB-RUNS-DOUBLE-LOG artifact writes two rows per
 * execution, so row count is a corrupt oracle; MAX(started_at) is immune because
 * both rows share the same started_at value.
 *
 * Rate-limit: in-process Map<jobName, lastAlertMs> — 2-hour cooldown per job.
 * Resets on server restart (correct: a fresh deploy should re-alert immediately).
 *
 * DDD layer: interface/scheduler (system/ subfolder).
 * No domain imports. DB access is read-only SELECT MAX(started_at).
 *
 * @idempotency T4 — alert dedup via in-process rate-limit Map; no WAL writes from watchdog itself
 */

import type { Database } from 'bun:sqlite'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchdogManifestEntry {
  /** Declared cron cadence in milliseconds */
  cadenceMs: number
  /**
   * Alert fires when: lastRunAge > cadenceMs × thresholdMultiplier.
   * 1.5 = alert after 1.5× the cadence has elapsed without a successful run.
   */
  thresholdMultiplier: number
  /**
   * 'alert-only' — send WORK Telegram only (safe for long-running or risky jobs).
   * 'self-heal'  — additionally invoke selfHealFn() through wrapRun for quick jobs.
   */
  action: 'alert-only' | 'self-heal'
  /**
   * Required when action='self-heal'. MUST be a thin wrapper that calls
   * jobRunRepo.wrapRun() internally so the T4 shouldSkipRecoveryReplay guard fires.
   */
  selfHealFn?: () => Promise<void>
}

export type WatchdogManifest = Record<string, WatchdogManifestEntry>

export interface WatchdogResult {
  checked: number
  alerted: number
  healed: number
}

// ─────────────────────────────────────────────────────────────────────────────
// In-process rate-limit state
// Exported for test access so tests can reset between cases.
// ─────────────────────────────────────────────────────────────────────────────

export const _alertCooldownMap: Map<string, number> = new Map()

/** Rate-limit window: 2 hours between alerts for the same job. */
export const ALERT_COOLDOWN_MS = 7_200_000

// ─────────────────────────────────────────────────────────────────────────────
// WATCHDOG_MANIFEST
//
// 16 monitored jobs per architect brief §4.4 / §7.
// cadenceMs values:
//   86_400_000  = 1 day
//   604_800_000 = 7 days
//
// Self-heal jobs are quick (<2 min) or have isRunning guards (architect §9 R-2).
// selfHealFn is intentionally left undefined at the manifest level — it is
// injected at registration time by startScheduler.ts to avoid importing job
// modules here (DDD clean: no upward dependencies from system/ into jobs/).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL_WATCHDOG_JOB_NAMES
//
// Authoritative list of job_name strings as recorded into cron_job_runs by each
// job's wrapRun/recordJobRun call site. This is the single source of truth used
// by the manifest-integrity test (ARCH-CRON-watchdog.test.ts WD-10) to assert
// that every WATCHDOG_MANIFEST key matches a real recorded name.
//
// HOW TO MAINTAIN: when a job is renamed, update the literal here AND in its
// wrapRun/recordJobRun call site simultaneously. A mismatch between this list
// and the manifest will cause WD-10 to fail loudly — that is the guard.
//
// Literals verified against their recording sites:
//   ohlcv-daily-aggregator    startScheduler.ts L631 jobRunRepo.wrapRun('ohlcv-daily-aggregator')
//   vnstockFundamentalsRefresh vnstockFundamentalsJob.ts JOB_NAME_FUNDAMENTALS
//   reputationComputeJob       startScheduler.ts L972  jobRunRepo.wrapRun('reputationComputeJob')
//   evidenceAccumulatorJob     startupHelpers.ts L341  recordJobRun(db, 'evidenceAccumulatorJob')
//   morningBriefingJob         startScheduler.ts L143  jobRunRepo.wrapRun('morningBriefingJob')
//   eveningSummaryJob          startScheduler.ts L179  jobRunRepo.wrapRun('eveningSummaryJob')
//   franceSummaryJob           startScheduler.ts L388  jobRunRepo.wrapRun('franceSummaryJob')
//   foreignFlowAlertJob        foreignFlowAlertJob.ts L314 recordJobRun(database, "foreignFlowAlertJob")
//   insiderCheckJob            insiderCheckJob.ts L138  recordJobRun(database, "insiderCheckJob")
//   calibrationReportJob       calibrationReportJob.ts L571 recordJobRun(database, "calibrationReportJob")
//   baseRateComputationJob     startupHelpers.ts L349  recordJobRun(db, 'baseRateComputationJob')
//   predictionResolutionJob    startupHelpers.ts L357  recordJobRun(db, 'predictionResolutionJob')
//   macroIndicatorRefreshJob   startScheduler.ts L729  jobRunRepo.wrapRun('macroIndicatorRefreshJob')
//   ta-ohlcv-backfill          startScheduler.ts L664  jobRunRepo.wrapRun('ta-ohlcv-backfill')
//   accuracyDigestJob          startScheduler.ts L1004 jobRunRepo.wrapRun('accuracyDigestJob')
//   summaryJob:daily           summaryJobs.ts L58      recordJobRun(db, `summaryJob:${periodType}`)
// ─────────────────────────────────────────────────────────────────────────────

export const CANONICAL_WATCHDOG_JOB_NAMES: readonly string[] = [
  'ohlcv-daily-aggregator',       // startScheduler.ts wrapRun L631
  'vnstockFundamentalsRefresh',   // vnstockFundamentalsJob.ts JOB_NAME_FUNDAMENTALS
  'reputationComputeJob',         // startScheduler.ts wrapRun L972
  'evidenceAccumulatorJob',       // startupHelpers.ts recordJobRun L341
  'morningBriefingJob',           // startScheduler.ts wrapRun L143
  'eveningSummaryJob',            // startScheduler.ts wrapRun L179
  'franceSummaryJob',             // startScheduler.ts wrapRun L388
  'foreignFlowAlertJob',          // foreignFlowAlertJob.ts recordJobRun L314
  'insiderCheckJob',              // insiderCheckJob.ts recordJobRun L138
  'calibrationReportJob',         // calibrationReportJob.ts recordJobRun L571
  'baseRateComputationJob',       // startupHelpers.ts recordJobRun L349
  'predictionResolutionJob',      // startupHelpers.ts recordJobRun L357
  'macroIndicatorRefreshJob',     // startScheduler.ts wrapRun L729
  'ta-ohlcv-backfill',            // startScheduler.ts wrapRun L664
  'accuracyDigestJob',            // startScheduler.ts wrapRun L1004
  'summaryJob:daily',             // summaryJobs.ts recordJobRun L58
] as const

export const WATCHDOG_MANIFEST: WatchdogManifest = {
  // FIX: key must equal the job_name string written by wrapRun/recordJobRun.
  // Verified 2026-06-14 against live cron_job_runs (router RAW-confirmed).
  'ohlcv-daily-aggregator': {
    // startScheduler.ts L631: jobRunRepo.wrapRun('ohlcv-daily-aggregator')
    // Prev key 'ohlcvDailyAggregatorJob' caused false "never run" alerts (25 runs/30d missed).
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'self-heal',
  },
  vnstockFundamentalsRefresh: {
    cadenceMs: 604_800_000,
    thresholdMultiplier: 1.3,
    action: 'alert-only',
  },
  reputationComputeJob: {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'self-heal',
  },
  evidenceAccumulatorJob: {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'self-heal',
  },
  morningBriefingJob: {
    // weekday-only job; flat cadenceMs×multiplier may flag on weekends.
    // TODO(architect): weekday-aware threshold for morningBriefingJob, franceSummaryJob, eveningSummaryJob.
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  eveningSummaryJob: {
    // weekday-only job; see morningBriefingJob TODO above.
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  franceSummaryJob: {
    // weekday-only job; see morningBriefingJob TODO above.
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  foreignFlowAlertJob: {
    // foreignFlowAlertJob.ts L314: recordJobRun(database, "foreignFlowAlertJob")
    // Prev key 'foreignFlowAlert' caused false "never run" alerts (28 runs/30d missed).
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  insiderCheckJob: {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  calibrationReportJob: {
    cadenceMs: 604_800_000,
    thresholdMultiplier: 1.3,
    action: 'alert-only',
  },
  baseRateComputationJob: {
    cadenceMs: 604_800_000,
    thresholdMultiplier: 1.3,
    action: 'alert-only',
  },
  predictionResolutionJob: {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  macroIndicatorRefreshJob: {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  'ta-ohlcv-backfill': {
    // startScheduler.ts L664: jobRunRepo.wrapRun('ta-ohlcv-backfill')
    // Prev key 'taOhlcvBackfill' caused false "never run" alerts (10 runs/30d missed).
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'self-heal',
  },
  accuracyDigestJob: {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
  'summaryJob:daily': {
    cadenceMs: 86_400_000,
    thresholdMultiplier: 1.5,
    action: 'alert-only',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// queryLastStartedAt
//
// Read-only probe: SELECT MAX(started_at) per job_name.
//
// Double-log immunity: MAX(started_at) is used instead of COUNT(*) or
// any row-count metric. The FIX-CRON-JOB-RUNS-DOUBLE-LOG bug writes two rows
// per execution — both rows share the same started_at value — so MAX(started_at)
// returns the correct last-fire timestamp regardless of row count.
//
// Statuses queried: 'success' and 'error'. We include 'error' rows because a
// job that ran but failed still fired its tick — the cadence is not broken.
// Only a missing row (never ran) or a very old row indicates a missed fire.
// ─────────────────────────────────────────────────────────────────────────────

function queryLastStartedAt(db: Database, jobName: string): string | null {
  try {
    const row = db
      .prepare<{ last_started_at: string | null }, [string]>(
        `SELECT MAX(started_at) AS last_started_at
         FROM cron_job_runs
         WHERE job_name = ?
           AND status IN ('success', 'error')`,
      )
      .get(jobName)
    return row?.last_started_at ?? null
  } catch {
    // Table missing or schema mismatch — return null (fail-open: watchdog skips)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runSchedulerWatchdog
//
// Core watchdog logic. Injectable deps for unit-test isolation:
//   db       — SQLite connection (in-memory for tests, getDb() in production)
//   manifest — WATCHDOG_MANIFEST or a test-scoped subset
//   sendFn   — WORK channel sender (sendTelegramWork in prod, mock in tests)
//   nowMs    — current time override for deterministic tests
// ─────────────────────────────────────────────────────────────────────────────

export async function runSchedulerWatchdog(deps?: {
  db?: Database
  manifest?: WatchdogManifest
  sendFn?: (msg: string) => Promise<void>
  nowMs?: number
}): Promise<WatchdogResult> {
  // Production imports are deferred to avoid coupling this module to the
  // infrastructure layer at parse time (DDD clean). Tests inject all deps.
  const db: Database = deps?.db ?? (await import('../../infrastructure/db/schema.js')).getDb()
  const manifest: WatchdogManifest = deps?.manifest ?? WATCHDOG_MANIFEST
  const nowMs: number = deps?.nowMs ?? Date.now()
  let sendFn: (msg: string) => Promise<void>

  if (deps?.sendFn) {
    sendFn = deps.sendFn
  } else {
    const { sendTelegramWork } = await import(
      '../../infrastructure/notifiers/telegram.js'
    )
    sendFn = async (msg: string) => {
      await sendTelegramWork(msg)
    }
  }

  let checked = 0
  let alerted = 0
  let healed = 0

  for (const [jobName, entry] of Object.entries(manifest)) {
    checked++

    const lastStartedAt = queryLastStartedAt(db, jobName)

    if (lastStartedAt === null) {
      // Job has never run — emit a never-ran alert (not subject to cadence rate-limit)
      const neverRanKey = `${jobName}:never`
      const lastAlert = _alertCooldownMap.get(neverRanKey) ?? 0
      if (nowMs - lastAlert >= ALERT_COOLDOWN_MS) {
        _alertCooldownMap.set(neverRanKey, nowMs)
        const msg =
          `[scheduler-watchdog] ${jobName}: has never run — ` +
          `scheduler registration may be missing.`
        try {
          await sendFn(msg)
        } catch {
          // Telegram send failure must not crash the watchdog
        }
        alerted++
      }
      continue
    }

    const lastRunMs = new Date(lastStartedAt).getTime()
    const ageMs = nowMs - lastRunMs
    const thresholdMs = entry.cadenceMs * entry.thresholdMultiplier

    if (ageMs <= thresholdMs) {
      // Job is within cadence — healthy, no action needed
      continue
    }

    // Job is stale — check rate-limit before alerting
    const lastAlert = _alertCooldownMap.get(jobName) ?? 0
    if (nowMs - lastAlert < ALERT_COOLDOWN_MS) {
      // Still within 2-hour cooldown — skip to prevent alert spam
      continue
    }

    // Fire the alert
    _alertCooldownMap.set(jobName, nowMs)

    const ageHours = (ageMs / 3_600_000).toFixed(1)
    const cadenceHours = (entry.cadenceMs / 3_600_000).toFixed(1)
    const lastRunIso = new Date(lastRunMs).toISOString().slice(0, 19) + 'Z'

    if (entry.action === 'self-heal' && entry.selfHealFn) {
      const nowIso = new Date(nowMs).toISOString().slice(0, 19) + 'Z'
      const msg =
        `[scheduler-watchdog] ${jobName}: last ran ${ageHours}h ago ` +
        `(cadence=${cadenceHours}h, threshold=${entry.thresholdMultiplier}×). ` +
        `Auto-trigger fired at ${nowIso}. Check cron_job_runs for status.`
      try {
        await sendFn(msg)
      } catch {
        // Continue to self-heal even if Telegram fails
      }
      alerted++

      try {
        await entry.selfHealFn()
        healed++
      } catch {
        // Self-heal errors are captured inside wrapRun; this catch is a safety net
      }
    } else {
      // alert-only (or self-heal without selfHealFn injected yet)
      const msg =
        `[scheduler-watchdog] ${jobName}: last ran ${ageHours}h ago ` +
        `(cadence=${cadenceHours}h, threshold=${entry.thresholdMultiplier}×). ` +
        `Stale since ${lastRunIso}. Check cron_job_runs for status.`
      try {
        await sendFn(msg)
      } catch {
        // Telegram send failure must not crash the watchdog
      }
      alerted++
    }
  }

  return { checked, alerted, healed }
}
