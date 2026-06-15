/**
 * Restart-cadence alert job — FIX-MCP-CRASH-LOOP A-1
 *                             FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE
 *
 * Queries cron_job_runs for crash-restart rows within the last 4 hours and
 * fires a WORK-channel alert when count >= ALERT_THRESHOLD (2).
 *
 * Deploy vs crash discrimination (FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE):
 * ─────────────────────────────────────────────────────────────────────────────
 * A force-recreate deploy sends SIGTERM to the old container, which calls the
 * graceful-shutdown handler in composition-root.ts and writes a
 * `mcpServerCleanShutdown` sentinel row immediately before closing the DB.
 * A genuine crash (OOM, SIGSEGV, Bun panic, Docker restart-policy retry)
 * skips the handler, so NO clean-shutdown row is written.
 *
 * Discriminator SQL:
 *   For each mcpServerStartup row S in the window, look for a
 *   mcpServerCleanShutdown row C whose `started_at` is strictly between
 *   the PREVIOUS startup and S.  If C exists → graceful deploy → skip.
 *   If C is absent → crash restart → count it.
 *
 * Bootstrap guard (migration boundary):
 * ─────────────────────────────────────────────────────────────────────────────
 * Historical mcpServerStartup rows written before this fix was deployed have
 * NO preceding mcpServerCleanShutdown row — not because they crashed, but
 * because the clean-shutdown handler did not exist yet. Treating absence-of-
 * sentinel as evidence of a crash for those rows produces false pages on the
 * fix's own rollout.
 *
 * Guard: compute firstCleanShutdown = MIN(started_at) of all
 * mcpServerCleanShutdown rows (a single query). Then:
 *
 *   (a) If firstCleanShutdown is NULL (no clean-shutdown rows exist anywhere):
 *       the discriminator has never proven itself live — classify NOTHING as a
 *       crash and return {restartCount:0, alertSent:false}.
 *
 *   (b) When evaluating a startup `current` with predecessor `prev`:
 *       only count it as a crash if prev >= firstCleanShutdown AND no clean-
 *       shutdown row exists in (prev, current).  If prev < firstCleanShutdown,
 *       the writer may not have existed during that gap — skip (not a crash).
 *
 * Self-healing: by the time the first graceful shutdown is ever recorded (next
 * graceful deploy after this fix ships), all pre-fix startups have aged out of
 * the 4h window, and full crash detection is live from that point on.
 *
 * Accepted tradeoff: during the bootstrap window (before the FIRST graceful
 * shutdown is ever written), a genuine crash-loop will NOT page. This is a
 * one-time, narrow gap — the pre-fix behaviour paged on everything, so this
 * is strictly better. Full crash-loop detection is live after the first
 * graceful stop.
 *
 * This is generic: no hardcoded timestamps, no per-deploy IDs, no allowlists.
 * It generalises to every future deploy and every future crash.
 *
 * DDD Layer: interface/scheduler — imports from infrastructure only.
 *            Never imports domain services.
 *
 * Injectable deps: db + sendFn for unit-test isolation.
 *
 * @module scheduler/system/restartCadenceAlertJob
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable Telegram send function (returns true on success). */
export type TelegramSender = (text: string) => Promise<boolean>;

