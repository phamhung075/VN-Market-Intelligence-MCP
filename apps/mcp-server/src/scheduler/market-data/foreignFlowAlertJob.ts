/**
 * Task 1133 — foreignFlowAlertJob
 *
 * Daily 16:30 VN (09:30 UTC, weekdays Mon-Fri) scanner that:
 * 1. Loads all watchlist stocks from DB
 * 2. Fetches foreign flow history for each stock (last 10 days)
 * 3. Runs analyzeForeignFlow() to detect smart-money patterns
 * 4. For HIGH-severity signals only:
 *    a. Inserts an alert row (INSERT OR IGNORE for same-day dedup)
 *    b. Writes an evidence fragment (direction → bullish/bearish)
 * 5. Sends one digest to WORK channel (never MARKET — Alert Commander handles escalation)
 * 6. Returns ForeignFlowAlertResult summary
 *
 * Zero-data guard: stocks where all foreignVolume rows are 0 are skipped.
 * Alert dedup: id = "foreign-flow-{CODE}-{UTC-DAY}" — safe to re-run.
 *
 * Layer: scheduler — may import from infrastructure and domain.
 *
 * @module scheduler/foreignFlowAlertJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { analyzeForeignFlow, type DailyForeignFlow } from "../../domain/services/foreignFlowAnalyzer.js";
import {
  insertEvidenceFragment,
} from "../../infrastructure/db/evidenceFragmentStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Summary returned by runForeignFlowAlertJob */
export interface ForeignFlowAlertResult {
  /** Total stocks read from watchlist */
  stocksScanned: number;
  /** Stocks skipped (< 2 rows of history, or all-zero foreignVolume) */
  stocksSkipped: number;
  /** Stocks with HIGH severity signal */
  highSignals: number;
  /** Alert rows inserted (INSERT OR IGNORE — 0 on same-day re-run) */
  alertsInserted: number;
  /** Evidence fragment rows written */
  evidenceFragmentsWritten: number;
}

