/**
 * BCTC Queue Enricher Job — Task 1287 (Scheduler Layer)
 *
 * Background scheduler job that enriches BCTC VPS queue items with missing
 * source_url values. Runs every 15 minutes to populate URLs from SSC lookups.
 *
 * Problem (Sprint 1280 background):
 * - /api/bctc-fetch-queue endpoint times out (504 after 60s) when processing >100 BCTC PDFs
 * - Root cause: SSC credibility lookups (sync listSscDocuments) block queue response
 * - Solution: Added skip_enrichment=true query parameter to skip sync enrichment,
 *   defer to background job (this task) that runs every 15min
 *
 * Design:
 * - Dequeues max 20 items with source_url = NULL per run
 * - Calls SSC fetcher with timeout wrapper (5s default)
 * - Populates source_url column in-place
 * - Handles timeouts, partial failures, idempotency
 *
 * @module scheduler/financial-reports/bctcQueueEnricherJob
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import type { SscDocumentLookup } from "../../application/usecases/bctcQueueEnricher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 5000;

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
// Helper: Fetch with timeout protection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper around SSC fetcher with timeout protection.
 * If fetch takes > timeoutMs, reject with timeout error.
 */
async function fetchWithTimeout(
  code: string,
  quarter: string,
  year: number,
  sscLookup: SscDocumentLookup,
  timeoutMs: number,
): Promise<Array<{ url: string }> | null> {
  return Promise.race([
    sscLookup(code, quarter, year),
    new Promise<null>((_, reject) =>
      setTimeout(
        () => reject(new Error(`SSC lookup timeout after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Run a single pass of the BCTC queue enricher job.
 *
 * Dequeues up to batchSize items with source_url = NULL, calls the SSC
 * document lookup function for each, and populates source_url where possible.
 * Handles timeouts and partial failures gracefully.
 *
 * @param opts - Configuration and dependency injection
 * @returns Result object with counts
 */
export async function runBctcQueueEnricherJob(opts: {
  db?: Database;
  sscLookup?: SscDocumentLookup;
  batchSize?: number; // default 20
  timeoutMs?: number; // default 5000
} = {}): Promise<BctcQueueEnricherRunResult> {
  const db = opts.db ?? getDb();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const result = {
    itemsProcessed: 0,
    urlsPopulated: 0,
    timeoutFailures: 0,
    partialFailures: 0,
  };

  // ── Query unenriched items (source_url IS NULL), ordered by created_at ASC ──
  let queueItems: Array<{
    id: number;
    action_code: string;
    period_year: number;
    period_quarter: string;
  }> = [];

  try {
    queueItems = db
      .query<
        {
          id: number;
          action_code: string;
          period_year: number;
          period_quarter: string;
        },
        [number]
      >(
        `SELECT id, action_code, period_year, period_quarter
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

  // Lazy-initialize default SSC lookup wrapper only if we have items to process
  let sscLookup = opts.sscLookup;
  if (!sscLookup) {
    const { listSscDocuments } = await import(
      "../../infrastructure/fetchers/ssc.js"
    );
    sscLookup = async (code: string, quarter: string, year: number) => {
      // Convert quarter string "Q1"-"Q4" to report type
      const reportType = quarter.toUpperCase().startsWith("Q")
        ? "quarterly"
        : "annual";
      const docs = await listSscDocuments(code, reportType, year);
      return docs.map((d) => ({ url: d.url }));
    };
  }

  // ── Prepare batch update statement ──
  const updateUrl = db.prepare(
    `UPDATE bctc_vps_queue SET source_url = ? WHERE id = ?`,
  );

  // ── Process each item ──
  for (const item of queueItems) {
    result.itemsProcessed++;

    try {
      const docs = await fetchWithTimeout(
        item.action_code,
        item.period_quarter,
        item.period_year,
        sscLookup,
        timeoutMs,
      );

      if (docs && docs.length > 0 && docs[0]?.url) {
        // Success: update source_url
        updateUrl.run(docs[0].url, item.id);
        result.urlsPopulated++;

        logger.debug("[bctcQueueEnricher] populated URL", {
          code: item.action_code,
          quarter: item.period_quarter,
          year: item.period_year,
          url: docs[0].url,
        });
      } else {
        // No docs found: SSC returned empty
        result.partialFailures++;
        logger.debug("[bctcQueueEnricher] no documents found from SSC", {
          code: item.action_code,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("timeout")) {
        result.timeoutFailures++;
        logger.warn("[bctcQueueEnricher] SSC lookup timeout", {
          code: item.action_code,
          timeoutMs,
        });
      } else {
        // Generic error: treat as failure
        result.timeoutFailures++;
        logger.warn("[bctcQueueEnricher] SSC lookup error", {
          code: item.action_code,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── Log summary ──
  if (result.itemsProcessed > 0) {
    logger.info("[bctcQueueEnricher] batch enrichment complete", {
      itemsProcessed: result.itemsProcessed,
      urlsPopulated: result.urlsPopulated,
      timeoutFailures: result.timeoutFailures,
      partialFailures: result.partialFailures,
    });
  }

  return result;
}
