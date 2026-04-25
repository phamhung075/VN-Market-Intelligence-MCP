/**
 * Infrastructure — Single-Writer Guard
 *
 * assertSingleWriter(): attempts a no-op exclusive lock probe on the DB.
 * Returns { contested: true } if another process holds a write lock.
 * Sends WORK channel alert if contested (non-fatal — server still starts).
 *
 * Called from initDatabase() in production.
 * Skipped when DB_PATH=:memory: (test env).
 *
 * Layer: infrastructure/db
 */
import type { Database } from "bun:sqlite";

export interface WriterGuardResult {
  contested: boolean;
  details?: string;
}

export function assertSingleWriter(db: Database): WriterGuardResult {
  try {
    // WAL mode: try an exclusive write probe
    // PRAGMA wal_checkpoint will fail with SQLITE_BUSY if another writer is active
    const result = db.query<{ busy: number; log: number; checkpointed: number }, []>(
      "PRAGMA wal_checkpoint(PASSIVE)"
    ).get();
    // busy > 0 means at least one WAL frame was blocked by another writer
    const contested = (result?.busy ?? 0) > 0;
    if (contested) {
      return { contested: true, details: `busy=${result?.busy}` };
    }
    return { contested: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SQLITE_BUSY") || msg.includes("database is locked")) {
      return { contested: true, details: msg };
    }
    // Other errors (permissions, etc.) are not contention
    return { contested: false, details: msg };
  }
}
