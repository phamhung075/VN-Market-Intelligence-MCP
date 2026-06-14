/**
 * DAV Pharmacy Monthly Check Job — Sprint 044
 *
 * Runs on the 1st of each month at 06:00 GMT+7.
 *
 * Steps:
 *   1. Fetch new drug approvals from dav.gov.vn
 *   2. Store as pharma_events in SQLite
 *   3. Log summary
 *
 * Layer: scheduler — may import from infrastructure/ and application/
 */

import { logger } from "../infrastructure/logger.js";
import { fetchDavPharmacy } from "../infrastructure/fetchers/davPharmacy.js";
import { getDb, initDatabase } from "../infrastructure/db/schema.js";
import { insertPharmaEvent } from "../infrastructure/db/pharmaStore.js";
import { shouldSkipRecoveryReplay } from "./startupHelpers.js";

/**
 * Run the monthly DAV drug approval check.
 * Fetches DAV registry, maps to pharma events, persists to DB.
 *
 * @idempotency T4 — cron_job_runs recency guard; replay skipped if last success < 90% of monthly cadence (27d window)
 */
export async function runDavPharmacyCheck(nowMsFn?: () => number): Promise<void> {
  const startedAt = Date.now();
  logger.info("[davPharmacyJob] starting monthly DAV check");

  try {
    await initDatabase();
    const db = getDb();

    const MONTHLY_CADENCE_MS = 2_592_000_000; // 30 days
    if (shouldSkipRecoveryReplay(db, "davPharmacyCheckJob", MONTHLY_CADENCE_MS, nowMsFn)) return;

    const approvals = await fetchDavPharmacy();

    let stored = 0;
    for (const approval of approvals) {
      try {
        insertPharmaEvent(db, {
          event_type: "drug_approval",
          drug_name: approval.drugName,
          manufacturer: approval.manufacturer,
          stock_code: approval.relatedStocks[0] ?? null,
          approval_date: approval.approvalDate || null,
          description: `DAV drug approval: ${approval.drugName} (${approval.registrationNumber})`,
          severity: "low",
        });
        stored++;
      } catch (err) {
        logger.warn("[davPharmacyJob] failed to store approval", {
          drugName: approval.drugName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[davPharmacyJob] monthly check complete", {
      fetched: approvals.length,
      stored,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    logger.error("[davPharmacyJob] job failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
