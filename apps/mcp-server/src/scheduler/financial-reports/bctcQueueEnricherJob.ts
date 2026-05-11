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
import { bctcHttpFetch } from "../../infrastructure/fetchers/bctcHttpFetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 20;

/** Per-ticker discovery timeout (ms). Conservative to avoid stalling the cron. */
const DISCOVERY_TIMEOUT_MS = 5_000;

/**
 * Maximum number of enrichment attempts before a no-URL row is marked
 * 'url_not_found'. This prevents rows with perpetually-empty discovery results
 * from blocking the queue indefinitely (Task 1782).
 *
 * At 15-min cron intervals, 5 attempts = ~75 min before a row is parked.
 */
const MAX_ENRICH_ATTEMPTS = 5;

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
  //   - 'https://congbothongtin.ssc.gov.vn/test...' (stub seeded before VPS
  //     resolves real URLs — FIX 1405b)
  //
  let queueItems: Array<{ id: number; action_code: string; attempts: number }> = [];

  try {
    queueItems = db
      .query<{ id: number; action_code: string; attempts: number }, [number]>(
        `SELECT id, action_code, attempts
         FROM bctc_vps_queue
         WHERE (
           source_url IS NULL
           OR source_url = 'MISSING'
           OR source_url LIKE '/test-%'
           OR source_url LIKE 'https://congbothongtin.ssc.gov.vn/test%'
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

  // ── Prepare update statements ─────────────────────────────────────────────
  const updateStmt = db.prepare<void, [string, number]>(
    `UPDATE bctc_vps_queue SET source_url = ? WHERE id = ?`,
  );
  // Task 1782: increment attempts on every no-URL run so the max-attempts gate
  // can fire and mark exhausted rows as 'url_not_found'.
  const incrementAttemptsStmt = db.prepare<void, [number]>(
    `UPDATE bctc_vps_queue SET attempts = attempts + 1 WHERE id = ?`,
  );
  const markUrlNotFoundStmt = db.prepare<void, [number]>(
    `UPDATE bctc_vps_queue SET status = 'url_not_found', attempts = attempts + 1 WHERE id = ?`,
  );

  // ── Discover URLs for each item ───────────────────────────────────────────
  for (const item of queueItems) {
    result.itemsProcessed++;

    try {
      const discovery = await discoverHosePdfUrls(item.action_code, {
        timeout: DISCOVERY_TIMEOUT_MS,
        _fetchVpsPlaywright: bctcHttpFetch,
        _fetchSsc:           bctcHttpFetch,
        _fetchCafef:         bctcHttpFetch,
        _fetchVietstock:     bctcHttpFetch,
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
        // No URL found.
        logger.warn(`[bctcQueueEnricher] 0 URLs found for ticker ${item.action_code} — scrape may be stale or source unavailable`);

        // Task 1782: rows that have already been attempted MAX_ENRICH_ATTEMPTS
        // times are marked 'url_not_found' so they stop blocking the queue.
        // Rows below the threshold stay 'pending' for the next cron cycle.
        //
        // Fix (FIX-BCTC-PIPELINE Bug 2): do NOT increment attempts on the very
        // first pass (attempts === 0). A source_url=NULL row with attempts=0 has
        // never had a successful network-level discovery attempt; incrementing on
        // the first miss would penalise rows that are simply new. Only rows that
        // have already been tried at least once (attempts > 0) are incremented.
        if (item.attempts >= MAX_ENRICH_ATTEMPTS) {
          markUrlNotFoundStmt.run(item.id);
          logger.warn("[bctcQueueEnricher] no URL after max attempts — marking url_not_found", {
            ticker: item.action_code,
            attempts: item.attempts,
          });
        } else if (item.attempts > 0) {
          incrementAttemptsStmt.run(item.id);
          logger.debug("[bctcQueueEnricher] no URLs found, leaving pending", {
            ticker: item.action_code,
            attempts: item.attempts + 1,
          });
        } else {
          logger.debug("[bctcQueueEnricher] no URLs found on first pass, leaving pending at 0", {
            ticker: item.action_code,
          });
        }
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

      // Do NOT increment attempts on error when source_url was never set.
      // Only increment when discovery actually reached the network and returned
      // no URL (handled in the else branch above). This keeps NULL-url rows
      // at attempts=0 until a real network-level discovery attempt completes.

      logger.warn("[bctcQueueEnricher] discovery error", {
        ticker: item.action_code,
        error: msg,
      });
    }
  }

  if (result.itemsProcessed > 0 && result.urlsPopulated === 0) {
    logger.warn(`[bctcQueueEnricher] 0 URLs populated across all ${result.itemsProcessed} item(s) — all sources may be unavailable or geo-blocked`);
  }

  return result;
}
