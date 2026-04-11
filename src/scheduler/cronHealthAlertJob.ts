/**
 * Task 1103 — cronHealthAlertJob
 *
 * Daily job that checks the 24-hour success rate of all registered cron jobs.
 * If any job has >= 3 runs but a success rate below 80%, a single consolidated
 * alert is sent to the WORK Telegram channel.
 *
 * Design decisions:
 *   - No alert on all-green (silent on healthy state)
 *   - Minimum 3 runs to avoid false positives on rarely-run jobs
 *   - 80% threshold is fixed (not configurable)
 *   - One batched message per run (no per-job spam)
 *   - WORK channel only — never MARKET
 *
 * @module scheduler/cronHealthAlertJob
 */

import type { Database } from "bun:sqlite";
import { getCronJobHealthSummary } from "../infrastructure/db/cronJobRunStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_RUNS = 3;
const SUCCESS_RATE_THRESHOLD = 0.80;
const WINDOW_DAYS = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal send-function signature (matches sendTelegramWork interface). */
export type SendFn = (text: string) => Promise<boolean | void>;

export interface CronHealthAlertResult {
  /** Number of degraded jobs that triggered the alert (0 = no alert sent). */
  alertsSent: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// runCronHealthAlert
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check 24-hour cron health and send one WORK-channel alert if any job is degraded.
 *
 * A job is "degraded" when:
 *   - It has at least 3 runs in the rolling 24-hour window (MIN_RUNS)
 *   - Its success rate is strictly below 80% (SUCCESS_RATE_THRESHOLD)
 *
 * @param db     SQLite database (defaults to production getDb() when omitted)
 * @param sendFn Telegram send function (defaults to sendTelegramWork; injectable for tests)
 * @returns      { alertsSent: number } — count of degraded jobs (0 = silent, all-green)
 */
export async function runCronHealthAlert(
  db?: Database,
  sendFn?: SendFn,
): Promise<CronHealthAlertResult> {
  // Resolve dependencies — lazy-import production modules only when not injected
  let resolvedDb: Database;
  if (db) {
    resolvedDb = db;
  } else {
    const { getDb } = await import("../infrastructure/db/schema.js");
    resolvedDb = getDb();
  }

  let resolvedSend: SendFn;
  if (sendFn) {
    resolvedSend = sendFn;
  } else {
    const { sendTelegramWork } = await import(
      "../infrastructure/notifiers/telegram.js"
    );
    resolvedSend = (text: string) => sendTelegramWork(text, { parseMode: "" });
  }

  // 1. Get health summary for last 24 hours
  const summaries = getCronJobHealthSummary(resolvedDb, WINDOW_DAYS);

  // 2. Filter for degraded jobs (meets sample minimum AND below success threshold)
  const degraded = summaries.filter(
    (s) =>
      s.total_runs_7d >= MIN_RUNS &&
      s.success_rate_7d < SUCCESS_RATE_THRESHOLD,
  );

  // 3. All-green: return silently — no heartbeat on healthy state
  if (degraded.length === 0) {
    return { alertsSent: 0 };
  }

  // 4. Format a single consolidated WORK-channel message
  //    Plain text only (no Markdown) — avoids Telegram parse errors
  const lines = degraded.map((d) => {
    const pct = (d.success_rate_7d * 100).toFixed(0);
    const runs = d.total_runs_7d;
    return `[!] ${d.job_name}: ${pct}% success (${runs} runs)`;
  });

  const message = [
    "Cron Health Alert",
    "",
    ...lines,
  ].join("\n");

  // 5. Send one message to WORK channel
  try {
    await resolvedSend(message);
  } catch (err) {
    console.error(
      "[cronHealthAlertJob] Failed to send Telegram alert:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return { alertsSent: degraded.length };
}
