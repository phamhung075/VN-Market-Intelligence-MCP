/**
 * alertOutcomeJob — Daily alert outcome resolver (Task 1847d-C)
 *
 * Runs once per day at 08:45 UTC (15:45 GMT+7) — 15 min after signalOutcomeJob.
 * Reads alerts WHERE outcome IS NULL, classifies alert type, fetches price window,
 * scores outcome, and writes result in a single batch transaction.
 *
 * BLK-3: Position-danger HITs trigger a digest notification to WORK channel.
 *
 * DDD layer: scheduler — may import from domain/ and infrastructure/.
 * MUST NOT import from application/ or interface/.
 *
 * @module scheduler/alerts/alertOutcomeJob
 * Task: 1847d-C
 */

import type { Database } from "bun:sqlite";
import {
  readPendingOutcomeAlerts,
  writeAlertOutcome,
} from "../../infrastructure/db/alertStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { shouldSkipRecoveryReplay } from "../startupHelpers.js";
import {
  classifyAlertType,
  scoreAlertOutcome,
} from "../../domain/services/alertOutcomeScorer.js";
import type { PricePoint } from "../../domain/services/alertOutcomeScorer.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AlertOutcomeJobDeps {
  db?: Database;
  nowFn?: () => Date;
  /** Injectable telegram sender for testability (default: sendTelegramWork) */
  telegramSender?: (message: string) => Promise<void>;
  /** Injectable nowMs for recovery dedup guard (tests only) */
  nowMsFn?: () => number;
}

