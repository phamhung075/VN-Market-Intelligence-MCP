/**
 * SSC Checker Job — Task 104 (interface/scheduler layer)
 *
 * Thin cron wrapper around the `checkSscReports` application use case.
 * Registered in `jobs.ts` at 20:00 Asia/Ho_Chi_Minh daily.
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous check is still running (SSC portal may be slow at report-drop time).
 *
 * BCT-OBS-02-FIX (2026-07-23): every nightly cycle now posts one summary
 * message to the WORK Telegram channel — root cause was that neither this
 * wrapper nor `checkSscReports()` ever called a telegram sender (RAW-verified:
 * zero `sendTelegram*`/`telegram` references in either file's full git history,
 * commits f3eeb9b7d..791b0e4dc). The nightly result was therefore silently
 * invisible to WORK regardless of outcome (no-op skip, full run, or error).
 *
 * Layer: interface/scheduler — may call application use cases and getDb().
 * Must not import directly from domain/.
 */

import { checkSscReports } from "../../application/usecases/checkSscReports.js";
import type { SscCheckResult } from "../../application/usecases/checkSscReports.js";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { mcpConfig } from "../../infrastructure/config.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Options (BCT-OBS-02-FIX — dependency injection for tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface SscCheckRunOptions {
  /**
   * Injectable WORK-channel Telegram sender (BCT-OBS-02-FIX). Defaults to
   * `sendTelegramWork`. Override in tests to assert the nightly-result→WORK
   * path without a real Telegram call.
   */
  sendWorkAlertFn?: (message: string) => Promise<boolean>;
  /**
   * Injectable override for the `checkSscReports` application use case
   * (tests only). Defaults to the production `checkSscReports`. Lets tests
   * exercise the enableLocalBctcFetch=true branch without hitting the real
   * watchlist/SSC portal/network.
   */
  checkSscReportsFn?: () => Promise<SscCheckResult>;
  /**
   * Test-only override for the VPS-only guard flag. Defaults to
   * `mcpConfig.features.enableLocalBctcFetch` (the real production singleton,
   * unchanged). `mcpConfig` is loaded once at module-import time so an
   * env-var change mid-test-run cannot flip it (same limitation documented
   * in FIX-1281's own test suite) — this override lets tests exercise both
   * branches deterministically without touching the singleton.
   */
  enableLocalBctcFetchOverride?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one SSC nightly check cycle.
 *
 * Calls `checkSscReports()` with the production SSC fetcher and BCTC pipeline.
 * Logs a structured summary line when the check completes, and sends exactly
 * one summary message to the WORK Telegram channel per executed cycle
 * (skip / complete / failed) — BCT-OBS-02-FIX.
 * Skips the check (and the WORK message) if a previous invocation is still
 * running, or if the T4 recovery-replay dedup guard already covered today.
 */
export async function runSscCheck(opts: SscCheckRunOptions = {}): Promise<void> {
  if (isRunning) {
    logger.warn("[ssc-check] previous cycle still running — skipped");
    return;
  }

  isRunning = true;

  const sendWorkAlert =
    opts.sendWorkAlertFn ??
    (async (msg: string) => {
      const { sendTelegramWork } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );
      return sendTelegramWork(msg, { parseMode: "" });
    });
  const checkSscReportsFn = opts.checkSscReportsFn ?? checkSscReports;
  const enableLocalBctcFetch =
    opts.enableLocalBctcFetchOverride ?? mcpConfig.features.enableLocalBctcFetch;

  // Set inside the try block below; sent to WORK once the cycle is done.
  // null = no executed cycle this invocation (concurrency/dedup early-return) —
  // no message needed since nothing new happened.
  let summaryMessage: string | null = null;

  try {
    const db = getDb();

    // T4 dedup guard: skip if already ran within daily cadence window
    // @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
    const DAILY_CADENCE_MS = 86_400_000;
    if (shouldSkipRecoveryReplay(db, "sscCheckerJob", DAILY_CADENCE_MS)) { isRunning = false; return; }

    // recordJobRun never re-throws — errors are captured in cron_job_runs.error_msg
    await recordJobRun(db, "sscCheckerJob", async () => {
      // Task 1281-fix: VPS-only architecture guard.
      // The local server (France IP) must NOT attempt to download BCTC PDFs directly.
      // All BCTC acquisition is handled exclusively by vn-bctc-fetch.service on the
      // Vinahost VPS (Vietnam IP). Skipping prevents x5 "Network timeout" errors at startup.
      //
      // FIX-CRON-SSCCHECKERJOB-DEAD-87D (2026-07-23): this guard used to sit
      // BEFORE recordJobRun() was ever called, so the daily cron wrote ZERO
      // cron_job_runs rows for the entire ~88 days it was unset in production —
      // indistinguishable from "crashed / never registered" to any freshness or
      // watchdog check. Moved inside the recordJobRun callback so the cron
      // always writes an honest 'success' row (rowsWritten=0) when it correctly
      // no-ops. This does NOT reintroduce any network call — checkSscReports()
      // is still only invoked when the flag is true. checkSscReports()'s
      // functional role (new-report discovery + alerting) has also been fully
      // superseded since by the queue-based VPS-driven pipeline (GET
      // /api/bctc-fetch-queue + bctcQueueEnricherJob + POST /api/push-bctc-pdf)
      // and by signalDetector.ts's generic report_new signal — see decision
      // journal FIX-CRON-SSCCHECKERJOB-DEAD-87D for the full evidence trail.
      if (!enableLocalBctcFetch) {
        logger.debug("[ssc-check] ENABLE_LOCAL_BCTC_FETCH=false — skipping (VPS-only mode)");
        summaryMessage =
          "[ssc-check] nightly run skipped — VPS-only mode (ENABLE_LOCAL_BCTC_FETCH=false); " +
          "BCTC discovery is handled by bctcQueueEnricherJob";
        return { rowsWritten: 0 };
      }

      const result = await checkSscReportsFn();
      logger.info(
        `[ssc-check] cycle complete — ` +
          `checked: ${result.checked}, ` +
          `newReports: ${result.newReports}, ` +
          `alerts: ${result.alerts}, ` +
          `errors: ${result.errors}`,
      );
      summaryMessage =
        `[ssc-check] nightly run complete — checked: ${result.checked}, ` +
        `newReports: ${result.newReports}, alerts: ${result.alerts}, errors: ${result.errors}`;
      return { rowsWritten: result.newReports };
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("[ssc-check] unhandled error", { error: errMsg });
    summaryMessage = `[ssc-check] nightly run FAILED — ${errMsg}`;
  } finally {
    isRunning = false;
  }

  // BCT-OBS-02-FIX: post the nightly result to WORK — non-fatal on send failure
  // (mirrors the bctcOverdueCheckJob FR-OBS-01-FIX precedent).
  if (summaryMessage !== null) {
    try {
      await sendWorkAlert(summaryMessage);
    } catch (sendErr) {
      logger.warn("[ssc-check] WORK channel alert send failed (non-fatal)", {
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
      });
    }
  }
}
