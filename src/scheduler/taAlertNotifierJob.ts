/**
 * Task 1314 — taAlertNotifierJob
 *
 * Runs every 15 minutes during VN market hours (every 15min 2-8 UTC Mon-Fri).
 * Queries the alerts table for unnotified TA alert rows, formats a compact
 * Vietnamese message, and sends it to the Telegram market channel.
 *
 * Design:
 * - Only picks up severity='warning' TA types: ta_overbought, ta_oversold,
 *   ta_bb_breakout_up, ta_bb_breakout_down
 * - Batch size capped at 10 rows per cycle to prevent oversized messages
 * - Marks notified_telegram=1 per-row AFTER successful sendFn
 * - If sendFn throws, no rows are marked (retry on next cycle)
 * - Returns { sent, skipped } summary
 *
 * Layer: scheduler — may import from infrastructure and domain.
 *        Must NOT import from application/ or interface/.
 *
 * @module scheduler/taAlertNotifierJob
 */

import type { Database } from "bun:sqlite";
import { logger } from "../infrastructure/logger.js";
import { recordJobRun } from "../infrastructure/db/cronJobRunStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TaAlertNotifierDeps {
  /** Injected SQLite database — defaults to production getDb() */
  db?: Database;
  /** Injected send function — defaults to sendTelegramMarket dynamic import */
  sendFn?: (msg: string, opts: unknown) => Promise<void>;
  /** Injected clock — defaults to () => new Date() */
  nowFn?: () => Date;
}

