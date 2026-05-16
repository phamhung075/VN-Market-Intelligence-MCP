/**
 * Public Contracts Store — Task B (populate public_contracts)
 *
 * Infrastructure layer: writes procurement contract records to the
 * public_contracts table. Injected into publicContractsJob.ts.
 *
 * Strategy: INSERT OR IGNORE on (title, award_date) uniqueness.
 * The table has no UNIQUE constraint defined in the migration, so we
 * use a SELECT-before-INSERT dedup guard keyed on (title, award_date).
 *
 * DDD constraint: infrastructure layer — no domain imports.
 *
 * @module infrastructure/db/publicContractsStore
 */

import type { Database } from "bun:sqlite";
import type { PublicContract } from "../fetchers/muasamcong.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StoreContractsResult {
  /** Number of rows actually inserted (deduped rows not counted). */
  inserted: number;
  /** Total contracts attempted. */
  attempted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert an array of PublicContract objects into the public_contracts table.
 *
 * Uses SELECT-before-INSERT dedup on (title, award_date) to avoid duplicates
 * across weekly runs. The fetched_at column uses datetime('now') as default.
 *
 * Any per-row error is caught and logged without aborting the batch.
 * The full batch runs inside a single transaction for atomicity.
 *
 * @param db        - SQLite Database instance (injected, no global state)
 * @param contracts - Array from fetchPublicContracts()
 * @returns StoreContractsResult with inserted + attempted counts
 */
export function storePublicContracts(
  db: Database,
  contracts: PublicContract[],
): StoreContractsResult {
  let inserted = 0;
  const attempted = contracts.length;

  if (attempted === 0) {
    return { inserted: 0, attempted: 0 };
  }

  const insertStmt = db.prepare(`
    INSERT INTO public_contracts (title, value, category, agency, winner, award_date, related_stocks, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const existsStmt = db.prepare(`
    SELECT 1 FROM public_contracts WHERE title = ? AND award_date = ? LIMIT 1
  `);

  const runBatch = db.transaction(() => {
    for (const c of contracts) {
      try {
        const exists = existsStmt.get(c.title, c.awardDate);
        if (exists) continue;

        insertStmt.run(
          c.title,
          c.value,
          c.category,
          c.agency,
          c.winner,
          c.awardDate,
          JSON.stringify(c.relatedStocks),
        );
        inserted++;
      } catch (err) {
        console.warn(
          `[publicContractsStore] row insert failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });

  try {
    runBatch();
  } catch (err) {
    console.error(
      `[publicContractsStore] transaction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { inserted, attempted };
}
