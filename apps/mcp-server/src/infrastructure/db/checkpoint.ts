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
 * Scheduled every 30min via cron in jobs.ts.
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

/** Injectable deps for runIntegrityCheck (unit testing). */
export interface IntegrityCheckDeps {
  getDb: () => { query: (sql: string) => { all: () => { integrity_check: string }[] } };
  log: typeof logger;
  walBytes: number;
  forceRun?: boolean;
}

const WAL_INTEGRITY_THRESHOLD_BYTES = 40 * 1024 * 1024; // 40 MB

/**
 * Runs PRAGMA integrity_check on the main database.
 *
 * Triggers:
 *   - Weekly cron (Sunday 02:00 UTC) — baseline schedule
 *   - WAL threshold path: called by integrityCheckJob when WAL >= 40 MB
 *
 * Sends WORK channel alert when corruption detected. Silent on clean pass.
 *
 * @param dbPath       Path to the DB file (for alert message)
 * @param sendWorkFn   Injectable sender for unit testing (defaults to sendTelegramWork)
 * @param _unused      Unused positional arg (kept for API compat)
 * @param deps         Injectable deps for testing ({ getDb, log, walBytes, forceRun })
 * @returns            { ok, details, walBytes }
 */
export async function runIntegrityCheck(
  dbPath: string,
  sendWorkFn?: (msg: string) => Promise<void>,
  _unused?: unknown,
  deps?: IntegrityCheckDeps,
): Promise<{ ok: boolean; details: string[]; walBytes: number }> {
  const _getDb = deps?.getDb ?? (() => getDb() as never);
  const _log = deps?.log ?? logger;
  const walBytes = deps !== undefined ? deps.walBytes : (Bun.file(dbPath + '-wal').size ?? 0);
  const forceRun = deps?.forceRun !== undefined ? deps.forceRun : true;

  // WAL threshold guard: skip if not forced and WAL < 40 MB
  if (!forceRun && walBytes < WAL_INTEGRITY_THRESHOLD_BYTES) {
    _log.debug('[integrity-check] WAL below threshold and forceRun=false — skipping');
    return { ok: true, details: [], walBytes };
  }

  let rows: { integrity_check: string }[] = [];
  try {
    const db = _getDb();
    rows = db.query('PRAGMA integrity_check').all();
  } catch (err) {
    const msg = `[integrity-check] CRITICAL: DB unreadable — ${dbPath} — ${err instanceof Error ? err.message : String(err)}`;
    _log.error(msg);
    const send =
      sendWorkFn ??
      (async (m: string) => {
        const { sendTelegramWork } = await import('../notifiers/telegram.js');
        await sendTelegramWork(m, { parseMode: '' });
      });
    try { await send(`CORRUPTION DETECTED (unreadable): ${dbPath}\n${msg}`); } catch { /* best-effort */ }
    return { ok: false, details: [String(err)], walBytes };
  }

  const details = rows.map((r) => r.integrity_check);
  const ok = details.length === 1 && details[0] === 'ok';

  _log.info('[integrity-check] result', { ok, rowCount: details.length, walBytes });

  if (!ok) {
    const send =
      sendWorkFn ??
      (async (m: string) => {
        const { sendTelegramWork } = await import('../notifiers/telegram.js');
        await sendTelegramWork(m, { parseMode: '' });
      });
    const alertMsg =
      `CORRUPTION DETECTED: ${dbPath}\nPRAGMA integrity_check returned ${details.length} issue(s):\n` +
      details.slice(0, 5).join('\n') +
      (details.length > 5 ? `\n... (${details.length - 5} more)` : '');
    try {
      await send(alertMsg);
    } catch (sendErr) {
      _log.error('[integrity-check] failed to send alert', {
        error: sendErr instanceof Error ? sendErr.message : String(sendErr),
      });
    }
  }

  return { ok, details, walBytes };
}

/** Deps injectable for runForcedTruncateCheckpoint (unit testing). */
export interface ForcedTruncateDeps {
  db?: Database;
  log?: (msg: string) => void;
}

/**
 * Runs a forced TRUNCATE WAL checkpoint.
 *
 * Issues `BEGIN IMMEDIATE; COMMIT` to flush in-flight writers and force
 * all existing reader snapshots to expire, then calls
 * `PRAGMA wal_checkpoint(TRUNCATE)` to reset the WAL file to zero length.
 *
 * This is the BC-1 ROOT FIX for the WAL wedge crash loop:
 * passive autocheckpoint at 4000 frames was defeated by 40+ concurrent
 * cron-job reader snapshots. TRUNCATE + BEGIN IMMEDIATE breaks the reader
 * pin every 30 min unconditionally during live and off-hours.
 *
 * BEGIN IMMEDIATE may stall writes up to busy_timeout (5 s) — bounded and
 * acceptable; cron jobs already tolerate write retry.
 *
 * @param deps — optional injectable deps (db, log) for unit testing
 * @returns { walSize, checkpointed } — walSize=frames in WAL, checkpointed=boolean
 */
export async function runForcedTruncateCheckpoint(
  deps?: ForcedTruncateDeps,
): Promise<{ walSize: number; checkpointed: boolean }> {
  const _db = deps?.db ?? getDb();
  const _log = deps?.log ?? ((msg: string) => logger.info(msg));

  // Step 1: Acquire and immediately release a write transaction so any
  // long-lived reader snapshots see a new transaction boundary and expire.
  // try/finally ensures we never leak an open transaction even if busy_timeout stalls.
  try {
    _db.exec("BEGIN IMMEDIATE");
    _db.exec("COMMIT");
  } catch (err) {
    // If BEGIN IMMEDIATE fails (e.g. another writer holds the lock longer than
    // busy_timeout), ensure we don't leave a dangling transaction.
    try { _db.exec("ROLLBACK"); } catch { /* best-effort rollback */ }
    _log(`[checkpoint] runForcedTruncateCheckpoint: BEGIN IMMEDIATE failed — ${err instanceof Error ? err.message : String(err)}`);
    // Non-fatal: proceed to TRUNCATE anyway; it may partially drain the WAL.
  }

  // Step 2: TRUNCATE checkpoint — resets WAL file to zero length once all
  // frames have been drained (guaranteed now that reader snapshots expired).
  try {
    const result = _db.query<{ busy: number; log: number; checkpointed: number }, []>(
      "PRAGMA wal_checkpoint(TRUNCATE)",
    ).get();

    // SQLite returns log=-1 / checkpointed=-1 when WAL is not applicable
    // (e.g. :memory: DB or journal_mode != WAL). Treat as "WAL empty / no-op".
    const rawLog = result?.log ?? 0;
    const rawCheckpointed = result?.checkpointed ?? 0;
    const walSize = rawLog < 0 ? 0 : rawLog;
    const checkpointed = rawLog < 0 || (rawCheckpointed >= rawLog && rawLog >= 0);

    _log(`[checkpoint] runForcedTruncateCheckpoint complete — walSize=${walSize} checkpointed=${checkpointed}`);
    return { walSize, checkpointed };
  } catch (err) {
    _log(`[checkpoint] runForcedTruncateCheckpoint: PRAGMA TRUNCATE failed — ${err instanceof Error ? err.message : String(err)}`);
    return { walSize: 0, checkpointed: false };
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