export interface AlertOutcomeJobResult {
  evaluated: number;
  hit: number;
  miss: number;
  unknown: number;
  skipped: number;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface BatchWrite {
  id: string;
  outcome: "HIT" | "MISS" | "UNKNOWN";
  detail: string;
  alertClass: string;
  /** Primary ticker for BLK-3 notification */
  code: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract primary ticker from affected_actions_json.
 * Handles both array format: [{code: 'VIC'}] and object format: {code: 'VIC'}.
 */
function extractPrimaryCode(affectedActionsJson: string | null): string | null {
  if (!affectedActionsJson) return null;
  try {
    const actions = JSON.parse(affectedActionsJson) as unknown;
    if (Array.isArray(actions) && actions.length > 0) {
      const first = actions[0] as { code?: string };
      return first.code ?? null;
    }
    if (actions && typeof actions === "object") {
      return (actions as { code?: string }).code ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch first price at or after alert triggered_at.
 */
function queryPriceAtAlert(
  db: Database,
  code: string,
  triggeredAt: string,
): number | null {
  const row = db
    .prepare<{ price: number }, [string, string]>(
      `SELECT price
       FROM market_prices_history
       WHERE code = ? AND fetched_at >= ?
       ORDER BY fetched_at ASC
       LIMIT 1`,
    )
    .get(code, triggeredAt);
  return row?.price ?? null;
}

/**
 * Fetch all prices within the eval window after alert triggered_at.
 */
function queryPriceWindow(
  db: Database,
  code: string,
  triggeredAt: string,
  evalWindowDays: number,
): PricePoint[] {
  const rows = db
    .prepare<{ price: number; fetched_at: string }, [string, string, string, string]>(
      `SELECT price, fetched_at
       FROM market_prices_history
       WHERE code = ?
         AND fetched_at >= ?
         AND fetched_at <= datetime(?, '+' || ? || ' days')
       ORDER BY fetched_at ASC`,
    )
    .all(code, triggeredAt, triggeredAt, String(evalWindowDays));
  return rows.map((r) => ({ price: r.price, fetchedAt: r.fetched_at }));
}

/**
 * Convert domain-layer outcome (lowercase) to infra-layer format (uppercase).
 */
function toStoreOutcome(outcome: "hit" | "miss" | "unknown"): "HIT" | "MISS" | "UNKNOWN" {
  return outcome.toUpperCase() as "HIT" | "MISS" | "UNKNOWN";
}

// ── Core function ──────────────────────────────────────────────────────────

/**
 * Score pending alert outcomes by comparing price windows after triggered_at.
 * Reads alerts WHERE outcome IS NULL (limited to last 90 days via readPendingOutcomeAlerts).
 * Writes all results in a single transaction for atomic consistency.
 *
 * BLK-3: Sends ONE digest to WORK channel if any position-danger alerts scored HIT.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of daily cadence (21.6h window)
 */
export async function runAlertOutcomeJob(
  deps?: AlertOutcomeJobDeps,
): Promise<AlertOutcomeJobResult> {
  const db: Database = deps?.db ?? getDb();
  const now = deps?.nowFn?.() ?? new Date();

  const DAILY_CADENCE_MS = 86_400_000;
  if (shouldSkipRecoveryReplay(db, "alertOutcomeJob", DAILY_CADENCE_MS, deps?.nowMsFn)) {
    return { evaluated: 0, hit: 0, miss: 0, unknown: 0, skipped: 0 };
  }

  const results: AlertOutcomeJobResult = {
    evaluated: 0,
    hit: 0,
    miss: 0,
    unknown: 0,
    skipped: 0,
  };

  // 1. Read pending alerts (outcome IS NULL, last 90 days)
  // readPendingOutcomeAlerts(windowDays, db) — use 90 days to match arch note on R-6
  const pendingAlerts = readPendingOutcomeAlerts(90, db);

  // 2. Process each alert
  const batch: BatchWrite[] = [];

  for (const alert of pendingAlerts) {
    try {
      // 2a. Classify alert type using signals_json
      // PendingOutcomeAlert has no message field — pass null
      const classification = classifyAlertType(alert.signals_json, null);

      // 2b. Extract primary ticker
      const code = extractPrimaryCode(alert.affected_actions_json);
      if (!code) {
        results.skipped++;
        continue;
      }

      // 2c. Check eval window elapsed
      const alertDate = new Date(alert.triggered_at);
      const calendarDaysElapsed = Math.floor(
        (now.getTime() - alertDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (calendarDaysElapsed < classification.evalWindowDays) {
        results.skipped++;
        continue; // too early — do not write
      }

      // 2d. Fetch prices from market_prices_history
      const alertPrice = queryPriceAtAlert(db, code, alert.triggered_at);
      const windowPrices = queryPriceWindow(
        db,
        code,
        alert.triggered_at,
        classification.evalWindowDays,
      );

      // 2e. Score outcome (pure domain function)
      const scoreResult = scoreAlertOutcome(
        classification,
        alertPrice,
        windowPrices,
        calendarDaysElapsed,
      );

      // 2f. Accumulate batch
      batch.push({
        id: alert.id,
        outcome: toStoreOutcome(scoreResult.outcome),
        detail: scoreResult.detail,
        alertClass: classification.alertClass,
        code,
      });

      results[scoreResult.outcome]++;
      results.evaluated++;
    } catch (error) {
      console.error(`[alertOutcomeJob] error processing alert ${alert.id}:`, error);
      results.skipped++;
    }
  }

  // 3. Batch write in a single transaction
  if (batch.length > 0) {
    const txn = db.transaction(() => {
      for (const write of batch) {
        writeAlertOutcome(write.id, write.outcome, write.detail, db);
      }
    });
    txn();
  }

  // 4. BLK-3: Telegram notification for position-danger HITs (WORK channel)
  const positionDangerHits = batch.filter(
    (w) => w.alertClass === "position-danger" && w.outcome === "HIT",
  );

  if (positionDangerHits.length > 0) {
    const sender = deps?.telegramSender ?? defaultTelegramSender;
    await notifyPositionDangerHits(positionDangerHits, sender);
  }

  return results;
}

// ── Telegram notification ──────────────────────────────────────────────────

/**
 * Default Telegram sender — uses WORK channel.
 * Imported lazily to avoid module load cost when running tests.
 */
async function defaultTelegramSender(message: string): Promise<void> {
  const { sendTelegramWork } = await import(
    "../../infrastructure/notifiers/telegram.js"
  );
  await sendTelegramWork(message);
}

/**
 * BLK-3: Send ONE digest to WORK channel for position-danger HITs.
 * Capped at 5 tickers in message body (+ N more suffix).
 *
 * Non-fatal: if Telegram send fails, logs and continues (job still succeeds).
 */
async function notifyPositionDangerHits(
  hits: BatchWrite[],
  sender: (message: string) => Promise<void>,
): Promise<void> {
  if (hits.length === 0) return;

  const capped = hits.slice(0, 5);
  const remainder = hits.length - capped.length;
  const suffix = remainder > 0 ? `\n+ ${remainder} alert(s) more` : "";

  const lines = capped.map((h) => `• ${h.code}: ${h.detail}`).join("\n");
  const message =
    `[ALERT ACCURACY] ${hits.length} position-danger alert(s) confirmed HIT:\n` +
    lines +
    suffix;

  try {
    await sender(message);
  } catch (error) {
    console.error("[alertOutcomeJob] Telegram notify failed (non-fatal):", error);
  }
}

// ── Cron wrapper ───────────────────────────────────────────────────────────

/**
 * Production cron entry point — called by startScheduler at 08:45 UTC weekdays.
 */
export async function runAlertOutcomeJobCron(): Promise<void> {
  try {
    const result = await runAlertOutcomeJob();
    console.log(
      `[alertOutcomeJob] evaluated=${result.evaluated} hit=${result.hit} miss=${result.miss} unknown=${result.unknown} skipped=${result.skipped}`,
    );
  } catch (error) {
    console.error("[alertOutcomeJob] cron failed:", error);
    throw error;
  }
}
