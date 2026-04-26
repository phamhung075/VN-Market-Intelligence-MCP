/**
 * BCTC Queue Enricher Job — Task 1287 (Scheduler Layer)
 *
 * Background scheduler job for BCTC VPS queue processing.
 * HOTFIX (Task 1288c, 2026-04-22): Disabled SSC enrichment.
 *
 * Root cause of repeated failures:
 * - Main server in France cannot fetch from SSC portal (geo-blocked)
 * - bctcQueueEnricherJob was calling listSscDocuments() directly
 * - This caused timeouts every 15 minutes → recurring fix cycles
 *
 * New behavior (HOTFIX):
 * - Main server NO LONGER queries SSC or downloads PDFs
 * - VPS service (Vietnam) is ONLY source of BCTC data
 * - Items with source_url=NULL are skipped (VPS will populate via push)
 * - Job now just marks items as processed without enrichment
 *
 * Design:
 * - Dequeues max 20 items with source_url = NULL per run
 * - Marks them as completed (VPS will backfill URLs via push)
 * - No SSC calls, no timeouts, no geo-blocking
 * - Idempotent and resilient
 *
 * @module scheduler/financial-reports/bctcQueueEnricherJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BctcQueueEnricherRunResult {
  itemsProcessed: number;
  urlsPopulated: number;
  timeoutFailures: number;
  partialFailures: number;
}

/**
 * Run a single pass of the BCTC queue enricher job.
 *
 * HOTFIX (Task 1288c): Disabled SSC lookups. Main server no longer queries SSC.
 *
 * Items with source_url = NULL are skipped. VPS service (Vietnam) is the ONLY
 * source of BCTC queue items. When VPS pushes items, they already have source_url.
 *
 * @param opts - Configuration and dependency injection
 * @returns Result object with counts
 */
export async function runBctcQueueEnricherJob(opts: {
  db?: Database;
  batchSize?: number; // default 20
} = {}): Promise<BctcQueueEnricherRunResult> {
  const db = opts.db ?? getDb();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;

  const result = {
    itemsProcessed: 0,
    urlsPopulated: 0,
    timeoutFailures: 0,
    partialFailures: 0,
  };

  // ── Query items awaiting enrichment ──
  let queueItems: Array<{
    id: number;
    action_code: string;
  }> = [];

  try {
    queueItems = db
      .query<
        {
          id: number;
          action_code: string;
        },
        [number]
      >(
        `SELECT id, action_code
         FROM bctc_vps_queue
         WHERE source_url IS NULL AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(batchSize);
  } catch (err) {
    logger.warn("[bctcQueueEnricher] Query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  if (queueItems.length === 0) {
    return result;
  }

  // Items with source_url IS NULL are awaiting VPS discovery.
  // They must remain 'pending' so the VPS service can attempt discovery and fetch.
  // Do NOT mark them as skipped — that would kill them permanently.
  // Nothing to do here: return early and let VPS populate source_url via push.

  logger.debug("[bctcQueueEnricher] no-op: items await VPS discovery", {
    itemsAwaitingVps: queueItems.length,
  });

  return result;
}
