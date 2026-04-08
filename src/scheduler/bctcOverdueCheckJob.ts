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
 * One-shot migration: fix existing bctc-overdue alerts that stored
 * signals_json as ["bctc_overdue"] (string array) instead of a proper
 * Signal object array.  The broken format caused formatSignalVi(s) to call
 * undefined.match() inside the dispatch pipeline, silently crashing the
 * send and leaving the alert stuck with notified_telegram = 0.
 *
 * Safe to call on every run — the WHERE clause is a no-op once all rows
 * are patched.
 */
function patchBrokenSignalsJson(db: Database): void {
  try {
    const rows = db
      .prepare(
        `SELECT id, message, affected_actions_json, triggered_at
         FROM alerts
         WHERE id LIKE 'bctc-overdue:%'
           AND signals_json NOT LIKE '%"type"%'`,
      )
      .all() as Array<{
        id: string;
        message: string;
        affected_actions_json: string;
        triggered_at: string;
      }>;

    if (rows.length === 0) return;

    const update = db.prepare(
      `UPDATE alerts SET signals_json = ? WHERE id = ?`,
    );
    const patch = db.transaction(() => {
      for (const row of rows) {
        let code = "UNKNOWN";
        try {
          const parsed = JSON.parse(row.affected_actions_json) as Array<{
            code: string;
          }>;
          code = parsed[0]?.code ?? code;
        } catch { /* best-effort */ }

        const fixedSignals = JSON.stringify([
          {
            type: "bctc_overdue",
            severity: "high",
            actionCode: code,
            message: row.message,
            confidence: 0.6,
            detectedAt: row.triggered_at,
          },
        ]);
        update.run(fixedSignals, row.id);
      }
    });
    patch();
    logger.info("[bctcOverdueCheck] patched broken signals_json rows", {
      count: rows.length,
    });
  } catch (err) {
    // Non-fatal migration — log and continue
    logger.warn("[bctcOverdueCheck] patchBrokenSignalsJson failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Run a single pass of the BCTC overdue check.
 */
export async function runBctcOverdueCheck(opts: RunOptions = {}): Promise<RunResult> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();
  const threshold = opts.overdueDaysThreshold ?? DEFAULT_OVERDUE_THRESHOLD_DAYS;

  // Migrate any existing broken alerts from the string-array format
  patchBrokenSignalsJson(db);

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

    // signals_json must be a proper Signal object array so that the dispatch
    // pipeline's formatSignalVi(s) can access s.type and s.message without
    // crashing.  Storing ["bctc_overdue"] (string array) caused msg.match()
    // to throw inside formatSignalVi → notifyTelegramAlert caught the error
    // → returned false → alert stuck unnotified forever.
    const signalsJson = JSON.stringify([
      {
        type: "bctc_overdue",
        severity: "high",
        actionCode: code,
        message,
        confidence: 0.6,
        detectedAt: triggeredAt,
      },
    ]);

    try {
      const info = insertAlert.run(
        alertId,
        triggeredAt,
        "high",
        signalsJson,
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
