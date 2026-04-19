/**
 * Infrastructure — SQLite WAL Checkpoint
 *
 * SQLite WAL (Write-Ahead Logging) accumulates changes in a -wal file.
 * Without periodic checkpoints, the WAL grows unbounded.
 *
 * This module provides:
 *   - `runWalCheckpoint()` — TRUNCATE checkpoint (checkpoints all frames and resets WAL to zero)
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
 * Runs a TRUNCATE WAL checkpoint on the main database.
 *
 * TRUNCATE mode: checkpoints all frames and resets the WAL file to zero
 * length regardless of active readers, matching the shutdown hook behaviour.
 * Safe to call at 03:00 GMT+7 off-hours when reader pressure is minimal.
 * Prevents unbounded WAL growth (root cause of 438MB WAL accumulation and
 * SQLite "malformed disk image" corruption in vnstock-sync).
 *
 * @param deps — optional injectable deps (for testing)
 * @returns { walSize, checkpointed } — frames in WAL vs frames checkpointed
 */
export function runWalCheckpoint(deps?: CheckpointDeps): { walSize: number; checkpointed: number } {
  const _getDb = deps?.getDb ?? getDb;
  const _log = deps?.log ?? logger;
  try {
    const db = _getDb();
    const result = db.query<{ busy: number; log: number; checkpointed: number }, []>(
      "PRAGMA wal_checkpoint(TRUNCATE)",
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
