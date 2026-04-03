/**
 * Insider Check Job — Task 250
 *
 * Daily 19:00 M-F job that:
 *   1. Fetches insider transaction disclosures from the SSC portal
 *   2. Stores new rows in the insider_transactions SQLite table
 *   3. Returns a summary of what was processed (for logging / testing)
 *
 * Layer: scheduler (interface) — orchestrates infrastructure fetchers + db
 */

import { fetchInsiderTransactions, type HttpClient } from "../infrastructure/fetchers/sscInsider.js";
import { insertInsiderTransaction, hasInsiderTransaction } from "../infrastructure/db/insiderStore.js";
import { getDb } from "../infrastructure/db/schema.js";
import type { InsiderRow } from "../infrastructure/db/insiderStore.js";
import type { RawInsiderRow } from "../infrastructure/fetchers/sscInsider.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a stable unique ID for an insider transaction row.
 * Format: {code}-{insiderName-slug}-{fromDate}
 */
function makeRowId(raw: RawInsiderRow): string {
  const namePart = raw.insiderName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 20);
  return `${raw.code}-${namePart}-${raw.fromDate}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface InsiderCheckResult {
  fetched: number;
  processed: number;
  skipped: number;
  errors: number;
}

/**
 * Main insider check job runner.
 * Never throws — all errors are logged and counted.
 *
 * @param httpClient - Optional injected HTTP client (for testing)
 * @returns Summary of rows fetched, inserted, skipped, and errors
 */
export async function runInsiderCheck(
  httpClient?: HttpClient,
): Promise<InsiderCheckResult> {
  const result: InsiderCheckResult = {
    fetched: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const raw = await fetchInsiderTransactions(httpClient);
    result.fetched = raw.length;

    if (raw.length === 0) return result;

    // Initialise the insider_transactions table if needed
    const db = getDb();
    ensureInsiderTable(db);

    const fetchedAt = new Date().toISOString();

    for (const row of raw) {
      try {
        const id = makeRowId(row);

        if (hasInsiderTransaction(db, id)) {
          result.skipped++;
          continue;
        }

        const insiderRow: InsiderRow = {
          id,
          code: row.code,
          insiderName: row.insiderName,
          position: row.position,
          type: row.type,
          registeredVolume: row.registeredVolume,
          executedVolume: row.executedVolume,
          price: row.price,
          fromDate: row.fromDate,
          toDate: row.toDate,
          fetchedAt,
        };

        insertInsiderTransaction(db, insiderRow);
        result.processed++;
      } catch (err) {
        console.error("[insiderCheckJob] Failed to store row:", err);
        result.errors++;
      }
    }
  } catch (err) {
    console.error("[insiderCheckJob] Fatal error in runInsiderCheck:", err);
    result.errors++;
  }

  return result;
}

/**
 * Ensure the insider_transactions table exists.
 * Called lazily on first use — idempotent.
 */
function ensureInsiderTable(db: import("bun:sqlite").Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id                TEXT PRIMARY KEY,
      code              TEXT NOT NULL,
      insider_name      TEXT NOT NULL,
      position          TEXT NOT NULL,
      type              TEXT NOT NULL,
      registered_volume INTEGER NOT NULL DEFAULT 0,
      executed_volume   INTEGER NOT NULL DEFAULT 0,
      price             REAL NOT NULL DEFAULT 0,
      from_date         TEXT NOT NULL,
      to_date           TEXT NOT NULL,
      fetched_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_insider_code ON insider_transactions(code);
    CREATE INDEX IF NOT EXISTS idx_insider_from ON insider_transactions(from_date);
  `);
}
