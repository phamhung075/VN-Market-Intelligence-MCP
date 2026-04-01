/**
 * Infrastructure — SQLite WAL Checkpoint
 *
 * SQLite WAL (Write-Ahead Logging) accumulates changes in a -wal file.
 * Without periodic checkpoints, the WAL grows unbounded.
 *
 * This module provides:
 *   - `runWalCheckpoint()` — PASSIVE checkpoint (never blocks readers/writers)
 *   - `registerShutdownHook()` — checkpoint on SIGTERM/SIGINT before exit
 *
 * Scheduled daily at 03:00 GMT+7 via cron in jobs.ts.
 *
 * Layer: infrastructure/db
 */

import { getDb } from "./schema.js";
import { logger } from "../logger.js";

/**
 * Runs a PASSIVE WAL checkpoint on the main database.
 *
 * PASSIVE mode: checkpoints as many frames as possible without blocking
 * any concurrent readers or writers. Safe to call anytime.
 *
 * @returns { walSize, checkpointed } — frames in WAL vs frames checkpointed
 */
export function runWalCheckpoint(): { walSize: number; checkpointed: number } {
  try {
    const db = getDb();
    const result = db.query<{ busy: number; log: number; checkpointed: number }, []>(
      "PRAGMA wal_checkpoint(PASSIVE)",
    ).get();

    const walSize = result?.log ?? 0;
    const checkpointed = result?.checkpointed ?? 0;

    logger.info("[checkpoint] WAL checkpoint complete", {
      walSize,
      checkpointed,
      remaining: walSize - checkpointed,
    });

    return { walSize, checkpointed };
  } catch (err) {
    logger.error("[checkpoint] WAL checkpoint failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { walSize: 0, checkpointed: 0 };
  }
}

/**
 * Registers SIGTERM and SIGINT handlers that run a WAL checkpoint
 * before the process exits. Ensures data integrity on graceful shutdown.
 */
export function registerShutdownHook(): void {
  const shutdown = (signal: string) => {
    logger.info(`[checkpoint] ${signal} received — running WAL checkpoint before exit`);
    try {
      runWalCheckpoint();
    } catch { /* best-effort */ }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.debug("[checkpoint] shutdown hooks registered");
}
