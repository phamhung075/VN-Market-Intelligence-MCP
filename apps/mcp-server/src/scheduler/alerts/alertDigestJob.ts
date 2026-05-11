/**
 * Alert Digest Job — Task 188 (Interface / Scheduler Layer)
 *
 * Thin cron wrapper around the `assembleAlertDigest` application use case.
 * Registered in `jobs.ts` at 21:00 Asia/Ho_Chi_Minh weekdays (0 21 * * 1-5).
 *
 * Steps:
 *   1. DB-backed dedup: if cron_job_runs already has a success row for
 *      alertDigestJob today, skip entirely (survives server restarts).
 *   2. Assemble the 24h alert digest.
 *   3. If Telegram is configured, send the digest text via the notifier.
 *   4. If Telegram is not configured, log a notice and skip sending.
 *
 * Two guards prevent duplicate sends:
 *   - DB guard (primary): checks cron_job_runs for today's success row.
 *   - In-memory concurrency guard: prevents overlap within the same process.
 *
 * Layer: interface/scheduler — imports from application/usecases and
 * infrastructure/notifiers only.
 */

import type { Database } from "bun:sqlite";
import type { AlertDigest } from "../../application/usecases/assembleAlertDigest.js";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

/**
 * DB-backed dedup: returns true when a success row for alertDigestJob exists
 * in cron_job_runs for today's UTC date. Fail-open: if the table is missing
 * or the query throws, returns false so the digest proceeds rather than being
 * silently suppressed.
 */
function alreadySentToday(db: Database): boolean {
  try {
    const row = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt
         FROM cron_job_runs
         WHERE job_name = 'alertDigestJob'
           AND status   = 'success'
           AND started_at >= date('now')`,
      )
      .get();
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false; // fail-open: do not suppress when guard cannot run
  }
}

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
 * Accepts an optional `db` for testing the DB-backed dedup guard. When
 * omitted the production DB is resolved via `getDb()`. The guard always runs
 * regardless of whether `db` is supplied — the old `if (db && ...)` pattern
 * was a bug: when `db` was undefined the guard was skipped entirely, allowing
 * the digest to fire multiple times in the same UTC day.
 *
 * @param digestFn - Optional override for the digest function (injectable for tests)
 * @param db       - Optional DB instance for the dedup guard; falls back to getDb()
 */
export async function runAlertDigest(
  digestFn?: () => Promise<AlertDigest>,
  db?: Database,
): Promise<void> {
  if (_running) {
    logger.warn("[alertDigestJob] already running — skipping");
    return;
  }

  // DB-backed dedup: primary guard — survives server restarts.
  // Always resolves a DB instance: injected db takes priority (tests / callers
  // that already hold a handle), falling back to getDb() in production.
  // The guard is unconditional — it never depends on db being truthy.
  const effectiveDb = db ?? getDb();
  if (alreadySentToday(effectiveDb)) {
    logger.debug("[alertDigestJob] digest already sent today (DB guard) — skipping");
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
