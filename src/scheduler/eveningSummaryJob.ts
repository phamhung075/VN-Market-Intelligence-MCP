/**
 * Evening Summary Job — Task 105 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `assembleEveningSummary` application use case.
 * Registered in `jobs.ts` at 22:00 Asia/Ho_Chi_Minh weekdays (0 22 * * 1-5).
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous summary is still assembling.
 *
 * Layer: interface/scheduler — imports from application/usecases only.
 */

import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one evening summary cycle.
 *
 * Accepts an optional `summaryFn` parameter for testing (avoids importing the
 * real `assembleEveningSummary` in tests, which would trigger DB dependencies).
 * In production the default `summaryFn` dynamically imports `assembleEveningSummary`.
 *
 * @param summaryFn - Optional override for the summary function (injectable for tests)
 */
export async function runEveningSummary(
  summaryFn?: () => Promise<EveningSummary>,
): Promise<void> {
  if (_running) {
    logger.warn("[eveningSummaryJob] already running — skipping");
    return;
  }

  _running = true;

  try {
    const fn =
      summaryFn ??
      (async () => {
        const { assembleEveningSummary } = await import(
          "../application/usecases/assembleEveningSummary.js"
        );
        return assembleEveningSummary();
      });

    const summary = await fn();

    logger.info(
      `[eveningSummaryJob] cycle complete — ` +
        `date: ${summary.date}, ` +
        `stories: ${summary.topStories.length}, ` +
        `alerts: ${summary.topAlerts.length}, ` +
        `movers: ${summary.watchlistMovers.length}`,
    );
  } catch (err) {
    logger.error("[eveningSummaryJob] unhandled error in summary cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    _running = false;
  }
}

/**
 * Register the evening summary job.
 * Called from `jobs.ts` — the cron expression is configured there.
 * This function is provided for callers who want to schedule via their own cron setup.
 */
export function scheduleEveningSummaryJob(): void {
  // Scheduling is wired in jobs.ts via the CRONS.eveningSummary expression.
  // This exported function exists for explicit registration use cases
  // (e.g. interface/scheduler/index.ts).
  logger.info("[eveningSummaryJob] evening summary job ready — scheduled via jobs.ts");
}
