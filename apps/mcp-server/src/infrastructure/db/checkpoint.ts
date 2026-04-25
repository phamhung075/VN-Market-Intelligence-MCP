/**
 * Infrastructure — SQLite WAL Checkpoint
 *
 * SQLite WAL (Write-Ahead Logging) accumulates changes in a -wal file.
 * Without periodic checkpoints, the WAL grows unbounded.
 *
 * This module provides:
 *   - `runWalCheckpoint()` — WAL checkpoint (FULL or TRUNCATE mode)
 *   - `backupDatabase()` — copy DB file after nightly checkpoint
 *   - `checkWalFileSize()` — disk-size sentinel, fires WORK alert at 10/40 MB
 *   - `registerShutdownHook()` — checkpoint on SIGTERM/SIGINT before exit
 *
 * Scheduled daily at 03:00 GMT+7 via cron in jobs.ts.
 *
 * Layer: infrastructure/db
 */

import { getDb } from "./schema.js";
import { logger } from "../logger.js";
import type { Database } from "bun:sqlite";

/** Deps injectable for testing; defaults to real implementations. */
export interface CheckpointDeps {
  getDb: () => Database;
  log: typeof logger;
}

/**
 * Runs a WAL checkpoint on the main database.
 *
 * FULL mode (default): flushes WAL frames to the DB file without truncating;
 * safe during live hours as readers can continue concurrently.
 * TRUNCATE mode: checkpoints all frames and resets the WAL file to zero
 * length; used during off-hours (03:00-05:00 UTC) when reader pressure is minimal.
 * Prevents unbounded WAL growth (root cause of 438MB WAL accumulation and
 * SQLite "malformed disk image" corruption in vnstock-sync).
 *
 * @param mode — 'FULL' (default) or 'TRUNCATE'
 * @param deps — optional injectable deps (for testing)
 * @returns { walSize, checkpointed } — frames in WAL vs frames checkpointed
 */
export function runWalCheckpoint(
  mode: 'FULL' | 'TRUNCATE' = 'FULL',
  deps?: CheckpointDeps,
): { walSize: number; checkpointed: number } {
  const _getDb = deps?.getDb ?? getDb;
  const _log = deps?.log ?? logger;
  try {
    const db = _getDb();
    const pragma = mode === 'TRUNCATE'
      ? "PRAGMA wal_checkpoint(TRUNCATE)"
      : "PRAGMA wal_checkpoint(FULL)";
    const result = db.query<{ busy: number; log: number; checkpointed: number }, []>(
      pragma,
    ).get();

    const walSize = result?.log ?? 0;
    const checkpointed = result?.checkpointed ?? 0;
    const remaining = walSize - checkpointed;

    _log.info("[checkpoint] WAL checkpoint complete", {
      walSize,
      checkpointed,
      remaining,
    });

    if (remaining > 10000) {
      _log.error("[checkpoint] WAL stuck >40MB — restarting may be needed", {
        walSize,
        checkpointed,
        remaining,
      });
    }

    return { walSize, checkpointed };
  } catch (err) {
    _log.error("[checkpoint] WAL checkpoint failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { walSize: 0, checkpointed: 0 };
  }
}

/**
 * Copies market.db → market.db.backup after nightly TRUNCATE checkpoint.
 * Overwrites any existing backup (single-file rotation; purpose = next-day
 * corruption recovery, not full history).
 * Uses Bun.file() copy — no shell spawn.
 *
 * @param dbPath  e.g. 'market.db' or Bun.env.DB_PATH
 * @param log     optional injectable logger (for testing)
 */
export async function backupDatabase(dbPath: string, log = logger): Promise<void> {
  const src = Bun.file(dbPath);
  const dst = Bun.file(dbPath + '.backup');
  try {
    await Bun.write(dst, src);
    log.info('[checkpoint] backup written', { src: dbPath, dst: dbPath + '.backup' });
  } catch (err) {
    log.error('[checkpoint] backup failed', { error: err instanceof Error ? err.message : String(err) });
    // Do NOT re-throw — backup failure must not crash the nightly cron
  }
}

/**
 * Checks the .db-wal file size on disk and fires WORK channel alerts at:
 *   > 10 MB (WARNING)  : log error + send alert, then proceed with checkpoint
 *   > 40 MB (CRITICAL) : log critical + send alert with CRITICAL severity
 *
 * Returns { bytes, warningFired } — bytes = 0 when WAL file does not exist.
 * Called by the cron handler in jobs.ts _before_ runWalCheckpoint so an alert
 * fires even when PRAGMA returns 0 (WAL has grown before any checkpoint ran).
 *
 * Injectable sendWorkFn for unit tests.
 */
export async function checkWalFileSize(
  dbPath: string,
  sendWorkFn?: (msg: string) => Promise<void>,
  log = logger,
): Promise<{ bytes: number; warningFired: boolean }> {
  const walPath = dbPath + "-wal";
  const walFile = Bun.file(walPath);
  const bytes = walFile.size; // 0 when file absent — safe

  if (bytes === 0) return { bytes: 0, warningFired: false };

  const MB = bytes / (1024 * 1024);
  const WARN_MB = 10;
  const CRIT_MB = 40;

  if (MB <= WARN_MB) return { bytes, warningFired: false };

  const isCritical = MB > CRIT_MB;
  const severity = isCritical ? "CRITICAL" : "WARNING";
  const msg =
    `WAL file ${severity}: ${MB.toFixed(1)} MB on disk (${walPath})` +
    (isCritical ? " — potential corruption risk, restart recommended" : "");

  log.error("[checkpoint] WAL file size alert", { bytes, MB: MB.toFixed(1), severity });

  const send =
    sendWorkFn ??
    (async (m: string) => {
      const { sendTelegramWork } = await import("../notifiers/telegram.js");
      await sendTelegramWork(m, { parseMode: "" });
    });

  try {
    await send(msg);
  } catch (err) {
    log.error("[checkpoint] failed to send WAL file size alert", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { bytes, warningFired: true };
}

/**
 * Registers SIGTERM and SIGINT handlers that run a TRUNCATE checkpoint
 * before the process exits. Ensures data integrity on graceful shutdown.
 *
 * Uses TRUNCATE mode (not PASSIVE) to guarantee ALL WAL frames are
 * flushed to the main DB file and the WAL is reset to zero. This
 * prevents data loss when `launchctl kickstart -k` replaces the process
 * (report #1086/#1088: financial_reports rows vanished after restarts).
 */
export function registerShutdownHook(): void {
  const shutdown = async (signal: string) => {
    logger.info(`[checkpoint] ${signal} received — running TRUNCATE checkpoint before exit`);
    try {
      const db = getDb();
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      logger.info("[checkpoint] TRUNCATE checkpoint complete — WAL flushed");
    } catch { /* best-effort */ }
    await Bun.sleep(200);   // 200ms settle — allow in-flight writes to complete
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.debug("[checkpoint] shutdown hooks registered");
}
