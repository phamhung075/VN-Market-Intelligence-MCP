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
import type { SscDocumentLookup } from "../../application/usecases/bctcQueueEnricher.js";

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
  // Stub implementation — to be filled in by 1287b (GREEN phase)
  // RED phase: tests define expected behavior
  throw new Error("[bctcQueueEnricherJob] Implementation not yet added (Task 1287b)");
}
