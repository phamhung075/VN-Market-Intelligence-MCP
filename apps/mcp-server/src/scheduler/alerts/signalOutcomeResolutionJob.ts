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

export interface SignalOutcomeResolutionJobDeps {
  db?: Database;
  /** Injectable nowMs for recovery dedup guard (tests only) */
  nowMsFn?: () => number;
}

export interface SignalOutcomeResolutionJobResult {
  resolved24h: number;
  resolved48h: number;
  skipped24h: number;
  skipped48h: number;
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
    return { resolved24h: 0, resolved48h: 0, skipped24h: 0, skipped48h: 0 };
  }

  const result24 = await resolveSignalOutcomes(db, 24);
  const result48 = await resolveSignalOutcomes(db, 48);

  return {
    resolved24h: result24.resolved,
    resolved48h: result48.resolved,
    skipped24h: result24.skipped,
    skipped48h: result48.skipped,
  };
}

/**
 * Production cron entry point — called by the scheduler every hour.
 */
export async function runSignalOutcomeResolutionJobCron(): Promise<void> {
  await runSignalOutcomeResolutionJob();
}
