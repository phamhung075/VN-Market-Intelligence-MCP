/**
 * accuracyDigestJob.ts — Daily accuracy WORK digest (Task 1941c)
 *
 * Thin cron wrapper: queries signal_outcomes accuracy stats, formats a digest
 * message, and sends to the WORK Telegram channel at 07:00 UTC daily.
 *
 * Steps:
 *   1. DB-backed dedup: if cron_job_runs already has a success row for
 *      accuracyDigestJob today, skip entirely (survives server restarts).
 *   2. In-memory concurrency guard: prevents overlap within the same process.
 *   3. Query accuracy stats via getSystemAccuracyDigestStats(db, 30).
 *   4. AC-3: if no rows at all (totalResolved=0 AND neutralOnlyRows=0), log info + exit.
 *   5. Build digest text via buildAccuracyDigestText().
 *   6. AC-8: all-neutral → short digest sent.
 *   7. Send to WORK channel via sendTelegramWork().
 *
 * DDD layer: interface/scheduler — imports from infrastructure/ and application/ only.
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { getSystemAccuracyDigestStats } from "../../infrastructure/db/signalOutcomeStore.js";
import { buildAccuracyDigestText } from "../../application/usecases/buildAccuracyDigest.js";

// ─────────────────────────────────────────────────────────────────────────────
// Module-scope concurrency guard (R-3: must be module-scope, not function-scope)
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed dedup guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a success row for accuracyDigestJob exists in cron_job_runs
 * for today's UTC date. Fail-open: if the table is missing or the query throws,
 * returns false so the digest proceeds rather than being silently suppressed.
 */
function alreadySentToday(db: Database): boolean {
  try {
    const row = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt
         FROM cron_job_runs
         WHERE job_name = 'accuracyDigestJob'
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** UTC date string YYYY-MM-DD for today. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Injection interface (for testing)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccuracyDigestDeps {
  db?: Database;
  sendWork?: (text: string) => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one accuracy digest cycle.
 *
 * Accepts optional `deps` for testing:
 *   - `deps.db`       — injected DB (falls back to getDb())
 *   - `deps.sendWork` — injected Telegram sender (falls back to sendTelegramWork)
 *
 * Both guards (in-memory + DB-backed dedup) always run regardless of injection.
 */
export async function runAccuracyDigest(deps?: AccuracyDigestDeps): Promise<void> {
  if (_running) {
    logger.warn("[accuracyDigestJob] already running — skipping");
    return;
  }

  const effectiveDb = deps?.db ?? getDb();

  if (alreadySentToday(effectiveDb)) {
    logger.debug(
      "[accuracyDigestJob] digest already sent today (DB guard) — skipping",
    );
    return;
  }

  _running = true;

  try {
    const stats = getSystemAccuracyDigestStats(effectiveDb, 30);

    // AC-3: zero rows in the table — graceful skip, no Telegram send
    if (stats.totalResolved === 0 && stats.neutralOnlyRows === 0) {
      logger.info(
        "[accuracyDigestJob] signal_outcomes empty or no resolved rows — skipping digest",
      );
      return;
    }

    const dateStr = todayUtc();
    const text = buildAccuracyDigestText(stats, dateStr);

    logger.info(
      `[accuracyDigestJob] digest built — date=${dateStr} totalResolved=${stats.totalResolved} ` +
        `neutralOnly=${stats.neutralOnlyRows} overallRate=${stats.overallRate?.toFixed(3) ?? "n/a"} ` +
        `types=${stats.bySignalType.length} newStocks=${stats.newStocksCount}`,
    );

    // Send via Telegram WORK channel
    try {
      const sendFn =
        deps?.sendWork ??
        (async (t: string) => {
          const { sendTelegramWork } = await import(
            "../../infrastructure/notifiers/telegram.js"
          );
          return sendTelegramWork(t);
        });

      const sent = await sendFn(text);

      if (!sent) {
        logger.info(
          "[accuracyDigestJob] Telegram WORK not configured — digest not sent",
        );
      } else {
        logger.info("[accuracyDigestJob] digest sent to WORK channel");
      }
    } catch (telegramErr) {
      logger.warn("[accuracyDigestJob] Telegram send failed (non-fatal)", {
        error:
          telegramErr instanceof Error
            ? telegramErr.message
            : String(telegramErr),
      });
    }
  } catch (err) {
    logger.error("[accuracyDigestJob] unhandled error in digest cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    _running = false;
  }
}
