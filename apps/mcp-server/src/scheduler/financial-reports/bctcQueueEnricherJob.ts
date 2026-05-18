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
import { fetchHsxBctcUrls } from "../../infrastructure/fetchers/hsxBctcFetcher.js";

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
  // Selects rows that need a discovery pass:
  //
  // Arm 1 — Normal pending items (source_url missing or placeholder):
  //   - source_url IS NULL (never populated)
  //   - 'MISSING' (placeholder written by earlier bad runs)
  //   - '/test-...' (placeholder written by test-seeding scripts)
  //   - 'https://congbothongtin.ssc.gov.vn/test...' (stub seeded before VPS
  //     resolves real URLs — FIX 1405b)
  //   - status = 'pending'
  //
  // Arm 2 — TASK-1943a: Grace-period auto-retry for url_not_found rows:
  //   - status = 'url_not_found' (exhausted MAX_ENRICH_ATTEMPTS previously)
  //   - last_attempt IS NOT NULL AND last_attempt < datetime('now', '-7 days')
  //     (grace period expired — SSC may have published late filings)
  //   - attempts < 6 (MAX_ENRICH_ATTEMPTS + 1 cap prevents infinite churn)
  //
  // Effect: rows permanently parked at url_not_found after 7+ days get one
  // more discovery pass. If still no URL → re-marked url_not_found (expected).
  // This prevents permanent calendar blindspots when SSC is slow to publish.
  //
  let queueItems: Array<{ id: number; action_code: string; attempts: number }> = [];

  // Primary query includes both Arm 1 (normal pending) and Arm 2 (grace-period retry).
  // Falls back to Arm 1 only if last_attempt column is absent (e.g. older schema).
  const ARM1_ONLY_SQL = `
    SELECT id, action_code, attempts
    FROM bctc_vps_queue
    WHERE (
      source_url IS NULL
      OR source_url = 'MISSING'
      OR source_url LIKE '/test-%'
      OR source_url LIKE 'https://congbothongtin.ssc.gov.vn/test%'
    )
    AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?`;

  const COMBINED_SQL = `
    SELECT id, action_code, attempts
    FROM bctc_vps_queue
    WHERE (
      (
        (
          source_url IS NULL
          OR source_url = 'MISSING'
          OR source_url LIKE '/test-%'
          OR source_url LIKE 'https://congbothongtin.ssc.gov.vn/test%'
        )
        AND status = 'pending'
      )
      OR (
        status = 'url_not_found'
        AND last_attempt IS NOT NULL
        AND last_attempt < datetime('now', '-7 days')
        AND attempts < 6
      )
    )
    ORDER BY created_at ASC
    LIMIT ?`;

  try {
    queueItems = db
      .query<{ id: number; action_code: string; attempts: number }, [number]>(
        COMBINED_SQL,
      )
      .all(batchSize);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such column: last_attempt")) {
      // Older schema without last_attempt column — fall back to Arm 1 only.
      // This handles test DBs with simplified schemas and pre-migration DBs.
      logger.debug("[bctcQueueEnricher] last_attempt column absent — grace-period arm disabled");
      try {
        queueItems = db
          .query<{ id: number; action_code: string; attempts: number }, [number]>(
            ARM1_ONLY_SQL,
          )
          .all(batchSize);
      } catch (fallbackErr) {
        logger.warn("[bctcQueueEnricher] Query failed", {
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        });
        return result;
      }
    } else {
      logger.warn("[bctcQueueEnricher] Query failed", {
        error: msg,
      });
      return result;
    }
  }

  if (queueItems.length === 0) {
    return result;
  }

  // ── Prepare update statements ─────────────────────────────────────────────
  // TASK-1943a: also reset status to 'pending' so grace-period url_not_found
  // rows (selected via Arm 2 query) are re-queued for the PDF pull job when
  // a source_url is found. For normal pending rows this is a no-op (already pending).
  const updateStmt = db.prepare<void, [string, number]>(
    `UPDATE bctc_vps_queue SET source_url = ?, status = 'pending' WHERE id = ?`,
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
      // Build discover options. Production defaults use fetchHsxBctcUrls for Strategy 0.
      // When opts.discoverOptions is supplied by a caller (e.g. integration tests),
      // _fetchHsx is only included if the caller explicitly sets it — preserving the
      // pre-BCTC-3b behaviour for all existing tests. Only pure production runs
      // (no discoverOptions override) wire the live hsxBctcFetcher.
      const discovery = await discoverHosePdfUrls(item.action_code, {
        timeout: DISCOVERY_TIMEOUT_MS,
        _fetchHsx:           fetchHsxBctcUrls,
        _fetchVpsPlaywright: bctcHttpFetch,
        _fetchSsc:           bctcHttpFetch,
        _fetchCafef:         bctcHttpFetch,
        _fetchVietstock:     bctcHttpFetch,
        // opts.discoverOptions spreads LAST and overrides any key above when present.
        // Tests that include _fetchHsx: undefined disable Strategy 0.
        // Tests that omit _fetchHsx entirely get the production default (live hsx.vn fetch).
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