/** Injectable Telegram overrides for testing (avoids real HTTP calls) */
export interface TelegramOverridesFF {
  sendWork: (msg: string) => Promise<boolean>;
  /** Present only for interface symmetry — NEVER called by this job */
  sendMarket?: (msg: string) => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist row
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Production DB lazy-loader
// ─────────────────────────────────────────────────────────────────────────────

async function defaultGetDb(): Promise<Database> {
  const { getDb } = await import("../../infrastructure/db/index.js");
  return getDb();
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-injected history fetch (for test compatibility)
// getForeignFlowHistory always calls getDb() — when a test DB is injected we
// must run the same query directly on the injected database.
// ─────────────────────────────────────────────────────────────────────────────

function getForeignFlowHistoryFromDb(
  database: Database,
  code: string,
  days = 10,
): DailyForeignFlow[] {
  // Query daily_ohlcv ASC so we can build a running cumulative sum.
  // COALESCE foreign_net_vol to 0 for rows where foreign flow was not yet written.
  const rows = database
    .prepare<unknown, [string, number]>(
      `SELECT code,
              date,
              COALESCE(foreign_net_vol, 0) AS net_vol
       FROM daily_ohlcv
       WHERE code = ?
       ORDER BY date ASC
       LIMIT ?`,
    )
    .all(code, days) as Array<{
    code: string;
    date: string;
    net_vol: number;
  }>;

  // Build cumulative sum (ascending) so delta[i] = net_vol[i] when reversed.
  let cumsum = 0;
  const ascending: DailyForeignFlow[] = rows.map((row) => {
    cumsum += row.net_vol;
    return {
      code: row.code,
      date: row.date,
      foreignVolume: cumsum,
      foreignRoom: 0,
      holdingRatio: 0,
    };
  });

  // analyzeForeignFlow expects DESC (most recent first).
  return ascending.reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the foreign flow alert scan.
 *
 * @param db                - Optional injected DB (uses production DB when omitted)
 * @param telegramOverrides - Optional injected send functions (uses real Telegram when omitted)
 */
export async function runForeignFlowAlertJob(
  db?: Database,
  telegramOverrides?: TelegramOverridesFF,
): Promise<ForeignFlowAlertResult> {
  const database = db ?? (await defaultGetDb());

  // ── Step 1: Load watchlist ─────────────────────────────────────────────────
  let watchlist: WatchlistRow[] = [];
  try {
    watchlist = database
      .query<WatchlistRow, []>("SELECT code FROM watchlist ORDER BY code")
      .all();
  } catch (err) {
    logger.warn("[foreignFlowAlertJob] Could not read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const utcDay = new Date().toISOString().slice(0, 10);
  const triggeredAt = new Date().toISOString();

  // Prepare insert statement for alert rows
  const insertAlert = database.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, signals_json, affected_actions_json,
       analysis_ids_json, message, read, user_note, sent_by)
    VALUES
      (?, ?, 'high', ?, ?, NULL, ?, 0, NULL, 'server')
  `);

  let stocksSkipped = 0;
  let highSignals = 0;
  let alertsInserted = 0;
  let evidenceFragmentsWritten = 0;

  const highSignalLines: string[] = [];

  // ── Step 2-4: Per-stock analysis ──────────────────────────────────────────
  for (const { code } of watchlist) {
    // Fetch history (last 10 days, DESC) — use injected DB directly
    const history = getForeignFlowHistoryFromDb(database, code, 10);

    // Zero-data guard: skip if all foreignVolume are 0
    if (history.every((r) => r.foreignVolume === 0)) {
      stocksSkipped++;
      continue;
    }

    // Insufficient history guard: analyzeForeignFlow needs >= 2 entries
    if (history.length < 2) {
      stocksSkipped++;
      continue;
    }

    const signal = analyzeForeignFlow(history);
    if (!signal || signal.severity !== "high") {
      // Only process HIGH severity
      continue;
    }

    highSignals++;

    // ── 4a: Insert alert row (INSERT OR IGNORE for same-day dedup) ──────────
    const alertId = `foreign-flow-${code}-${utcDay}`;
    const signalsJson = JSON.stringify([
      {
        type: "foreign_flow",
        severity: "high",
        actionCode: code,
        message: signal.reasoning,
        confidence: 0.75,
        detectedAt: triggeredAt,
      },
    ]);
    const affectedActionsJson = JSON.stringify([{ code }]);
    const message = `[${code}] Foreign flow signal: ${signal.reasoning}`;

    const insertResult = insertAlert.run(
      alertId,
      triggeredAt,
      signalsJson,
      affectedActionsJson,
      message,
    );
    if (insertResult.changes > 0) {
      alertsInserted++;
    }

    // ── 4b: Write evidence fragment only for non-neutral direction ──────────
    if (signal.netFlowDirection !== "neutral") {
      const direction =
        signal.netFlowDirection === "net_buy" ? "bullish" : "bearish";

      insertEvidenceFragment(database, {
        stock: code,
        evidence_type: "foreign_flow_institutional",
        direction,
        magnitude: Math.min(1.0, Math.abs(signal.totalNetVolume3d) / 500_000),
        confidence: 0.75,
        source_agent: "scheduler/foreignFlowAlertJob",
        ttl_days: 14,
      });
      evidenceFragmentsWritten++;
    }

    highSignalLines.push(
      `${code}: ${signal.netFlowDirection} (${signal.consecutiveDays}d streak) — ${signal.reasoning}`,
    );

    logger.info(
      `[foreignFlowAlertJob] HIGH signal ${code} — ${signal.reasoning}`,
    );
  }

  // ── Step 5: Send WORK digest (exactly once) ────────────────────────────────
  const digestDate = utcDay;
  let digestMsg: string;

  if (highSignals === 0) {
    digestMsg = [
      `FOREIGN FLOW SCAN ${digestDate}`,
      `Scanned: ${watchlist.length} stocks`,
      `Skipped: ${stocksSkipped} (insufficient data)`,
      "No HIGH severity signals today.",
    ].join("\n");
  } else {
    digestMsg = [
      `FOREIGN FLOW SCAN ${digestDate}`,
      `Scanned: ${watchlist.length} stocks | High signals: ${highSignals} | Alerts inserted: ${alertsInserted}`,
      "",
      ...highSignalLines,
    ].join("\n");
  }

  // Resolve send function — dynamic import in production, injected in tests
  const sendWork =
    telegramOverrides?.sendWork ??
    (async (msg: string) => {
      const { sendTelegramWork } = await import(
        "../../infrastructure/notifiers/telegram.js"
      );
      return sendTelegramWork(msg);
    });

  try {
    await sendWork(digestMsg);
    logger.info("[foreignFlowAlertJob] WORK digest sent");
  } catch (err) {
    logger.warn("[foreignFlowAlertJob] WORK digest send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    stocksScanned: watchlist.length,
    stocksSkipped,
    highSignals,
    alertsInserted,
    evidenceFragmentsWritten,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper with recordJobRun observability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron-callable wrapper for the foreign flow alert job.
 *
 * Wraps runForeignFlowAlertJob in recordJobRun for observability.
 * Used by jobs.ts at 08:13 UTC (15:13 VN) on weekdays (rescheduled Sprint 1949-T6; was 09:30 UTC).
 */
export async function runForeignFlowAlertJobCron(): Promise<void> {
  const database = await defaultGetDb();

  await recordJobRun(database, "foreignFlowAlertJob", async () => {
    const result = await runForeignFlowAlertJob(database);
    return { rowsWritten: result.alertsInserted + result.evidenceFragmentsWritten };
  });
}
