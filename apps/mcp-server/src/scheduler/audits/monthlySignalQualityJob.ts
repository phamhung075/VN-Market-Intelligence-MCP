/**
 * Monthly Signal Quality Audit Job — Task 1295c
 *
 * size-justification: 153L — single-job scheduler module: audit-month resolution,
 * T4 per-target-month dedup guard (shouldSkipMonthlyReplay, FIX-MONTHLYSIGNALQUALITY-
 * AUDITJOB-MISSED-JULY-RECOVER-GUARD 2026-08-29: +27L guard+job-name constant;
 * 119→153 measured) and the WORK-channel message build; a 3-function module does not
 * justify a split, and moving the guard elsewhere would break the recordJobRun/pairing
 * cohesion the scheduler zone's wrapper pattern relies on.
 *
 * Runs on the 1st of each month at 00:00 UTC.
 * Queries signal rejection statistics from the prior month and generates an audit report.
 * If rejection rate exceeds 2%, sends an alert to the WORK Telegram channel.
 *
 * Layer: scheduler
 * DDD rules:
 *   - May import from application/ (service layer), infrastructure/ (DB)
 *   - Calls application/services/signalQualityAudit functions
 *   - Uses infrastructure/notifiers/telegram for WORK channel alerts
 *
 * Cron schedule: 0 0 1 * * (1st of month, 00:00 UTC)
 *
 * Exports:
 *   - runMonthlySignalQualityJob(): Promise<void>
 */

import type { Database } from "bun:sqlite";
import { queryRejectionStats, generateAuditReport } from "../../application/services/signalQualityAudit.js";
import { log, shouldSkipMonthlyReplay } from "../startupHelpers.js";

/**
 * Canonical scheduler job_name for this audit (single source of truth — used by
 * the T4 dedup guard below, by schedulerJobTable.ts's registration, and by
 * startScheduler.ts's startup catch-up probe so the three can never drift apart).
 */
export const MONTHLY_SIGNAL_QUALITY_AUDIT_JOB_NAME = "monthlySignalQualityAuditJob";

/**
 * Run the monthly signal quality audit.
 *
 * 1. Calculates the prior month (e.g., if running in May, audits April)
 * 2. Calls queryRejectionStats() to get rejection metrics
 * 3. Calls generateAuditReport() to create markdown report
 * 4. Extracts rejection rate from report
 * 5. If rejection_rate > 2%, sends alert to WORK channel
 * 6. Always logs audit findings to agent_work table
 *
 * T4 idempotency dedup guard (FIX-MONTHLYSIGNALQUALITYAUDITJOB-MISSED-JULY-
 * RECOVER-GUARD, 2026-08-29): before doing any work, skips entirely when a
 * SUCCESS run for MONTHLY_SIGNAL_QUALITY_AUDIT_JOB_NAME exists started in the
 * current calendar month — any fire within a calendar month resolves to the SAME
 * prior-month target, so a success anywhere in the current month proves the
 * current target's Telegram report was already sent. This is what makes
 * recoverMissedExecutions: true safe on the registration (schedulerJobTable.ts):
 * a recovery replay / startup catch-up / manual trigger can never double-send.
 * Fail-open on DB error (missing cron_job_runs table in partial-schema tests →
 * proceed), matching shouldSkipRecoveryReplay's contract.
 *
 * @param db — SQLite database instance (injected for testability, defaults to production getDb())
 * @param sendFn — Optional send function for testing (defaults to sendTelegramWork)
 * @returns Promise<void>
 */
export async function runMonthlySignalQualityJob(
  db?: Database,
  sendFn?: (text: string) => Promise<boolean | void>,
): Promise<void> {
  // Resolve dependencies
  let resolvedDb: Database;
  if (db) {
    resolvedDb = db;
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    resolvedDb = getDb();
  }

  // T4 per-target-month dedup guard — skip BEFORE any query or send when the
  // current target month's report was already produced by an earlier fire this
  // month (see function-level doc for the full rationale).
  if (shouldSkipMonthlyReplay(resolvedDb, MONTHLY_SIGNAL_QUALITY_AUDIT_JOB_NAME)) {
    log(`[${MONTHLY_SIGNAL_QUALITY_AUDIT_JOB_NAME}] already sent this month — skipping (T4 dedup)`);
    return;
  }

  let resolvedSend: (text: string) => Promise<boolean | void>;
  if (sendFn) {
    resolvedSend = sendFn;
  } else {
    const { sendTelegramWork } = await import("../../infrastructure/notifiers/telegram.js");
    resolvedSend = (text: string) => sendTelegramWork(text, { parseMode: "" });
  }

  // Calculate prior month
  const now = new Date();
  let auditMonth = now.getUTCMonth(); // 0-11
  let auditYear = now.getUTCFullYear();

  // If running on the 1st at 00:00 UTC, we audit the previous month
  if (auditMonth === 0) {
    auditMonth = 11;
    auditYear -= 1;
  } else {
    auditMonth -= 1;
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const auditMonthNameStr: string = monthNames[auditMonth] ?? `Month${auditMonth + 1}`;

  // Query rejection statistics for the prior month
  const stats = await queryRejectionStats(resolvedDb, auditMonthNameStr, auditYear);

  // Generate audit report
  const report = await generateAuditReport(resolvedDb);

  // Extract rejection rate from report (format: "Rejection Rate | X.XX%")
  const rateMatch = report.match(/Rejection Rate \| (\d+\.\d+)%/);
  const rejectionRatePercent = rateMatch && rateMatch[1] ? parseFloat(rateMatch[1]) : 0;
  const rejectionRateDecimal = rejectionRatePercent / 100;

  // Threshold: 2%
  const ALERT_THRESHOLD = 0.02;
  const shouldAlert = rejectionRateDecimal > ALERT_THRESHOLD;

  // Build message
  let message = `📊 Signal Quality Audit — ${auditMonthNameStr} ${auditYear}\n`;
  message += `\n`;
  message += `Total Rejections: ${stats.total}\n`;
  message += `Rejection Rate: ${rejectionRatePercent.toFixed(2)}%\n`;
  message += `Top Agent: ${Object.entries(stats.by_agent).sort((a, b) => b[1] - a[1])[0]?.[0] || "none"}\n`;
  message += `\n`;

  if (shouldAlert) {
    message += `⚠️ **ALERT**: Rejection rate (${rejectionRatePercent.toFixed(2)}%) exceeds 2% threshold.\n`;
    message += `Full report:\n\n${report}`;
  } else {
    message += `✓ Rejection rate within acceptable threshold.\n`;
  }

  // Send to WORK channel (always, regardless of threshold)
  await resolvedSend(message);
}
