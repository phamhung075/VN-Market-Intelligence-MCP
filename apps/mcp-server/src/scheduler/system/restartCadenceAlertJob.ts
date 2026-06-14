/**
 * Restart-cadence alert job — FIX-MCP-CRASH-LOOP A-1
 *
 * Queries cron_job_runs for rows with job_name='mcpServerStartup' in the
 * last 4 hours.  When count >= 2 (i.e. the server has restarted at least
 * once inside the window, in addition to the current boot), sends a
 * WORK-channel Telegram alert with the restart count and timestamps.
 *
 * This is a guardrail — it is only meaningful after the WAL root fix
 * (BC-1) is deployed.  Before BC-1, the crash loop would cause it to fire
 * continuously.
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
  restartCount: number;
  alertSent: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel job name written at composition-root startup. */
export const STARTUP_JOB_NAME = "mcpServerStartup";

/** Sliding window in hours for restart-count detection. */
const WINDOW_HOURS = 4;

/** Minimum restart count (sentinel rows in window) to trigger an alert. */
const ALERT_THRESHOLD = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

interface StartupRow {
  started_at: string;
}

/**
 * Queries cron_job_runs for startup sentinel rows within the last 4 hours.
 * Sends a WORK-channel alert when count >= 2.
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
    // Query startup sentinel rows within the sliding 4-hour window.
    // SQLite datetime arithmetic: '-4 hours' matches the convention used in
    // getCronJobHealthSummary and other cron queries in this codebase.
    const rows = resolvedDb
      .prepare<StartupRow, []>(
        `SELECT started_at
         FROM cron_job_runs
         WHERE job_name  = '${STARTUP_JOB_NAME}'
           AND started_at >= datetime('now', '-${WINDOW_HOURS} hours')
         ORDER BY started_at ASC`,
      )
      .all();

    const restartCount = rows.length;

    if (restartCount < ALERT_THRESHOLD) {
      return { restartCount, alertSent: false };
    }

    // Build alert message — include timestamps for ops context.
    const timestamps = rows.map((r) => r.started_at).join(", ");
    const message =
      `[mcp-server] RESTART CADENCE ALERT: ` +
      `mcp-server restarted ${restartCount} times in last ${WINDOW_HOURS}h` +
      ` — starts: ${timestamps}`;

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
