/**
 * Morning Briefing — Step 16: evidence top scores (bullish leaders + bearish warnings).
 *
 * Extracted from assembleBriefing.ts (formerly the module-level queryEvidenceTopScores
 * helper at line 538, plus the top-level BEARISH_WARNING_THRESHOLD constant it consumes)
 * — FACTORY-APP-split-assembleBriefing.
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import { sqlInClause } from "../../../infrastructure/db/sqlHelpers.js";
import type { EvidenceScoreBriefingRow } from "./types.js";

/** Net bearish weight threshold below which a stock is flagged as a bearish warning. */
export const BEARISH_WARNING_THRESHOLD = -2.0;

interface EvidenceScoreRow {
  code: string;
  score_date: string;
  bullish_score: number;
  bearish_score: number;
  fragment_count: number;
}

/**
 * Query evidence_scores for the most-recent score per watchlist stock.
 * Returns top 3 bullish leaders (netScore > 0, fragment_count >= 1) +
 * all bearish warnings (netScore < BEARISH_WARNING_THRESHOLD, fragment_count >= 1).
 * Deduplicates: bearish takes priority if a stock qualifies for both.
 */
function queryEvidenceTopScoresImpl(
  db: Database,
  watchlistCodes: string[],
): EvidenceScoreBriefingRow[] {
  if (watchlistCodes.length === 0) return [];
  const placeholders = sqlInClause(watchlistCodes.length);
  const rows = db
    .prepare<EvidenceScoreRow, (string | number)[]>(`
      SELECT stock AS code,
             score_date,
             bullish_score,
             bearish_score,
             fragment_count
      FROM evidence_scores
      WHERE stock IN (${placeholders})
        AND (stock, score_date) IN (
              SELECT stock, MAX(score_date)
              FROM evidence_scores
              WHERE stock IN (${placeholders})
              GROUP BY stock
            )
    `)
    .all(...watchlistCodes, ...watchlistCodes);

  const enriched = rows
    .filter((r) => r.fragment_count >= 1)
    .map((r) => ({
      code: r.code,
      netScore: r.bullish_score - r.bearish_score,
      bullishScore: r.bullish_score,
      bearishScore: r.bearish_score,
      fragmentCount: r.fragment_count,
      scoreDate: r.score_date,
    }));

  const bearishWarnings = enriched.filter(
    (r) => r.netScore < BEARISH_WARNING_THRESHOLD,
  );
  const bearishCodes = new Set(bearishWarnings.map((r) => r.code));

  const bullishLeaders = enriched
    .filter((r) => r.netScore > 0 && !bearishCodes.has(r.code))
    .sort((a, b) => b.netScore - a.netScore)
    .slice(0, 3);

  return [...bullishLeaders, ...bearishWarnings];
}

/** Step wrapper — swallows/logs errors so an evidence-score query failure never aborts the briefing. */
export function queryEvidenceTopScores(
  db: Database,
  watchlistCodes: string[],
): EvidenceScoreBriefingRow[] {
  try {
    return queryEvidenceTopScoresImpl(db, watchlistCodes);
  } catch (esErr) {
    logger.warn("[assembleBriefing] evidenceTopScores step failed", {
      error: esErr instanceof Error ? esErr.message : String(esErr),
    });
    return [];
  }
}
