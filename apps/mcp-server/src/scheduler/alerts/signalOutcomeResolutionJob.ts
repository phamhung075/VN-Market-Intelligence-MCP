/**
 * signalOutcomeResolutionJob.ts — Hourly signal outcome resolution cron (2026-05-17)
 *
 * Runs every hour (0 * * * *). For each run:
 *   1. Calls resolveSignalOutcomes(db, 24) — resolves T+24h pending rows.
 *   2. Calls resolveSignalOutcomes(db, 48) — resolves T+48h pending rows.
 *
 * Pattern follows signalOutcomeJob.ts (Task 1382d).
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 */

import type { Database } from "bun:sqlite";
import { resolveSignalOutcomes } from "../../infrastructure/db/signalOutcomeStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import { sendTelegramBug } from "../../infrastructure/notifiers/telegram.js";

export interface SignalOutcomeResolutionJobDeps {
  db?: Database;
  /** Injectable nowMs for recovery dedup guard (tests only) */
  nowMsFn?: () => number;
  /** Injectable BUG-channel sender for the liveness self-alert (tests only) */
  sendBugFn?: (msg: string) => Promise<unknown>;
  /** Injectable now() for the liveness alert's daily dedup gate (tests only) */
  nowFn?: () => Date;
}

export interface SignalOutcomeResolutionJobResult {
  resolved24h: number;
  resolved48h: number;
  skipped24h: number;
  skipped48h: number;
  /** Rows unresolved (checked_at NULL) more than 72h past created_at — 0 when healthy */
  stuckCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Liveness / freshness self-check (FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED item 3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level daily gate — mirrors freshnessSlaMonitorJob.ts's `_lastSummaryDate`
 * pattern. Resetting on process restart is acceptable: worst case is one extra
 * alert on the same UTC day, never silence.
 */
let _lastStalledAlertDate = "";

/** Test-only reset hook for the daily alert-dedup gate. */
export function resetStalledResolverAlertGate(): void {
  _lastStalledAlertDate = "";
}

/**
 * Counts signal_outcomes rows still unresolved (checked_at IS NULL) more than
 * 72h past created_at — the 48h resolution window plus a 24h buffer, matching
 * this task's own verification_gate language ("resolves within 48h+buffer").
 *
 * This is the guard that would have caught the original stall immediately: the
 * cron itself kept reporting `status='success'` in cron_job_runs every hour for
 * 5+ weeks while resolving nothing, because a successful *run* is not the same
 * as successful *progress*. A non-zero stuck count after a normal run means the
 * resolution mechanism (price lookup) is broken even though the job "succeeded".
 * Sends at most one BUG alert per UTC day; never throws (fail-safe — a
 * notification failure must not break the resolution job itself).
 */
export async function checkStalledResolutionLiveness(
  db: Database,
  sendBugFn: (msg: string) => Promise<unknown> = sendTelegramBug,
  nowFn: () => Date = () => new Date(),
): Promise<number> {
  let stuckCount = 0;
  try {
    const row = db
      .query<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM signal_outcomes
          WHERE checked_at IS NULL
            AND created_at <= datetime('now', '-72 hours')`,
      )
      .get();
    stuckCount = row?.cnt ?? 0;
  } catch {
    return 0; // table absent — nothing to check
  }

  const todayUtc = nowFn().toISOString().slice(0, 10);
  if (stuckCount > 0 && _lastStalledAlertDate !== todayUtc) {
    _lastStalledAlertDate = todayUtc;
    try {
      await sendBugFn(
        `[signal-outcome-resolution] LIVENESS: ${stuckCount} signal_outcomes row(s) ` +
          `unresolved >72h past creation — resolver may be stalled (price lookup ` +
          `failing) even though the cron itself reports success.`,
      );
    } catch {
      // non-fatal — never break the resolution job over a notification failure
    }
  }

  return stuckCount;
}

/**
 * Runs both T+24h and T+48h resolution scans.
 * Injectable db for testing.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of hourly cadence (54min window)
 */
export async function runSignalOutcomeResolutionJob(
  deps?: SignalOutcomeResolutionJobDeps,
): Promise<SignalOutcomeResolutionJobResult> {
  const db: Database = deps?.db ?? getDb();

  const HOURLY_CADENCE_MS = 3_600_000;
  if (shouldSkipRecoveryReplay(db, "signalOutcomeResolution", HOURLY_CADENCE_MS, deps?.nowMsFn)) {
    return { resolved24h: 0, resolved48h: 0, skipped24h: 0, skipped48h: 0, stuckCount: 0 };
  }

  const result24 = await resolveSignalOutcomes(db, 24);
  const result48 = await resolveSignalOutcomes(db, 48);

  // Liveness self-check (item 3) — non-blocking, never throws.
  const stuckCount = await checkStalledResolutionLiveness(db, deps?.sendBugFn, deps?.nowFn);

  return {
    resolved24h: result24.resolved,
    resolved48h: result48.resolved,
    skipped24h: result24.skipped,
    skipped48h: result48.skipped,
    stuckCount,
  };
}

/**
 * Production cron entry point — called by the scheduler every hour.
 */
export async function runSignalOutcomeResolutionJobCron(): Promise<void> {
  await runSignalOutcomeResolutionJob();
}
