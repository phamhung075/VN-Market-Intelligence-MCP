/**
 * Infrastructure — SQLite WAL Checkpoint
 *
 * SQLite WAL (Write-Ahead Logging) accumulates changes in a -wal file.
 * Without periodic checkpoints, the WAL grows unbounded.
 *
 * This module provides:
 *   - `runWalCheckpoint()` — RESTART checkpoint (blocks new writers until complete, truncates WAL)
 *   - `registerShutdownHook()` — checkpoint on SIGTERM/SIGINT before exit
 *
 * Scheduled daily at 03:00 GMT+7 via cron in jobs.ts.
 *
 * Layer: infrastructure/db
 */

import { getDb } from "./schema.js";
import { logger } from "../logger.js";

/**
 * Runs a RESTART WAL checkpoint on the main database.
 *
 * RESTART mode: checkpoints all frames, then blocks new writers until all
 * existing readers have finished so the WAL file can be reset to zero.
 * Safe to call at 03:00 GMT+7 off-hours when reader pressure is minimal.
 * Prevents unbounded WAL growth (root cause of 270MB WAL accumulation and
 * SQLite "malformed disk image" corruption in vnstock-sync).
 *
 * @returns { walSize, checkpointed } — frames in WAL vs frames checkpointed
 */
export function runWalCheckpoint(): { walSize: number; checkpointed: number } {
  try {
    const db = getDb();
    const result = db.query<{ busy: number; log: number; checkpointed: number }, []>(
      "PRAGMA wal_checkpoint(RESTART)",
    ).get();

    const walSize = result?.log ?? 0;
    const checkpointed = result?.checkpointed ?? 0;
    const remaining = walSize - checkpointed;

    logger.info("[checkpoint] WAL checkpoint complete", {
      walSize,
      checkpointed,
      remaining,
    });

    if (remaining > 1000) {
      logger.warn("[checkpoint] remaining frames > 1000 — WAL growth runaway risk", {
        walSize,
        checkpointed,
        remaining,
      });
    }

    return { walSize, checkpointed };
  } catch (err) {
    logger.error("[checkpoint] WAL checkpoint failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { walSize: 0, checkpointed: 0 };
  }
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
  const shutdown = (signal: string) => {
    logger.info(`[checkpoint] ${signal} received — running TRUNCATE checkpoint before exit`);
    try {
      const db = getDb();
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      logger.info("[checkpoint] TRUNCATE checkpoint complete — WAL flushed");
    } catch { /* best-effort */ }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.debug("[checkpoint] shutdown hooks registered");
}
