/**
 * Alert Digest Job — Task 188 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `assembleAlertDigest` application use case.
 * Registered in `jobs.ts` at 21:00 Asia/Ho_Chi_Minh weekdays (0 21 * * 1-5).
 *
 * Steps:
 *   1. Assemble the 24h alert digest.
 *   2. If Telegram is configured, send the digest text via the notifier.
 *   3. If Telegram is not configured, log a notice and skip sending.
 *
 * A concurrency guard prevents a second invocation from starting while the
 * previous digest is still assembling.
 *
 * Layer: interface/scheduler — imports from application/usecases and
 * infrastructure/notifiers only.
 */

import type { AlertDigest } from "../../application/usecases/assembleAlertDigest.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;
/** Date string of last digest sent — prevents duplicates on restart/re-trigger. */
let _lastDigestSentDate = "";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one alert digest cycle.
 *
 * Accepts an optional `digestFn` for testing (avoids importing the real
 * `assembleAlertDigest` in tests, which would trigger DB dependencies).
 * In production the default `digestFn` dynamically imports `assembleAlertDigest`.
 *
 * @param digestFn - Optional override for the digest function (injectable for tests)
 */
export async function runAlertDigest(
  digestFn?: () => Promise<AlertDigest>,
): Promise<void> {
  if (_running) {
    logger.warn("[alertDigestJob] already running — skipping");
    return;
  }

  _running = true;

  try {
    const fn =
      digestFn ??
      (async () => {
        const { assembleAlertDigest } = await import(
          "../../application/usecases/assembleAlertDigest.js"
        );
        return assembleAlertDigest();
      });

    const digest = await fn();

    logger.info(
      `[alertDigestJob] digest assembled — ` +
        `date: ${digest.date}, ` +
        `total: ${digest.totalCount}, ` +
        `critical: ${digest.criticalCount}, ` +
        `high: ${digest.highCount}, ` +
        `stocks: ${digest.stockBlocks.length}`,
    );

    // Skip sending when there are no alerts — no noise on Telegram
    if (digest.totalCount === 0) {
      logger.info("[alertDigestJob] no alerts today — skipping Telegram send");
      return;
    }

    // Daily dedup: don't send the same date's digest twice
    if (_lastDigestSentDate === digest.date) {
      logger.debug("[alertDigestJob] digest already sent today — skipping");
      return;
    }

    // Attempt to send via Telegram if configured
    try {
      const { sendTelegram } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );
      const sent = await sendTelegram(digest.text);

      if (!sent) {
        logger.info(
          "[alertDigestJob] (Telegram chua duoc cau hinh) — digest not sent",
        );
      } else {
        _lastDigestSentDate = digest.date;
        logger.info("[alertDigestJob] digest sent via Telegram");
      }
    } catch (telegramErr) {
      // Telegram module might not be available (e.g. in stripped test builds)
      // or Telegram may not be configured — treat as non-fatal
      logger.warn("[alertDigestJob] Telegram send skipped", {
        error:
          telegramErr instanceof Error
            ? telegramErr.message
            : String(telegramErr),
      });
    }
  } catch (err) {
    logger.error("[alertDigestJob] unhandled error in digest cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    _running = false;
  }
}

/**
 * Register the alert digest job.
 * Called from `jobs.ts` — the cron expression is configured there.
 */
export function scheduleAlertDigestJob(): void {
  logger.info(
    "[alertDigestJob] alert digest job ready — scheduled via jobs.ts",
  );
}
