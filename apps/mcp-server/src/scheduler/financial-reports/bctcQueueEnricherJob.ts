/**
 * BCTC Queue Enricher Job — Task 1287 (Scheduler Layer)
 *
 * Background scheduler job for BCTC VPS queue processing.
 *
 * History:
 * - Task 1288c (2026-04-22): Disabled SSC enrichment (geo-blocked, recurring timeouts).
 * - Task 1343c (2026-04-27): Replaced old SSC approach with multi-source discovery
 *   via discoverHosePdfUrls() (SSC iboard → cafef.vn → vietstock.vn).
 *   All HTTP calls are injectable for testability. Geo-blocking avoided by
 *   using the iboard JSON API (not the legacy Oracle ADF SPA).
 * - fix/bctc-url-enrichment (2026-04-27): Extended WHERE clause to also capture
 *   items with source_url = 'MISSING' or source_url LIKE '/test-%' (placeholder
 *   values left in DB by earlier bad runs). Added SSC_IBOARD_BASE_URL env comment.
 *
 * Design:
 * - Dequeues max 20 items with source_url = NULL or a placeholder value per run.
 * - Calls discoverHosePdfUrls() for each item.
 * - On success: writes source_url to DB so VPS can fetch.
 * - On failure / empty: leaves item pending (VPS will retry later).
 * - Idempotent and resilient. No circuit-breaker dependency.
 * - Set SSC_IBOARD_BASE_URL env var to route iboard API calls through a VPS proxy
 *   when running from a geo-blocked region (iboard-query.ssc.vn is NXDOMAIN outside VN).
 *
 * @module scheduler/financial-reports/bctcQueueEnricherJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import {
  discoverHosePdfUrls,
  type DiscoverOptions,
} from "../../domain/services/bctcDiscovery.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 20;

/** Per-ticker discovery timeout (ms). Conservative to avoid stalling the cron. */
const DISCOVERY_TIMEOUT_MS = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BctcQueueEnricherRunResult {
  itemsProcessed: number;
  urlsPopulated: number;
  timeoutFailures: number;
  partialFailures: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a single pass of the BCTC queue enricher job.
 *
 * For each pending queue item without a source_url, calls discoverHosePdfUrls()
 * and writes the first discovered PDF URL back to `bctc_vps_queue.source_url`.
 *
 * @param opts - Configuration and dependency injection
 * @returns Result object with counts
 */
export async function runBctcQueueEnricherJob(opts: {
  db?: Database;
  batchSize?: number;
  /** Injectable fetch overrides — used in tests to avoid real HTTP calls. */
  discoverOptions?: DiscoverOptions;
} = {}): Promise<BctcQueueEnricherRunResult> {
  const db = opts.db ?? getDb();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;

  const result: BctcQueueEnricherRunResult = {
    itemsProcessed: 0,
    urlsPopulated: 0,
    timeoutFailures: 0,
    partialFailures: 0,
  };

  // ── Query items awaiting enrichment ──────────────────────────────────────
  //
  // Treats the following source_url values as "needs enrichment":
  //   - NULL (never populated)
  //   - 'MISSING' (placeholder written by earlier bad runs)
  //   - '/test-...' (placeholder written by test-seeding scripts)
  //
  let queueItems: Array<{ id: number; action_code: string }> = [];

  try {
    queueItems = db
      .query<{ id: number; action_code: string }, [number]>(
        `SELECT id, action_code
         FROM bctc_vps_queue
         WHERE (
           source_url IS NULL
           OR source_url = 'MISSING'
           OR source_url LIKE '/test-%'
         )
         AND status = 'pending'
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

  // ── Prepare update statement ──────────────────────────────────────────────
  const updateStmt = db.prepare<void, [string, number]>(
    `UPDATE bctc_vps_queue SET source_url = ? WHERE id = ?`,
  );

  // ── Discover URLs for each item ───────────────────────────────────────────
  for (const item of queueItems) {
    result.itemsProcessed++;

    try {
      const discovery = await discoverHosePdfUrls(item.action_code, {
        timeout: DISCOVERY_TIMEOUT_MS,
        ...opts.discoverOptions,
      });

      if (discovery.urls.length > 0) {
        // Write the first (most authoritative) PDF URL
        const firstUrl = discovery.urls[0];
        if (firstUrl === undefined) {
          result.partialFailures++;
          continue;
        }
        updateStmt.run(firstUrl, item.id);
        result.urlsPopulated++;

        logger.debug("[bctcQueueEnricher] source_url populated", {
          ticker: item.action_code,
          source: discovery.source,
          url: discovery.urls[0],
        });
      } else {
        // No URL found — leave pending for VPS retry
        logger.debug("[bctcQueueEnricher] no URLs found, leaving pending", {
          ticker: item.action_code,
        });
        result.partialFailures++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");

      if (isTimeout) {
        result.timeoutFailures++;
      } else {
        result.partialFailures++;
      }

      logger.warn("[bctcQueueEnricher] discovery error", {
        ticker: item.action_code,
        error: msg,
      });
    }
  }

  return result;
}