export interface TaAlertNotifierResult {
  /** Rows successfully marked notified_telegram=1 */
  sent: number;
  /** Always 0 — WHERE clause enforces; field exists for future audit use */
  skipped: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB row type
// ─────────────────────────────────────────────────────────────────────────────

interface AlertRow {
  id: string;
  message: string | null;
  signals_json: string | null;
  affected_actions_json: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Production DB lazy-loader
// ─────────────────────────────────────────────────────────────────────────────

async function defaultGetDb(): Promise<Database> {
  const { getDb } = await import("../infrastructure/db/index.js");
  return getDb();
}

// ─────────────────────────────────────────────────────────────────────────────
// Message formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract stock code from affected_actions_json.
 * Falls back to "(unknown)" on parse error.
 */
function extractCode(affectedActionsJson: string | null): string {
  if (!affectedActionsJson) return "(unknown)";
  try {
    const parsed = JSON.parse(affectedActionsJson) as Array<{ code?: string }>;
    return parsed[0]?.code ?? "(unknown)";
  } catch {
    return "(unknown)";
  }
}

/**
 * Extract signal type from signals_json[0].type.
 * Returns null on parse error.
 */
function extractSignalType(signalsJson: string | null): string | null {
  if (!signalsJson) return null;
  try {
    const parsed = JSON.parse(signalsJson) as Array<{ type?: string }>;
    return parsed[0]?.type ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract RSI value from stored message string.
 * Pattern: "VCB: RSI(14) = 74.2 — quá mua"
 * Falls back to "?" on regex miss.
 */
function extractRsiValue(message: string | null): string {
  if (!message) return "?";
  const match = /RSI\(14\)\s*=\s*([\d.]+)/.exec(message);
  return match?.[1] ?? "?";
}

/**
 * Format a single alert row line based on signal type.
 */
function formatAlertLine(row: AlertRow): string {
  const code = extractCode(row.affected_actions_json);
  const signalType = extractSignalType(row.signals_json);

  switch (signalType) {
    case "ta_overbought": {
      const rsi = extractRsiValue(row.message);
      return `${code}: RSI=${rsi} quá mua`;
    }
    case "ta_oversold": {
      const rsi = extractRsiValue(row.message);
      return `${code}: RSI=${rsi} quá bán`;
    }
    case "ta_bb_breakout_up":
      return `${code}: giá vượt BB trên — bứt phá tăng`;
    case "ta_bb_breakout_down":
      return `${code}: giá dưới BB dưới — bứt phá giảm`;
    default:
      return `${code}: (unknown TA type: ${signalType ?? "null"})`;
  }
}

/**
 * Format a Vietnam-time HH:MM string from a Date.
 * UTC+7 offset applied manually to avoid timezone dependency.
 */
function formatVnTime(now: Date): string {
  const vnMs = now.getTime() + 7 * 3_600_000;
  const vnDate = new Date(vnMs);
  const hh = String(vnDate.getUTCHours()).padStart(2, "0");
  const mm = String(vnDate.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Build the full Telegram message string for a batch of alert rows.
 */
function formatBatchMessage(rows: AlertRow[], nowFn: () => Date): string {
  const vnTime = formatVnTime(nowFn());
  const header = `TA Alert [${vnTime} VN]:`;
  const lines = rows.map(formatAlertLine);
  return [header, ...lines].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the TA alert notifier job.
 *
 * Queries unnotified TA alert rows, formats a Vietnamese Telegram message,
 * sends to the market channel, and marks each row notified.
 */
export async function runTaAlertNotifier(
  deps?: TaAlertNotifierDeps,
): Promise<TaAlertNotifierResult> {
  const database = deps?.db ?? (await defaultGetDb());
  const nowFn = deps?.nowFn ?? (() => new Date());

  // ── FR-1: Fetch unnotified TA alert rows ──────────────────────────────────
  const rows = database
    .prepare<AlertRow, []>(`
      SELECT id, message, signals_json, affected_actions_json
        FROM alerts
       WHERE notified_telegram = 0
         AND json_extract(signals_json, '$[0].type') IN (
             'ta_overbought', 'ta_oversold',
             'ta_bb_breakout_up', 'ta_bb_breakout_down'
         )
       ORDER BY triggered_at ASC
    `)
    .all();

  // Guard: empty result
  if (rows.length === 0) {
    return { sent: 0, skipped: 0 };
  }

  // Apply batch cap
  if (rows.length > BATCH_SIZE) {
    logger.warn(
      `[taAlertNotifierJob] batch capped at ${BATCH_SIZE} — ${rows.length - BATCH_SIZE} rows deferred to next cycle`,
    );
  }
  const batch = rows.slice(0, BATCH_SIZE);

  // ── FR-2: Format message ──────────────────────────────────────────────────
  const message = formatBatchMessage(batch, nowFn);

  // ── FR-3: Resolve sendFn ──────────────────────────────────────────────────
  const sendFn =
    deps?.sendFn ??
    (async (msg: string, opts: unknown) => {
      const { sendTelegramMarket } = await import(
        "../infrastructure/notifiers/telegram.js"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sendTelegramMarket(msg, opts as any);
    });

  // ── FR-3: Send to market channel ──────────────────────────────────────────
  try {
    await sendFn(message, {
      persist: { from_agent: "ta-notifier", message_type: "ta_alert" },
    });
  } catch (err) {
    // sendFn threw — do NOT mark any rows; they will retry next cycle
    logger.warn("[taAlertNotifierJob] sendFn threw — no rows marked notified", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, skipped: 0 };
  }

  // ── FR-4: Mark each row notified_telegram=1 (per-row try/catch) ───────────
  const updateStmt = database.prepare<void, [string]>(
    "UPDATE alerts SET notified_telegram = 1 WHERE id = ?",
  );

  let sent = 0;
  for (const row of batch) {
    try {
      updateStmt.run(row.id);
      sent++;
    } catch (err) {
      logger.warn(
        `[taAlertNotifierJob] UPDATE failed for alert id=${row.id}`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  logger.info(
    `[taAlertNotifierJob] sent=${sent} batch=${batch.length} total_unnotified=${rows.length}`,
  );

  return { sent, skipped: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-callable wrapper with recordJobRun observability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cron-callable wrapper for the TA alert notifier job.
 *
 * Used by jobs.ts at every-15-min 2-8 UTC on weekdays.
 */
export async function runTaAlertNotifierCron(): Promise<TaAlertNotifierResult> {
  const database = await defaultGetDb();

  let result: TaAlertNotifierResult = { sent: 0, skipped: 0 };

  await recordJobRun(database, "taAlertNotifierJob", async () => {
    result = await runTaAlertNotifier({ db: database });
    return { rowsWritten: result.sent };
  });

  return result;
}