/** Result returned by runRestartCadenceAlertJob. */
export interface RestartCadenceResult {
  /** Number of crash-restarts (deploy startups excluded) found in the window. */
  restartCount: number;
  alertSent: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel job name written at composition-root startup. */
export const STARTUP_JOB_NAME = "mcpServerStartup";

/**
 * Sentinel job name written by the graceful-shutdown handler (SIGTERM/SIGINT)
 * in composition-root.ts immediately before closeDb().
 *
 * Absence of this row between two consecutive startup sentinels means the
 * prior session ended as a crash (no graceful shutdown handler ran).
 */
export const CLEAN_SHUTDOWN_JOB_NAME = "mcpServerCleanShutdown";

/** Sliding window in hours for restart-count detection. */
const WINDOW_HOURS = 4;

/** Minimum crash-restart count in window to trigger an alert. */
const ALERT_THRESHOLD = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

interface StartupRow {
  started_at: string;
}

/**
 * Count crash-restarts in the last 4-hour window, ignoring graceful deploys.
 *
 * A startup is classified as a crash-restart if there is NO
 * `mcpServerCleanShutdown` row between the previous startup and this one.
 * A startup is classified as a deploy if a clean-shutdown row exists in that
 * gap (SIGTERM handler ran → graceful exit → force-recreate brought new container up).
 *
 * Sends a WORK-channel alert when crashRestartCount >= ALERT_THRESHOLD.
 *
 * Non-fatal: query error and send error are logged but not re-thrown so this
 * job can never crash the scheduler.
 *
 * @param db     - SQLite database (defaults to production getDb())
 * @param sendFn - Telegram send function (defaults to sendTelegramWork)
 */
export async function runRestartCadenceAlertJob(
  db?: Database,
  sendFn?: TelegramSender,
): Promise<RestartCadenceResult> {
  // Lazy-load production dependencies only when not injected.
  let resolvedDb: Database;
  if (db) {
    resolvedDb = db;
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    resolvedDb = getDb();
  }

  let resolvedSend: TelegramSender;
  if (sendFn) {
    resolvedSend = sendFn;
  } else {
    const { sendTelegramWork } = await import(
      "../../infrastructure/notifiers/telegram.js"
    );
    resolvedSend = (text: string) => sendTelegramWork(text, { parseMode: "" });
  }

  try {
    // ── 0. Bootstrap guard: find the earliest clean-shutdown sentinel ever ────
    // If NULL, the discriminator has never proven itself live (pre-fix history
    // only). We cannot distinguish crash from pre-fix stop → classify nothing
    // as a crash. See module-level comment for full rationale.
    const firstCleanShutdownRow = resolvedDb
      .prepare<{ first_cs: string | null }, [string]>(
        `SELECT MIN(started_at) AS first_cs
         FROM cron_job_runs
         WHERE job_name = ?`,
      )
      .get(CLEAN_SHUTDOWN_JOB_NAME);

    const firstCleanShutdown = firstCleanShutdownRow?.first_cs ?? null;

    if (firstCleanShutdown === null) {
      // Discriminator not yet bootstrapped — no clean-shutdown sentinel exists.
      // All in-window startups pre-date the fix; absence-of-sentinel is NOT
      // crash evidence. Return silent until the first graceful stop is recorded.
      return { restartCount: 0, alertSent: false };
    }

    // ── 1. Fetch all startup sentinels in the window (oldest first) ───────────
    // We need the full ordered list so we can determine what preceded each boot.
    // Extend the lookback one extra window to capture the startup that preceded
    // the oldest in-window startup (needed to classify the first row).
    const startupRows = resolvedDb
      .prepare<StartupRow, [string]>(
        `SELECT started_at
         FROM cron_job_runs
         WHERE job_name  = ?
           AND started_at >= datetime('now', '-${WINDOW_HOURS * 2} hours')
         ORDER BY started_at ASC`,
      )
      .all(STARTUP_JOB_NAME);

    // ── 2. For each in-window startup, decide deploy vs crash ─────────────────
    // A startup at time T is a CRASH restart when:
    //   (a) its predecessor `prev` >= firstCleanShutdown (the writer existed
    //       during that gap), AND
    //   (b) no mcpServerCleanShutdown row lies in (prev, T).
    // If prev < firstCleanShutdown, the writer may not have existed during
    // that gap — skip (not counted as crash). This prevents false pages on
    // the rollout window when pre-fix startups are still in the 4h window.
    const windowCutoff = (() => {
      const d = new Date();
      d.setHours(d.getHours() - WINDOW_HOURS);
      return d.toISOString().replace("T", " ").slice(0, 19);
    })();

    const crashTimestamps: string[] = [];

    for (let i = 0; i < startupRows.length; i++) {
      const current = startupRows[i]!.started_at;

      // Only evaluate rows inside the detection window.
      if (current < windowCutoff) continue;

      // No predecessor → cannot classify → skip (conservative: not a crash).
      if (i === 0) continue;

      const prev = startupRows[i - 1]!.started_at;

      // Bootstrap boundary: if the predecessor pre-dates the first ever
      // clean-shutdown sentinel, the handler may not have existed then.
      // Skip — absence-of-sentinel is not crash evidence for this gap.
      if (prev < firstCleanShutdown) continue;

      // Check for a clean-shutdown sentinel between prev and current.
      const cleanShutdown = resolvedDb
        .prepare<{ cnt: number }, [string, string, string]>(
          `SELECT COUNT(*) AS cnt
           FROM cron_job_runs
           WHERE job_name  = ?
             AND started_at > ?
             AND started_at < ?`,
        )
        .get(CLEAN_SHUTDOWN_JOB_NAME, prev, current);

      const hadCleanShutdown = (cleanShutdown?.cnt ?? 0) > 0;
      if (!hadCleanShutdown) {
        // No graceful-shutdown sentinel between the two startups → crash restart.
        crashTimestamps.push(current);
      }
    }

    const restartCount = crashTimestamps.length;

    if (restartCount < ALERT_THRESHOLD) {
      return { restartCount, alertSent: false };
    }

    // Build alert message — include timestamps for ops context.
    const timestamps = crashTimestamps.join(", ");
    const message =
      `[mcp-server] CRASH-RESTART CADENCE ALERT: ` +
      `mcp-server crashed and restarted ${restartCount} times in last ${WINDOW_HOURS}h` +
      ` (deploy startups excluded) — crash-starts: ${timestamps}`;

    try {
      await resolvedSend(message);
    } catch (sendErr) {
      console.error(
        "[restartCadenceAlertJob] failed to send Telegram alert:",
        sendErr instanceof Error ? sendErr.message : String(sendErr),
      );
    }

    return { restartCount, alertSent: true };
  } catch (err) {
    console.error(
      "[restartCadenceAlertJob] query error (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
    return { restartCount: 0, alertSent: false };
  }
}
