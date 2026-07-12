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
import { storeAlerts } from "../../infrastructure/db/alertStore.js";
import type { Alert } from "../../domain/services/alertGenerator.js";
import { deriveConfidenceFromStrength } from "../../domain/services/alertConfidenceScorer.js";
import {
  FOREIGN_FLOW_CONFIDENCE_BASE,
  FOREIGN_FLOW_CONFIDENCE_CEILING,
} from "../../domain/services/alertThresholds.js";

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
  // BUG-FIX (FIX-EVIDENCE-PIPELINE-STARVED): the original query used
  // ORDER BY date ASC LIMIT ?, which returned the OLDEST `days` rows in the
  // table (not the most-recent ones). When the table grows beyond `days` rows,
  // the oldest historical rows have foreign_net_vol=0, so the cumulative sum
  // was always 0 and the zero-data guard skipped every stock, writing 0
  // evidence fragments since 2026-05-27.
  //
  // Fix: query the MOST RECENT `days` rows (ORDER BY date DESC LIMIT ?), then
  // reverse in memory to obtain ASC order for the cumulative-sum build.
  // The cumulative-sum delta invariant is preserved: deltas[i] = net_vol of day i.
  const recent = database
    .prepare<unknown, [string, number]>(
      `SELECT code,
              date,
              COALESCE(foreign_net_vol, 0) AS net_vol
       FROM daily_ohlcv_with_flow
       -- TASK_2003 (SUBTASK-DAILY-FF-4): daily_ohlcv_with_flow compat view
       -- (COALESCE new daily_foreign_flow, then legacy daily_ohlcv.foreign_*).
       WHERE code = ?
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(code, days) as Array<{
    code: string;
    date: string;
    net_vol: number;
  }>;

  // Reverse to ASC order so the cumulative sum runs oldest→newest.
  const asc = recent.slice().reverse();

  // Build cumulative sum (ascending) so delta[i] = net_vol[i] when reversed.
  let cumsum = 0;
  const ascending: DailyForeignFlow[] = asc.map((row) => {
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

  // FU-ALERT-COWRITE-SCHEDULER-JOBS: use storeAlerts for atomic alerts↔agent_signals co-write.
  // Dedup check: probe existing alert by deterministic id before calling storeAlerts.
  const checkAlertExists = database.prepare<{ cnt: number }, [string]>(
    "SELECT COUNT(*) AS cnt FROM alerts WHERE id = ?"
  );

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

    // FACTORY-SCHEDULER-alert-confidence-literals: derive confidence from the
    // signal's own 3-day net-flow magnitude (same value already computed for
    // the evidence fragment below) instead of a frozen literal. A borderline
    // HIGH signal (~100k shares/3d) lands near FOREIGN_FLOW_CONFIDENCE_BASE; a
    // maxed-out signal (>=500k shares/3d) lands at FOREIGN_FLOW_CONFIDENCE_CEILING.
    const flowMagnitude = Math.min(1.0, Math.abs(signal.totalNetVolume3d) / 500_000);
    const flowConfidence = deriveConfidenceFromStrength({
      strength: flowMagnitude,
      base: FOREIGN_FLOW_CONFIDENCE_BASE,
      ceiling: FOREIGN_FLOW_CONFIDENCE_CEILING,
    });

    // ── 4a: Build alert and write via storeAlerts (atomic alerts↔agent_signals co-write)
    //        FU-ALERT-COWRITE-SCHEDULER-JOBS: replaces direct INSERT OR IGNORE.
    const alertId = `foreign-flow-${code}-${utcDay}`;
    const message = `[${code}] Foreign flow signal: ${signal.reasoning}`;

    // Same-day dedup: INSERT OR IGNORE is preserved inside storeAlerts.
    // Check existing row to accurately track alertsInserted count.
    const existingRow = checkAlertExists.get(alertId);
    const alreadyExists = (existingRow?.cnt ?? 0) > 0;

    if (!alreadyExists) {
      const foreignFlowAlert: Alert = {
        id: alertId,
        actionCode: code,
        signals: [
          {
            type: "foreign_flow",
            severity: "high",
            actionCode: code,
            message: signal.reasoning,
            confidence: flowConfidence,
            detectedAt: triggeredAt,
          },
        ],
        severity: "high",
        message,
        isRead: false,
        createdAt: triggeredAt,
      };
      storeAlerts([foreignFlowAlert], database);
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
        magnitude: flowMagnitude,
        confidence: flowConfidence,
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
