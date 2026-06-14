/**
 * Dev Team Weekly Heartbeat Job — Task 245 (Interface / Scheduler Layer)
 *
 * Sends a Vietnamese-language summary of the Dev Team's weekly activity
 * to the Telegram Chat Channel every Sunday at 07:00 UTC.
 *
 * Logic:
 *   1. Query `telegram_reports` for last 7 days:
 *      - total reports received
 *      - processed count (status != 'new')
 *      - oldest unprocessed report age (hours)
 *   2. Query `system_changelog` for last 7 days:
 *      - count of applied fixes
 *   3. Compute status:
 *      - NGỪNG    — any unprocessed report older than 72 h
 *      - CẢNH BÁO — any unprocessed report older than 24 h
 *      - HOẠT ĐỘNG — all processed, or no reports at all
 *   4. Format and send plain-text Vietnamese message to Chat Channel
 *
 * Dependencies are fully injectable for TDD (db, sendFn).
 *
 * DDD Layer: interface/scheduler — may import from infrastructure only.
 *
 * @module scheduler/devTeamHeartbeatJob
 */

import type { Database } from "bun:sqlite";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable Telegram send function (returns true on success). */
export type SendFn = (text: string) => Promise<boolean>;

/** Injectable nowMs function for recovery dedup guard (tests only) */
export type NowMsFn = () => number;

/** Status classification of the Dev Team. */
export type HeartbeatStatus = "HOẠT ĐỘNG" | "CẢNH BÁO" | "NGỪNG";

/** Summary data gathered from the database. */
export interface HeartbeatData {
  total: number;
  processed: number;
  unprocessed: number;
  /** Age of the oldest unprocessed report in hours, or 0 when none. */
  oldestUnprocessedAgeH: number;
  fixCount: number;
  status: HeartbeatStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Reports older than this are NGỪNG (72 h). */
const STOP_THRESHOLD_H = 72;

/** Reports older than this are CẢNH BÁO (24 h). */
const WARN_THRESHOLD_H = 24;

/** Look-back window for both queries (7 days in seconds). */
const WINDOW_SECONDS = 7 * 24 * 3600;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

// telegram_reports and system_changelog are created by initDatabase()
// in src/infrastructure/db/schema.ts (task 1029) — no inline DDL needed here.

/**
 * Computes the heartbeat status from the age of the oldest unprocessed report.
 *
 * @param oldestAgeH - Age in hours of the oldest unprocessed report (0 = none)
 * @param unprocessed - Count of unprocessed reports
 * @param total - Total reports in last 7 days
 */
function computeStatus(
  oldestAgeH: number,
  unprocessed: number,
  total: number,
): HeartbeatStatus {
  if (total === 0 || unprocessed === 0) return "HOẠT ĐỘNG";
  if (oldestAgeH >= STOP_THRESHOLD_H) return "NGỪNG";
  if (oldestAgeH >= WARN_THRESHOLD_H) return "CẢNH BÁO";
  return "HOẠT ĐỘNG";
}

/**
 * Formats the age as a short human-readable string.
 *
 * @param ageH - Age in fractional hours
 */
function formatAge(ageH: number): string {
  if (ageH <= 0) return "N/A";
  return `${Math.round(ageH)}h`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gathers heartbeat data from SQLite.
 *
 * @param db - SQLite database instance
 * @returns HeartbeatData with counts, oldest-age, and status
 */
export function gatherHeartbeatData(db: Database): HeartbeatData {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - WINDOW_SECONDS;

  // ── telegram_reports stats ─────────────────────────────────────────────────
  interface ReportStats {
    total: number;
    processed: number;
    oldest_new_ts: number | null;
  }

  const stats = db
    .query<ReportStats, [number]>(
      `SELECT
         COUNT(*)                                              AS total,
         SUM(CASE WHEN status != 'new' THEN 1 ELSE 0 END)    AS processed,
         MIN(CASE WHEN status = 'new' THEN created_at END)    AS oldest_new_ts
       FROM telegram_reports
       WHERE created_at >= ?`,
    )
    .get(windowStart) ?? { total: 0, processed: 0, oldest_new_ts: null };

  const total = stats.total ?? 0;
  const processed = stats.processed ?? 0;
  const unprocessed = total - processed;

  let oldestUnprocessedAgeH = 0;
  if (stats.oldest_new_ts != null) {
    oldestUnprocessedAgeH = (nowSec - stats.oldest_new_ts) / 3600;
  }

  // ── system_changelog stats ─────────────────────────────────────────────────
  interface FixCount {
    fix_count: number;
  }

  const windowStartIso = new Date(windowStart * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const fixRow = db
    .query<FixCount, [string]>(
      `SELECT COUNT(*) AS fix_count
       FROM system_changelog
       WHERE fixed_at >= ?`,
    )
    .get(windowStartIso) ?? { fix_count: 0 };

  const fixCount = fixRow.fix_count ?? 0;

  const status = computeStatus(oldestUnprocessedAgeH, unprocessed, total);

  return {
    total,
    processed,
    unprocessed,
    oldestUnprocessedAgeH,
    fixCount,
    status,
  };
}

/**
 * Formats the heartbeat data into a plain-text Vietnamese message.
 *
 * @param data - HeartbeatData from gatherHeartbeatData()
 * @returns Formatted message string
 */
export function formatHeartbeatMessage(data: HeartbeatData): string {
  const ageStr =
    data.unprocessed > 0 ? formatAge(data.oldestUnprocessedAgeH) : "N/A";

  return [
    `Dev Team — Tuan nay:`,
    `Bao cao xu ly: ${data.processed}/${data.total}`,
    `Fix ap dung: ${data.fixCount}`,
    `Chua xu ly: ${data.unprocessed} (cu nhat: ${ageStr})`,
    `Trang thai: ${data.status}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the Dev Team weekly heartbeat.
 *
 * Gathers stats from the database and sends a Vietnamese summary to Telegram
 * Chat Channel.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of weekly cadence (6 days 1h12m window)
 * @param db       - SQLite database instance (defaults to production getDb())
 * @param sendFn   - Telegram send function (defaults to sendTelegramWork)
 * @param nowMsFn  - Injectable clock for dedup guard (tests only)
 */
export async function runDevTeamHeartbeat(
  db?: Database,
  sendFn?: SendFn,
  nowMsFn?: NowMsFn,
): Promise<void> {
  // Lazy-load production dependencies only when not injected (avoids import
  // side-effects in tests that run in the worktree without full infrastructure)
  let resolvedDb: Database;
  if (db) {
    resolvedDb = db;
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    resolvedDb = getDb();
  }

  // T4 dedup guard: skip if already ran within weekly cadence window
  const WEEKLY_CADENCE_MS = 604_800_000;
  if (shouldSkipRecoveryReplay(resolvedDb, "devTeamHeartbeat", WEEKLY_CADENCE_MS, nowMsFn)) {
    return;
  }

  let resolvedSend: SendFn;
  if (sendFn) {
    resolvedSend = sendFn;
  } else {
    const { sendTelegramWork } = await import(
      "../../infrastructure/notifiers/telegram.js"
    );
    resolvedSend = (text: string) => sendTelegramWork(text, { parseMode: "" });
  }

  try {
    const data = gatherHeartbeatData(resolvedDb);
    const message = formatHeartbeatMessage(data);
    await resolvedSend(message);
  } catch (err) {
    console.error(
      "[devTeamHeartbeatJob] Failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
