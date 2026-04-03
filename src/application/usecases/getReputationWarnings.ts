/**
 * Get Reputation Warnings — Task 266
 *
 * Application-layer use case. Reads the latest reputation scores for a list
 * of stock codes from the reputation_scores table and returns only those
 * with a score below the warning threshold (< 50).
 *
 * Used by:
 * - Morning briefing: warns about stocks in 'warning' or 'danger' risk level
 * - Alert Commander: flags reputation degradation
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import { getReputation } from "../../infrastructure/db/reputationStore.js";
import type { ReputationScore } from "../../domain/services/reputationScorer.js";

/** Minimum score below which a reputation warning is issued. */
const REPUTATION_WARNING_THRESHOLD = 50;

/**
 * Return reputation scores below warning threshold for the given stock codes.
 *
 * For each code, fetches the latest reputation record. Stocks with no record
 * are silently skipped (no history = no warning).
 *
 * @param db         - Active bun:sqlite Database instance
 * @param stockCodes - List of stock tickers to check
 * @returns          - Reputation scores with score < 50, sorted by score ASC
 */
export function getReputationWarnings(
  db: Database,
  stockCodes: string[],
): ReputationScore[] {
  const warnings: ReputationScore[] = [];

  for (const code of stockCodes) {
    const rep = getReputation(db, code);
    if (rep !== null && rep.score < REPUTATION_WARNING_THRESHOLD) {
      warnings.push(rep);
    }
  }

  // Sort by score ascending (most critical first)
  warnings.sort((a, b) => a.score - b.score);
  return warnings;
}
