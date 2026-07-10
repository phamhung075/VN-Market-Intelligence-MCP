/**
 * Data Audit Job — Task 157
 *
 * Scheduled database audit and cleanup engine.
 * Runs nightly (daily) at 23:00 and weekly (deep) at Sunday 01:00 GMT+7.
 *
 * Layer: infrastructure/scheduler
 * DDD rules:
 *   - May import from infrastructure/ and domain/
 *   - Must NOT import from application/ or interface/
 *   - The agent_feedback DDL is inlined here (not imported from feedbackTools.ts)
 *     to avoid violating DDD by importing from interface/mcp/tools/
 *
 * FACTORY-SCHEDULER-split-dataAuditJob: the D-1..D-11 and W-1..W-7 check
 * bodies (previously ~800L of inline logic inside runDailyChecks/
 * runWeeklyChecks) now live one-check-group-per-file under `audit-checks/`.
 * AuditFinding + the shared category/priority/dedup/Telegram-format helpers
 * live in `dataAuditShared.ts`. This file is now a thin composition root:
 * it wires the per-check functions together in the original D-n/W-n order
 * and owns the system_logs/audit_state/Telegram finalize steps + the public
 * runDailyAudit/runWeeklyAudit/runDailyAuditIfStale entry points.
 *
 * Exports:
 *   AuditFinding       — result interface for each check (re-exported from dataAuditShared.ts)
 *   runDailyAudit()    — D-1 through D-11 checks, < 5s
 *   runWeeklyAudit()   — daily + W-1 through W-7, < 30s
 */

import { Database } from "bun:sqlite";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import { checkZeroPriceRows } from "./audit-checks/checkZeroPriceRows.js";
import { checkStalePriceRows } from "./audit-checks/checkStalePriceRows.js";
import { checkStaleAlerts } from "./audit-checks/checkStaleAlerts.js";
import { checkRagAnalysesQuality } from "./audit-checks/checkRagAnalysesQuality.js";
import { checkFailedValidation } from "./audit-checks/checkFailedValidation.js";
import { checkBctcFilingOverdue } from "./audit-checks/checkBctcFilingOverdue.js";
import { checkBctcStranded } from "./audit-checks/checkBctcStranded.js";
import { checkStaleFeedback } from "./audit-checks/checkStaleFeedback.js";
import { checkOldSystemLogs } from "./audit-checks/checkOldSystemLogs.js";
import { checkOldTelegramReports } from "./audit-checks/checkOldTelegramReports.js";
import { checkStaleAgentSignals } from "./audit-checks/checkStaleAgentSignals.js";
import { checkOrphanAgentSignalsAlertId } from "./audit-checks/checkOrphanAgentSignalsAlertId.js";
import { checkRowCountSnapshot } from "./audit-checks/checkRowCountSnapshot.js";
import { checkOldCommodityHistory } from "./audit-checks/checkOldCommodityHistory.js";
import { checkOldSbvHistory } from "./audit-checks/checkOldSbvHistory.js";
import { checkDuplicatePriceHistory } from "./audit-checks/checkDuplicatePriceHistory.js";
import { checkDuplicateRagAnalyses } from "./audit-checks/checkDuplicateRagAnalyses.js";
import { checkIndicatorRanges } from "./audit-checks/checkIndicatorRanges.js";
import { checkOrphanAlerts } from "./audit-checks/checkOrphanAlerts.js";
import { checkLancedbDrift } from "./audit-checks/checkLancedbDrift.js";
import {
  AuditFinding,
  TelegramFn,
  GetCountFn,
  buildFindingTitle,
  buildTelegramMessage,
} from "./dataAuditShared.js";

// Re-exported for backward-compatible import paths (existing tests + bctcReparseJob
// import AuditFinding/buildFindingTitle from "./dataAuditJob.js" — the split must
// not force call-site churn on consumers outside this module).
export type { AuditFinding, TelegramFn, GetCountFn };
export { buildFindingTitle };

