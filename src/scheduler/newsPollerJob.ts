/**
 * News Poller Job — Task 102 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `pollNews` application use case.
 * Implements a concurrency guard: if a previous poll cycle is still running,
 * the new invocation is skipped and a warning is logged.
 *
 * Layer: interface/scheduler — imports from application/usecases only.
 */

import type { PollNewsResult } from "../application/usecases/pollNews.js";
import { logger } from "../infrastructure/logger.js";

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
      const { pollNews } = await import("../application/usecases/pollNews.js");
      return pollNews();
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
