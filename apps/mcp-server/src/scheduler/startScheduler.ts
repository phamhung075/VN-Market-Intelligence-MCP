/**
 * startScheduler.ts — composition root (task 1406e; JOB_TABLE extraction
 * FACTORY-SCHEDULER-job-table-registry)
 *
 * Owns: the single DB handle + job-run repository, startup-time repairs/probes/backfills
 * that are NOT cron registrations, and the two calls that wire up all 79 cron jobs:
 *   registerJobTable(buildJobTable(ctx), jobRunRepo)  — 57 jobs sharing the plain
 *                                                        jobRunRepo.wrapRun(name, runner)
 *                                                        envelope (schedulerJobTable.ts)
 *   registerBespokeJobs(ctx)                          — 22 jobs with non-standard shapes
 *                                                        (schedulerJobTable.ts)
 *
 * The declarative job table + the two registration functions live in schedulerJobTable.ts.
 * The WAL-checkpoint escalation closure lives in walEscalation.ts. This file stays the
 * thin composition root: DB/repo init, startup repairs, startup-catchup probes, and the
 * two registration calls.
 */

import { registerSummaryJobs, runSummaryJob } from './summaryJobs.js'
import { registerShutdownHook } from '../infrastructure/db/checkpoint.js'
import { runDailyAuditIfStale } from './news-analysis/dataAuditJob.js'
import { runOhlcvStartupProbe } from './market-data/ohlcvStartupProbe.js'
import { runOhlcvCandlePresenceGuard } from './market-data/ohlcvCandleGuard.js'
import { runIntraday5mCompactor } from './market-data/intraday5mCompactorJob.js'
import { runIntradayForeignFlow5mCompactor } from './market-data/intradayForeignFlow5mCompactorJob.js'
import { purgeStrandedSeedRows } from './market-data/allzeroOhlcvBackfill.js'
import { runMorningBriefing } from './briefings/morningBriefingJob.js'
import { runEveningSummary } from './briefings/eveningSummaryJob.js'
import { runFranceSummary } from './briefings/franceSummaryJob.js'
import { runAlertDigest } from './alerts/alertDigestJob.js'
import { validateMacroFreshnessOnStartup } from './macro/index.js'
import { fetchFredEffrIorb } from '../infrastructure/fetchers/fredEffrIorb.js'
import { fetchFredIsmSubcomponents } from '../infrastructure/fetchers/fredIsmSubcomponents.js'
import { runVnstockFundamentalsJob } from './financial-reports/vnstockFundamentalsJob.js'
import { runVnstockStartupProbe } from './financial-reports/vnstockStartupProbe.js'
import { getDb } from '../infrastructure/db/schema.js'
import { SqliteJobRunRepository } from '../infrastructure/db/repositories/SqliteJobRunRepository.js'
import { reapZombieJobRuns } from '../infrastructure/db/cronJobRunStore.js'
import { CRONS } from './cronConfig.js'
import { buildJobTable, registerJobTable, registerBespokeJobs } from './schedulerJobTable.js'
import {
  log,
  shouldRunCatchup,
  eveningReportIsValid,
  scheduleForeignFlowCbReset,
  runBctcReparseWithDb,
} from './startupHelpers.js'

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

  // ── Composition root — one DB handle + job-run repository for all cron jobs ──
  // Task 1839a Phase 2: single DB init; jobRunRepo replaces per-job calls.
  const db = getDb()
  const jobRunRepo = new SqliteJobRunRepository(db)

  // Task 1955b: reap zombie cron_job_runs rows left behind by prior process crashes.
  // Must run BEFORE any cron registration so newly-registered jobs see a clean slate.
  const { reaped } = reapZombieJobRuns(db)
  if (reaped > 0) {
    log(`[startup] reaped ${reaped} zombie cron_job_runs row(s) → status=crashed`)
  }

  // FIX-OHLCV-STRANDED-ROWS-REPAIR-P1 — startup repair of synthetic seed bars
  // Purges daily_ohlcv rows that are flat O=H=L=C with volume=0.  These rows
  // were written by the PRE-FIX aggregator image (before d4b532be) and serve as
  // live poison for BB/RSI indicators ("giá 0 dưới BB" false breakout).
  // Generic predicate: volume=0 AND open=high=low=close — no date/ticker literals.
  // Safe: vol>0 real candles (including halt-day ATC rows) are never matched.
  // Idempotent: subsequent restarts delete 0 rows (no-op).
  try {
    const strandedResult = purgeStrandedSeedRows(db)
    if (strandedResult.deleted > 0) {
      log(`[startup] purgeStrandedSeedRows: deleted ${strandedResult.deleted} synthetic flat seed bar(s) from daily_ohlcv`)
    }
  } catch (err) {
    // Non-fatal: log the error, continue startup. Repair will re-run on next restart.
    log(`[startup] purgeStrandedSeedRows error (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
  }

  // Startup probe — ohlcv data completeness check (task 1353, Sprint 119).
  // Fire-and-forget: alerts WORK channel if any watchlist ticker has < 8
  // daily_ohlcv rows, prompting operator to run fetch-ohlcv-backfill.sh on VPS.
  void runOhlcvStartupProbe().then((r) => {
    if (r.sent) log(`[ohlcv-probe] sparse tickers: ${r.sparseTickers.map(t => t.code).join(', ')}`)
  }).catch(console.error)

  // ALPHA-S1-STARTUP-CANDLE-GUARD (2026-07-13) — calendar-aware catch-up guard. Detects a
  // missing daily_ohlcv session for the most recent VN TRADING day (weekends/holidays
  // structurally skipped via vnTradingCalendar — see ohlcvCandleGuard.ts header) and
  // triggers recoverMissingOhlcvSession(). Fire-and-forget, same phase as the probe above.
  void runOhlcvCandlePresenceGuard().catch((err) => {
    log(`[ohlcv-candle-guard] startup guard error: ${err instanceof Error ? err.message : String(err)}`)
  })

  // ALPHA-S2-SUB2-JOB-CRON (2026-07-15) — startup one-shot compaction of
  // market_prices_history ticks into intraday_ohlcv_5m. The job's steady-state
  // algorithm already reprocesses the ENTIRE current content of the source table
  // on every invocation, so this startup call IS the backfill of whatever ticks
  // currently survive at deploy time (brief §5) — no separate migration script.
  // Non-fatal by the same convention as every other startup repair in this file.
  void runIntraday5mCompactor().then((r) => {
    log(`[startup] intraday5mCompactor: buckets=${r.bucketsWritten} codes=${r.codesProcessed} ticks=${r.ticksScanned}`)
  }).catch((err) => {
    log(`[startup] intraday5mCompactor error (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
  })

  // ALPHA-S2-FF-SUB3-JOB-CRON (2026-07-15) — startup one-shot compaction of
  // foreign_flow_history ticks into intraday_foreign_flow_5m. Same backfill-via-steady-state
  // idiom as the price-plane compactor above — this startup call IS the backfill of whatever
  // ticks currently survive at deploy time; no separate migration script. Non-fatal.
  void runIntradayForeignFlow5mCompactor().then((r) => {
    log(`[startup] intradayForeignFlow5mCompactor: buckets=${r.bucketsWritten} codes=${r.codesProcessed} ticks=${r.ticksScanned}`)
  }).catch((err) => {
    log(`[startup] intradayForeignFlow5mCompactor error (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
  })

  // Startup CB reset — task 1404
  // Resets breakers.foreignFlow after FOREIGN_FLOW_CB_RESET_DELAY_MS (default 60s).
  // Ensures that if the VPS pushed a batch before migrations completed and tripped
  // the CB to OPEN, it recovers automatically after startup is stable — without
  // waiting the full 5-minute resetTimeoutMs.
  scheduleForeignFlowCbReset()

  // ── Cron job registration — declarative table + bespoke call sites ──
  // FACTORY-SCHEDULER-job-table-registry: the 79 scheduleCron(...) call sites that used to
  // live inline here now live in schedulerJobTable.ts — 57 share the plain
  // jobRunRepo.wrapRun(name, runner) envelope (buildJobTable + registerJobTable); 22 are
  // bespoke, verbatim scheduleCron(...) call sites (registerBespokeJobs). See
  // schedulerJobTable.ts's header for the full rationale and the walEscalateFn /
  // scheduler-watchdog self-heal manifest details.
  const jobTableCtx = { db, jobRunRepo }
  registerJobTable(buildJobTable(jobTableCtx), jobRunRepo)
  registerBespokeJobs(jobTableCtx)

  registerSummaryJobs({
    daily:     CRONS.summaryDaily,
    weekly:    CRONS.summaryWeekly,
    monthly:   CRONS.summaryMonthly,
    quarterly: CRONS.summaryQuarterly,
    yearly:    CRONS.summaryYearly,
  })

  // Startup catch-up: if a server restart straddled the 23:00 daily cron,
  // last_daily_audit can drift >24h causing WAL bloat risk. Fire-and-forget.
  // Triggered by report 994 (missed 2026-04-06 audit).
  void runDailyAuditIfStale().then((ran) => {
    if (ran) log("daily audit catch-up ran on startup")
  })

  // Startup catch-up: if server restarts after 09:30 GMT+7, stranded PDFs
  // won't be reparsed until tomorrow. Fire-and-forget 30s after boot.
  // Triggered by report 1108 (VNM/VEA PDFs on disk but financial_reports empty).
  // Fix task 1915-fix-part1: call runBctcReparseWithDb(db) instead of
  // runBctcReparseJob() directly — the direct call bypassed db injection and
  // produced a misleading fire-and-forget recordJobRun no-op.
  setTimeout(async () => {
    try {
      await runBctcReparseWithDb(db)
      log('[bctc-reparse] startup catch-up: complete')
    } catch (err) {
      log(`[bctc-reparse] startup catch-up failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, 30_000)

  // Startup catch-up: if server restarts after 08:00 GMT+7 (01:00 UTC) or
  // 22:30 GMT+7 (15:30 UTC) without morning briefing / evening summary having
  // run, fire them once. 30s delay matches bctcReparseJob pattern. task 1430.
  setTimeout(async () => {
    log('[startup-catchup] probe firing — checking morningBriefingJob + eveningSummaryJob + franceSummaryJob')

    try {
      if (shouldRunCatchup(db, 'morningBriefingJob', 1, 0, new Date(), true)) {
        log('[startup-catchup] morningBriefingJob: running catch-up')
        await jobRunRepo.wrapRun('morningBriefingJob', async () => { await runMorningBriefing() })
      }
    } catch (err) {
      log(`[startup-catchup] morningBriefingJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      // task 1408: pass reportCheckFn so catchup is skipped when a valid
      // (fresh vnIndex + newsCount > 0) evening report already exists for
      // today's VN date — prevents overwriting a good report with stale data
      // when the container restarts after midnight UTC but before market open.
      const eveningReportCheck = () => eveningReportIsValid()
      if (shouldRunCatchup(db, 'eveningSummaryJob', 15, 30, new Date(), true, eveningReportCheck)) {
        log('[startup-catchup] eveningSummaryJob: running catch-up')
        await jobRunRepo.wrapRun('eveningSummaryJob', async () => { await runEveningSummary() })
      }
    } catch (err) {
      log(`[startup-catchup] eveningSummaryJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      if (shouldRunCatchup(db, 'franceSummaryJob', 9, 0, new Date(), true)) {
        log('[startup-catchup] franceSummaryJob: running catch-up')
        await jobRunRepo.wrapRun('franceSummaryJob', async () => { await runFranceSummary() })
      }
    } catch (err) {
      log(`[startup-catchup] franceSummaryJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    // task 1958a: alertDigestJob and summaryJob:daily lacked startup-catchup probes.
    // When the container restarts after their scheduled windows (14:00 UTC and 15:30 UTC),
    // these jobs were permanently skipped for the day. The probes below fire them once
    // on startup when the window has passed and no success row exists for today.
    // recoverMissedExecutions: true (set on their cron registrations) handles the
    // complementary case: event-loop stall during a RUNNING container.
    try {
      // alertDigestJob: 21:00 VN = 14:00 UTC, weekdays only
      if (shouldRunCatchup(db, 'alertDigestJob', 14, 0, new Date(), true)) {
        log('[startup-catchup] alertDigestJob: running catch-up')
        await jobRunRepo.wrapRun('alertDigestJob', async () => { await runAlertDigest(undefined, db) })
      }
    } catch (err) {
      log(`[startup-catchup] alertDigestJob error: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      // summaryJob:daily: 22:30 VN = 15:30 UTC, every day (weekdayOnly=false)
      if (shouldRunCatchup(db, 'summaryJob:daily', 15, 30, new Date(), false)) {
        log('[startup-catchup] summaryJob:daily: running catch-up')
        await runSummaryJob('daily')
      }
    } catch (err) {
      log(`[startup-catchup] summaryJob:daily error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, 30_000)

  registerShutdownHook()

  // Startup validation — check macro data freshness on server start
  // Detects stale macro data (>24h old) and alerts WORK channel before morning briefing
  void validateMacroFreshnessOnStartup().catch((err) => {
    log(`[macro-startup-validation] error: ${err instanceof Error ? err.message : String(err)}`)
  })

  // Task 1922j — Startup backfill: populate fred_series_daily when empty.
  // macroIndicatorRefreshJob runs once daily at 06:00 GMT+7; after a Docker restart
  // the table is empty until the next scheduled run. Backfill immediately on startup
  // to ensure EFFR/IORB and ISM data are always available after container restarts.
  void (async () => {
    try {
      const db = getDb()
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM fred_series_daily`
      ).get() as { cnt: number } | null
      if ((row?.cnt ?? 0) === 0) {
        log('[startup-backfill] fred_series_daily empty — running EFFR/IORB backfill')
        const result = await fetchFredEffrIorb(undefined, db)
        if (result !== null) {
          log(`[startup-backfill] EFFR/IORB: ${result.effrRows} EFFR + ${result.iorbRows} IORB rows inserted`)
        } else {
          log('[startup-backfill] EFFR/IORB fetch returned null — FRED temporarily unavailable')
        }
        const ismResult = await fetchFredIsmSubcomponents(undefined, db)
        if (ismResult !== null) {
          const total = Object.values(ismResult.inserted).reduce((a, b) => a + b, 0)
          log(`[startup-backfill] ISM sub-components: ${total} rows inserted, failed: [${ismResult.failed.join(',')}]`)
        } else {
          log('[startup-backfill] ISM fetch returned null — FRED_API_KEY absent or unavailable')
        }
      }

      // FIX-FRED-YAHOO-WEEKEND-STALE: Bridge gap — if tracked_indicators has no
      // fed_funds_rate row (e.g. after a cold restart before the daily cron runs),
      // use the latest EFFR value from fred_series_daily. This ensures the
      // macro-indicators service never falls back to the hardcoded 5.33 fixture.
      const fedRow = db.prepare(
        `SELECT COUNT(*) AS cnt FROM tracked_indicators WHERE indicator = 'fed_funds_rate'`
      ).get() as { cnt: number } | null
      if ((fedRow?.cnt ?? 0) === 0) {
        const effrRow = db.prepare<{ value: number; date: string }, []>(
          `SELECT value, date FROM fred_series_daily
           WHERE series = 'EFFR' AND value != '.'
           ORDER BY date DESC LIMIT 1`
        ).get()
        if (effrRow != null) {
          const extractedAt = new Date().toISOString()
          try {
            db.prepare(
              `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at, data_env)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run('fed_funds_rate', effrRow.value, '%', 'fred_series_daily', extractedAt, 'live')
          } catch {
            db.prepare(
              `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
               VALUES (?, ?, ?, ?, ?)`
            ).run('fed_funds_rate', effrRow.value, '%', 'fred_series_daily', extractedAt)
          }
          log(`[startup-backfill] fed_funds_rate bridged from EFFR: ${effrRow.value}% (date: ${effrRow.date})`)
        } else {
          log('[startup-backfill] fed_funds_rate: tracked_indicators empty + no EFFR rows — rate stays at fixture fallback')
        }
      }
    } catch (err) {
      log(`[startup-backfill] fred_series_daily backfill error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })()

  // Task 1942a — Startup backfill probe: populate vnstock fundamentals tables
  // when the DB is empty or stale after a cold Docker restart.
  // The Monday cron (vnstockFundamentalsRefresh Mon 01:00 UTC) only fires once
  // weekly; after a restart the tables may be empty for up to 7 days.
  // Guard: COUNT(DISTINCT code WHERE data_type='financials') < 10  → cold DB
  //        last fetched_at > 7 days ago                           → stale data
  //        Otherwise                                              → skip
  // _isFundamentalsRunning in vnstockFundamentalsJob handles overlap with the
  // Monday cron — no second lock is needed here (AC-7).
  // Fix 3 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE): wrap probe in jobRunRepo.wrapRun so
  // probe invocations appear in cron_job_runs with proper status=error when they crash.
  // Previously this was fire-and-forget void — crashes were invisible to the auditor.
  void (async () => {
    await jobRunRepo.wrapRun('vnstockStartupProbe', async () => {
      await runVnstockStartupProbe({
        getDb,
        runJob: () => runVnstockFundamentalsJob(),
        scheduleDelay: (ms: number) => new Promise<void>((res) => setTimeout(res, ms)),
        log,
      });
    });
  })()

  log(`[scheduler] jobs registered — ${Object.keys(CRONS).length} cron keys in CRONS map (incl. WAL checkpoint + restart-cadence-alert + 5 summary) + vps-watchdog + VPS health + SLA monitor + macro-refresh + imf-poller + session-tool-usage + tasks-md-janitor + bctc-eval-recompute + agm-plan + board-details + deep-fetch-vps + deep-fetch-main + scheduler-watchdog + breadth-persister active`)
}