// ─────────────────────────────────────────────────────────────────────────────
// Schema helpers (inline DDL — no interface-layer import)
// ─────────────────────────────────────────────────────────────────────────────

function ensureAuditDependencies(_db: Database): void {
  // agent_feedback DDL is now canonical in src/infrastructure/db/schema.ts (task 1022).
  // audit_state DDL is now canonical in src/infrastructure/db/schema.ts (task 1041).
  // Both tables are created by initDatabase() — no inline DDL needed here.
}

// ─────────────────────────────────────────────────────────────────────────────
// Default production helpers
// ─────────────────────────────────────────────────────────────────────────────

async function defaultGetDb(): Promise<Database> {
  const { getDb } = await import("../../infrastructure/db/schema.js");
  return getDb();
}

async function defaultSendTelegram(text: string): Promise<void> {
  try {
    const { mcpConfig } = await import("../../infrastructure/config.js");
    if (!mcpConfig.telegram?.enabled) return;
    const { sendTelegramWork } = await import("../../infrastructure/notifiers/telegram.js");
    await sendTelegramWork(text, { parseMode: "" });
  } catch { /* best-effort */ }
}

// G5b (P2-F): getCount from vectorstore.ts removed — rag-service owns LanceDB (R-1 resolved).
// W-7 uses ragHealthCheck to probe rag-service liveness; count drift check is N/A
// (mcp-server no longer holds a direct LanceDB count). Returns 0 as sentinel.
async function defaultGetCount(): Promise<number> {
  try {
    const { ragHealthCheck } = await import("../../infrastructure/rag/ragHttpClient.js");
    const healthy = await ragHealthCheck();
    return healthy ? -1 : 0; // -1 = "rag-service reachable, real count unknown"
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily audit checks (D-1 through D-11) — orchestration only, check bodies
// live in audit-checks/*.ts. Order preserved exactly from the pre-split
// monolith so finding order + insertFeedbackIfNew side-effect ordering are
// byte-for-byte identical.
// ─────────────────────────────────────────────────────────────────────────────

function runDailyChecks(db: Database): AuditFinding[] {
  return [
    ...checkZeroPriceRows(db),          // D-1
    ...checkStalePriceRows(db),         // D-2
    ...checkStaleAlerts(db),            // D-3, D-4
    ...checkRagAnalysesQuality(db),     // D-5, D-6
    ...checkFailedValidation(db),       // D-7
    ...checkBctcFilingOverdue(db),      // D-7b
    ...checkBctcStranded(db),           // D-7c
    ...checkStaleFeedback(db),          // D-8
    ...checkOldSystemLogs(db),          // D-9
    ...checkOldTelegramReports(db),     // D-10
    ...checkStaleAgentSignals(db),      // D-NEW
    ...checkOrphanAgentSignalsAlertId(db), // D-NEW2 (FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID)
    ...checkRowCountSnapshot(db),       // D-11 (+ D-11b row_count_drop)
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly audit checks (W-1 through W-7) — orchestration only, check bodies
// live in audit-checks/*.ts. Order preserved exactly from the pre-split
// monolith.
// ─────────────────────────────────────────────────────────────────────────────

async function runWeeklyChecks(db: Database, getCountFn: GetCountFn): Promise<AuditFinding[]> {
  return [
    ...checkOldCommodityHistory(db),         // W-1
    ...checkOldSbvHistory(db),               // W-2
    ...checkDuplicatePriceHistory(db),       // W-3
    ...checkDuplicateRagAnalyses(db),        // W-4
    ...checkIndicatorRanges(db),             // W-5
    ...checkOrphanAlerts(db),                // W-6
    ...(await checkLancedbDrift(db, getCountFn)), // W-7
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalize: system_logs + audit_state + Telegram
// ─────────────────────────────────────────────────────────────────────────────

function writeSystemLog(
  db: Database,
  mode: "daily" | "weekly",
  findings: AuditFinding[],
): void {
  try {
    // Routine audit completion is INFO. Warning-severity findings are
    // recorded inside details_json — they are not system-level warnings and
    // should not pollute the RECENT ERRORS panel. Only criticals escalate.
    const hasCritical = findings.some((f) => f.severity === "critical");
    const level = hasCritical ? "error" : "info";

    const cleaned = findings.filter((f) => f.action === "auto_cleaned").reduce((s, f) => s + f.rowsAffected, 0);
    const warnings = findings.filter((f) => (f.action === "flagged" || f.action === "escalated") && f.severity === "warning").length;
    const criticals = findings.filter((f) => (f.action === "flagged" || f.action === "escalated") && f.severity === "critical").length;
    const message = `${mode === "weekly" ? "Weekly" : "Daily"} audit complete: ${cleaned} cleaned, ${warnings} warnings, ${criticals} criticals`;

    db.prepare(`
      INSERT INTO system_logs (timestamp, level, source, message, details_json)
      VALUES (datetime('now'), ?, 'data-auditor', ?, ?)
    `).run(level, message, JSON.stringify(findings));
  } catch { /* never fail the audit for a log write error */ }
}

function upsertAuditState(
  db: Database,
  mode: "daily" | "weekly",
  findings: AuditFinding[],
): void {
  try {
    const findingsJson = JSON.stringify(findings);
    if (mode === "daily") {
      db.prepare(`
        INSERT INTO audit_state (id, last_daily_audit_at, last_daily_findings)
        VALUES (1, datetime('now'), ?)
        ON CONFLICT(id) DO UPDATE SET
          last_daily_audit_at = excluded.last_daily_audit_at,
          last_daily_findings = excluded.last_daily_findings
      `).run(findingsJson);
    } else {
      db.prepare(`
        INSERT INTO audit_state (id, last_daily_audit_at, last_weekly_audit_at, last_daily_findings, last_weekly_findings)
        VALUES (1, datetime('now'), datetime('now'), ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          last_weekly_audit_at  = excluded.last_weekly_audit_at,
          last_weekly_findings  = excluded.last_weekly_findings
      `).run(findingsJson, findingsJson);
    }
  } catch { /* never fail the audit for a state write error */ }
}

async function maybeSendTelegram(
  mode: "daily" | "weekly",
  findings: AuditFinding[],
  db: Database,
  telegramFn: TelegramFn,
): Promise<void> {
  // Send conditions:
  //   - at least one auto_cleaned finding with rowsAffected > 0, OR
  //   - at least one "flagged" or "escalated" finding
  // Row count snapshots (action="none") do NOT trigger a Telegram send on their own.
  const hasIssues =
    findings.some((f) => f.action === "auto_cleaned" && f.rowsAffected > 0) ||
    findings.some((f) => f.action === "flagged" || f.action === "escalated");

  if (!hasIssues) return; // silent on clean run

  try {
    const msg = buildTelegramMessage(mode, findings, db);
    await telegramFn(msg);
  } catch { /* best-effort — never crash the audit for Telegram */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the daily audit (D-1 through D-10).
 *
 * @param db          - Optional injected Database (for testing). Defaults to getDb() singleton.
 * @param telegramFn  - Optional injected Telegram send function (for testing).
 * @param nowMsFn     - Optional injected clock for recovery dedup guard (tests only).
 * @returns Promise<AuditFinding[]>
 *
 * Steps: D-1 (zero_price_rows) through D-11 (row_count_snapshot).
 * D-10 purges telegram_reports older than 48 h.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
 */
export async function runDailyAudit(
  db?: Database,
  telegramFn?: TelegramFn,
  nowMsFn?: () => number,
): Promise<AuditFinding[]> {
  const database = db ?? await defaultGetDb();
  const telegram = telegramFn ?? defaultSendTelegram;

  const DAILY_CADENCE_MS = 86_400_000;
  if (shouldSkipRecoveryReplay(database, "dataAuditJob:daily", DAILY_CADENCE_MS, nowMsFn)) {
    return [];
  }

  let findings: AuditFinding[] = [];

  // recordJobRun never re-throws — errors are captured in cron_job_runs.error_msg
  await recordJobRun(database, "dataAuditJob:daily", async () => {
    ensureAuditDependencies(database);

    findings = runDailyChecks(database);

    writeSystemLog(database, "daily", findings);
    upsertAuditState(database, "daily", findings);
    await maybeSendTelegram("daily", findings, database, telegram);

    // Clean expired agent signals (Sprint 038)
    try {
      const { cleanExpired } = await import("../../infrastructure/db/agentSignalStore.js");
      const removed = cleanExpired(database);
      if (removed > 0) {
        findings.push({ table: "agent_signals", check: "expired_cleanup", severity: "info", rowsAffected: removed, action: "auto_cleaned", detail: `Removed ${removed} expired signals` });
      }
    } catch { /* agent_signals table may not exist yet */ }

    return { rowsWritten: findings.length };
  });

  return findings;
}

/**
 * Startup catch-up: run runDailyAudit() only if last_daily_audit_at is missing
 * or older than `maxAgeHours` (default 24h). Prevents audit gaps after server
 * restarts that straddle the scheduled 23:00 GMT+7 cron firing window.
 * Reported via dev-team-cron Loop after report 994 (audit missed 2026-04-06).
 */
export async function runDailyAuditIfStale(maxAgeHours = 24): Promise<boolean> {
  try {
    const database = await defaultGetDb();
    ensureAuditDependencies(database);
    const row = database
      .query<{ last_daily_audit_at: string | null }, []>(
        "SELECT last_daily_audit_at FROM audit_state WHERE id = 1",
      )
      .get();
    const last = row?.last_daily_audit_at ? new Date(row.last_daily_audit_at).getTime() : 0;
    const ageH = (Date.now() - last) / 3_600_000;
    if (last && ageH < maxAgeHours) return false;
    console.log(`[dataAuditJob] startup catch-up: last_daily_audit ${ageH.toFixed(1)}h old, running now`);
    await runDailyAudit(database);
    return true;
  } catch (err) {
    console.warn(`[dataAuditJob] startup catch-up failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Run the weekly deep audit (daily checks + W-1 through W-7).
 *
 * @param db          - Optional injected Database (for testing). Defaults to getDb() singleton.
 * @param telegramFn  - Optional injected Telegram send function (for testing).
 * @param getCountFn  - Optional injected LanceDB count function (for testing).
 * @param nowMsFn     - Optional injected clock for recovery dedup guard (tests only).
 * @returns Promise<AuditFinding[]>
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (6 days 1h12m window)
 */
export async function runWeeklyAudit(
  db?: Database,
  telegramFn?: TelegramFn,
  getCountFn?: GetCountFn,
  nowMsFn?: () => number,
): Promise<AuditFinding[]> {
  const database = db ?? await defaultGetDb();
  const telegram = telegramFn ?? defaultSendTelegram;
  const getCount = getCountFn ?? defaultGetCount;

  const WEEKLY_CADENCE_MS = 604_800_000;
  if (shouldSkipRecoveryReplay(database, "dataAuditJob:weekly", WEEKLY_CADENCE_MS, nowMsFn)) {
    return [];
  }

  ensureAuditDependencies(database);

  // Run daily checks first (weekly is a superset)
  const dailyFindings = runDailyChecks(database);

  // Run weekly-specific checks
  const weeklyFindings = await runWeeklyChecks(database, getCount);

  const allFindings = [...dailyFindings, ...weeklyFindings];

  // G5b (P2-F): LanceDB compaction removed — rag-service owns its LanceDB lifecycle.
  // mcp-server no longer holds a direct LanceDB connection (R-1 resolved).

  writeSystemLog(database, "weekly", allFindings);
  upsertAuditState(database, "weekly", allFindings);
  await maybeSendTelegram("weekly", allFindings, database, telegram);

  return allFindings;
}
