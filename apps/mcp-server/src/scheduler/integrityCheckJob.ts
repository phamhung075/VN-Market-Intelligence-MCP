/**
 * DB Integrity Check Job — Task 1342
 *
 * Thin orchestrator for the weekly PRAGMA integrity_check scan.
 *
 * Trigger logic:
 *   - Weekly cron: always runs integrity check (forceRun = true)
 *   - WAL threshold path: if WAL >= 40MB, run check; otherwise skip
 *
 * DDD Layer: interface/scheduler
 */

import { runIntegrityCheck } from '../infrastructure/db/checkpoint.js';
import { logger } from '../infrastructure/logger.js';
import { getDb } from '../infrastructure/db/schema.js';

const WAL_INTEGRITY_THRESHOLD_BYTES = 40 * 1024 * 1024; // 40 MB

/**
 * Runs the integrity check job.
 *
 * @param dbPath         Path to market.db (defaults to Bun.env.DB_PATH ?? 'market.db')
 * @param forceCheck     Skip WAL threshold guard (used by weekly cron path)
 * @returns              Result from runIntegrityCheck, or null if skipped
 */
export async function runIntegrityCheckJob(
  dbPath: string = Bun.env.DB_PATH ?? 'market.db',
  forceCheck: boolean = true,
): Promise<{ ok: boolean; details: string[]; walBytes: number } | null> {
  const walBytes = Bun.file(dbPath + '-wal').size ?? 0;

  const shouldRun = forceCheck || walBytes >= WAL_INTEGRITY_THRESHOLD_BYTES;
  if (!shouldRun) {
    logger.debug('[integrity-check-job] WAL below threshold and forceCheck=false — skipping');
    return null;
  }

  return runIntegrityCheck(dbPath, undefined, undefined, {
    getDb: () => getDb() as never,
    log: logger,
    walBytes,
    forceRun: true,
  });
}

/**
 * runJob — named export expected by test 12.
 * Alias for runIntegrityCheckJob() with production defaults.
 */
export async function runJob(): Promise<{ ok: boolean; details: string[]; walBytes: number } | null> {
  return runIntegrityCheckJob();
}
