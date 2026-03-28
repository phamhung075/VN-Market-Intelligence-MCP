/**
 * News Poller Job — Task 102 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `pollNews` application use case.
 * Implements a concurrency guard: if a previous poll cycle is still running,
 * the new invocation is skipped and a warning is logged.
 *
 * Layer: interface/scheduler — imports from application/usecases only.
 */

import { logger } from "../infrastructure/logger.js";

/** Mirrors PollNewsResult from application/usecases/pollNews.ts (task 102) */
interface PollNewsResult {
  fetched: number;
  inserted: number;
  duplicates: number;
  alerts: number;
  errors: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level flag: true while a poll cycle is in flight.
 * Protected against concurrent cron invocations.
 */
let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron-callable wrapper for `pollNews`.
 *
 * Accepts an optional `pollFn` parameter for testing (avoids importing the
 * real `pollNews` in tests, which would trigger DB and HTTP dependencies).
 * In production the default `pollFn` dynamically imports `pollNews`.
 *
 * @param pollFn - Optional override for the poll function (injectable for tests)
 */
export async function runNewsPoller(
  pollFn?: () => Promise<PollNewsResult>,
): Promise<void> {
  if (isRunning) {
    logger.warn("[news-poll] previous cycle still running — skipped");
    return;
  }

  isRunning = true;

  try {
    // Resolve poll function: injected override or real pollNews
    const fn = pollFn ?? (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import("../application/usecases/pollNews.js" as any);
      return (mod as { pollNews: () => Promise<PollNewsResult> }).pollNews();
    });

    const result = await fn();

    logger.info(
      `[news-poll] cycle complete — fetched: ${result.fetched}, ` +
      `new: ${result.inserted}, duplicates: ${result.duplicates}, ` +
      `alerts: ${result.alerts}, errors: ${result.errors}`,
    );
  } catch (err) {
    logger.error("[news-poll] unhandled error in poll cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isRunning = false;
  }
}
