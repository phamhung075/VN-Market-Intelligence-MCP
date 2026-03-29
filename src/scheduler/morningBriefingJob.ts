/**
 * Morning Briefing Job — Task 101 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `assembleBriefing` application use case.
 * Registered in `jobs.ts` at 08:00 Asia/Ho_Chi_Minh weekdays (0 8 * * 1-5).
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous briefing is still assembling.
 *
 * Layer: interface/scheduler — imports from application/usecases only.
 */

import type { DailyBriefing } from "../application/usecases/assembleBriefing.js";
import { logger } from "../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let isRunning = false;

/** Reset concurrency guard — exported for test isolation. */
export function resetMorningBriefingGuard(): void {
  isRunning = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one morning briefing cycle.
 *
 * Accepts an optional `briefingFn` parameter for testing (avoids importing the
 * real `assembleBriefing` in tests, which would trigger DB and HTTP dependencies).
 * In production the default `briefingFn` dynamically imports `assembleBriefing`.
 *
 * @param briefingFn - Optional override for the briefing function (injectable for tests)
 */
export async function runMorningBriefing(
  briefingFn?: () => Promise<DailyBriefing>,
): Promise<void> {
  if (isRunning) {
    logger.warn("[morning-briefing] previous cycle still running — skipped");
    return;
  }

  isRunning = true;

  try {
    // Resolve briefing function: injected override or real assembleBriefing
    const fn =
      briefingFn ??
      (async () => {
        const { assembleBriefing } = await import(
          "../application/usecases/assembleBriefing.js"
        );
        return assembleBriefing();
      });

    const briefing = await fn();

    logger.info(
      `[morning-briefing] cycle complete — ` +
        `date: ${briefing.date}, ` +
        `stories: ${briefing.topStories.length}, ` +
        `alerts: ${briefing.alerts.length}, ` +
        `watchlist: ${briefing.watchlistSummary.length}, ` +
        `newReports: ${briefing.newReports.length}`,
    );
  } catch (err) {
    logger.error("[morning-briefing] unhandled error in briefing cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isRunning = false;
  }
}
