/**
 * Data Audit Job — Task 242 (agent signal cleanup)
 *
 * Runs nightly to perform data integrity maintenance tasks:
 *   1. Clean expired agent_signals rows to prevent table bloat.
 *
 * Registered in `jobs.ts` at 23:00 daily (Asia/Ho_Chi_Minh).
 *
 * Layer: interface/scheduler — may call getDb() and infrastructure stores.
 * Must not import directly from domain/.
 */

import { getDb, initDatabase } from "../infrastructure/db/schema.js";
import { cleanExpired } from "../infrastructure/db/agentSignalStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the nightly data audit.
 *
 * - Removes expired agent_signals rows.
 * - Logs counts for monitoring.
 */
export async function runDataAudit(): Promise<void> {
  const tag = "[dataAuditJob]";
  console.log(`${tag} Starting nightly data audit…`);

  try {
    await initDatabase();
    const db = getDb();

    // Clean up expired agent signals
    const signalsCleaned = cleanExpired(db);
    console.log(`${tag} Expired agent signals removed: ${signalsCleaned}`);

    console.log(`${tag} Audit complete.`);
  } catch (err) {
    console.error(`${tag} Audit failed:`, err);
  }
}
