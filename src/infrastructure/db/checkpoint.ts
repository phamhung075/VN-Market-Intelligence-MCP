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
import type { Database } from "bun:sqlite";

/** Deps injectable for testing; defaults to real implementations. */
export interface CheckpointDeps {
  getDb: () => Database;
  log: typeof logger;
}

/**
 * Runs a RESTART WAL checkpoint on the main database.
 *
 * RESTART mode: checkpoints all frames, then blocks new writers until all
 * existing readers have finished so the WAL file can be reset to zero.
 * Safe to call at 03:00 GMT+7 off-hours when reader pressure is minimal.
 * Prevents unbounded WAL growth (root cause of 270MB WAL accumulation and
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
      "PRAGMA wal_checkpoint(RESTART)",
    ).get();

    const walSize = result?.log ?? 0;
    const checkpointed = result?.checkpointed ?? 0;
    const remaining = walSize - checkpointed;

    _log.info("[checkpoint] WAL checkpoint complete", {
      walSize,
      checkpointed,
      remaining,
    });

    if (remaining > 1000) {
      _log.warn("[checkpoint] remaining frames > 1000 — WAL growth runaway risk", {
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
