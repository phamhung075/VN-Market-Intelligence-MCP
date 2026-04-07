/**
 * BCTC Overdue Check job — Task 1018 Slice 1 (skeleton).
 *
 * Scans the watchlist, computes the current statutory BCTC filing deadline
 * for each stock, and inserts an `alerts` row when:
 *   - no filing exists for that quarter, AND
 *   - the deadline was crossed more than `overdueDaysThreshold` days ago
 *     (default 3).
 *
 * Slice 2 (this revision): the inserted alert row uses severity = "high" so
 * it is automatically picked up by `readUnnotifiedAlerts()` and dispatched to
 * the user Chat Channel by the existing Alert Commander pipeline (no new
 * Telegram code is added — the deterministic id provides cooldown/dedup).
 *
 * Slice 3 will register a daily cron entry in `src/scheduler/jobs.ts`.
 *
 * Idempotency:
 *   The alert id is deterministic — `bctc-overdue:<CODE>:<YEAR>:<Q>:<UTC-DAY>`
 *   — so re-running the job within the same UTC day produces no duplicates
 *   thanks to PRIMARY KEY on `alerts.id`. A new alert per stock fires at most
 *   once per UTC day until the report lands.
 *
 * Domain-pure logic for deadline + classification lives in
 * `src/domain/services/earningsCalendar.ts`. This file is the
 * scheduler-layer wrapper that wires that logic to the SQLite store.
 *
 * @module scheduler/bctcOverdueCheckJob
 */

import type { Database } from "bun:sqlite";

import { getDb } from "../infrastructure/db/schema.js";
import {
  getCurrentDeadline,
  classifyFilingStatus,
} from "../domain/services/earningsCalendar.js";
import { logger } from "../infrastructure/logger.js";

interface RunOptions {
  /** Database connection (defaults to singleton). Override in tests. */
  db?: Database;
  /** Reference instant; defaults to wall-clock now. */
  now?: Date;
  /** Minimum days past deadline before an alert fires (default: 3). */
  overdueDaysThreshold?: number;
}

interface RunResult {
  alertsInserted: number;
  stocksChecked: number;
  overdueFound: number;
}

interface WatchlistRow {
  code: string;
  domain: string;
}

interface FilingRow {
  published_at: string | null;
}

const DEFAULT_OVERDUE_THRESHOLD_DAYS = 3;

/**
 * Run a single pass of the BCTC overdue check.
 */
export async function runBctcOverdueCheck(opts: RunOptions = {}): Promise<RunResult> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();
  const threshold = opts.overdueDaysThreshold ?? DEFAULT_OVERDUE_THRESHOLD_DAYS;

  let watchlist: WatchlistRow[] = [];
  try {
    watchlist = db
      .query<WatchlistRow, []>(
        "SELECT code, COALESCE(domain, 'general') AS domain FROM watchlist ORDER BY code",
      )
      .all();
  } catch (err) {
    logger.warn("[bctcOverdueCheck] Could not read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { alertsInserted: 0, stocksChecked: 0, overdueFound: 0 };
  }

  if (watchlist.length === 0) {
    return { alertsInserted: 0, stocksChecked: 0, overdueFound: 0 };
  }

  const insertAlert = db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note)
    VALUES
      (?, ?, ?, ?, ?, NULL, ?, 0, NULL)
  `);

  const utcDay = now.toISOString().slice(0, 10);
  const triggeredAt = now.toISOString();

  let alertsInserted = 0;
  let overdueFound = 0;

  for (const { code, domain } of watchlist) {
    const { quarter, year, deadline } = getCurrentDeadline(now, domain);

    let filingDate: string | null = null;
    try {
      const row = db
        .query<FilingRow, [string, number, number]>(
          `SELECT published_at FROM financial_reports
            WHERE action_code = ? AND period_year = ? AND period_quarter = ?
              AND published_at IS NOT NULL
            ORDER BY published_at ASC LIMIT 1`,
        )
        .get(code, year, quarter);
      filingDate = row?.published_at ?? null;
    } catch (err) {
      logger.warn("[bctcOverdueCheck] filing lookup failed", {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const status = classifyFilingStatus(now, {
      filingDate,
      quarter,
      year,
      deadline,
    });

    if (status.status !== "QUA_HAN") continue;
    const daysOverdue = Math.abs(status.daysUntilDeadline ?? 0);
    if (daysOverdue < threshold) continue;

    overdueFound += 1;

    const alertId = `bctc-overdue:${code}:${year}:Q${quarter}:${utcDay}`;
    const message =
      `${code} BCTC overdue: Q${quarter}-${year} report is ${daysOverdue} days past the statutory deadline ` +
      `(${deadline.toISOString().slice(0, 10)}). No filing found in financial_reports.`;

    try {
      const info = insertAlert.run(
        alertId,
        triggeredAt,
        "high",
        JSON.stringify(["bctc_overdue"]),
        JSON.stringify([{ code, expectedImpact: "down", confidence: 0.6 }]),
        message,
      );
      if ((info.changes ?? 0) > 0) alertsInserted += 1;
    } catch (err) {
      logger.warn("[bctcOverdueCheck] alert insert failed", {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (alertsInserted > 0) {
    logger.info("[bctcOverdueCheck] inserted overdue alerts", {
      alertsInserted,
      overdueFound,
      stocksChecked: watchlist.length,
    });
  }

  return {
    alertsInserted,
    stocksChecked: watchlist.length,
    overdueFound,
  };
}
